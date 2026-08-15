using Microsoft.EntityFrameworkCore;
using System.Net.Mail;
using System.Net;
using Pesneer.Api.Data;
using Pesneer.Api.Email;

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
        var shared = app.MapGroup("/api/company/branding").RequireAuthorization();
        shared.MapGet("/", GetBrandingAsync);
        shared.MapGet("/logo", GetLogoAsync);

        var owner = app.MapGroup("/api/company/branding").RequireAuthorization("OwnerPortal");
        owner.MapPost("/logo", UploadLogoAsync).DisableAntiforgery();
        owner.MapDelete("/logo", DeleteLogoAsync);
        owner.MapPut("/report-notification-email", UpdateReportNotificationEmailAsync);
        owner.MapPost("/email/retry", RetryEmailDeliveriesAsync);
        owner.MapPost("/email/test", SendTestEmailAsync);
        return app;
    }

    private static async Task<IResult> GetBrandingAsync(PesneerDbContext dbContext, ICompanyContext context, IEmailSender emailSender, CancellationToken cancellationToken)
    {
        var company = await CompanyQuery(dbContext, context).AsNoTracking().SingleOrDefaultAsync(cancellationToken);
        return company is null
            ? Results.NotFound(new { message = "Firma bulunamadı." })
            : Results.Ok(new
            {
                companyName = company.LegalName,
                hasLogo = company.LogoData != null,
                logoFileName = company.LogoFileName,
                logoUpdatedAt = company.LogoUpdatedAt,
                reportNotificationEmail = company.ReportNotificationEmail,
                emailDeliveryConfigured = emailSender.IsConfigured,
                emailDeliveryProvider = emailSender.ProviderName,
                emailDeliveryConfigurationError = emailSender.ConfigurationError,
                logoUrl = company.LogoData == null ? null : $"/api/company/branding/logo?v={company.LogoUpdatedAt?.ToUnixTimeSeconds()}"
            });
    }

    private static async Task<IResult> GetLogoAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var company = await CompanyQuery(dbContext, context).AsNoTracking()
            .Select(item => new { item.LogoData, item.LogoContentType, item.LogoFileName, item.LogoUpdatedAt })
            .SingleOrDefaultAsync(cancellationToken);
        if (company?.LogoData is null) return Results.NotFound(new { message = "Firma logosu yüklenmemiş." });
        return Results.File(company.LogoData, company.LogoContentType ?? "image/png", company.LogoFileName,
            lastModified: company.LogoUpdatedAt, enableRangeProcessing: true);
    }

    private static async Task<IResult> UploadLogoAsync(HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType) return Results.BadRequest(new { message = "Logo dosyası seçin." });
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("logo") ?? form.Files.FirstOrDefault();
        if (file is null || file.Length == 0) return Results.BadRequest(new { message = "Logo dosyası seçin." });
        if (file.Length > MaximumLogoSize) return Results.BadRequest(new { message = "Logo en fazla 4 MB olabilir." });
        if (!AllowedTypes.Contains(file.ContentType)) return Results.BadRequest(new { message = "Logo PNG, JPG veya WEBP olmalıdır." });

        await using var memory = new MemoryStream();
        await file.CopyToAsync(memory, cancellationToken);
        var data = memory.ToArray();
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
        if (!emailSender.IsConfigured)
            return Results.Problem(emailSender.ConfigurationError ?? "Sunucunun e-posta gönderici ayarları eksik.", statusCode: 503);

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
        if (!emailSender.IsConfigured)
            return Results.Problem(emailSender.ConfigurationError ?? "E-posta servisi yapılandırılmadı.", statusCode: 503);
        var company = await CompanyQuery(dbContext, context).AsNoTracking().SingleOrDefaultAsync(cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var recipient = string.IsNullOrWhiteSpace(request.Email) ? company.ReportNotificationEmail : request.Email.Trim();
        if (string.IsNullOrWhiteSpace(recipient) || !MailAddress.TryCreate(recipient, out _))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Test için geçerli bir e-posta adresi girin."] });
        var attachment = System.Text.Encoding.UTF8.GetBytes($"Pestneer e-posta teslimat testi\nFirma: {company.LegalName}\nTarih: {DateTimeOffset.UtcNow:O}");
        await emailSender.SendAsync(new OutboundEmail(recipient, "Pestneer e-posta teslimat testi",
            $"<p><strong>{WebUtility.HtmlEncode(company.LegalName)}</strong> için e-posta otomasyonu çalışıyor.</p>",
            "pestneer-email-test.txt", "text/plain", attachment), cancellationToken);
        return Results.Ok(new { sent = true, recipient, provider = emailSender.ProviderName });
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
