using Pesneer.Api.Reports;

namespace Pesneer.Api.StationActivations;

public sealed record UpsertStationActivationRequest(
    string? Notes,
    bool Finalize,
    IReadOnlyList<ServiceReportStationInput> Stations);

public sealed record StationActivationResponse(
    Guid Id,
    Guid WorkOrderId,
    string WorkOrderNumber,
    string Number,
    string Status,
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    DateTimeOffset ScheduledAt,
    string OperatorName,
    string? Notes,
    int TotalStations,
    int ActiveStations,
    int DamagedStations,
    int InaccessibleStations,
    int TotalCaught,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? FinalizedAt,
    IReadOnlyList<ServiceReportStationInput> Stations);
