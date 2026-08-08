namespace Pesneer.Api.SitePlans;

public sealed record SitePlanEquipmentTypeInput(
    string Id,
    string Code,
    string Name,
    string Color,
    string Shape);

public sealed record SitePlanElementInput(
    string Id,
    string Type,
    decimal X,
    decimal Y,
    decimal Width,
    decimal Height,
    decimal Rotation,
    string? Text,
    string? Stroke,
    string? Fill,
    decimal StrokeWidth,
    string? EquipmentTypeId,
    string? StationNumber);

public sealed record SitePlanCanvasInput(
    int Width,
    int Height,
    IReadOnlyList<SitePlanEquipmentTypeInput> EquipmentTypes,
    IReadOnlyList<SitePlanElementInput> Elements);

public sealed record SaveSitePlanRequest(
    Guid CustomerId,
    Guid? BranchId,
    string Title,
    string AreaName,
    string? FieldGuide,
    string? RevisionNote,
    SitePlanCanvasInput Canvas);

public sealed record SitePlanDocumentResponse(
    Guid Id,
    string FileName,
    string ContentType,
    string DownloadUrl);

public sealed record SitePlanResponse(
    Guid Id,
    string Number,
    string Title,
    string AreaName,
    string FieldGuide,
    string Status,
    int Revision,
    string? RevisionNote,
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    string CreatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    SitePlanCanvasInput Canvas,
    SitePlanDocumentResponse Document);
