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
        for (var attempt = 1; attempt <= 3; attempt++)
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

            if (attempt < 3) await Task.Delay(attempt == 1 ? 350 : 900, cancellationToken);
        }

        logger.LogWarning(lastError, "Open-Meteo weather request failed after retries for {Latitude}, {Longitude}.", latitude, longitude);
        return cached is null ? null : cached.Reading with { IsStale = true };
    }

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
    private sealed record CachedWeather(WeatherReading Reading, DateTimeOffset FreshUntil);
}
