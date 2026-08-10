namespace Pesneer.Api.Domain;

public enum PortalType
{
    Owner = 1,
    Employee = 2,
    Customer = 3
}

public enum CompanyRole
{
    Owner = 1,
    Administrator = 2,
    OperationsManager = 3,
    Technician = 4,
    CustomerAdministrator = 5,
    CustomerViewer = 6
}

public enum WorkShiftStatus
{
    Working = 1,
    OnBreak = 2,
    Completed = 3
}

public sealed class Company
{
    public Guid Id { get; set; }
    public required string LegalName { get; set; }
    public required string Code { get; set; }
    public bool IsActive { get; set; } = true;
    public byte[]? LogoData { get; set; }
    public string? LogoContentType { get; set; }
    public string? LogoFileName { get; set; }
    public DateTimeOffset? LogoUpdatedAt { get; set; }
    public string? ReportNotificationEmail { get; set; }
    public bool VisionEnabled { get; set; } = true;
    public bool VisionReviewRequired { get; set; } = true;
    public string VisionPreferredModel { get; set; } = "Auto";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Account
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public required string NormalizedEmail { get; set; }
    public required string DisplayName { get; set; }
    public string? PhoneNumber { get; set; }
    public required string PasswordHash { get; set; }
    public PortalType Portal { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CompanyMembership
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid CompanyId { get; set; }
    public CompanyRole Role { get; set; }
    public bool CanSelfSchedule { get; set; }
    public bool IsActive { get; set; } = true;
    public Account Account { get; set; } = null!;
    public Company Company { get; set; } = null!;
}

public interface ICompanyScoped
{
    Guid CompanyId { get; set; }
}

public sealed class Customer : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public required string LegalName { get; set; }
    public required string Code { get; set; }
    public string? ContactName { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? District { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? MapUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public Company Company { get; set; } = null!;
    public ICollection<CustomerBranch> Branches { get; set; } = [];
}

public sealed class CustomerBranch : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public required string Name { get; set; }
    public required string Code { get; set; }
    public required string Address { get; set; }
    public string? City { get; set; }
    public string? District { get; set; }
    public string? ContactName { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? MapUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public Customer Customer { get; set; } = null!;
}

public sealed class CustomerMembership : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public CompanyRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public Account Account { get; set; } = null!;
    public Company Company { get; set; } = null!;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
}

public sealed class EmergencyRequest : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public Guid? AssignedEmployeeAccountId { get; set; }
    public Guid? CustomerContractId { get; set; }
    public required string Number { get; set; }
    public required string RequestType { get; set; } = "EmergencyCall";
    public required string Subject { get; set; } = "Acil çağrı";
    public required string ServiceType { get; set; }
    public required string Priority { get; set; }
    public required string Status { get; set; }
    public required string Description { get; set; }
    public required string ContractCoverage { get; set; } = "Unclassified";
    public decimal ChargeAmount { get; set; }
    public DateTimeOffset? SlaDueAt { get; set; }
    public string? ContactPhone { get; set; }
    public DateTimeOffset? DueAt { get; set; }
    public DateTimeOffset? RequestedAppointmentAt { get; set; }
    public required string ClosureApprovalStatus { get; set; } = "NotRequired";
    public DateTimeOffset? ClosureApprovedAt { get; set; }
    public string? ClosureApprovalNote { get; set; }
    public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? AcknowledgedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public Account? AssignedEmployeeAccount { get; set; }
    public CustomerContract? CustomerContract { get; set; }
    public ICollection<EmergencyRequestHistory> History { get; set; } = [];
}

public sealed class CommercialProposal : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public required string Number { get; set; }
    public required string Title { get; set; }
    public required string Status { get; set; } = "Draft";
    public DateOnly IssueDate { get; set; }
    public DateOnly ValidUntil { get; set; }
    public required string Currency { get; set; } = "TRY";
    public decimal DiscountAmount { get; set; }
    public decimal VatRate { get; set; } = 20;
    public decimal Subtotal { get; set; }
    public decimal VatAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string? Notes { get; set; }
    public string? Terms { get; set; }
    public Guid? CustomerDecisionByAccountId { get; set; }
    public DateTimeOffset? CustomerDecisionAt { get; set; }
    public string? CustomerDecisionNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<CommercialProposalLine> Lines { get; set; } = [];
}

public sealed class CommercialProposalLine : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CommercialProposalId { get; set; }
    public required string Description { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public int SortOrder { get; set; }
    public CommercialProposal CommercialProposal { get; set; } = null!;
}

public sealed class CustomerContract : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid? CommercialProposalId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public required string Number { get; set; }
    public required string Title { get; set; }
    public required string Status { get; set; } = "Draft";
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public required string BillingFrequency { get; set; } = "Monthly";
    public int BillingDay { get; set; } = 1;
    public int PaymentTermDays { get; set; } = 15;
    public decimal PeriodAmount { get; set; }
    public required string Currency { get; set; } = "TRY";
    public string? Scope { get; set; }
    public string? Terms { get; set; }
    public bool AutoRenew { get; set; }
    public int RenewalNoticeDays { get; set; } = 60;
    public decimal AnnualPriceIncreaseRate { get; set; }
    public int FreeEmergencyCallsPerYear { get; set; }
    public decimal ExtraEmergencyCallPrice { get; set; }
    public int ResponseTimeHours { get; set; } = 24;
    public DateTimeOffset? LastRenewedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public CommercialProposal? CommercialProposal { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<ReceivableEntry> Receivables { get; set; } = [];
    public ICollection<ContractServicePlan> ServicePlans { get; set; } = [];
    public ICollection<WorkOrder> WorkOrders { get; set; } = [];
    public ICollection<EmergencyRequest> EmergencyRequests { get; set; } = [];
}

public sealed class ContractServicePlan : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerContractId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid? AssignedEmployeeAccountId { get; set; }
    public required string ServiceType { get; set; }
    public required string RecurrenceType { get; set; } = "Monthly";
    public int VisitsPerPeriod { get; set; } = 1;
    public int PreferredDay { get; set; } = 1;
    public required string PreferredTime { get; set; } = "09:00";
    public int DurationMinutes { get; set; } = 60;
    public decimal BranchPrice { get; set; }
    public DateOnly? GeneratedThrough { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public CustomerContract CustomerContract { get; set; } = null!;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account? AssignedEmployeeAccount { get; set; }
    public ICollection<WorkOrder> WorkOrders { get; set; } = [];
}

public sealed class ReceivableEntry : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid? CustomerContractId { get; set; }
    public required string Number { get; set; }
    public required string Description { get; set; }
    public DateOnly IssueDate { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal Amount { get; set; }
    public decimal PaidAmount { get; set; }
    public required string Currency { get; set; } = "TRY";
    public required string Status { get; set; } = "Planned";
    public DateTimeOffset? PaidAt { get; set; }
    public string? PaymentNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public CustomerContract? CustomerContract { get; set; }
}

public sealed class WorkOrderEconomics : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkOrderId { get; set; }
    public decimal Revenue { get; set; }
    public decimal PersonnelHourlyCost { get; set; }
    public decimal DistanceKm { get; set; }
    public decimal FuelCost { get; set; }
    public decimal RepeatVisitCost { get; set; }
    public decimal EmergencyCallCost { get; set; }
    public decimal OtherCost { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public WorkOrder WorkOrder { get; set; } = null!;
}

public sealed class EmergencyRequestHistory : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid EmergencyRequestId { get; set; }
    public Guid ChangedByAccountId { get; set; }
    public required string Status { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public EmergencyRequest EmergencyRequest { get; set; } = null!;
    public Account ChangedByAccount { get; set; } = null!;
}

public sealed class WorkOrder : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid? AssignedEmployeeAccountId { get; set; }
    public Guid? CustomerContractId { get; set; }
    public Guid? ContractServicePlanId { get; set; }
    public required string Number { get; set; }
    public required string ServiceType { get; set; }
    public required string VisitType { get; set; } = "Routine";
    public required string RecurrenceType { get; set; } = "Once";
    public Guid? RecurrenceGroupId { get; set; }
    public DateTimeOffset ScheduledAt { get; set; }
    public int DurationMinutes { get; set; } = 60;
    public string? Notes { get; set; }
    public required string Status { get; set; }
    public required string ContractCoverage { get; set; } = "Unclassified";
    public decimal ChargeAmount { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public int? CustomerDurationMinutes { get; set; }
    public int TotalLaborMinutes { get; set; }
    public string? CompletionNote { get; set; }
    public string? Recommendation { get; set; }
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account? AssignedEmployeeAccount { get; set; }
    public CustomerContract? CustomerContract { get; set; }
    public ContractServicePlan? ContractServicePlan { get; set; }
    public ICollection<WorkOrderStatusHistory> History { get; set; } = [];
    public ICollection<WorkOrderPhoto> Photos { get; set; } = [];
    public ICollection<WorkOrderAssignment> Assignments { get; set; } = [];
    public ICollection<WorkOrderVisitSession> VisitSessions { get; set; } = [];
}

public sealed class WorkOrderAssignment : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkOrderId { get; set; }
    public Guid EmployeeAccountId { get; set; }
    public bool IsLead { get; set; }
    public DateTimeOffset AssignedAt { get; set; } = DateTimeOffset.UtcNow;
    public WorkOrder WorkOrder { get; set; } = null!;
    public Account EmployeeAccount { get; set; } = null!;
}

public sealed class WorkOrderVisitSession : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkOrderId { get; set; }
    public Guid EmployeeAccountId { get; set; }
    public required string Status { get; set; } = "Active";
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EndedAt { get; set; }
    public int DurationMinutes { get; set; }
    public string? Reason { get; set; }
    public WorkOrder WorkOrder { get; set; } = null!;
    public Account EmployeeAccount { get; set; } = null!;
}

public sealed class WorkOrderStatusHistory : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkOrderId { get; set; }
    public Guid ChangedByAccountId { get; set; }
    public string? FromStatus { get; set; }
    public required string ToStatus { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public WorkOrder WorkOrder { get; set; } = null!;
    public Account ChangedByAccount { get; set; } = null!;
}

public sealed class WorkOrderPhoto : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkOrderId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public required byte[] Data { get; set; }
    public string? Location { get; set; }
    public string? Status { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
    public WorkOrder WorkOrder { get; set; } = null!;
}

public sealed class ServiceReport : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkOrderId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public required string ReportNumber { get; set; }
    public required string Status { get; set; } = "Draft";
    public required string FirmName { get; set; }
    public string? FirmAddress { get; set; }
    public string? FirmPhone { get; set; }
    public string? FirmWeb { get; set; }
    public string? ResponsibleManager { get; set; }
    public string? PermissionNumber { get; set; }
    public string? TeamManager { get; set; }
    public string? TargetPests { get; set; }
    public string? ResidenceType { get; set; }
    public decimal? AreaSquareMeters { get; set; }
    public string? WorkType { get; set; }
    public string? Consumables { get; set; }
    public string? SafetyMeasures { get; set; }
    public string? ApplicationSummary { get; set; }
    public string? Findings { get; set; }
    public string? CorrectiveActions { get; set; }
    public string? Recommendations { get; set; }
    public string? CustomerRepresentativeName { get; set; }
    public string? ManagerSignatureData { get; set; }
    public string? CustomerSignatureData { get; set; }
    public string? AdditionalEmailRecipients { get; set; }
    public required string VerificationCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinalizedAt { get; set; }
    public WorkOrder WorkOrder { get; set; } = null!;
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<ServiceReportStation> Stations { get; set; } = [];
    public ICollection<ServiceReportProduct> Products { get; set; } = [];
    public ICollection<ReportEmailDelivery> EmailDeliveries { get; set; } = [];
}

public sealed class ReportEmailDelivery : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportId { get; set; }
    public required string RecipientEmail { get; set; }
    public required string NormalizedRecipientEmail { get; set; }
    public required string RecipientType { get; set; }
    public required string Status { get; set; } = "Pending";
    public int AttemptCount { get; set; }
    public DateTimeOffset? LastAttemptAt { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ServiceReport ServiceReport { get; set; } = null!;
}

public sealed class ServiceReportStation : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportId { get; set; }
    public Guid? SitePlanId { get; set; }
    public string? SitePlanElementId { get; set; }
    public required string DeviceNumber { get; set; }
    public required string Area { get; set; }
    public required string DeviceType { get; set; }
    public string? TargetPest { get; set; }
    public int CaughtCount { get; set; }
    public bool HasActivity { get; set; }
    public bool PlateChanged { get; set; }
    public required string DeviceStatus { get; set; } = "Active";
    public string? ActivityType { get; set; }
    public string? InaccessibilityReason { get; set; }
    public Guid? AppliedVehicleStockItemId { get; set; }
    public string? AppliedProductName { get; set; }
    public decimal? AppliedAmount { get; set; }
    public string? AppliedUnit { get; set; }
    public Guid? ReplacementVehicleStockItemId { get; set; }
    public string? ReplacementProductName { get; set; }
    public decimal? ReplacementQuantity { get; set; }
    public string? ReplacementUnit { get; set; }
    public string? Notes { get; set; }
    public ServiceReport ServiceReport { get; set; } = null!;
    public ICollection<ServiceReportPestObservation> PestObservations { get; set; } = [];
}

public sealed class ServiceReportPestObservation : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportStationId { get; set; }
    public required string PestKey { get; set; }
    public required string PestName { get; set; }
    public int DetectedCount { get; set; }
    public int ApprovedCount { get; set; }
    public decimal MeanConfidence { get; set; }
    public required string Source { get; set; } = "Manual";
    public string? ModelName { get; set; }
    public string? ModelVersion { get; set; }
    public required string ReviewStatus { get; set; } = "Reviewed";
    public string? VisionResultJson { get; set; }
    public DateTimeOffset? AnalyzedAt { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid? ReviewedByAccountId { get; set; }
    public ServiceReportStation ServiceReportStation { get; set; } = null!;
    public Account? ReviewedByAccount { get; set; }
}

public sealed class ServiceReportProduct : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportId { get; set; }
    public Guid? VehicleStockItemId { get; set; }
    public required string ProductName { get; set; }
    public string? LicenseNumber { get; set; }
    public string? ApplicationMethod { get; set; }
    public string? DilutionRate { get; set; }
    public string? ActiveIngredient { get; set; }
    public string? Antidote { get; set; }
    public string? PackingQuantity { get; set; }
    public decimal AmountUsed { get; set; }
    public required string Unit { get; set; }
    public ServiceReport ServiceReport { get; set; } = null!;
    public VehicleStockItem? VehicleStockItem { get; set; }
}

public sealed class QualityAnalysis : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public required string Number { get; set; }
    public required string AnalysisType { get; set; }
    public required string TemplateCode { get; set; }
    public required string Title { get; set; }
    public required string Status { get; set; } = "Published";
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public int? Score { get; set; }
    public string? Level { get; set; }
    public string? Summary { get; set; }
    public string? Findings { get; set; }
    public string? Recommendations { get; set; }
    public required string PayloadJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<QualityDocument> Documents { get; set; } = [];
}

public sealed class QualityDocument : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public Guid? QualityAnalysisId { get; set; }
    public Guid? SitePlanId { get; set; }
    public required string Category { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public long SizeBytes { get; set; }
    public byte[]? FileData { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer? Customer { get; set; }
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public QualityAnalysis? QualityAnalysis { get; set; }
    public SitePlan? SitePlan { get; set; }
}

public sealed class AuditPackage : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public Guid? QualityDocumentId { get; set; }
    public required string Number { get; set; }
    public required string Title { get; set; }
    public required string AuditProfile { get; set; }
    public required string Status { get; set; } = "Generated";
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public bool IncludeOptionalWaste { get; set; }
    public int ReadinessScore { get; set; }
    public required string PreflightJson { get; set; }
    public required string ManifestJson { get; set; }
    public required byte[] PdfData { get; set; }
    public required byte[] ZipData { get; set; }
    public required string PdfSha256 { get; set; }
    public required string ZipSha256 { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public QualityDocument? QualityDocument { get; set; }
    public ICollection<AuditPackageItem> Items { get; set; } = [];
}

public sealed class AuditPackageItem : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid AuditPackageId { get; set; }
    public required string Section { get; set; }
    public required string SourceType { get; set; }
    public Guid? SourceId { get; set; }
    public required string DocumentNumber { get; set; }
    public required string Title { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public string? Revision { get; set; }
    public string? Scope { get; set; }
    public DateTimeOffset SourceDate { get; set; }
    public required string Sha256 { get; set; }
    public required byte[] FileData { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public AuditPackage AuditPackage { get; set; } = null!;
}

public sealed class QualityInspection : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportId { get; set; }
    public Guid InspectorAccountId { get; set; }
    public Guid EmployeeAccountId { get; set; }
    public Guid? CorrectiveActionId { get; set; }
    public required string Number { get; set; }
    public required string InspectionType { get; set; }
    public required string SelectionReason { get; set; }
    public required string Status { get; set; } = "Planned";
    public DateTimeOffset? ScheduledAt { get; set; }
    public DateTimeOffset? InspectedAt { get; set; }
    public int PhotoQualityScore { get; set; }
    public int StationCompletionScore { get; set; }
    public int ProductDoseScore { get; set; }
    public int SignatureScore { get; set; }
    public int TimelinessScore { get; set; }
    public int ReportCompletenessScore { get; set; }
    public int TotalScore { get; set; }
    public required string Grade { get; set; } = "Pending";
    public bool RequiresCorrectiveAction { get; set; }
    public string? Findings { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ServiceReport ServiceReport { get; set; } = null!;
    public Account InspectorAccount { get; set; } = null!;
    public Account EmployeeAccount { get; set; } = null!;
    public CorrectiveAction? CorrectiveAction { get; set; }
}

public sealed class CorrectiveAction : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public Guid? AssignedAccountId { get; set; }
    public required string Number { get; set; }
    public required string SourceType { get; set; }
    public Guid? SourceId { get; set; }
    public required string Category { get; set; }
    public required string Title { get; set; }
    public required string Problem { get; set; }
    public string? RootCause { get; set; }
    public required string ProposedAction { get; set; }
    public required string ResponsibleParty { get; set; }
    public required string Priority { get; set; }
    public required string Status { get; set; } = "Open";
    public DateOnly DueDate { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public required string CustomerApprovalStatus { get; set; } = "Pending";
    public DateTimeOffset? CustomerApprovalAt { get; set; }
    public string? CustomerApprovalNote { get; set; }
    public string? RecurrenceKey { get; set; }
    public int RecurrenceCount { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public Account? AssignedAccount { get; set; }
    public ICollection<CorrectiveActionEvidence> Evidence { get; set; } = [];
    public ICollection<CorrectiveActionHistory> History { get; set; } = [];
}

public sealed class CorrectiveActionEvidence : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CorrectiveActionId { get; set; }
    public Guid UploadedByAccountId { get; set; }
    public required string Stage { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public required byte[] Data { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public CorrectiveAction CorrectiveAction { get; set; } = null!;
    public Account UploadedByAccount { get; set; } = null!;
}

public sealed class CorrectiveActionHistory : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CorrectiveActionId { get; set; }
    public Guid ChangedByAccountId { get; set; }
    public string? FromStatus { get; set; }
    public required string ToStatus { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public CorrectiveAction CorrectiveAction { get; set; } = null!;
    public Account ChangedByAccount { get; set; } = null!;
}

public sealed class WasteDisposalRecord : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid? WorkOrderId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public required string Number { get; set; }
    public required string WasteType { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public required string Status { get; set; } = "Generated";
    public DateTimeOffset GeneratedAt { get; set; }
    public string? TemporaryStorage { get; set; }
    public string? RecipientName { get; set; }
    public string? CarrierOrFacility { get; set; }
    public string? DisposalMethod { get; set; }
    public string? DocumentNumber { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public WorkOrder? WorkOrder { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<WasteDisposalEvidence> Evidence { get; set; } = [];
}

public sealed class WasteDisposalEvidence : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WasteDisposalRecordId { get; set; }
    public Guid UploadedByAccountId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public required byte[] Data { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public WasteDisposalRecord WasteDisposalRecord { get; set; } = null!;
    public Account UploadedByAccount { get; set; } = null!;
}

public sealed class SitePlan : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid CreatedByAccountId { get; set; }
    public required string Number { get; set; }
    public required string Title { get; set; }
    public required string AreaName { get; set; }
    public required string FieldGuide { get; set; }
    public required string Status { get; set; }
    public int Revision { get; set; }
    public string? RevisionNote { get; set; }
    public required string CanvasJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<QualityDocument> Documents { get; set; } = [];
}

public sealed class WorkShift : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid EmployeeAccountId { get; set; }
    public DateOnly WorkDate { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public WorkShiftStatus Status { get; set; }
    public Account EmployeeAccount { get; set; } = null!;
    public ICollection<WorkShiftBreak> Breaks { get; set; } = [];
}

public sealed class WorkShiftBreak : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid WorkShiftId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public WorkShift WorkShift { get; set; } = null!;
}

public sealed class VehicleStockCheck : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid EmployeeAccountId { get; set; }
    public Guid? VehicleId { get; set; }
    public DateTimeOffset CheckedAt { get; set; }
    public Account EmployeeAccount { get; set; } = null!;
    public Vehicle? Vehicle { get; set; }
    public ICollection<VehicleStockCheckItem> Items { get; set; } = [];
}

public sealed class VehicleStockCheckItem : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid VehicleStockCheckId { get; set; }
    public Guid? VehicleStockItemId { get; set; }
    public required string ProductName { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public bool IsManual { get; set; }
    public VehicleStockCheck VehicleStockCheck { get; set; } = null!;
    public VehicleStockItem? VehicleStockItem { get; set; }
}

public sealed class Vehicle : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? AssignedEmployeeAccountId { get; set; }
    public required string Plate { get; set; }
    public required string NormalizedPlate { get; set; }
    public required string Brand { get; set; }
    public required string Model { get; set; }
    public int? ModelYear { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Account? AssignedEmployeeAccount { get; set; }
    public ICollection<VehicleStockItem> StockItems { get; set; } = [];
}

public sealed class VehicleStockItem : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid VehicleId { get; set; }
    public Guid? InventoryItemId { get; set; }
    public required string ProductName { get; set; }
    public required string NormalizedName { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public DateTimeOffset LastMovementAt { get; set; }
    public bool IsActive { get; set; } = true;
    public Vehicle Vehicle { get; set; } = null!;
    public InventoryItem? InventoryItem { get; set; }
}

public sealed class VehicleStockMovement : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid VehicleStockItemId { get; set; }
    public Guid? InventoryItemId { get; set; }
    public Guid? ServiceReportId { get; set; }
    public Guid? PerformedByAccountId { get; set; }
    public required string Type { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public VehicleStockItem VehicleStockItem { get; set; } = null!;
    public InventoryItem? InventoryItem { get; set; }
    public ServiceReport? ServiceReport { get; set; }
    public Account? PerformedByAccount { get; set; }
}

public sealed class InventoryItem : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
    public required string Category { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public decimal MinimumQuantity { get; set; }
    public decimal UnitCost { get; set; }
    public string? LotNumber { get; set; }
    public DateTimeOffset LastMovementAt { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class InventoryMovement : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid InventoryItemId { get; set; }
    public required string Type { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public InventoryItem InventoryItem { get; set; } = null!;
}

public sealed class CalendarEntry : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? AssignedEmployeeAccountId { get; set; }
    public required string Kind { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset ScheduledAt { get; set; }
    public bool IsAllDay { get; set; }
    public required string Priority { get; set; }
    public required string Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Account? AssignedEmployeeAccount { get; set; }
}
