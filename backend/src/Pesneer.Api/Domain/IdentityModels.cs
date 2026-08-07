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
    public CompanyRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public Account Account { get; set; } = null!;
    public Company Company { get; set; } = null!;
    public Customer Customer { get; set; } = null!;
}

public sealed class WorkOrder : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? CustomerBranchId { get; set; }
    public Guid? AssignedEmployeeAccountId { get; set; }
    public required string Number { get; set; }
    public required string ServiceType { get; set; }
    public required string VisitType { get; set; } = "Routine";
    public required string RecurrenceType { get; set; } = "Once";
    public Guid? RecurrenceGroupId { get; set; }
    public DateTimeOffset ScheduledAt { get; set; }
    public int DurationMinutes { get; set; } = 60;
    public string? Notes { get; set; }
    public required string Status { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? CompletionNote { get; set; }
    public string? Recommendation { get; set; }
    public Customer Customer { get; set; } = null!;
    public CustomerBranch? CustomerBranch { get; set; }
    public Account? AssignedEmployeeAccount { get; set; }
    public ICollection<WorkOrderStatusHistory> History { get; set; } = [];
    public ICollection<WorkOrderPhoto> Photos { get; set; } = [];
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
    public required string VerificationCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinalizedAt { get; set; }
    public WorkOrder WorkOrder { get; set; } = null!;
    public Account CreatedByAccount { get; set; } = null!;
    public ICollection<ServiceReportStation> Stations { get; set; } = [];
    public ICollection<ServiceReportProduct> Products { get; set; } = [];
}

public sealed class ServiceReportStation : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportId { get; set; }
    public required string DeviceNumber { get; set; }
    public required string Area { get; set; }
    public required string DeviceType { get; set; }
    public string? TargetPest { get; set; }
    public int CaughtCount { get; set; }
    public bool HasActivity { get; set; }
    public bool PlateChanged { get; set; }
    public required string DeviceStatus { get; set; } = "Active";
    public string? Notes { get; set; }
    public ServiceReport ServiceReport { get; set; } = null!;
}

public sealed class ServiceReportProduct : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ServiceReportId { get; set; }
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
    public DateTimeOffset CheckedAt { get; set; }
    public Account EmployeeAccount { get; set; } = null!;
    public ICollection<VehicleStockCheckItem> Items { get; set; } = [];
}

public sealed class VehicleStockCheckItem : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid VehicleStockCheckId { get; set; }
    public required string ProductName { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public bool IsManual { get; set; }
    public VehicleStockCheck VehicleStockCheck { get; set; } = null!;
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
