using System.Globalization;
using System.Text.RegularExpressions;

namespace Pesneer.Api.WeatherRisk;

public interface IMapLocationResolver
{
    Task<ResolvedLocation?> ResolveAsync(decimal? latitude, decimal? longitude, string? mapUrl, CancellationToken cancellationToken);
}

public sealed partial class MapLocationResolver(IHttpClientFactory httpClientFactory) : IMapLocationResolver
{
    private static readonly string[] AllowedHosts = ["google.com", "maps.google.com", "www.google.com", "maps.app.goo.gl", "goo.gl"];

    public async Task<ResolvedLocation?> ResolveAsync(decimal? latitude, decimal? longitude, string? mapUrl, CancellationToken cancellationToken)
    {
        if (CoordinatesAreValid(latitude, longitude)) return new ResolvedLocation(latitude!.Value, longitude!.Value);
        if (TryParse(mapUrl, out var parsed)) return parsed;
        if (!Uri.TryCreate(mapUrl, UriKind.Absolute, out var current) || !IsAllowed(current)) return null;

        var client = httpClientFactory.CreateClient("GoogleMapsResolver");
        for (var redirect = 0; redirect < 5; redirect++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, current);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is not null)
            {
                current = response.Headers.Location.IsAbsoluteUri ? response.Headers.Location : new Uri(current, response.Headers.Location);
                if (!IsAllowed(current)) return null;
                if (TryParse(current.ToString(), out parsed)) return parsed;
                continue;
            }

            return TryParse(response.RequestMessage?.RequestUri?.ToString(), out parsed) ? parsed : null;
        }

        return null;
    }

    public static bool TryParse(string? mapUrl, out ResolvedLocation? location)
    {
        location = null;
        if (string.IsNullOrWhiteSpace(mapUrl)) return false;

        var decoded = Uri.UnescapeDataString(mapUrl.Replace('+', ' '));
        foreach (var pattern in CoordinatePatterns())
        {
            var match = pattern.Match(decoded);
            if (!match.Success ||
                !decimal.TryParse(match.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var latitude) ||
                !decimal.TryParse(match.Groups[2].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var longitude) ||
                !CoordinatesAreValid(latitude, longitude)) continue;

            location = new ResolvedLocation(latitude, longitude);
            return true;
        }

        return false;
    }

    private static bool CoordinatesAreValid(decimal? latitude, decimal? longitude) =>
        latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180;

    private static bool IsAllowed(Uri uri) => uri.Scheme == Uri.UriSchemeHttps &&
        AllowedHosts.Any(host => uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith($".{host}", StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<Regex> CoordinatePatterns()
    {
        yield return AtCoordinatesRegex();
        yield return QueryCoordinatesRegex();
        yield return GoogleDataCoordinatesRegex();
    }

    [GeneratedRegex(@"@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)", RegexOptions.CultureInvariant)]
    private static partial Regex AtCoordinatesRegex();

    [GeneratedRegex(@"(?:[?&](?:q|query|ll|destination)=|/place/)(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex QueryCoordinatesRegex();

    [GeneratedRegex(@"!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)", RegexOptions.CultureInvariant)]
    private static partial Regex GoogleDataCoordinatesRegex();
}
