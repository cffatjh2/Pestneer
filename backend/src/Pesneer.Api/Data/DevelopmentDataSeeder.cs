using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public static class DevelopmentDataSeeder
{
    private const string OwnerEmail = "sahip@mail.com";
    private const string OwnerPassword = "123456";
    private const string CompanyCode = "TURA-ANKARA";

    public static async Task InitializeAsync(IServiceProvider services, IWebHostEnvironment environment)
    {
        await using var scope = services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<Account>>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var ownerEmail = environment.IsDevelopment() ? OwnerEmail : configuration["BootstrapOwner:Email"];
        var ownerPassword = environment.IsDevelopment() ? OwnerPassword : configuration["BootstrapOwner:Password"];
        var companyCode = environment.IsDevelopment() ? CompanyCode : configuration["BootstrapOwner:CompanyCode"];
        var companyName = environment.IsDevelopment() ? "Tura Çevre Sağlığı" : configuration["BootstrapOwner:CompanyName"];

        if (!string.IsNullOrWhiteSpace(ownerEmail) && !string.IsNullOrWhiteSpace(ownerPassword) &&
            !string.IsNullOrWhiteSpace(companyCode) && !string.IsNullOrWhiteSpace(companyName))
        {
            var normalizedCompanyCode = companyCode.Trim().ToUpperInvariant();
            var company = await dbContext.Companies.SingleOrDefaultAsync(item => item.Code == normalizedCompanyCode);
            if (company is null)
            {
                company = new Company
                {
                    Id = Guid.NewGuid(),
                    Code = normalizedCompanyCode,
                    LegalName = companyName.Trim()
                };
                dbContext.Companies.Add(company);
            }

            var normalizedEmail = ownerEmail.Trim().ToUpperInvariant();
            var account = await dbContext.Accounts.SingleOrDefaultAsync(item =>
                item.Portal == PortalType.Owner && item.NormalizedEmail == normalizedEmail);

            if (account is null)
            {
                account = new Account
                {
                    Id = Guid.NewGuid(),
                    Email = ownerEmail.Trim(),
                    NormalizedEmail = normalizedEmail,
                    DisplayName = "Firma Sahibi",
                    PasswordHash = string.Empty,
                    Portal = PortalType.Owner
                };
                account.PasswordHash = passwordHasher.HashPassword(account, ownerPassword);
                dbContext.Accounts.Add(account);
            }
            // NOTE: Do NOT overwrite existing account passwords on restart

            account.IsActive = true;

            var hasMembership = await dbContext.CompanyMemberships.AnyAsync(item =>
                item.AccountId == account.Id && item.CompanyId == company.Id);
            if (!hasMembership)
            {
                dbContext.CompanyMemberships.Add(new CompanyMembership
                {
                    Id = Guid.NewGuid(),
                    AccountId = account.Id,
                    CompanyId = company.Id,
                    Role = CompanyRole.Owner
                });
            }
            // Seed standard real biocides and consumables for the company if empty
            await SeedCompanyBiocidesAsync(dbContext, company.Id);
        }

        var systemAdminEmail = configuration["SystemAdmin:Email"]?.Trim();
        var systemAdminPassword = configuration["SystemAdmin:Password"]?.Trim();
        if (string.IsNullOrWhiteSpace(systemAdminEmail)) systemAdminEmail = "cffatjh@gmail.com";
        if (string.IsNullOrWhiteSpace(systemAdminPassword)) systemAdminPassword = "4354e643a83C9";

        if (!string.IsNullOrWhiteSpace(systemAdminEmail) && !string.IsNullOrWhiteSpace(systemAdminPassword))
        {
            var systemNormalizedEmail = systemAdminEmail.ToUpperInvariant();
            var systemAdmin = await dbContext.Accounts.SingleOrDefaultAsync(item =>
                item.Portal == PortalType.SystemAdmin && item.NormalizedEmail == systemNormalizedEmail);
            if (systemAdmin is null)
            {
                systemAdmin = new Account
                {
                    Id = Guid.NewGuid(),
                    Email = systemAdminEmail,
                    NormalizedEmail = systemNormalizedEmail,
                    DisplayName = "Pestneer Sistem Yöneticisi",
                    PasswordHash = string.Empty,
                    Portal = PortalType.SystemAdmin
                };
                systemAdmin.PasswordHash = passwordHasher.HashPassword(systemAdmin, systemAdminPassword);
                dbContext.Accounts.Add(systemAdmin);
            }
            // NOTE: Do NOT overwrite existing system admin password on restart
            systemAdmin.IsActive = true;
        }

        await dbContext.SaveChangesAsync();
    }

    public static async Task SeedCompanyBiocidesAsync(PesneerDbContext dbContext, Guid companyId)
    {
        var hasItems = await dbContext.InventoryItems.IgnoreQueryFilters().AnyAsync(item => item.CompanyId == companyId);
        if (hasItems) return;

        var now = DateTimeOffset.UtcNow;
        (string Name, string Category, decimal Qty, string Unit, decimal Min, decimal Cost, string? Lic, string Lot)[] defaultBiocides =
        [
            ("Brodifacoum %0.005 Mum Blok Yem", "Biyosidal Ürünler", 5000m, "Gram", 500m, 0.45m, "2018/142", "BRD-2026-01"),
            ("Bromadiolone %0.005 Pasta Yem", "Biyosidal Ürünler", 3000m, "Gram", 400m, 0.50m, "2019/88", "BRM-2026-02"),
            ("Difenacoum %0.005 Pelet Yem", "Biyosidal Ürünler", 3000m, "Gram", 300m, 0.40m, "2020/215", "DFN-2026-01"),
            ("Maxforce IC %2.15 Hamamböceği Jeli", "Biyosidal Ürünler", 500m, "Gram", 60m, 4.20m, "2017/63", "MXF-2026-04"),
            ("Goliath Jel %0.05 Hamamböceği Jeli", "Biyosidal Ürünler", 350m, "Gram", 70m, 5.10m, "2016/110", "GLT-2026-01"),
            ("K-Othrine SC 25 Sıvı İnsektisit", "Biyosidal Ürünler", 2500m, "Mililitre", 500m, 1.20m, "2015/92", "KOT-2026-03"),
            ("Chrysamed Forte Konsantre İnsektisit", "Biyosidal Ürünler", 2000m, "Mililitre", 500m, 1.10m, "2021/304", "CHY-2026-02"),
            ("Fare & Sıçan Yapışkanlı Levha (Plaka)", "Sarf Malzemeleri", 200m, "Adet", 30m, 8.50m, null, "PLK-2026-01"),
            ("EFK Sinek Cihazı UV Yapışkan Levhası", "Sarf Malzemeleri", 100m, "Adet", 20m, 15.00m, null, "EFK-2026-01"),
            ("Feromonlu Güve & Böcek Monitör Yapışkanı", "Sarf Malzemeleri", 150m, "Adet", 25m, 6.00m, null, "FRM-2026-01"),
        ];

        foreach (var b in defaultBiocides)
        {
            var item = new InventoryItem
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                Name = b.Name,
                NormalizedName = b.Name.ToUpperInvariant(),
                Category = b.Category,
                Quantity = b.Qty,
                Unit = b.Unit,
                MinimumQuantity = b.Min,
                UnitCost = b.Cost,
                LicenseNumber = b.Lic,
                LotNumber = b.Lot,
                LastMovementAt = now,
                IsActive = true
            };
            dbContext.InventoryItems.Add(item);
            dbContext.InventoryMovements.Add(new InventoryMovement
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                InventoryItemId = item.Id,
                Type = "InitialStock",
                Quantity = b.Qty,
                UnitCostSnapshot = b.Cost,
                Unit = b.Unit,
                Note = "Başlangıç Biyosidal & Sarf Envanteri",
                OccurredAt = now
            });
        }
    }
}
