namespace Pesneer.Api.WeatherRisk;

public interface IWeatherRiskService
{
    Task<WeatherRiskOverviewResponse> BuildAsync(IReadOnlyList<WeatherRiskLocation> locations, bool forceRefresh, CancellationToken cancellationToken);
}

public sealed class WeatherRiskService(IMapLocationResolver locationResolver, IWeatherService weatherService) : IWeatherRiskService
{
    private const string Disclaimer = "Risk puanları hava koşullarına dayalı operasyonel erken uyarıdır; saha keşfi veya zararlı teşhisi yerine geçmez.";

    public async Task<WeatherRiskOverviewResponse> BuildAsync(IReadOnlyList<WeatherRiskLocation> locations, bool forceRefresh, CancellationToken cancellationToken)
    {
        var results = new List<LocationWeatherRiskResponse>(locations.Count);
        foreach (var location in locations)
        {
            var resolved = await locationResolver.ResolveAsync(location.Latitude, location.Longitude, location.MapUrl, cancellationToken);
            if (resolved is null)
            {
                results.Add(Unavailable(location, "Hava ve risk analizi için koordinat veya koordinat içeren Google Haritalar bağlantısı gerekli."));
                continue;
            }

            var weather = await weatherService.GetAsync(resolved.Latitude, resolved.Longitude, forceRefresh, cancellationToken);
            if (weather is null)
            {
                results.Add(Unavailable(location with { Latitude = resolved.Latitude, Longitude = resolved.Longitude }, "Hava durumu servisine şu anda ulaşılamıyor."));
                continue;
            }

            var (summary, pests) = PestRiskEngine.Calculate(weather);
            results.Add(new LocationWeatherRiskResponse(
                location.CustomerId, location.CustomerName, location.BranchId, location.BranchName, location.Address,
                location.MapUrl, resolved.Latitude, resolved.Longitude, location.LocationType, null,
                new WeatherSnapshotResponse(weather.TemperatureC, weather.ApparentTemperatureC, weather.RelativeHumidity,
                    weather.PrecipitationMm, weather.WindSpeedKmh, weather.WeatherCode, Condition(weather.WeatherCode),
                    weather.ObservedAt, weather.IsStale, weather.Forecast),
                summary, pests));
        }

        var ordered = results.OrderByDescending(item => item.Risk?.Score ?? -1).ThenBy(item => item.CustomerName).ThenBy(item => item.BranchName).ToArray();
        return new WeatherRiskOverviewResponse(DateTimeOffset.UtcNow, ordered.Length, ordered.Count(item => item.Risk?.Level == "High"), ordered, Disclaimer);
    }

    private static LocationWeatherRiskResponse Unavailable(WeatherRiskLocation location, string reason) => new(
        location.CustomerId, location.CustomerName, location.BranchId, location.BranchName, location.Address,
        location.MapUrl, location.Latitude, location.Longitude, location.LocationType, reason, null, null, []);

    private static string Condition(int code) => code switch
    {
        0 => "Açık",
        1 or 2 => "Parçalı bulutlu",
        3 => "Kapalı",
        45 or 48 => "Sisli",
        51 or 53 or 55 or 56 or 57 => "Çisenti",
        61 or 63 or 65 or 66 or 67 or 80 or 81 or 82 => "Yağmurlu",
        71 or 73 or 75 or 77 or 85 or 86 => "Karlı",
        95 or 96 or 99 => "Gök gürültülü",
        _ => "Değişken"
    };
}
