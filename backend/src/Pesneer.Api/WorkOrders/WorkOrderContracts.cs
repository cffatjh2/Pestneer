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
    string? MapUrl,
    string? PortalContactName,
    string? PortalEmail,
    string? PortalPassword);

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
    string? MapUrl,
    string? PortalContactName,
    string? PortalEmail,
    string? PortalPassword);

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

public sealed record BranchEmployeeAssignmentRequest(Guid BranchId, Guid? EmployeeAccountId);

public sealed record CreateWorkOrdersRequest(
    Guid CustomerId,
    IReadOnlyList<Guid> BranchIds,
    string ServiceType,
    DateOnly Date,
    string Time,
    int DurationMinutes,
    Guid? EmployeeAccountId,
    string? Notes,
    string VisitType = "Routine",
    string RecurrenceType = "Once",
    int? OccurrenceCount = null,
    IReadOnlyList<DateOnly>? ManualDates = null,
    IReadOnlyList<BranchEmployeeAssignmentRequest>? BranchAssignments = null,
    IReadOnlyList<Guid>? EmployeeAccountIds = null);

public sealed record UpdateWorkOrderRequest(
    Guid? EmployeeAccountId,
    IReadOnlyList<Guid>? EmployeeAccountIds,
    string ServiceType,
    string VisitType,
    DateOnly Date,
    string Time,
    int DurationMinutes,
    string? Notes,
    string Status);

public sealed record WorkOrderHistoryResponse(
    Guid Id,
    string? FromStatus,
    string ToStatus,
    string? Note,
    DateTimeOffset OccurredAt,
    string ChangedBy);

public sealed record WorkOrderPhotoResponse(
    Guid Id,
    string FileName,
    string ContentType,
    DateTimeOffset UploadedAt,
    string Url,
    string? Location,
    string? Status,
    string? Description);

public sealed record WorkOrderAssignmentResponse(Guid EmployeeAccountId, string EmployeeName, bool IsLead);

public sealed record WorkOrderVisitSessionResponse(
    Guid Id,
    Guid EmployeeAccountId,
    string EmployeeName,
    string Status,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    int DurationMinutes,
    string? Reason);

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
    string VisitType,
    string RecurrenceType,
    Guid? RecurrenceGroupId,
    DateTimeOffset ScheduledAt,
    int DurationMinutes,
    Guid? EmployeeAccountId,
    string EmployeeName,
    string Status,
    string? Notes,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    int? CustomerDurationMinutes,
    int TotalLaborMinutes,
    string? CompletionNote,
    string? Recommendation,
    IReadOnlyList<WorkOrderAssignmentResponse> Assignments,
    IReadOnlyList<WorkOrderVisitSessionResponse> VisitSessions,
    IReadOnlyList<WorkOrderHistoryResponse> History,
    IReadOnlyList<WorkOrderPhotoResponse> Photos);

public sealed record CompleteWorkOrderRequest(string CompletionNote, string? Recommendation);

public sealed record ChangeVisitStateRequest(string Action, string? Reason);

public sealed record EmployeePlanningOptionsResponse(
    bool CanSelfSchedule,
    IReadOnlyList<CustomerResponse> Customers);
