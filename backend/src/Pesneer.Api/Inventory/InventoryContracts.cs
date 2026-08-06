namespace Pesneer.Api.Inventory;

public sealed record CreateInventoryEntryRequest(
    string Name,
    string Category,
    decimal Quantity,
    string Unit,
    decimal MinimumQuantity,
    string? LotNumber);

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
