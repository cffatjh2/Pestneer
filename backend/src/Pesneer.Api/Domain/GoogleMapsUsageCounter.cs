namespace Pesneer.Api.Domain;

/// <summary>
/// Project-wide monthly reservation counter for billable Google Maps SKUs.
/// It is deliberately not tenant-scoped because Google bills the shared API project.
/// </summary>
public sealed class GoogleMapsUsageCounter
{
    public required string PeriodKey { get; set; }
    public required string Metric { get; set; }
    public int UsedUnits { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
