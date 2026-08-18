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
        }

        var systemAdminEmail = configuration["SystemAdmin:Email"]?.Trim();
        var systemAdminPassword = configuration["SystemAdmin:Password"]?.Trim();
        if (string.IsNullOrWhiteSpace(systemAdminPassword)) systemAdminPassword = ownerPassword;
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

            systemAdmin.IsActive = true;
        }

        await dbContext.SaveChangesAsync();
    }
}
