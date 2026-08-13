namespace Pesneer.Api.FieldOperations;

public sealed record AttendanceResponse(
    Guid? ShiftId,
    string Status,
    DateOnly WorkDate,
    DateTimeOffset? StartedAt,
    DateTimeOffset? EndedAt,
    int WorkedMinutes,
    int BreakMinutes,
    DateTimeOffset CalculatedAt);

public sealed record VehicleStockItemRequest(
    Guid? VehicleStockItemId,
    string ProductName,
    decimal Quantity,
    string Unit,
    string? LicenseNumber,
    Guid? LicenseDocumentId,
    bool IsManual);

public sealed record CreateVehicleStockCheckRequest(IReadOnlyList<VehicleStockItemRequest> Items);

public sealed record VehicleStockItemResponse(
    Guid Id,
    Guid? VehicleStockItemId,
    Guid? InventoryItemId,
    string ProductName,
    decimal Quantity,
    string Unit,
    string? LicenseNumber,
    Guid? LicenseDocumentId,
    bool IsManual);

public sealed record VehicleStockCheckResponse(
    Guid Id,
    DateTimeOffset CheckedAt,
    Guid? VehicleId,
    string? Plate,
    string? VehicleDescription,
    IReadOnlyList<VehicleStockItemResponse> Items);

public sealed record WorkforceEmployeeResponse(
    Guid EmployeeId,
    string Name,
    string Email,
    string Status,
    DateTimeOffset? StartedAt,
    DateTimeOffset? EndedAt,
    int TodayWorkedMinutes,
    int TodayBreakMinutes,
    int WeekWorkedMinutes,
    int MonthWorkedMinutes,
    DateTimeOffset? LastStockCheckAt);

public sealed record WorkforceAnalyticsResponse(
    DateOnly Date,
    int ActiveEmployees,
    int WorkingEmployees,
    int CompletedEmployees,
    int TotalWorkedMinutes,
    int WeekWorkedMinutes,
    int MonthWorkedMinutes,
    IReadOnlyList<WorkforceEmployeeResponse> Employees);
