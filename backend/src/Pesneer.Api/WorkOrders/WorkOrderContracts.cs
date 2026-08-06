namespace Pesneer.Api.WorkOrders;

public sealed record CreateCustomerRequest(
    string LegalName,
    string? Code,
    string? ContactName,
    string? PhoneNumber,
    string? Email,
    string? Address,
    string? City,
    string? District,
    decimal? Latitude,
    decimal? Longitude,
    string? MapUrl);

public sealed record CreateCustomerBranchRequest(
    string Name,
    string? Code,
    string Address,
    string? City,
    string? District,
    string? ContactName,
    string? PhoneNumber,
    string? Email,
    decimal? Latitude,
    decimal? Longitude,
    string? MapUrl);

public sealed record BulkCreateCustomerBranchesRequest(
    IReadOnlyList<CreateCustomerBranchRequest> Branches);

public sealed record CustomerBranchResponse(
    Guid Id,
    string Name,
    string Code,
    string Address,
    string? City,
    string? District,
    string? ContactName,
    string? PhoneNumber,
    string? Email,
    decimal? Latitude,
    decimal? Longitude,
    string? MapUrl,
    bool IsActive);

public sealed record CustomerResponse(
    Guid Id,
    string LegalName,
    string Code,
    string? ContactName,
    string? PhoneNumber,
    string? Email,
    string? Address,
    string? City,
    string? District,
    decimal? Latitude,
    decimal? Longitude,
    string? MapUrl,
    bool IsActive,
    IReadOnlyList<CustomerBranchResponse> Branches);

public sealed record CreateWorkOrdersRequest(
    Guid CustomerId,
    IReadOnlyList<Guid> BranchIds,
    string ServiceType,
    DateOnly Date,
    string Time,
    int DurationMinutes,
    Guid? EmployeeAccountId,
    string? Notes);

public sealed record WorkOrderResponse(
    Guid Id,
    string Number,
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    string BranchAddress,
    string? BranchMapUrl,
    string ServiceType,
    DateTimeOffset ScheduledAt,
    int DurationMinutes,
    Guid? EmployeeAccountId,
    string EmployeeName,
    string Status,
    string? Notes);
