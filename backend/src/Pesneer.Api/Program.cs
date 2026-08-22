using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Pesneer.Api.Auth;
using Pesneer.Api.Audits;
using Pesneer.Api.Branding;
using Pesneer.Api.Calendar;
using Pesneer.Api.Commercial;
using Pesneer.Api.Compliance;
using Pesneer.Api.QualityControl;
using Pesneer.Api.Customers;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Employees;
using Pesneer.Api.Email;
using Pesneer.Api.FieldOperations;
using Pesneer.Api.Health;
using Pesneer.Api.Inventory;
using Pesneer.Api.Observability;
using Pesneer.Api.Reports;
using Pesneer.Api.StationActivations;
using Pesneer.Api.Quality;
using Pesneer.Api.SitePlans;
using Pesneer.Api.WeatherRisk;
using Pesneer.Api.Vision;
using Pesneer.Api.WorkOrders;
using Pesneer.Api.SystemAdministration;
using Pesneer.Api.Storage;
using Pesneer.Api.Maps;

var builder = WebApplication.CreateBuilder(args);
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
// HttpClientFactory's default request logs contain the full Storage object path. Suppress that
// category so tenant identifiers, hashes, signed tokens and object paths never reach Render logs.
builder.Logging.AddFilter("System.Net.Http.HttpClient.SupabaseStorage", LogLevel.None);
// EF's built-in command logger can include SQL text, schema/column names and parameter metadata.
// Privacy-safe aggregate command counts and timings are collected by our interceptor instead.
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.None);
var railwayDatabaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
var databaseProvider = string.IsNullOrWhiteSpace(railwayDatabaseUrl)
    ? builder.Configuration["DatabaseProvider"]
    : "Postgres";
var connectionString = string.IsNullOrWhiteSpace(railwayDatabaseUrl)
    ? builder.Configuration.GetConnectionString("Pesneer")
    : ToNpgsqlConnectionString(railwayDatabaseUrl);
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("Pesneer veritabanı bağlantısı tanımlanmalıdır.");
}
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("JWT ayarları tanımlanmalıdır.");

if (jwtOptions.SigningKey.Length < 32)
{
    throw new InvalidOperationException("JWT imzalama anahtarı en az 32 karakter olmalıdır.");
}

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<EmailDeliveryOptions>(builder.Configuration.GetSection(EmailDeliveryOptions.SectionName));
builder.Services.Configure<SupabaseStorageOptions>(builder.Configuration.GetSection(SupabaseStorageOptions.SectionName));
builder.Services.Configure<RequestMetricsOptions>(builder.Configuration.GetSection(RequestMetricsOptions.SectionName));
builder.Services.Configure<GoogleMapsQuotaOptions>(builder.Configuration.GetSection(GoogleMapsQuotaOptions.SectionName));
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICompanyContext, HttpCompanyContext>();
builder.Services.AddScoped<PrivacySafeDbRequestMetrics>();
builder.Services.AddScoped<PrivacySafeDbCommandInterceptor>();
if (string.Equals(databaseProvider, "Sqlite", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddDbContext<PesneerDbContext>((services, options) => options
        .UseSqlite(connectionString)
        .AddInterceptors(services.GetRequiredService<PrivacySafeDbCommandInterceptor>()));
}
else
{
    builder.Services.AddDbContext<PostgresPesneerDbContext>((services, options) =>
        options.UseNpgsql(connectionString, npgsql => npgsql
            .MigrationsAssembly(typeof(PostgresPesneerDbContext).Assembly.FullName)
            .EnableRetryOnFailure(5, TimeSpan.FromSeconds(5), null))
            .AddInterceptors(services.GetRequiredService<PrivacySafeDbCommandInterceptor>()));
    builder.Services.AddScoped<PesneerDbContext>(services =>
        services.GetRequiredService<PostgresPesneerDbContext>());
}
builder.Services.AddScoped<IPasswordHasher<Account>, PasswordHasher<Account>>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<ILoginService, LoginService>();
builder.Services.AddHttpClient("Resend", (services, client) =>
{
    var emailOptions = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<EmailDeliveryOptions>>().Value;
    client.BaseAddress = new Uri(emailOptions.ApiBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddHttpClient("GoogleOAuth", client => client.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient("Gmail", (services, client) =>
{
    var emailOptions = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<EmailDeliveryOptions>>().Value;
    client.BaseAddress = new Uri(emailOptions.GoogleGmailApiBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddSingleton<IEmailCredentialProtector, EmailCredentialProtector>();
builder.Services.AddSingleton<IEmailOAuthStateService, EmailOAuthStateService>();
builder.Services.AddScoped<IGoogleEmailConnectionService, GoogleEmailConnectionService>();
builder.Services.AddScoped<IEmailSender, ReliableEmailSender>();
builder.Services.AddScoped<IReportEmailDispatcher, ReportEmailDispatcher>();
builder.Services.AddHostedService<ReportEmailDeliveryWorker>();
builder.Services.AddHttpClient("SupabaseStorage", client => client.Timeout = TimeSpan.FromMinutes(10))
    .RedactLoggedHeaders(_ => true);
builder.Services.AddSingleton<IFileStore, SupabaseFileStore>();
builder.Services.AddSingleton<IHybridFileStorage, HybridFileStorageService>();
builder.Services.AddHostedService<PendingFileCleanupWorker>();
builder.Services.AddHostedService<LegacyBlobBackfillWorker>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient("OpenMeteo", client =>
{
    client.BaseAddress = new Uri("https://api.open-meteo.com/v1/");
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Pestneer/0.8.0 (+https://pesneer.onrender.com)");
});
builder.Services.AddHttpClient("MetNorway", client =>
{
    client.BaseAddress = new Uri("https://api.met.no/weatherapi/locationforecast/2.0/");
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Pestneer/0.8.0 (+https://pesneer.onrender.com)");
});
builder.Services.AddHttpClient("GoogleMapsResolver", client =>
{
    client.Timeout = TimeSpan.FromSeconds(6);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Pestneer/0.8.0 (+https://pesneer.onrender.com)");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddScoped<IMapLocationResolver, MapLocationResolver>();
builder.Services.AddScoped<IWeatherService, OpenMeteoWeatherService>();
builder.Services.AddScoped<IWeatherRiskService, WeatherRiskService>();
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat([
        "application/json",
        "image/svg+xml",
        "application/javascript",
        "text/css",
        "text/plain"
    ]);
});
builder.Services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
builder.Services.AddProblemDetails();

var allowedOrigins = (builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .Concat([
        builder.Configuration["Email:FrontendBaseUrl"],
        "http://localhost:5173",
        "https://www.pestneer.com",
        "https://pestneer.com",
        "https://pestneer-ctf.pages.dev",
        "https://pesneer.onrender.com"
    ])
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin!.Trim().TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
            if (allowedOrigins.Contains(origin.TrimEnd('/'), StringComparer.OrdinalIgnoreCase)) return true;
            return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || uri.Host.EndsWith(".pages.dev", StringComparison.OrdinalIgnoreCase)
                || uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase);
        });
        policy.AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("OwnerPortal", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("portal", PortalType.Owner.ToString()));

    options.AddPolicy("CompanyStaff", policy => policy
        .RequireAuthenticatedUser()
        .RequireAssertion(context =>
        {
            var portal = context.User.FindFirstValue("portal");
            return portal is nameof(PortalType.Owner) or nameof(PortalType.Employee);
        }));

    options.AddPolicy("EmployeePortal", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("portal", PortalType.Employee.ToString()));

    options.AddPolicy("CustomerPortal", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("portal", PortalType.Customer.ToString()));

    options.AddPolicy("SystemAdmin", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("portal", PortalType.SystemAdmin.ToString()));
});

var app = builder.Build();

await MigrateDatabaseAsync(app.Services);
await DevelopmentDataSeeder.InitializeAsync(app.Services, app.Environment);

app.UseForwardedHeaders();
app.UsePrivacySafeRequestMetrics();
if (app.Environment.IsDevelopment()) app.UseDeveloperExceptionPage();
else app.UseExceptionHandler();
app.UseResponseCompression();
app.UseCors();
app.UseDefaultFiles();
var staticFileContentTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
staticFileContentTypes.Mappings[".onnx"] = "application/octet-stream";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = staticFileContentTypes });
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    service = "Pesneer.Api",
    version = "0.8.0"
}));

var auth = app.MapGroup("/api/auth");
auth.MapPost("/owner/login", (LoginRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    SignInAsync(PortalType.Owner, request, loginService, cancellationToken));
auth.MapPost("/employee/login", (LoginRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    SignInAsync(PortalType.Employee, request, loginService, cancellationToken));
auth.MapPost("/customer/login", (LoginRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    SignInAsync(PortalType.Customer, request, loginService, cancellationToken));
auth.MapPost("/register-demo", (DemoRegisterRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    RegisterDemoHandlerAsync(request, loginService, cancellationToken));

app.MapGet("/api/company/dashboard", async (PesneerDbContext dbContext, CancellationToken cancellationToken) =>
{
    var today = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);
    var tomorrow = today.AddDays(1);
    var weekStart = today.AddDays(-7);
    int plannedWorkOrders;
    int activeOperations;
    int completedThisWeek;
    if (dbContext.Database.IsNpgsql())
    {
        var counts = await dbContext.WorkOrders.AsNoTracking()
            .Where(item => item.Status == "InProgress" || (item.ScheduledAt >= weekStart && item.ScheduledAt < tomorrow))
            .GroupBy(_ => 1)
            .Select(g => new
            {
                plannedWorkOrders = g.Count(item => item.ScheduledAt >= today && item.ScheduledAt < tomorrow),
                activeOperations = g.Count(item => item.Status == "InProgress"),
                completedThisWeek = g.Count(item => item.Status == "Completed" && item.ScheduledAt >= weekStart)
            })
            .SingleOrDefaultAsync(cancellationToken);
        plannedWorkOrders = counts?.plannedWorkOrders ?? 0;
        activeOperations = counts?.activeOperations ?? 0;
        completedThisWeek = counts?.completedThisWeek ?? 0;
    }
    else
    {
        var rows = await dbContext.WorkOrders.AsNoTracking()
            .Select(item => new { item.Status, item.ScheduledAt }).ToListAsync(cancellationToken);
        plannedWorkOrders = rows.Count(item => item.ScheduledAt >= today && item.ScheduledAt < tomorrow);
        activeOperations = rows.Count(item => item.Status == "InProgress");
        completedThisWeek = rows.Count(item => item.Status == "Completed" && item.ScheduledAt >= weekStart);
    }
    return Results.Ok(new
    {
        plannedWorkOrders,
        activeOperations,
        completedThisWeek
    });
}).RequireAuthorization("CompanyStaff");

app.MapEmployeeEndpoints();
app.MapFieldOperationsEndpoints();
app.MapInventoryEndpoints();
app.MapWorkOrderEndpoints();
app.MapCalendarEndpoints();
app.MapServiceReportEndpoints();
app.MapStationActivationEndpoints();
app.MapCustomerPortalEndpoints();
app.MapWeatherRiskEndpoints();
app.MapQualityEndpoints();
app.MapSitePlanEndpoints();
app.MapCompanyBrandingEndpoints();
app.MapCommercialEndpoints();
app.MapCorrectiveActionEndpoints();
app.MapQualityInspectionEndpoints();
app.MapHealthWasteEndpoints();
app.MapAuditPackageEndpoints();
app.MapVisionSettingsEndpoints();
app.MapAccountSecurityEndpoints();
app.MapSystemAdministrationEndpoints();
app.MapFileStorageEndpoints();
app.MapGoogleMapsQuotaEndpoints();

app.MapFallbackToFile("index.html");
app.Run();

static async Task MigrateDatabaseAsync(IServiceProvider services)
{
    for (var attempt = 1; attempt <= 5; attempt++)
    {
        try
        {
            await using var scope = services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
            if (db.Database.IsSqlite())
            {
                await db.Database.EnsureCreatedAsync();
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Companies\" ADD COLUMN \"IsTrial\" INTEGER NOT NULL DEFAULT 0;"); } catch { }
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Companies\" ADD COLUMN \"TrialStartedAt\" TEXT;"); } catch { }
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Companies\" ADD COLUMN \"TrialEndsAt\" TEXT;"); } catch { }
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Accounts\" ADD COLUMN \"HasAcceptedTerms\" INTEGER NOT NULL DEFAULT 0;"); } catch { }
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Accounts\" ADD COLUMN \"TermsAcceptedAt\" TEXT;"); } catch { }
                try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Accounts\" ADD COLUMN \"TermsAcceptedVersion\" TEXT;"); } catch { }
                await EnsureSqlitePrivateStorageFoundationAsync(db);
            }
            else if (db.Database.IsNpgsql())
            {
                await db.Database.MigrateAsync();
                await db.Database.ExecuteSqlRawAsync("""
                    ALTER TABLE "Companies" ADD COLUMN IF NOT EXISTS "IsTrial" boolean NOT NULL DEFAULT false;
                    ALTER TABLE "Companies" ADD COLUMN IF NOT EXISTS "TrialStartedAt" timestamp with time zone;
                    ALTER TABLE "Companies" ADD COLUMN IF NOT EXISTS "TrialEndsAt" timestamp with time zone;
                    ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "HasAcceptedTerms" boolean NOT NULL DEFAULT false;
                    ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "TermsAcceptedAt" timestamp with time zone;
                    ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "TermsAcceptedVersion" text;
                """);
            }
            return;
        }
        catch when (attempt < 5)
        {
            await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
        }
    }
}

static async Task EnsureSqlitePrivateStorageFoundationAsync(PesneerDbContext db)
{
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS "GoogleMapsUsageCounters" (
            "PeriodKey" TEXT NOT NULL,
            "Metric" TEXT NOT NULL,
            "UsedUnits" INTEGER NOT NULL,
            "UpdatedAt" TEXT NOT NULL,
            CONSTRAINT "PK_GoogleMapsUsageCounters" PRIMARY KEY ("PeriodKey", "Metric")
        );
        """);
    // Local databases historically use EnsureCreated rather than migration history. Keep their
    // upgrade additive and idempotent so existing inline bytes remain untouched.
    (string Table, string Column, string Sql)[] additiveColumns =
    [
        ("ServiceReportStations", "VisionAnalysisJson", "ALTER TABLE \"ServiceReportStations\" ADD COLUMN \"VisionAnalysisJson\" TEXT;"),
        ("WorkOrderPhotos", "StoredObjectId", "ALTER TABLE \"WorkOrderPhotos\" ADD COLUMN \"StoredObjectId\" TEXT;"),
        ("WasteDisposalEvidence", "StoredObjectId", "ALTER TABLE \"WasteDisposalEvidence\" ADD COLUMN \"StoredObjectId\" TEXT;"),
        ("QualityDocuments", "StoredObjectId", "ALTER TABLE \"QualityDocuments\" ADD COLUMN \"StoredObjectId\" TEXT;"),
        ("CorrectiveActionEvidence", "StoredObjectId", "ALTER TABLE \"CorrectiveActionEvidence\" ADD COLUMN \"StoredObjectId\" TEXT;"),
        ("Companies", "LogoStoredObjectId", "ALTER TABLE \"Companies\" ADD COLUMN \"LogoStoredObjectId\" TEXT;"),
        ("AuditPackages", "PdfStoredObjectId", "ALTER TABLE \"AuditPackages\" ADD COLUMN \"PdfStoredObjectId\" TEXT;"),
        ("AuditPackages", "ZipStoredObjectId", "ALTER TABLE \"AuditPackages\" ADD COLUMN \"ZipStoredObjectId\" TEXT;"),
        ("AuditPackageItems", "SizeBytes", "ALTER TABLE \"AuditPackageItems\" ADD COLUMN \"SizeBytes\" INTEGER;"),
        ("AuditPackageItems", "StoredObjectId", "ALTER TABLE \"AuditPackageItems\" ADD COLUMN \"StoredObjectId\" TEXT;")
    ];
    foreach (var addition in additiveColumns)
        if (!await SqliteColumnExistsAsync(db, addition.Table, addition.Column))
            await db.Database.ExecuteSqlRawAsync(addition.Sql);

    string[] foundationCommands =
    [
        """
        CREATE TABLE IF NOT EXISTS "StoredObjects" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_StoredObjects" PRIMARY KEY,
            "CompanyId" TEXT NOT NULL,
            "Sha256" TEXT NOT NULL,
            "SizeBytes" INTEGER NOT NULL,
            "ContentType" TEXT NOT NULL,
            "StorageKey" TEXT NOT NULL,
            "InitialFileName" TEXT NOT NULL,
            "State" TEXT NOT NULL,
            "CreatedAt" TEXT NOT NULL,
            "VerifiedAt" TEXT NULL,
            CONSTRAINT "FK_StoredObjects_Companies_CompanyId" FOREIGN KEY ("CompanyId")
                REFERENCES "Companies" ("Id") ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS "StoredObjectUploadSessions" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_StoredObjectUploadSessions" PRIMARY KEY,
            "CompanyId" TEXT NOT NULL,
            "StoredObjectId" TEXT NOT NULL,
            "FileName" TEXT NOT NULL,
            "IdempotencyKeyHash" TEXT NOT NULL,
            "CreatedAt" TEXT NOT NULL,
            "ExpiresAt" TEXT NOT NULL,
            "CompletedAt" TEXT NULL,
            CONSTRAINT "FK_StoredObjectUploadSessions_StoredObjects_StoredObjectId" FOREIGN KEY ("StoredObjectId")
                REFERENCES "StoredObjects" ("Id") ON DELETE CASCADE
        );
        """,
        "CREATE INDEX IF NOT EXISTS \"IX_WorkOrderPhotos_StoredObjectId\" ON \"WorkOrderPhotos\" (\"StoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_WasteDisposalEvidence_StoredObjectId\" ON \"WasteDisposalEvidence\" (\"StoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_QualityDocuments_StoredObjectId\" ON \"QualityDocuments\" (\"StoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_CorrectiveActionEvidence_StoredObjectId\" ON \"CorrectiveActionEvidence\" (\"StoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_Companies_LogoStoredObjectId\" ON \"Companies\" (\"LogoStoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_AuditPackages_PdfStoredObjectId\" ON \"AuditPackages\" (\"PdfStoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_AuditPackages_ZipStoredObjectId\" ON \"AuditPackages\" (\"ZipStoredObjectId\");",
        "CREATE INDEX IF NOT EXISTS \"IX_AuditPackageItems_StoredObjectId\" ON \"AuditPackageItems\" (\"StoredObjectId\");",
        "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_StoredObjects_CompanyId_Sha256\" ON \"StoredObjects\" (\"CompanyId\", \"Sha256\");",
        "CREATE INDEX IF NOT EXISTS \"IX_StoredObjects_State_CreatedAt\" ON \"StoredObjects\" (\"State\", \"CreatedAt\");",
        "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_StoredObjects_StorageKey\" ON \"StoredObjects\" (\"StorageKey\");",
        "CREATE INDEX IF NOT EXISTS \"IX_StoredObjectUploadSessions_CompanyId_ExpiresAt\" ON \"StoredObjectUploadSessions\" (\"CompanyId\", \"ExpiresAt\");",
        "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_StoredObjectUploadSessions_CompanyId_IdempotencyKeyHash\" ON \"StoredObjectUploadSessions\" (\"CompanyId\", \"IdempotencyKeyHash\");",
        "CREATE INDEX IF NOT EXISTS \"IX_StoredObjectUploadSessions_StoredObjectId\" ON \"StoredObjectUploadSessions\" (\"StoredObjectId\");"
    ];
    foreach (var command in foundationCommands)
        await db.Database.ExecuteSqlRawAsync(command);
}

static async Task<bool> SqliteColumnExistsAsync(PesneerDbContext db, string tableName, string columnName)
{
    var connection = db.Database.GetDbConnection();
    var shouldClose = connection.State != System.Data.ConnectionState.Open;
    if (shouldClose) await connection.OpenAsync();
    try
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info(\"{tableName.Replace("\"", "\"\"")}\");";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            if (reader.GetString(1).Equals(columnName, StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }
    finally
    {
        if (shouldClose) await connection.CloseAsync();
    }
}

static string ToNpgsqlConnectionString(string databaseUrl)
{
    var trimmed = databaseUrl.Trim().Trim('\'', '"');

    if (trimmed.Contains(';') || (trimmed.Contains('=') && !trimmed.StartsWith("postgres", StringComparison.OrdinalIgnoreCase)))
    {
        var customBuilder = new NpgsqlConnectionStringBuilder(trimmed)
        {
            SslMode = SslMode.Require
        };
        return customBuilder.ConnectionString;
    }

    var match = System.Text.RegularExpressions.Regex.Match(
        trimmed,
        @"^(?:postgres|postgresql):\/\/(?<user>[^:]+):(?<pass>.+)@(?<host>[^:\/\?]+)(?::(?<port>\d+))?(?:\/(?<db>[^\?]+))?",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    if (match.Success)
    {
        var user = Uri.UnescapeDataString(match.Groups["user"].Value);
        var pass = Uri.UnescapeDataString(match.Groups["pass"].Value);
        var host = match.Groups["host"].Value;
        var portStr = match.Groups["port"].Value;
        var port = int.TryParse(portStr, out var p) ? p : 5432;
        var db = match.Groups["db"].Success && !string.IsNullOrWhiteSpace(match.Groups["db"].Value)
            ? Uri.UnescapeDataString(match.Groups["db"].Value)
            : "postgres";

        return new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Username = user,
            Password = pass,
            Database = db,
            SslMode = SslMode.Require,
            Timeout = 30,
            CommandTimeout = 60,
            Pooling = true,
            MinPoolSize = 2,
            MaxPoolSize = 20
        }.ConnectionString;
    }

    var fallback = new NpgsqlConnectionStringBuilder(trimmed)
    {
        SslMode = SslMode.Require
    };
    return fallback.ConnectionString;
}

static async Task<IResult> SignInAsync(
    PortalType portal,
    LoginRequest request,
    ILoginService loginService,
    CancellationToken cancellationToken)
{
    var result = await loginService.SignInAsync(portal, request, cancellationToken);
    if (result.Response is not null) return Results.Ok(result.Response);
    if (result.IsTrialExpired)
    {
        return Results.Json(new { message = result.ErrorMessage, isTrialExpired = true }, statusCode: StatusCodes.Status403Forbidden);
    }
    return Results.Json(new { message = result.ErrorMessage ?? "Firma kodu, e-posta veya şifre hatalı." }, statusCode: StatusCodes.Status401Unauthorized);
}

static async Task<IResult> RegisterDemoHandlerAsync(
    DemoRegisterRequest request,
    ILoginService loginService,
    CancellationToken cancellationToken)
{
    var result = await loginService.RegisterDemoAsync(request, cancellationToken);
    if (result.Response is not null) return Results.Created($"/api/company/{result.Response.Company.Id}", result.Response);
    return Results.BadRequest(new { message = result.ErrorMessage ?? "Demo hesap oluşturulamadı." });
}
