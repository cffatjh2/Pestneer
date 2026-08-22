namespace Pesneer.Api.Maps;

public sealed class GoogleMapsQuotaOptions
{
    public const string SectionName = "GoogleMapsQuota";

    public bool Enabled { get; set; } = true;
    public int DynamicMapsMonthlyLimit { get; set; } = 9_000;
    public int AutocompleteRequestsMonthlyLimit { get; set; } = 9_000;
    public int PlaceDetailsMonthlyLimit { get; set; } = 9_000;
    public int GeocodingMonthlyLimit { get; set; } = 9_000;
}
