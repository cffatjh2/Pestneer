using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Vision;

public static class VisionSettingsEndpoints
{
    private static readonly HashSet<string> Models = ["Auto", "pVision", "pLens", "Vision", "Lens", "Nano", "Tiny"];

    public static IEndpointRouteBuilder MapVisionSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/vision/settings", GetAsync).RequireAuthorization("CompanyStaff");
        app.MapPut("/api/company/vision/settings", UpdateAsync).RequireAuthorization("OwnerPortal");
        return app;
    }

    private static async Task<IResult> GetAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue) return Results.Forbid();
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId.Value, cancellationToken);
        return Results.Ok(ToResponse(company));
    }

    private static async Task<IResult> UpdateAsync(UpdateVisionSettingsRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue) return Results.Forbid();
        if (!Models.Contains(request.PreferredModel))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["preferredModel"] = ["Model tercihi Auto, pVision veya pLens olmalıdır."] });
        var company = await dbContext.Companies.SingleAsync(item => item.Id == context.CompanyId.Value, cancellationToken);
        company.VisionEnabled = request.Enabled;
        company.VisionReviewRequired = request.ReviewRequired;
        company.VisionPreferredModel = NormalizeModel(request.PreferredModel);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(company));
    }

    private static VisionSettingsResponse ToResponse(Company company) => new(
        company.VisionEnabled,
        company.VisionReviewRequired,
        NormalizeModel(company.VisionPreferredModel),
        "PestneerVision bir yapay zeka modelidir ve hata yapabilir. Sonuçları kontrol edin.");

    private static string NormalizeModel(string? value) => value switch
    {
        "Nano" or "Vision" => "pVision",
        "Tiny" or "Lens" => "pLens",
        "pVision" or "pLens" or "Auto" => value,
        _ => "Auto",
    };
}

public sealed record UpdateVisionSettingsRequest(bool Enabled, bool ReviewRequired, string PreferredModel);
public sealed record VisionSettingsResponse(bool Enabled, bool ReviewRequired, string PreferredModel, string Disclaimer);
