using System.Security;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public class PesneerDbContext(
    DbContextOptions options,
    ICompanyContext companyContext) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<CompanyEmailConnection> CompanyEmailConnections => Set<CompanyEmailConnection>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<CompanyMembership> CompanyMemberships => Set<CompanyMembership>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerBranch> CustomerBranches => Set<CustomerBranch>();
    public DbSet<CustomerMembership> CustomerMemberships => Set<CustomerMembership>();
    public DbSet<EmergencyRequest> EmergencyRequests => Set<EmergencyRequest>();
    public DbSet<EmergencyRequestHistory> EmergencyRequestHistories => Set<EmergencyRequestHistory>();
    public DbSet<CommercialProposal> CommercialProposals => Set<CommercialProposal>();
    public DbSet<CommercialProposalLine> CommercialProposalLines => Set<CommercialProposalLine>();
    public DbSet<CustomerContract> CustomerContracts => Set<CustomerContract>();
    public DbSet<ContractServicePlan> ContractServicePlans => Set<ContractServicePlan>();
    public DbSet<ReceivableEntry> ReceivableEntries => Set<ReceivableEntry>();
    public DbSet<WorkOrderEconomics> WorkOrderEconomics => Set<WorkOrderEconomics>();
    public DbSet<WorkOrder> WorkOrders => Set<WorkOrder>();
    public DbSet<WorkOrderStatusHistory> WorkOrderStatusHistories => Set<WorkOrderStatusHistory>();
    public DbSet<WorkOrderPhoto> WorkOrderPhotos => Set<WorkOrderPhoto>();
    public DbSet<WorkOrderAssignment> WorkOrderAssignments => Set<WorkOrderAssignment>();
    public DbSet<WorkOrderVisitSession> WorkOrderVisitSessions => Set<WorkOrderVisitSession>();
    public DbSet<ServiceReport> ServiceReports => Set<ServiceReport>();
    public DbSet<ServiceReportStation> ServiceReportStations => Set<ServiceReportStation>();
    public DbSet<ServiceReportPestObservation> ServiceReportPestObservations => Set<ServiceReportPestObservation>();
    public DbSet<ServiceReportProduct> ServiceReportProducts => Set<ServiceReportProduct>();
    public DbSet<StationActivation> StationActivations => Set<StationActivation>();
    public DbSet<ReportEmailDelivery> ReportEmailDeliveries => Set<ReportEmailDelivery>();
    public DbSet<QualityAnalysis> QualityAnalyses => Set<QualityAnalysis>();
    public DbSet<QualityDocument> QualityDocuments => Set<QualityDocument>();
    public DbSet<AuditPackage> AuditPackages => Set<AuditPackage>();
    public DbSet<AuditPackageItem> AuditPackageItems => Set<AuditPackageItem>();
    public DbSet<QualityInspection> QualityInspections => Set<QualityInspection>();
    public DbSet<CorrectiveAction> CorrectiveActions => Set<CorrectiveAction>();
    public DbSet<CorrectiveActionEvidence> CorrectiveActionEvidence => Set<CorrectiveActionEvidence>();
    public DbSet<CorrectiveActionHistory> CorrectiveActionHistories => Set<CorrectiveActionHistory>();
    public DbSet<WasteDisposalRecord> WasteDisposalRecords => Set<WasteDisposalRecord>();
    public DbSet<WasteDisposalEvidence> WasteDisposalEvidence => Set<WasteDisposalEvidence>();
    public DbSet<SitePlan> SitePlans => Set<SitePlan>();
    public DbSet<WorkShift> WorkShifts => Set<WorkShift>();
    public DbSet<WorkShiftBreak> WorkShiftBreaks => Set<WorkShiftBreak>();
    public DbSet<VehicleStockCheck> VehicleStockChecks => Set<VehicleStockCheck>();
    public DbSet<VehicleStockCheckItem> VehicleStockCheckItems => Set<VehicleStockCheckItem>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<VehicleStockItem> VehicleStockItems => Set<VehicleStockItem>();
    public DbSet<VehicleStockMovement> VehicleStockMovements => Set<VehicleStockMovement>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<CalendarEntry> CalendarEntries => Set<CalendarEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Company>(entity =>
        {
            entity.HasIndex(company => company.Code).IsUnique();
            entity.Property(company => company.Code).HasMaxLength(64);
            entity.Property(company => company.LegalName).HasMaxLength(240);
            entity.Property(company => company.LogoContentType).HasMaxLength(80);
            entity.Property(company => company.LogoFileName).HasMaxLength(240);
            entity.Property(company => company.ReportNotificationEmail).HasMaxLength(320);
            entity.Property(company => company.IsTrial).HasDefaultValue(false);
            entity.Property(company => company.VisionEnabled).HasDefaultValue(true);
            entity.Property(company => company.VisionReviewRequired).HasDefaultValue(true);
            entity.Property(company => company.VisionPreferredModel).HasMaxLength(16).HasDefaultValue("Auto");
        });

        modelBuilder.Entity<CompanyEmailConnection>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Provider }).IsUnique();
            entity.Property(item => item.Provider).HasMaxLength(32);
            entity.Property(item => item.SenderEmail).HasMaxLength(320);
            entity.Property(item => item.EncryptedRefreshToken).HasMaxLength(4000);
            entity.Property(item => item.LastError).HasMaxLength(2000);
            entity.HasOne(item => item.Company).WithMany().HasForeignKey(item => item.CompanyId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<Account>(entity =>
        {
            entity.HasIndex(account => new { account.Portal, account.NormalizedEmail }).IsUnique();
            entity.Property(account => account.Portal).HasConversion<string>().HasMaxLength(24);
            entity.Property(account => account.Email).HasMaxLength(320);
            entity.Property(account => account.NormalizedEmail).HasMaxLength(320);
            entity.Property(account => account.DisplayName).HasMaxLength(160);
            entity.Property(account => account.PhoneNumber).HasMaxLength(24);
        });

        modelBuilder.Entity<CompanyMembership>(entity =>
        {
            entity.HasIndex(membership => new { membership.AccountId, membership.CompanyId }).IsUnique();
            entity.Property(membership => membership.Role).HasConversion<string>().HasMaxLength(40);
            entity.HasOne(membership => membership.Account).WithMany().HasForeignKey(membership => membership.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(membership => membership.Company).WithMany().HasForeignKey(membership => membership.CompanyId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.HasIndex(customer => new { customer.CompanyId, customer.Code }).IsUnique();
            entity.Property(customer => customer.LegalName).HasMaxLength(240);
            entity.Property(customer => customer.Code).HasMaxLength(64);
            entity.Property(customer => customer.ContactName).HasMaxLength(160);
            entity.Property(customer => customer.PhoneNumber).HasMaxLength(24);
            entity.Property(customer => customer.Email).HasMaxLength(320);
            entity.Property(customer => customer.Address).HasMaxLength(500);
            entity.Property(customer => customer.City).HasMaxLength(80);
            entity.Property(customer => customer.District).HasMaxLength(80);
            entity.Property(customer => customer.Latitude).HasPrecision(9, 6);
            entity.Property(customer => customer.Longitude).HasPrecision(9, 6);
            entity.Property(customer => customer.MapUrl).HasMaxLength(1000);
            entity.HasOne(customer => customer.Company).WithMany().HasForeignKey(customer => customer.CompanyId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(customer => companyContext.CompanyId.HasValue && customer.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CustomerBranch>(entity =>
        {
            entity.HasIndex(branch => new { branch.CompanyId, branch.CustomerId, branch.Code }).IsUnique();
            entity.Property(branch => branch.Name).HasMaxLength(160);
            entity.Property(branch => branch.Code).HasMaxLength(64);
            entity.Property(branch => branch.Address).HasMaxLength(500);
            entity.Property(branch => branch.City).HasMaxLength(80);
            entity.Property(branch => branch.District).HasMaxLength(80);
            entity.Property(branch => branch.ContactName).HasMaxLength(160);
            entity.Property(branch => branch.PhoneNumber).HasMaxLength(24);
            entity.Property(branch => branch.Email).HasMaxLength(320);
            entity.Property(branch => branch.Latitude).HasPrecision(9, 6);
            entity.Property(branch => branch.Longitude).HasPrecision(9, 6);
            entity.Property(branch => branch.MapUrl).HasMaxLength(1000);
            entity.HasOne(branch => branch.Customer).WithMany(customer => customer.Branches).HasForeignKey(branch => branch.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(branch => companyContext.CompanyId.HasValue && branch.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CustomerMembership>(entity =>
        {
            entity.HasIndex(membership => new { membership.AccountId, membership.CompanyId }).IsUnique();
            entity.Property(membership => membership.Role).HasConversion<string>().HasMaxLength(40);
            entity.HasOne(membership => membership.Account).WithMany().HasForeignKey(membership => membership.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(membership => membership.Company).WithMany().HasForeignKey(membership => membership.CompanyId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(membership => membership.Customer).WithMany().HasForeignKey(membership => membership.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(membership => membership.CustomerBranch).WithMany().HasForeignKey(membership => membership.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(membership => companyContext.CompanyId.HasValue && membership.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<EmergencyRequest>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.Status, item.RequestedAt });
            entity.Property(item => item.Number).HasMaxLength(40);
            entity.Property(item => item.RequestType).HasMaxLength(40);
            entity.Property(item => item.Subject).HasMaxLength(240);
            entity.Property(item => item.ServiceType).HasMaxLength(32);
            entity.Property(item => item.Priority).HasMaxLength(16);
            entity.Property(item => item.Status).HasMaxLength(20);
            entity.Property(item => item.Description).HasMaxLength(2000);
            entity.Property(item => item.ContractCoverage).HasMaxLength(32);
            entity.Property(item => item.ChargeAmount).HasPrecision(14, 2);
            entity.Property(item => item.ContactPhone).HasMaxLength(24);
            entity.Property(item => item.ClosureApprovalStatus).HasMaxLength(24);
            entity.Property(item => item.ClosureApprovalNote).HasMaxLength(1000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.AssignedEmployeeAccount).WithMany().HasForeignKey(item => item.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerContract).WithMany(item => item.EmergencyRequests).HasForeignKey(item => item.CustomerContractId).OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CommercialProposal>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.CustomerId, item.Status, item.CreatedAt });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.Currency).HasMaxLength(8);
            entity.Property(item => item.DiscountAmount).HasPrecision(14, 2);
            entity.Property(item => item.VatRate).HasPrecision(5, 2);
            entity.Property(item => item.Subtotal).HasPrecision(14, 2);
            entity.Property(item => item.VatAmount).HasPrecision(14, 2);
            entity.Property(item => item.TotalAmount).HasPrecision(14, 2);
            entity.Property(item => item.Notes).HasMaxLength(3000);
            entity.Property(item => item.Terms).HasMaxLength(5000);
            entity.Property(item => item.CustomerDecisionNote).HasMaxLength(1000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CommercialProposalLine>(entity =>
        {
            entity.Property(item => item.Description).HasMaxLength(500);
            entity.Property(item => item.Unit).HasMaxLength(32);
            entity.Property(item => item.Quantity).HasPrecision(14, 3);
            entity.Property(item => item.UnitPrice).HasPrecision(14, 2);
            entity.Property(item => item.LineTotal).HasPrecision(14, 2);
            entity.HasOne(item => item.CommercialProposal).WithMany(item => item.Lines).HasForeignKey(item => item.CommercialProposalId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CustomerContract>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.CustomerId, item.Status, item.EndDate });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.BillingFrequency).HasMaxLength(24);
            entity.Property(item => item.PeriodAmount).HasPrecision(14, 2);
            entity.Property(item => item.AnnualPriceIncreaseRate).HasPrecision(6, 2);
            entity.Property(item => item.ExtraEmergencyCallPrice).HasPrecision(14, 2);
            entity.Property(item => item.Currency).HasMaxLength(8);
            entity.Property(item => item.Scope).HasMaxLength(5000);
            entity.Property(item => item.Terms).HasMaxLength(5000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CommercialProposal).WithMany().HasForeignKey(item => item.CommercialProposalId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ContractServicePlan>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.CustomerContractId, item.CustomerBranchId, item.ServiceType });
            entity.Property(item => item.ServiceType).HasMaxLength(120);
            entity.Property(item => item.RecurrenceType).HasMaxLength(20);
            entity.Property(item => item.PreferredTime).HasMaxLength(8);
            entity.Property(item => item.BranchPrice).HasPrecision(14, 2);
            entity.HasOne(item => item.CustomerContract).WithMany(item => item.ServicePlans).HasForeignKey(item => item.CustomerContractId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.AssignedEmployeeAccount).WithMany().HasForeignKey(item => item.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ReceivableEntry>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.Status, item.DueDate });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.Description).HasMaxLength(500);
            entity.Property(item => item.Amount).HasPrecision(14, 2);
            entity.Property(item => item.PaidAmount).HasPrecision(14, 2);
            entity.Property(item => item.Currency).HasMaxLength(8);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.PaymentNote).HasMaxLength(1000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerContract).WithMany(item => item.Receivables).HasForeignKey(item => item.CustomerContractId).OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrderEconomics>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId }).IsUnique();
            entity.Property(item => item.Revenue).HasPrecision(14, 2);
            entity.Property(item => item.PersonnelHourlyCost).HasPrecision(14, 2);
            entity.Property(item => item.DistanceKm).HasPrecision(12, 2);
            entity.Property(item => item.FuelCost).HasPrecision(14, 2);
            entity.Property(item => item.RepeatVisitCost).HasPrecision(14, 2);
            entity.Property(item => item.EmergencyCallCost).HasPrecision(14, 2);
            entity.Property(item => item.OtherCost).HasPrecision(14, 2);
            entity.HasOne(item => item.WorkOrder).WithOne().HasForeignKey<WorkOrderEconomics>(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<EmergencyRequestHistory>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.EmergencyRequestId, item.OccurredAt });
            entity.Property(item => item.Status).HasMaxLength(20);
            entity.Property(item => item.Note).HasMaxLength(1000);
            entity.HasOne(item => item.EmergencyRequest).WithMany(request => request.History).HasForeignKey(item => item.EmergencyRequestId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.ChangedByAccount).WithMany().HasForeignKey(item => item.ChangedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrder>(entity =>
        {
            entity.HasIndex(workOrder => new { workOrder.CompanyId, workOrder.Number }).IsUnique();
            entity.Property(workOrder => workOrder.Number).HasMaxLength(40);
            entity.Property(workOrder => workOrder.ServiceType).HasMaxLength(120);
            entity.Property(workOrder => workOrder.VisitType).HasMaxLength(32);
            entity.Property(workOrder => workOrder.RecurrenceType).HasMaxLength(24);
            entity.Property(workOrder => workOrder.Status).HasMaxLength(24);
            entity.Property(workOrder => workOrder.ContractCoverage).HasMaxLength(32);
            entity.Property(workOrder => workOrder.ChargeAmount).HasPrecision(14, 2);
            entity.Property(workOrder => workOrder.Notes).HasMaxLength(1000);
            entity.Property(workOrder => workOrder.CompletionNote).HasMaxLength(2000);
            entity.Property(workOrder => workOrder.Recommendation).HasMaxLength(2000);
            entity.HasOne(workOrder => workOrder.Customer).WithMany().HasForeignKey(workOrder => workOrder.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.CustomerBranch).WithMany().HasForeignKey(workOrder => workOrder.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.AssignedEmployeeAccount).WithMany().HasForeignKey(workOrder => workOrder.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.CustomerContract).WithMany(item => item.WorkOrders).HasForeignKey(workOrder => workOrder.CustomerContractId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(workOrder => workOrder.ContractServicePlan).WithMany(item => item.WorkOrders).HasForeignKey(workOrder => workOrder.ContractServicePlanId).OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(workOrder => companyContext.CompanyId.HasValue && workOrder.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrderStatusHistory>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId, item.OccurredAt });
            entity.Property(item => item.FromStatus).HasMaxLength(24);
            entity.Property(item => item.ToStatus).HasMaxLength(24);
            entity.Property(item => item.Note).HasMaxLength(1000);
            entity.HasOne(item => item.WorkOrder).WithMany(workOrder => workOrder.History).HasForeignKey(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.ChangedByAccount).WithMany().HasForeignKey(item => item.ChangedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrderAssignment>(entity =>
        {
            entity.HasIndex(item => new { item.WorkOrderId, item.EmployeeAccountId }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.EmployeeAccountId, item.AssignedAt });
            entity.HasOne(item => item.WorkOrder).WithMany(item => item.Assignments).HasForeignKey(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.EmployeeAccount).WithMany().HasForeignKey(item => item.EmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrderVisitSession>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId, item.EmployeeAccountId, item.StartedAt });
            entity.HasIndex(item => new { item.WorkOrderId, item.EmployeeAccountId, item.Status });
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.Reason).HasMaxLength(1000);
            entity.HasOne(item => item.WorkOrder).WithMany(item => item.VisitSessions).HasForeignKey(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.EmployeeAccount).WithMany().HasForeignKey(item => item.EmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrderPhoto>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId, item.UploadedAt });
            entity.Property(item => item.FileName).HasMaxLength(240);
            entity.Property(item => item.ContentType).HasMaxLength(80);
            entity.Property(item => item.Location).HasMaxLength(240);
            entity.Property(item => item.Status).HasMaxLength(80);
            entity.Property(item => item.Description).HasMaxLength(1000);
            entity.HasOne(item => item.WorkOrder).WithMany(workOrder => workOrder.Photos).HasForeignKey(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ServiceReport>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.ReportNumber }).IsUnique();
            entity.Property(item => item.ReportNumber).HasMaxLength(48);
            entity.Property(item => item.Status).HasMaxLength(20);
            entity.Property(item => item.FirmName).HasMaxLength(240);
            entity.Property(item => item.FirmAddress).HasMaxLength(500);
            entity.Property(item => item.FirmPhone).HasMaxLength(40);
            entity.Property(item => item.FirmWeb).HasMaxLength(240);
            entity.Property(item => item.ResponsibleManager).HasMaxLength(160);
            entity.Property(item => item.PermissionNumber).HasMaxLength(120);
            entity.Property(item => item.TeamManager).HasMaxLength(160);
            entity.Property(item => item.TargetPests).HasMaxLength(500);
            entity.Property(item => item.ResidenceType).HasMaxLength(80);
            entity.Property(item => item.AreaSquareMeters).HasPrecision(12, 2);
            entity.Property(item => item.WorkType).HasMaxLength(500);
            entity.Property(item => item.Consumables).HasMaxLength(1000);
            entity.Property(item => item.SafetyMeasures).HasMaxLength(2000);
            entity.Property(item => item.ApplicationSummary).HasMaxLength(3000);
            entity.Property(item => item.Findings).HasMaxLength(3000);
            entity.Property(item => item.CorrectiveActions).HasMaxLength(3000);
            entity.Property(item => item.Recommendations).HasMaxLength(3000);
            entity.Property(item => item.CustomerRepresentativeName).HasMaxLength(160);
            entity.Property(item => item.ManagerSignatureData).HasMaxLength(500000);
            entity.Property(item => item.CustomerSignatureData).HasMaxLength(500000);
            entity.Property(item => item.AdditionalEmailRecipients).HasMaxLength(2000);
            entity.Property(item => item.VerificationCode).HasMaxLength(64);
            entity.HasOne(item => item.WorkOrder).WithOne().HasForeignKey<ServiceReport>(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ReportEmailDelivery>(entity =>
        {
            entity.HasIndex(item => new { item.ServiceReportId, item.NormalizedRecipientEmail }).IsUnique();
            entity.HasIndex(item => new { item.Status, item.NextAttemptAt, item.CreatedAt });
            entity.Property(item => item.RecipientEmail).HasMaxLength(320);
            entity.Property(item => item.NormalizedRecipientEmail).HasMaxLength(320);
            entity.Property(item => item.RecipientType).HasMaxLength(32);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.LastError).HasMaxLength(2000);
            entity.HasOne(item => item.ServiceReport).WithMany(report => report.EmailDeliveries).HasForeignKey(item => item.ServiceReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ServiceReportStation>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.ServiceReportId, item.DeviceNumber });
            entity.HasIndex(item => new { item.CompanyId, item.SitePlanId, item.SitePlanElementId });
            entity.Property(item => item.DeviceNumber).HasMaxLength(80);
            entity.Property(item => item.Area).HasMaxLength(240);
            entity.Property(item => item.DeviceType).HasMaxLength(40);
            entity.Property(item => item.TargetPest).HasMaxLength(160);
            entity.Property(item => item.DeviceStatus).HasMaxLength(32);
            entity.Property(item => item.SitePlanElementId).HasMaxLength(80);
            entity.Property(item => item.ActivityType).HasMaxLength(80);
            entity.Property(item => item.InaccessibilityReason).HasMaxLength(1000);
            entity.Property(item => item.AppliedProductName).HasMaxLength(240);
            entity.Property(item => item.AppliedAmount).HasPrecision(12, 3);
            entity.Property(item => item.AppliedUnit).HasMaxLength(32);
            entity.Property(item => item.ReplacementProductName).HasMaxLength(240);
            entity.Property(item => item.ReplacementQuantity).HasPrecision(12, 3);
            entity.Property(item => item.ReplacementUnit).HasMaxLength(32);
            entity.Property(item => item.Notes).HasMaxLength(1000);
            entity.HasOne(item => item.ServiceReport).WithMany(report => report.Stations).HasForeignKey(item => item.ServiceReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ServiceReportProduct>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.ServiceReportId, item.ProductName });
            entity.Property(item => item.ProductName).HasMaxLength(240);
            entity.Property(item => item.LicenseNumber).HasMaxLength(160);
            entity.Property(item => item.ApplicationMethod).HasMaxLength(240);
            entity.Property(item => item.DilutionRate).HasMaxLength(120);
            entity.Property(item => item.ActiveIngredient).HasMaxLength(240);
            entity.Property(item => item.Antidote).HasMaxLength(500);
            entity.Property(item => item.PackingQuantity).HasMaxLength(160);
            entity.Property(item => item.AmountUsed).HasPrecision(12, 3);
            entity.Property(item => item.Unit).HasMaxLength(32);
            entity.HasOne(item => item.ServiceReport).WithMany(report => report.Products).HasForeignKey(item => item.ServiceReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.VehicleStockItem).WithMany().HasForeignKey(item => item.VehicleStockItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.LicenseDocument).WithMany().HasForeignKey(item => item.LicenseDocumentId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ServiceReportPestObservation>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.ServiceReportStationId, item.PestKey });
            entity.Property(item => item.PestKey).HasMaxLength(64);
            entity.Property(item => item.PestName).HasMaxLength(120);
            entity.Property(item => item.MeanConfidence).HasPrecision(5, 4);
            entity.Property(item => item.Source).HasMaxLength(24);
            entity.Property(item => item.ModelName).HasMaxLength(80);
            entity.Property(item => item.ModelVersion).HasMaxLength(40);
            entity.Property(item => item.ReviewStatus).HasMaxLength(24);
            entity.Property(item => item.VisionResultJson).HasMaxLength(200000);
            entity.HasOne(item => item.ServiceReportStation).WithMany(station => station.PestObservations).HasForeignKey(item => item.ServiceReportStationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.ReviewedByAccount).WithMany().HasForeignKey(item => item.ReviewedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<StationActivation>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.Status).HasMaxLength(20);
            entity.Property(item => item.Notes).HasMaxLength(3000);
            entity.HasOne(item => item.WorkOrder).WithMany().HasForeignKey(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<QualityAnalysis>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.AnalysisType, item.CustomerId, item.CustomerBranchId, item.PeriodEnd });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.AnalysisType).HasMaxLength(24);
            entity.Property(item => item.TemplateCode).HasMaxLength(48);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.Status).HasMaxLength(20);
            entity.Property(item => item.Level).HasMaxLength(20);
            entity.Property(item => item.Summary).HasMaxLength(3000);
            entity.Property(item => item.Findings).HasMaxLength(5000);
            entity.Property(item => item.Recommendations).HasMaxLength(5000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<QualityDocument>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Category, item.CreatedAt });
            entity.Property(item => item.Category).HasMaxLength(40);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.Description).HasMaxLength(2000);
            entity.Property(item => item.FileName).HasMaxLength(240);
            entity.Property(item => item.ContentType).HasMaxLength(120);
            entity.Property(item => item.LicenseNumber).HasMaxLength(160);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.QualityAnalysis).WithMany(item => item.Documents).HasForeignKey(item => item.QualityAnalysisId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.SitePlan).WithMany(item => item.Documents).HasForeignKey(item => item.SitePlanId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.InventoryItem).WithMany(item => item.LicenseDocuments).HasForeignKey(item => item.InventoryItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<AuditPackage>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.CustomerId, item.CustomerBranchId, item.CreatedAt });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.AuditProfile).HasMaxLength(40);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.PdfSha256).HasMaxLength(64);
            entity.Property(item => item.ZipSha256).HasMaxLength(64);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.QualityDocument).WithMany().HasForeignKey(item => item.QualityDocumentId).OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<AuditPackageItem>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.AuditPackageId, item.Section });
            entity.Property(item => item.Section).HasMaxLength(80);
            entity.Property(item => item.SourceType).HasMaxLength(80);
            entity.Property(item => item.DocumentNumber).HasMaxLength(80);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.FileName).HasMaxLength(240);
            entity.Property(item => item.ContentType).HasMaxLength(120);
            entity.Property(item => item.Revision).HasMaxLength(80);
            entity.Property(item => item.Scope).HasMaxLength(500);
            entity.Property(item => item.Sha256).HasMaxLength(64);
            entity.HasOne(item => item.AuditPackage).WithMany(item => item.Items).HasForeignKey(item => item.AuditPackageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<QualityInspection>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.Status, item.ScheduledAt });
            entity.HasIndex(item => new { item.CompanyId, item.EmployeeAccountId, item.InspectedAt });
            entity.HasIndex(item => new { item.CompanyId, item.ServiceReportId });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.InspectionType).HasMaxLength(32);
            entity.Property(item => item.SelectionReason).HasMaxLength(500);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.Grade).HasMaxLength(20);
            entity.Property(item => item.Findings).HasMaxLength(4000);
            entity.Property(item => item.Notes).HasMaxLength(2000);
            entity.HasOne(item => item.ServiceReport).WithMany().HasForeignKey(item => item.ServiceReportId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.InspectorAccount).WithMany().HasForeignKey(item => item.InspectorAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.EmployeeAccount).WithMany().HasForeignKey(item => item.EmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CorrectiveAction).WithMany().HasForeignKey(item => item.CorrectiveActionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CorrectiveAction>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.CustomerId, item.CustomerBranchId, item.Status, item.DueDate });
            entity.HasIndex(item => new { item.CompanyId, item.SourceType, item.SourceId });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.SourceType).HasMaxLength(40);
            entity.Property(item => item.Category).HasMaxLength(80);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.Problem).HasMaxLength(4000);
            entity.Property(item => item.RootCause).HasMaxLength(4000);
            entity.Property(item => item.ProposedAction).HasMaxLength(4000);
            entity.Property(item => item.ResponsibleParty).HasMaxLength(20);
            entity.Property(item => item.Priority).HasMaxLength(20);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.CustomerApprovalStatus).HasMaxLength(20);
            entity.Property(item => item.CustomerApprovalNote).HasMaxLength(2000);
            entity.Property(item => item.RecurrenceKey).HasMaxLength(160);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.AssignedAccount).WithMany().HasForeignKey(item => item.AssignedAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CorrectiveActionEvidence>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.CorrectiveActionId, item.CreatedAt });
            entity.Property(item => item.Stage).HasMaxLength(20);
            entity.Property(item => item.FileName).HasMaxLength(240);
            entity.Property(item => item.ContentType).HasMaxLength(80);
            entity.Property(item => item.Note).HasMaxLength(1000);
            entity.HasOne(item => item.CorrectiveAction).WithMany(item => item.Evidence).HasForeignKey(item => item.CorrectiveActionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.UploadedByAccount).WithMany().HasForeignKey(item => item.UploadedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CorrectiveActionHistory>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.CorrectiveActionId, item.OccurredAt });
            entity.Property(item => item.FromStatus).HasMaxLength(24);
            entity.Property(item => item.ToStatus).HasMaxLength(24);
            entity.Property(item => item.Note).HasMaxLength(2000);
            entity.HasOne(item => item.CorrectiveAction).WithMany(item => item.History).HasForeignKey(item => item.CorrectiveActionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.ChangedByAccount).WithMany().HasForeignKey(item => item.ChangedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WasteDisposalRecord>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.CustomerId, item.CustomerBranchId, item.GeneratedAt });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.WasteType).HasMaxLength(80);
            entity.Property(item => item.Quantity).HasPrecision(14, 3);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.Property(item => item.Status).HasMaxLength(24);
            entity.Property(item => item.TemporaryStorage).HasMaxLength(240);
            entity.Property(item => item.RecipientName).HasMaxLength(160);
            entity.Property(item => item.CarrierOrFacility).HasMaxLength(240);
            entity.Property(item => item.DisposalMethod).HasMaxLength(240);
            entity.Property(item => item.DocumentNumber).HasMaxLength(100);
            entity.Property(item => item.Notes).HasMaxLength(2000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.WorkOrder).WithMany().HasForeignKey(item => item.WorkOrderId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WasteDisposalEvidence>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WasteDisposalRecordId, item.CreatedAt });
            entity.Property(item => item.FileName).HasMaxLength(240);
            entity.Property(item => item.ContentType).HasMaxLength(80);
            entity.Property(item => item.Note).HasMaxLength(1000);
            entity.HasOne(item => item.WasteDisposalRecord).WithMany(item => item.Evidence).HasForeignKey(item => item.WasteDisposalRecordId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.UploadedByAccount).WithMany().HasForeignKey(item => item.UploadedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<SitePlan>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.Number }).IsUnique();
            entity.HasIndex(item => new { item.CompanyId, item.CustomerId, item.CustomerBranchId, item.UpdatedAt });
            entity.Property(item => item.Number).HasMaxLength(48);
            entity.Property(item => item.Title).HasMaxLength(240);
            entity.Property(item => item.AreaName).HasMaxLength(240);
            entity.Property(item => item.FieldGuide).HasMaxLength(240);
            entity.Property(item => item.Status).HasMaxLength(20);
            entity.Property(item => item.RevisionNote).HasMaxLength(1000);
            entity.HasOne(item => item.Customer).WithMany().HasForeignKey(item => item.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CustomerBranch).WithMany().HasForeignKey(item => item.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkShift>(entity =>
        {
            entity.HasIndex(shift => new { shift.CompanyId, shift.EmployeeAccountId, shift.WorkDate }).IsUnique();
            entity.Property(shift => shift.Status).HasConversion<string>().HasMaxLength(24);
            entity.HasOne(shift => shift.EmployeeAccount).WithMany().HasForeignKey(shift => shift.EmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(shift => companyContext.CompanyId.HasValue && shift.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkShiftBreak>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkShiftId, item.StartedAt });
            entity.HasOne(item => item.WorkShift).WithMany(shift => shift.Breaks).HasForeignKey(item => item.WorkShiftId).OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<VehicleStockCheck>(entity =>
        {
            entity.HasIndex(check => new { check.CompanyId, check.EmployeeAccountId, check.CheckedAt });
            entity.HasOne(check => check.EmployeeAccount).WithMany().HasForeignKey(check => check.EmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(check => check.Vehicle).WithMany().HasForeignKey(check => check.VehicleId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(check => companyContext.CompanyId.HasValue && check.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<VehicleStockCheckItem>(entity =>
        {
            entity.Property(item => item.ProductName).HasMaxLength(160);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.Property(item => item.Quantity).HasPrecision(12, 2);
            entity.HasOne(item => item.VehicleStockCheck).WithMany(check => check.Items).HasForeignKey(item => item.VehicleStockCheckId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.VehicleStockItem).WithMany().HasForeignKey(item => item.VehicleStockItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<Vehicle>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.NormalizedPlate }).IsUnique();
            entity.Property(item => item.Plate).HasMaxLength(16);
            entity.Property(item => item.NormalizedPlate).HasMaxLength(16);
            entity.Property(item => item.Brand).HasMaxLength(80);
            entity.Property(item => item.Model).HasMaxLength(80);
            entity.HasOne(item => item.AssignedEmployeeAccount).WithMany().HasForeignKey(item => item.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<VehicleStockItem>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.VehicleId, item.InventoryItemId });
            entity.Property(item => item.ProductName).HasMaxLength(160);
            entity.Property(item => item.NormalizedName).HasMaxLength(160);
            entity.Property(item => item.Quantity).HasPrecision(14, 3);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.HasOne(item => item.Vehicle).WithMany(vehicle => vehicle.StockItems).HasForeignKey(item => item.VehicleId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.InventoryItem).WithMany().HasForeignKey(item => item.InventoryItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<VehicleStockMovement>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.VehicleStockItemId, item.OccurredAt });
            entity.HasIndex(item => new { item.CompanyId, item.ServiceReportId });
            entity.Property(item => item.Type).HasMaxLength(32);
            entity.Property(item => item.Quantity).HasPrecision(14, 3);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.Property(item => item.Note).HasMaxLength(500);
            entity.HasOne(item => item.VehicleStockItem).WithMany().HasForeignKey(item => item.VehicleStockItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.InventoryItem).WithMany().HasForeignKey(item => item.InventoryItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ServiceReport).WithMany().HasForeignKey(item => item.ServiceReportId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.PerformedByAccount).WithMany().HasForeignKey(item => item.PerformedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<InventoryItem>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.NormalizedName, item.LotNumber });
            entity.Property(item => item.Name).HasMaxLength(160);
            entity.Property(item => item.NormalizedName).HasMaxLength(160);
            entity.Property(item => item.Category).HasMaxLength(80);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.Property(item => item.LotNumber).HasMaxLength(80);
            entity.Property(item => item.LicenseNumber).HasMaxLength(160);
            entity.Property(item => item.Quantity).HasPrecision(12, 2);
            entity.Property(item => item.MinimumQuantity).HasPrecision(12, 2);
            entity.Property(item => item.UnitCost).HasPrecision(14, 4);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<InventoryMovement>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.OccurredAt });
            entity.Property(item => item.Type).HasMaxLength(32);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.Property(item => item.Note).HasMaxLength(500);
            entity.Property(item => item.Quantity).HasPrecision(12, 2);
            entity.HasOne(item => item.InventoryItem).WithMany().HasForeignKey(item => item.InventoryItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<CalendarEntry>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.ScheduledAt });
            entity.Property(item => item.Kind).HasMaxLength(16);
            entity.Property(item => item.Title).HasMaxLength(180);
            entity.Property(item => item.Description).HasMaxLength(2000);
            entity.Property(item => item.Priority).HasMaxLength(16);
            entity.Property(item => item.Status).HasMaxLength(16);
            entity.HasOne(item => item.AssignedEmployeeAccount).WithMany().HasForeignKey(item => item.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        EnforceCompanyBoundary();
        return base.SaveChangesAsync(cancellationToken);
    }

    public Task<int> SaveSystemAdministrationChangesAsync(Guid targetCompanyId, CancellationToken cancellationToken = default)
    {
        if (companyContext.Portal != PortalType.SystemAdmin)
            throw new SecurityException("Sistem yönetimi kayıt yetkisi doğrulanamadı.");

        EnforceCompanyBoundary(targetCompanyId);
        return base.SaveChangesAsync(cancellationToken);
    }

    public Task<int> SaveReportEmailDeliveryChangesAsync(Guid targetCompanyId, CancellationToken cancellationToken = default)
    {
        var changedCompanyEntries = ChangeTracker.Entries<ICompanyScoped>()
            .Where(entry => entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToArray();
        if (changedCompanyEntries.Any(entry => entry.Entity is not ReportEmailDelivery))
            throw new SecurityException("E-posta teslimat işlemi başka operasyon verisini değiştiremez.");

        EnforceCompanyBoundary(targetCompanyId);
        return base.SaveChangesAsync(cancellationToken);
    }

    public Task<int> SaveEmailConnectionChangesAsync(Guid targetCompanyId, CancellationToken cancellationToken = default)
    {
        var changedCompanyEntries = ChangeTracker.Entries<ICompanyScoped>()
            .Where(entry => entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToArray();
        if (changedCompanyEntries.Any(entry => entry.Entity is not CompanyEmailConnection))
            throw new SecurityException("E-posta bağlantı işlemi başka operasyon verisini değiştiremez.");

        EnforceCompanyBoundary(targetCompanyId);
        return base.SaveChangesAsync(cancellationToken);
    }

    private void EnforceCompanyBoundary(Guid? explicitCompanyId = null)
    {
        var scopedEntries = ChangeTracker.Entries<ICompanyScoped>().ToArray();
        if (scopedEntries.Length == 0) return;

        var currentCompanyId = explicitCompanyId ?? companyContext.CompanyId
            ?? throw new SecurityException("Firma bağlamı olmadan operasyon verisi değiştirilemez.");

        foreach (var entry in scopedEntries)
        {
            if (entry.State == EntityState.Added && entry.Entity.CompanyId == Guid.Empty)
            {
                entry.Entity.CompanyId = currentCompanyId;
            }

            if (entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted &&
                entry.Entity.CompanyId != currentCompanyId)
            {
                throw new SecurityException("Başka bir firmaya ait veri üzerinde işlem yapılamaz.");
            }
        }
    }
}
