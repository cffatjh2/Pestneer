using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Pesneer.Api.WeatherRisk;

public interface IWeatherService
{
    Task<WeatherReading?> GetAsync(decimal latitude, decimal longitude, bool forceRefresh, CancellationToken cancellationToken);
}

public sealed class OpenMeteoWeatherService(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    ILogger<OpenMeteoWeatherService> logger) : IWeatherService
{
    private static readonly TimeSpan Freshness = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan StaleLifetime = TimeSpan.FromHours(8);

    public async Task<WeatherReading?> GetAsync(decimal latitude, decimal longitude, bool forceRefresh, CancellationToken cancellationToken)
    {
        if (latitude is < -90 or > 90 || longitude is < -180 or > 180) return null;
        var cacheKey = $"weather:{decimal.Round(latitude, 4)}:{decimal.Round(longitude, 4)}";
        cache.TryGetValue(cacheKey, out CachedWeather? cached);
        if (!forceRefresh && cached is not null && cached.FreshUntil > DateTimeOffset.UtcNow) return cached.Reading;

        Exception? lastError = null;
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            try
            {
                var query = FormattableString.Invariant(
                    $"forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&forecast_days=3&timezone=auto");
                using var response = await httpClientFactory.CreateClient("OpenMeteo").GetAsync(query, cancellationToken);
                response.EnsureSuccessStatusCode();
                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                var reading = Parse(json.RootElement);
                cache.Set(cacheKey, new CachedWeather(reading, DateTimeOffset.UtcNow.Add(Freshness)), StaleLifetime);
                return reading;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                lastError = new TimeoutException("Open-Meteo request timed out.");
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                lastError = exception;
            }

            if (attempt < 2) await Task.Delay(350, cancellationToken);
        }

        logger.LogWarning(lastError, "Open-Meteo weather request failed after retries for {Latitude}, {Longitude}; trying MET Norway.", latitude, longitude);
        try
        {
            var fallback = await GetMetNorwayAsync(latitude, longitude, cancellationToken);
            if (fallback is not null)
            {
                cache.Set(cacheKey, new CachedWeather(fallback, DateTimeOffset.UtcNow.Add(Freshness)), StaleLifetime);
                return fallback;
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("MET Norway weather request timed out for {Latitude}, {Longitude}.", latitude, longitude);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "MET Norway weather request failed for {Latitude}, {Longitude}.", latitude, longitude);
        }

        return cached is null ? null : cached.Reading with { IsStale = true };
    }

    private async Task<WeatherReading?> GetMetNorwayAsync(decimal latitude, decimal longitude, CancellationToken cancellationToken)
    {
        var query = FormattableString.Invariant($"compact?lat={latitude}&lon={longitude}");
        using var response = await httpClientFactory.CreateClient("MetNorway").GetAsync(query, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return ParseMetNorway(json.RootElement);
    }

    private static WeatherReading? ParseMetNorway(JsonElement root)
    {
        if (!root.TryGetProperty("properties", out var properties) ||
            !properties.TryGetProperty("timeseries", out var timeseriesElement)) return null;
        var timeseries = timeseriesElement.EnumerateArray().ToArray();
        if (timeseries.Length == 0) return null;

        var samples = timeseries.Select(item =>
        {
            var observedAt = DateTimeOffset.TryParse(item.GetProperty("time").GetString(), CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed) ? parsed : DateTimeOffset.UtcNow;
            var data = item.GetProperty("data");
            var details = data.GetProperty("instant").GetProperty("details");
            var precipitation = NestedDecimal(data, "next_1_hours", "details", "precipitation_amount");
            var symbol = NestedString(data, "next_1_hours", "summary", "symbol_code") ??
                NestedString(data, "next_6_hours", "summary", "symbol_code") ?? string.Empty;
            return new ForecastSample(observedAt, Decimal(details, "air_temperature"),
                (int)Math.Round(Decimal(details, "relative_humidity")), Decimal(details, "wind_speed"), precipitation, symbol);
        }).ToArray();

        var current = samples[0];
        var forecast = samples
            .GroupBy(item => DateOnly.FromDateTime(item.ObservedAt.ToOffset(TimeSpan.FromHours(3)).DateTime))
            .OrderBy(group => group.Key)
            .Take(3)
            .Select(group => new ForecastDayResponse(group.Key, group.Min(item => item.TemperatureC),
                group.Max(item => item.TemperatureC), decimal.Round(group.Sum(item => item.PrecipitationMm), 1), 0))
            .ToArray();
        return new WeatherReading(current.TemperatureC, current.TemperatureC, current.RelativeHumidity,
            current.PrecipitationMm, decimal.Round(current.WindSpeedMs * 3.6m, 1), WeatherCode(current.Symbol),
            current.ObservedAt, forecast);
    }

    private static decimal NestedDecimal(JsonElement element, string parent, string child, string property) =>
        element.TryGetProperty(parent, out var parentElement) && parentElement.TryGetProperty(child, out var childElement)
            ? Decimal(childElement, property) : 0;

    private static string? NestedString(JsonElement element, string parent, string child, string property) =>
        element.TryGetProperty(parent, out var parentElement) && parentElement.TryGetProperty(child, out var childElement) &&
        childElement.TryGetProperty(property, out var value) ? value.GetString() : null;

    private static int WeatherCode(string symbol) => symbol switch
    {
        var value when value.Contains("thunder", StringComparison.OrdinalIgnoreCase) => 95,
        var value when value.Contains("snow", StringComparison.OrdinalIgnoreCase) => 71,
        var value when value.Contains("sleet", StringComparison.OrdinalIgnoreCase) => 66,
        var value when value.Contains("rain", StringComparison.OrdinalIgnoreCase) => 61,
        var value when value.Contains("fog", StringComparison.OrdinalIgnoreCase) => 45,
        var value when value.Contains("partlycloudy", StringComparison.OrdinalIgnoreCase) => 2,
        var value when value.Contains("cloudy", StringComparison.OrdinalIgnoreCase) => 3,
        _ => 0
    };

    private static WeatherReading Parse(JsonElement root)
    {
        var current = root.GetProperty("current");
        var daily = root.GetProperty("daily");
        var dates = daily.GetProperty("time").EnumerateArray().Select(item => DateOnly.Parse(item.GetString()!, CultureInfo.InvariantCulture)).ToArray();
        var minimums = Decimals(daily, "temperature_2m_min");
        var maximums = Decimals(daily, "temperature_2m_max");
        var precipitation = Decimals(daily, "precipitation_sum");
        var probabilities = Integers(daily, "precipitation_probability_max");
        var forecast = dates.Select((date, index) => new ForecastDayResponse(
            date, minimums.ElementAtOrDefault(index), maximums.ElementAtOrDefault(index),
            precipitation.ElementAtOrDefault(index), probabilities.ElementAtOrDefault(index))).ToArray();

        var observedAt = DateTimeOffset.TryParse(current.GetProperty("time").GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow;
        return new WeatherReading(
            Decimal(current, "temperature_2m"), Decimal(current, "apparent_temperature"),
            Integer(current, "relative_humidity_2m"), Decimal(current, "precipitation"),
            Decimal(current, "wind_speed_10m"), Integer(current, "weather_code"), observedAt, forecast);
    }

    private static decimal Decimal(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.TryGetDecimal(out var number) ? number : 0;
    private static int Integer(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.TryGetInt32(out var number) ? number : 0;
    private static decimal[] Decimals(JsonElement element, string property) => element.GetProperty(property).EnumerateArray().Select(item => item.TryGetDecimal(out var value) ? value : 0).ToArray();
    private static int[] Integers(JsonElement element, string property) => element.GetProperty(property).EnumerateArray().Select(item => item.TryGetInt32(out var value) ? value : 0).ToArray();
    private sealed record ForecastSample(DateTimeOffset ObservedAt, decimal TemperatureC, int RelativeHumidity, decimal WindSpeedMs, decimal PrecipitationMm, string Symbol);
    private sealed record CachedWeather(WeatherReading Reading, DateTimeOffset FreshUntil);
}
