using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Data;

namespace Pesneer.Api.Maps;

public static class GoogleMapsQuotaEndpoints
{
    private const int MaxReservationUnits = 12;

    public static IEndpointRouteBuilder MapGoogleMapsQuotaEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/maps/quota/acquire", AcquireAsync)
            .RequireAuthorization("CompanyStaff");
        return app;
    }

    private static async Task<IResult> AcquireAsync(
        GoogleMapsQuotaRequest request,
        PesneerDbContext db,
        IOptions<GoogleMapsQuotaOptions> configuredOptions,
        CancellationToken cancellationToken)
    {
        var options = configuredOptions.Value;
        var units = request.Units;
        if (units is < 1 or > MaxReservationUnits)
            return Results.BadRequest(new { message = "Geçersiz kota rezervasyonu." });

        var metric = request.Metric?.Trim().ToLowerInvariant();
        var limit = metric switch
        {
            "dynamic_maps" => options.DynamicMapsMonthlyLimit,
            "autocomplete_requests" => options.AutocompleteRequestsMonthlyLimit,
            "place_details" => options.PlaceDetailsMonthlyLimit,
            "geocoding" => options.GeocodingMonthlyLimit,
            _ => 0
        };
        if (limit <= 0)
            return Results.BadRequest(new { message = "Bilinmeyen veya kapalı Google Maps kotası." });

        if (!options.Enabled)
            return Results.Ok(new GoogleMapsQuotaResponse(true, 0, limit, "disabled"));

        var now = DateTimeOffset.UtcNow;
        var periodKey = now.ToString("yyyy-MM");

        // One atomic UPSERT is used instead of read-then-write. Concurrent browsers can never
        // reserve beyond the configured hard ceiling.
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "GoogleMapsUsageCounters" ("PeriodKey", "Metric", "UsedUnits", "UpdatedAt")
            VALUES ({periodKey}, {metric}, {units}, {now})
            ON CONFLICT ("PeriodKey", "Metric") DO UPDATE SET
                "UsedUnits" = "GoogleMapsUsageCounters"."UsedUnits" + {units},
                "UpdatedAt" = {now}
            WHERE "GoogleMapsUsageCounters"."UsedUnits" + {units} <= {limit};
            """, cancellationToken);

        if (affected == 0)
            return Results.Json(
                new GoogleMapsQuotaResponse(false, 0, limit, periodKey),
                statusCode: StatusCodes.Status429TooManyRequests);

        var used = await db.GoogleMapsUsageCounters.AsNoTracking()
            .Where(item => item.PeriodKey == periodKey && item.Metric == metric)
            .Select(item => item.UsedUnits)
            .SingleAsync(cancellationToken);

        return Results.Ok(new GoogleMapsQuotaResponse(true, Math.Max(0, limit - used), limit, periodKey));
    }
}

public sealed record GoogleMapsQuotaRequest(string? Metric, int Units = 1);
public sealed record GoogleMapsQuotaResponse(bool Allowed, int Remaining, int Limit, string Period);
