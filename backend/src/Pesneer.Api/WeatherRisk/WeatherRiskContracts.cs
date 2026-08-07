namespace Pesneer.Api.WeatherRisk;

public sealed record ForecastDayResponse(
    DateOnly Date,
    decimal MinimumTemperatureC,
    decimal MaximumTemperatureC,
    decimal PrecipitationMm,
    int PrecipitationProbability);

public sealed record WeatherSnapshotResponse(
    decimal TemperatureC,
    decimal ApparentTemperatureC,
    int RelativeHumidity,
    decimal PrecipitationMm,
    decimal WindSpeedKmh,
    int WeatherCode,
    string Condition,
    DateTimeOffset ObservedAt,
    bool IsStale,
    IReadOnlyList<ForecastDayResponse> Forecast);

public sealed record PestRiskResponse(
    string Code,
    string Name,
    int Score,
    string Level,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<string> Recommendations);

public sealed record RiskSummaryResponse(int Score, string Level, string Label);

public sealed record LocationWeatherRiskResponse(
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    string Address,
    string? MapUrl,
    decimal? Latitude,
    decimal? Longitude,
    string LocationType,
    string? UnavailableReason,
    WeatherSnapshotResponse? Weather,
    RiskSummaryResponse? Risk,
    IReadOnlyList<PestRiskResponse> Pests);

public sealed record WeatherRiskOverviewResponse(
    DateTimeOffset GeneratedAt,
    int TotalLocations,
    int HighRiskLocations,
    IReadOnlyList<LocationWeatherRiskResponse> Locations,
    string Disclaimer);

public sealed record WeatherReading(
    decimal TemperatureC,
    decimal ApparentTemperatureC,
    int RelativeHumidity,
    decimal PrecipitationMm,
    decimal WindSpeedKmh,
    int WeatherCode,
    DateTimeOffset ObservedAt,
    IReadOnlyList<ForecastDayResponse> Forecast,
    bool IsStale = false);

public sealed record ResolvedLocation(decimal Latitude, decimal Longitude);

public sealed record WeatherRiskLocation(
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    string Address,
    string? MapUrl,
    decimal? Latitude,
    decimal? Longitude,
    string LocationType);
