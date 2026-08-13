using System.Text.Json;
using Pesneer.Api.Reports;

namespace Pesneer.Api.StationActivations;

public static class StationActivationData
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string Serialize(IReadOnlyList<ServiceReportStationInput> stations) => JsonSerializer.Serialize(stations, JsonOptions);

    public static IReadOnlyList<ServiceReportStationInput> Deserialize(string json) =>
        JsonSerializer.Deserialize<List<ServiceReportStationInput>>(json, JsonOptions) ?? [];
}
