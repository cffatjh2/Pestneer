namespace Pesneer.Api.Customers;

public sealed record CustomerPortalBranchResponse(Guid Id, string Name, string Code, string Address, string? City, string? District, string? PhoneNumber, string? Email, string? MapUrl);
public sealed record CustomerPortalWorkOrderResponse(Guid Id, string Number, Guid? BranchId, string BranchName, string ServiceType, string VisitType, DateTimeOffset ScheduledAt, int DurationMinutes, string Status, string EmployeeName, string? CompletionNote, string? Recommendation);
public sealed record EmergencyHistoryResponse(string Status, string? Note, DateTimeOffset OccurredAt, string ChangedBy);
public sealed record EmergencyRequestResponse(Guid Id, string Number, Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, string RequestType, string Subject, string ServiceType, string Priority, string Status, string Description, string? ContactPhone, Guid? AssignedEmployeeAccountId, string EmployeeName, DateTimeOffset RequestedAt, DateTimeOffset? DueAt, DateTimeOffset? RequestedAppointmentAt, string ClosureApprovalStatus, DateTimeOffset? ClosureApprovedAt, string? ClosureApprovalNote, DateTimeOffset? AcknowledgedAt, DateTimeOffset? CompletedAt, IReadOnlyList<EmergencyHistoryResponse> History);
public sealed record CustomerPortalSummaryResponse(Guid CustomerId, string CustomerName, string Scope, IReadOnlyList<CustomerPortalBranchResponse> Branches, IReadOnlyList<CustomerPortalWorkOrderResponse> UpcomingWorkOrders, IReadOnlyList<CustomerPortalWorkOrderResponse> CompletedWorkOrders, IReadOnlyList<EmergencyRequestResponse> EmergencyRequests);
public sealed record CreateEmergencyRequestRequest(Guid? BranchId, string? RequestType, string? Subject, string? ServiceType, string Priority, string Description, string? ContactPhone, DateTimeOffset? DueAt, DateTimeOffset? RequestedAppointmentAt);
public sealed record UpdateEmergencyRequestRequest(string Status, Guid? EmployeeAccountId, string? Note, DateTimeOffset? DueAt);
public sealed record RequestMessageRequest(string Message);
public sealed record ClosureApprovalRequest(bool Approved, string? Note);
