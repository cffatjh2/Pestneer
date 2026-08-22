namespace Pesneer.Api.Inventory;

public sealed record CreateInventoryEntryRequest(
    string Name,
    string Category,
    decimal Quantity,
    string Unit,
    decimal MinimumQuantity,
    decimal? UnitCost,
    string? LotNumber);

public sealed record CreateInventoryExitRequest(
    Guid InventoryItemId,
    decimal Quantity,
    string? Note);

public sealed record InventorySummaryResponse(
    int ThisMonthExitCount,
    int VehicleCount,
    int VehicleStockItemCount);

public sealed record InventoryAlertResponse(
    Guid InventoryItemId,
    string Title,
    string Message,
    string Severity,
    decimal CurrentQuantity,
    decimal MinimumQuantity,
    string Unit,
    DateTimeOffset OccurredAt);

public sealed record InventoryItemResponse(
    Guid Id,
    string Name,
    string Category,
    decimal Quantity,
    string Unit,
    decimal MinimumQuantity,
    decimal UnitCost,
    string? LotNumber,
    string? LicenseNumber,
    Guid? LicenseDocumentId,
    DateTimeOffset LastMovementAt,
    string Status,
    decimal VehicleQuantity,
    decimal TotalQuantity);

public sealed record CreateVehicleRequest(
    string Plate,
    string Brand,
    string Model,
    int? ModelYear,
    Guid? AssignedEmployeeAccountId);

public sealed record TransferInventoryToVehicleRequest(
    Guid InventoryItemId,
    Guid VehicleId,
    decimal Quantity,
    string? Note);

public sealed record VehicleStockItemResponse(
    Guid Id,
    Guid? InventoryItemId,
    string ProductName,
    decimal Quantity,
    string Unit,
    string? LicenseNumber,
    Guid? LicenseDocumentId,
    DateTimeOffset LastMovementAt,
    bool IsManual);

public sealed record VehicleResponse(
    Guid Id,
    string Plate,
    string Brand,
    string Model,
    int? ModelYear,
    Guid? AssignedEmployeeAccountId,
    string AssignedEmployeeName,
    bool IsActive,
    IReadOnlyList<VehicleStockItemResponse> StockItems);
