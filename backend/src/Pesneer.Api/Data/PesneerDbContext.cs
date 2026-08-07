using System.Security;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public class PesneerDbContext(
    DbContextOptions options,
    ICompanyContext companyContext) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<CompanyMembership> CompanyMemberships => Set<CompanyMembership>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerBranch> CustomerBranches => Set<CustomerBranch>();
    public DbSet<CustomerMembership> CustomerMemberships => Set<CustomerMembership>();
    public DbSet<WorkOrder> WorkOrders => Set<WorkOrder>();
    public DbSet<WorkOrderStatusHistory> WorkOrderStatusHistories => Set<WorkOrderStatusHistory>();
    public DbSet<WorkOrderPhoto> WorkOrderPhotos => Set<WorkOrderPhoto>();
    public DbSet<ServiceReport> ServiceReports => Set<ServiceReport>();
    public DbSet<ServiceReportStation> ServiceReportStations => Set<ServiceReportStation>();
    public DbSet<ServiceReportProduct> ServiceReportProducts => Set<ServiceReportProduct>();
    public DbSet<WorkShift> WorkShifts => Set<WorkShift>();
    public DbSet<WorkShiftBreak> WorkShiftBreaks => Set<WorkShiftBreak>();
    public DbSet<VehicleStockCheck> VehicleStockChecks => Set<VehicleStockCheck>();
    public DbSet<VehicleStockCheckItem> VehicleStockCheckItems => Set<VehicleStockCheckItem>();
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
            entity.HasIndex(membership => new { membership.AccountId, membership.CompanyId, membership.CustomerId }).IsUnique();
            entity.Property(membership => membership.Role).HasConversion<string>().HasMaxLength(40);
            entity.HasOne(membership => membership.Account).WithMany().HasForeignKey(membership => membership.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(membership => membership.Company).WithMany().HasForeignKey(membership => membership.CompanyId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(membership => membership.Customer).WithMany().HasForeignKey(membership => membership.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(membership => companyContext.CompanyId.HasValue && membership.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<WorkOrder>(entity =>
        {
            entity.HasIndex(workOrder => new { workOrder.CompanyId, workOrder.Number }).IsUnique();
            entity.Property(workOrder => workOrder.Number).HasMaxLength(40);
            entity.Property(workOrder => workOrder.ServiceType).HasMaxLength(120);
            entity.Property(workOrder => workOrder.VisitType).HasMaxLength(32);
            entity.Property(workOrder => workOrder.RecurrenceType).HasMaxLength(24);
            entity.Property(workOrder => workOrder.Status).HasMaxLength(24);
            entity.Property(workOrder => workOrder.Notes).HasMaxLength(1000);
            entity.Property(workOrder => workOrder.CompletionNote).HasMaxLength(2000);
            entity.Property(workOrder => workOrder.Recommendation).HasMaxLength(2000);
            entity.HasOne(workOrder => workOrder.Customer).WithMany().HasForeignKey(workOrder => workOrder.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.CustomerBranch).WithMany().HasForeignKey(workOrder => workOrder.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.AssignedEmployeeAccount).WithMany().HasForeignKey(workOrder => workOrder.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
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

        modelBuilder.Entity<WorkOrderPhoto>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.WorkOrderId, item.UploadedAt });
            entity.Property(item => item.FileName).HasMaxLength(240);
            entity.Property(item => item.ContentType).HasMaxLength(80);
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
            entity.Property(item => item.WorkType).HasMaxLength(120);
            entity.Property(item => item.Consumables).HasMaxLength(1000);
            entity.Property(item => item.SafetyMeasures).HasMaxLength(2000);
            entity.Property(item => item.ApplicationSummary).HasMaxLength(3000);
            entity.Property(item => item.Findings).HasMaxLength(3000);
            entity.Property(item => item.CorrectiveActions).HasMaxLength(3000);
            entity.Property(item => item.Recommendations).HasMaxLength(3000);
            entity.Property(item => item.CustomerRepresentativeName).HasMaxLength(160);
            entity.Property(item => item.ManagerSignatureData).HasMaxLength(500000);
            entity.Property(item => item.CustomerSignatureData).HasMaxLength(500000);
            entity.Property(item => item.VerificationCode).HasMaxLength(64);
            entity.HasOne(item => item.WorkOrder).WithOne().HasForeignKey<ServiceReport>(item => item.WorkOrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.CreatedByAccount).WithMany().HasForeignKey(item => item.CreatedByAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<ServiceReportStation>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.ServiceReportId, item.DeviceNumber });
            entity.Property(item => item.DeviceNumber).HasMaxLength(80);
            entity.Property(item => item.Area).HasMaxLength(240);
            entity.Property(item => item.DeviceType).HasMaxLength(40);
            entity.Property(item => item.TargetPest).HasMaxLength(160);
            entity.Property(item => item.DeviceStatus).HasMaxLength(32);
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
            entity.HasQueryFilter(check => companyContext.CompanyId.HasValue && check.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<VehicleStockCheckItem>(entity =>
        {
            entity.Property(item => item.ProductName).HasMaxLength(160);
            entity.Property(item => item.Unit).HasMaxLength(24);
            entity.Property(item => item.Quantity).HasPrecision(12, 2);
            entity.HasOne(item => item.VehicleStockCheck).WithMany(check => check.Items).HasForeignKey(item => item.VehicleStockCheckId).OnDelete(DeleteBehavior.Cascade);
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
            entity.Property(item => item.Quantity).HasPrecision(12, 2);
            entity.Property(item => item.MinimumQuantity).HasPrecision(12, 2);
            entity.HasQueryFilter(item => companyContext.CompanyId.HasValue && item.CompanyId == companyContext.CompanyId.Value);
        });

        modelBuilder.Entity<InventoryMovement>(entity =>
        {
            entity.HasIndex(item => new { item.CompanyId, item.OccurredAt });
            entity.Property(item => item.Type).HasMaxLength(16);
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

    private void EnforceCompanyBoundary()
    {
        var scopedEntries = ChangeTracker.Entries<ICompanyScoped>().ToArray();
        if (scopedEntries.Length == 0) return;

        var currentCompanyId = companyContext.CompanyId
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
