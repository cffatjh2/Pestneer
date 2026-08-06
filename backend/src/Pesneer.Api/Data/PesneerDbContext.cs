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
    public DbSet<WorkShift> WorkShifts => Set<WorkShift>();
    public DbSet<WorkShiftBreak> WorkShiftBreaks => Set<WorkShiftBreak>();
    public DbSet<VehicleStockCheck> VehicleStockChecks => Set<VehicleStockCheck>();
    public DbSet<VehicleStockCheckItem> VehicleStockCheckItems => Set<VehicleStockCheckItem>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
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
            entity.Property(workOrder => workOrder.Status).HasMaxLength(24);
            entity.Property(workOrder => workOrder.Notes).HasMaxLength(1000);
            entity.HasOne(workOrder => workOrder.Customer).WithMany().HasForeignKey(workOrder => workOrder.CustomerId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.CustomerBranch).WithMany().HasForeignKey(workOrder => workOrder.CustomerBranchId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(workOrder => workOrder.AssignedEmployeeAccount).WithMany().HasForeignKey(workOrder => workOrder.AssignedEmployeeAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasQueryFilter(workOrder => companyContext.CompanyId.HasValue && workOrder.CompanyId == companyContext.CompanyId.Value);
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
