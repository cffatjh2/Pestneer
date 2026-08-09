using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;

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
        return app;
    }

    private static async Task<IResult> GetBrandingAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
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
