using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Pesneer.Api.Auth;
using Pesneer.Api.Calendar;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Employees;
using Pesneer.Api.FieldOperations;
using Pesneer.Api.Inventory;
using Pesneer.Api.WorkOrders;

var builder = WebApplication.CreateBuilder(args);
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
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICompanyContext, HttpCompanyContext>();
if (string.Equals(databaseProvider, "Sqlite", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddDbContext<PesneerDbContext>(options => options.UseSqlite(connectionString));
}
else
{
    builder.Services.AddDbContext<PostgresPesneerDbContext>(options =>
        options.UseNpgsql(connectionString, npgsql => npgsql
            .MigrationsAssembly(typeof(PostgresPesneerDbContext).Assembly.FullName)
            .EnableRetryOnFailure(5, TimeSpan.FromSeconds(5), null)));
    builder.Services.AddScoped<PesneerDbContext>(services =>
        services.GetRequiredService<PostgresPesneerDbContext>());
}
builder.Services.AddScoped<IPasswordHasher<Account>, PasswordHasher<Account>>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<ILoginService, LoginService>();
builder.Services.AddProblemDetails();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod());
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
});

var app = builder.Build();

await MigrateDatabaseAsync(app.Services);
await DevelopmentDataSeeder.InitializeAsync(app.Services, app.Environment);

app.UseExceptionHandler();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    service = "Pesneer.Api",
    version = "0.2.0"
}));

var auth = app.MapGroup("/api/auth");
auth.MapPost("/owner/login", (LoginRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    SignInAsync(PortalType.Owner, request, loginService, cancellationToken));
auth.MapPost("/employee/login", (LoginRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    SignInAsync(PortalType.Employee, request, loginService, cancellationToken));
auth.MapPost("/customer/login", (LoginRequest request, ILoginService loginService, CancellationToken cancellationToken) =>
    SignInAsync(PortalType.Customer, request, loginService, cancellationToken));

app.MapGet("/api/company/dashboard", async (PesneerDbContext dbContext, CancellationToken cancellationToken) =>
{
    var today = DateTimeOffset.UtcNow.Date;
    var workOrders = dbContext.WorkOrders.AsNoTracking();
    return Results.Ok(new
    {
        plannedWorkOrders = await workOrders.CountAsync(item => item.ScheduledAt >= today && item.ScheduledAt < today.AddDays(1), cancellationToken),
        activeOperations = await workOrders.CountAsync(item => item.Status == "InProgress", cancellationToken),
        completedThisWeek = await workOrders.CountAsync(item => item.Status == "Completed" && item.ScheduledAt >= today.AddDays(-7), cancellationToken)
    });
}).RequireAuthorization("CompanyStaff");

app.MapEmployeeEndpoints();
app.MapFieldOperationsEndpoints();
app.MapInventoryEndpoints();
app.MapWorkOrderEndpoints();
app.MapCalendarEndpoints();

app.MapGet("/api/customer/work-orders", async (
    PesneerDbContext dbContext,
    ICompanyContext companyContext,
    CancellationToken cancellationToken) =>
{
    if (!companyContext.CustomerId.HasValue) return Results.Forbid();

    var workOrders = await dbContext.WorkOrders.AsNoTracking()
        .Where(item => item.CustomerId == companyContext.CustomerId.Value)
        .OrderByDescending(item => item.ScheduledAt)
        .Select(item => new { item.Id, item.Number, item.ServiceType, item.ScheduledAt, item.Status })
        .ToListAsync(cancellationToken);
    return Results.Ok(workOrders);
}).RequireAuthorization("CustomerPortal");

app.MapFallbackToFile("index.html");
app.Run();

static async Task MigrateDatabaseAsync(IServiceProvider services)
{
    for (var attempt = 1; attempt <= 5; attempt++)
    {
        try
        {
            await using var scope = services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<PesneerDbContext>().Database.MigrateAsync();
            return;
        }
        catch when (attempt < 5)
        {
            await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
        }
    }
}

static string ToNpgsqlConnectionString(string databaseUrl)
{
    var uri = new Uri(databaseUrl);
    var credentials = uri.UserInfo.Split(':', 2);
    if (credentials.Length != 2) throw new InvalidOperationException("DATABASE_URL kullanıcı bilgileri geçerli değil.");

    return new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Username = Uri.UnescapeDataString(credentials[0]),
        Password = Uri.UnescapeDataString(credentials[1]),
        Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
        SslMode = SslMode.Prefer,
        Pooling = true
    }.ConnectionString;
}

static async Task<IResult> SignInAsync(
    PortalType portal,
    LoginRequest request,
    ILoginService loginService,
    CancellationToken cancellationToken)
{
    var response = await loginService.SignInAsync(portal, request, cancellationToken);
    return response is null
        ? Results.Json(new { message = "Firma kodu, e-posta veya şifre hatalı." }, statusCode: StatusCodes.Status401Unauthorized)
        : Results.Ok(response);
}
