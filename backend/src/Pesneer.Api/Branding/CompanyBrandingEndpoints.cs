using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Net.Mail;
using System.Net;
using System.Text.Json;
using Pesneer.Api.Data;
using Pesneer.Api.Email;
using Pesneer.Api.Optimization;

namespace Pesneer.Api.Branding;

public static class CompanyBrandingEndpoints
{
    private const long MaximumLogoSize = 4 * 1024 * 1024;
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/webp"
    };

    public static IEndpointRouteBuilder MapCompanyBrandingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/company/branding/email/google/callback", CompleteGoogleEmailConnectionAsync);

        var shared = app.MapGroup("/api/company/branding").RequireAuthorization();
        shared.MapGet("/", GetBrandingAsync);
        shared.MapGet("/logo", GetLogoAsync);

        var owner = app.MapGroup("/api/company/branding").RequireAuthorization("OwnerPortal");
        owner.MapPost("/logo", UploadLogoAsync).DisableAntiforgery();
        owner.MapDelete("/logo", DeleteLogoAsync);
        owner.MapPut("/report-notification-email", UpdateReportNotificationEmailAsync);
        owner.MapPost("/email/retry", RetryEmailDeliveriesAsync);
        owner.MapPost("/email/test", SendTestEmailAsync);
        owner.MapPost("/email/google/connect", StartGoogleEmailConnectionAsync);
        owner.MapDelete("/email/google", DisconnectGoogleEmailConnectionAsync);
        return app;
    }

    private static async Task<IResult> GetBrandingAsync(PesneerDbContext dbContext, ICompanyContext context, IEmailSender emailSender, CancellationToken cancellationToken)
    {
        var company = await CompanyQuery(dbContext, context).AsNoTracking().SingleOrDefaultAsync(cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var emailStatus = await emailSender.GetStatusAsync(company.Id, cancellationToken);
        return Results.Ok(new
            {
                companyName = company.LegalName,
                hasLogo = company.LogoData != null,
                logoFileName = company.LogoFileName,
                logoUpdatedAt = company.LogoUpdatedAt,
                reportNotificationEmail = company.ReportNotificationEmail,
                emailDeliveryConfigured = emailStatus.IsConfigured,
                emailDeliveryProvider = emailStatus.ProviderName,
                emailDeliveryConfigurationError = emailStatus.ConfigurationError,
                emailOAuthAvailable = emailStatus.Google.OAuthAvailable,
                emailOAuthConnected = emailStatus.Google.Connected,
                emailOAuthSenderEmail = emailStatus.Google.SenderEmail,
                emailOAuthConnectedAt = emailStatus.Google.ConnectedAt,
                emailOAuthLastError = emailStatus.Google.LastError,
                logoUrl = company.LogoData == null ? null : $"/api/company/branding/logo?v={company.LogoUpdatedAt?.ToUnixTimeSeconds()}"
            });
    }

    private static async Task<IResult> GetLogoAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var company = await CompanyQuery(dbContext, context).AsNoTracking()
            .Select(item => new { item.LogoData, item.LogoContentType, item.LogoFileName, item.LogoUpdatedAt })
            .SingleOrDefaultAsync(cancellationToken);
        if (company?.LogoData is null) return Results.NotFound(new { message = "Firma logosu yüklenmemiş." });
        return PrivateFileResults.Exact(company.LogoData, company.LogoContentType ?? "image/png", company.LogoFileName ?? "company-logo", company.LogoUpdatedAt);
    }

    private static async Task<IResult> UploadLogoAsync(HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType) return Results.BadRequest(new { message = "Logo dosyası seçin." });
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("logo") ?? form.Files.FirstOrDefault();
        if (file is null || file.Length == 0) return Results.BadRequest(new { message = "Logo dosyası seçin." });
        if (file.Length > MaximumLogoSize) return Results.BadRequest(new { message = "Logo en fazla 4 MB olabilir." });
        if (!AllowedTypes.Contains(file.ContentType)) return Results.BadRequest(new { message = "Logo PNG, JPG veya WEBP olmalıdır." });

        var data = await UploadBuffers.ReadExactlyAsync(file, cancellationToken);
        if (!MatchesSignature(data, file.ContentType)) return Results.BadRequest(new { message = "Logo dosyasının biçimi doğrulanamadı." });

        var company = await CompanyQuery(dbContext, context).SingleOrDefaultAsync(cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        company.LogoData = data;
        company.LogoContentType = file.ContentType;
        company.LogoFileName = Path.GetFileName(file.FileName);
        company.LogoUpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { companyName = company.LegalName, hasLogo = true, logoFileName = company.LogoFileName, logoUpdatedAt = company.LogoUpdatedAt, logoUrl = $"/api/company/branding/logo?v={company.LogoUpdatedAt.Value.ToUnixTimeSeconds()}" });
    }

    private static async Task<IResult> DeleteLogoAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var company = await CompanyQuery(dbContext, context).SingleOrDefaultAsync(cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        company.LogoData = null;
        company.LogoContentType = null;
        company.LogoFileName = null;
        company.LogoUpdatedAt = null;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> UpdateReportNotificationEmailAsync(
        UpdateReportNotificationEmailRequest request,
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        if (email is not null && !MailAddress.TryCreate(email, out _))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Geçerli bir firma bildirim e-postası girin."] });
        var company = await CompanyQuery(dbContext, context).SingleOrDefaultAsync(cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        company.ReportNotificationEmail = email;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { reportNotificationEmail = company.ReportNotificationEmail });
    }

    private static async Task<IResult> RetryEmailDeliveriesAsync(
        PesneerDbContext dbContext,
        ICompanyContext context,
        IEmailSender emailSender,
        IReportEmailDispatcher dispatcher,
        CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue) return Results.NotFound(new { message = "Firma bulunamadı." });
        var emailStatus = await emailSender.GetStatusAsync(context.CompanyId.Value, cancellationToken);
        if (!emailStatus.IsConfigured)
            return Results.Problem(emailStatus.ConfigurationError ?? "Sunucunun e-posta gönderici ayarları eksik.", statusCode: 503);

        var failed = await dbContext.ReportEmailDeliveries
            .Where(item => item.CompanyId == context.CompanyId.Value && item.Status == "Failed")
            .ToListAsync(cancellationToken);
        foreach (var delivery in failed)
        {
            delivery.Status = "Pending";
            delivery.AttemptCount = 0;
            delivery.NextAttemptAt = DateTimeOffset.UtcNow;
            delivery.LastAttemptAt = null;
            delivery.LastError = null;
        }
        if (failed.Count > 0) await dbContext.SaveChangesAsync(cancellationToken);
        var sent = await dispatcher.DispatchPendingAsync(cancellationToken, context.CompanyId.Value);
        return Results.Ok(new { reset = failed.Count, sent });
    }

    private static async Task<IResult> SendTestEmailAsync(
        TestEmailRequest request,
        PesneerDbContext dbContext,
        ICompanyContext context,
        IEmailSender emailSender,
        CancellationToken cancellationToken)
    {
        var company = await CompanyQuery(dbContext, context).AsNoTracking().SingleOrDefaultAsync(cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var emailStatus = await emailSender.GetStatusAsync(company.Id, cancellationToken);
        if (!emailStatus.IsConfigured)
            return Results.Problem(emailStatus.ConfigurationError ?? "E-posta servisi yapılandırılmadı.", statusCode: 503);
        var recipient = string.IsNullOrWhiteSpace(request.Email) ? company.ReportNotificationEmail : request.Email.Trim();
        if (string.IsNullOrWhiteSpace(recipient) || !MailAddress.TryCreate(recipient, out _))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Test için geçerli bir e-posta adresi girin."] });
        var attachment = System.Text.Encoding.UTF8.GetBytes($"Pestneer e-posta teslimat testi\nFirma: {company.LegalName}\nTarih: {DateTimeOffset.UtcNow:O}");
        await emailSender.SendAsync(new OutboundEmail(company.Id, $"pestneer-test-{Guid.NewGuid():N}", recipient, "Pestneer e-posta teslimat testi",
            $"<p><strong>{WebUtility.HtmlEncode(company.LegalName)}</strong> için e-posta otomasyonu çalışıyor.</p>",
            "pestneer-email-test.txt", "text/plain", attachment), cancellationToken);
        return Results.Ok(new { sent = true, recipient, provider = emailStatus.ProviderName });
    }

    private static IResult StartGoogleEmailConnectionAsync(
        ICompanyContext context,
        IGoogleEmailConnectionService googleEmailConnectionService)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue)
            return Results.Unauthorized();
        if (!googleEmailConnectionService.OAuthAvailable)
            return Results.Problem(googleEmailConnectionService.ConfigurationError, statusCode: 503);
        return Results.Ok(new
        {
            authorizationUrl = googleEmailConnectionService.CreateAuthorizationUrl(context.CompanyId.Value, context.AccountId.Value)
        });
    }

    private static async Task<IResult> CompleteGoogleEmailConnectionAsync(
        string? code,
        string? state,
        string? error,
        string? error_description,
        IGoogleEmailConnectionService googleEmailConnectionService,
        IOptions<EmailDeliveryOptions> options,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(error))
            return OAuthResultPage(false, null, error_description ?? error, options.Value.FrontendBaseUrl);
        try
        {
            var result = await googleEmailConnectionService.CompleteAsync(code ?? string.Empty, state ?? string.Empty, cancellationToken);
            return OAuthResultPage(true, result.SenderEmail, null, options.Value.FrontendBaseUrl);
        }
        catch (Exception exception)
        {
            return OAuthResultPage(false, null, exception.Message, options.Value.FrontendBaseUrl);
        }
    }

    private static async Task<IResult> DisconnectGoogleEmailConnectionAsync(
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue) return Results.NotFound(new { message = "Firma bulunamadı." });
        var connection = await dbContext.CompanyEmailConnections.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.CompanyId == context.CompanyId.Value && item.Provider == "Google", cancellationToken);
        if (connection is null) return Results.NoContent();
        dbContext.CompanyEmailConnections.Remove(connection);
        await dbContext.SaveEmailConnectionChangesAsync(context.CompanyId.Value, cancellationToken);
        return Results.NoContent();
    }

    private static IResult OAuthResultPage(bool success, string? senderEmail, string? error, string frontendBaseUrl)
    {
        var targetOrigin = Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out var frontendUri)
            ? frontendUri.GetLeftPart(UriPartial.Authority)
            : "*";
        var payload = JsonSerializer.Serialize(new { type = "pestneer-email-oauth", success, senderEmail, error });
        var encodedOrigin = JsonSerializer.Serialize(targetOrigin);
        var title = success ? "Gmail bağlantısı tamamlandı" : "Gmail bağlantısı tamamlanamadı";
        var message = success
            ? $"{WebUtility.HtmlEncode(senderEmail)} hesabı Pestneer'e güvenli biçimde bağlandı."
            : WebUtility.HtmlEncode(error ?? "Bilinmeyen bir yetkilendirme hatası oluştu.");
        var html = $$"""
            <!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>{{title}}</title><style>body{font-family:system-ui,sans-serif;background:#f4f8fb;color:#102a43;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:520px;background:white;border:1px solid #d9e4ee;border-radius:18px;padding:32px;box-shadow:0 20px 50px #1232}h1{font-size:24px}p{line-height:1.6;color:#526b7f}</style></head>
            <body><main><h1>{{title}}</h1><p>{{message}}</p><p>Bu pencereyi kapatıp Pestneer'e dönebilirsiniz.</p></main>
            <script>window.opener?.postMessage({{payload}}, {{encodedOrigin}});setTimeout(() => window.close(), 1200);</script></body></html>
            """;
        return Results.Content(html, "text/html; charset=utf-8");
    }

    private static IQueryable<Domain.Company> CompanyQuery(PesneerDbContext dbContext, ICompanyContext context)
    {
        if (!context.CompanyId.HasValue) return dbContext.Companies.Where(_ => false);
        return dbContext.Companies.Where(item => item.Id == context.CompanyId.Value && item.IsActive);
    }

    private static bool MatchesSignature(byte[] data, string contentType) => contentType.ToLowerInvariant() switch
    {
        "image/png" => data.Length > 8 && data.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
        "image/jpeg" => data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF,
        "image/webp" => data.Length > 12 && System.Text.Encoding.ASCII.GetString(data, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(data, 8, 4) == "WEBP",
        _ => false
    };
}

public sealed record UpdateReportNotificationEmailRequest(string? Email);
public sealed record TestEmailRequest(string? Email);
