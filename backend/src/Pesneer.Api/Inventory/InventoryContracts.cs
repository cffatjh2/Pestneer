namespace Pesneer.Api.Inventory;

public sealed record CreateInventoryEntryRequest(
    string Name,
    string Category,
    decimal Quantity,
    string Unit,
    decimal MinimumQuantity,
    string? LotNumber);

public sealed record CreateInventoryExitRequest(
    Guid InventoryItemId,
    decimal Quantity,
    string? Note);

public sealed record InventorySummaryResponse(
    int ThisMonthExitCount);

public sealed record InventoryItemResponse(
    Guid Id,
    string Name,
    string Category,
    decimal Quantity,
    string Unit,
    decimal MinimumQuantity,
    string? LotNumber,
    DateTimeOffset LastMovementAt,
    string Status);
