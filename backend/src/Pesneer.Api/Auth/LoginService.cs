using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Auth;

public sealed record LoginResult(LoginResponse? Response, string? ErrorMessage = null, bool IsTrialExpired = false);

public interface ILoginService
{
    Task<LoginResult> SignInAsync(PortalType portal, LoginRequest request, CancellationToken cancellationToken);
}

public sealed class LoginService(
    PesneerDbContext dbContext,
    IPasswordHasher<Account> passwordHasher,
    IJwtTokenService jwtTokenService) : ILoginService
{
    public async Task<LoginResult> SignInAsync(PortalType portal, LoginRequest request, CancellationToken cancellationToken)
    {
        var companyCode = request.CompanyCode.Trim().ToUpperInvariant();
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var company = await dbContext.Companies.IgnoreQueryFilters().AsNoTracking()
            .SingleOrDefaultAsync(item => item.Code == companyCode && item.IsActive, cancellationToken);
        var account = await dbContext.Accounts.IgnoreQueryFilters().AsNoTracking()
            .SingleOrDefaultAsync(item => item.Portal == portal && item.NormalizedEmail == normalizedEmail && item.IsActive, cancellationToken);

        if (company is null || account is null ||
            passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        {
            return new LoginResult(null, "Firma kodu, e-posta veya şifre hatalı.");
        }

        if (company.IsTrial && company.TrialEndsAt.HasValue && company.TrialEndsAt.Value < DateTimeOffset.UtcNow && portal != PortalType.SystemAdmin)
        {
            return new LoginResult(null, "1 haftalık deneme süreniz sona ermiştir. Verileriniz sistemde güvenle saklanmaktadır. Hesabınızı tam sürüme geçirmek ve erişimi yeniden açmak için lütfen Pestneer ile iletişime geçin.", IsTrialExpired: true);
        }

        CompanyRole role;
        Guid? customerId = null;
        Guid? customerBranchId = null;

        if (portal == PortalType.Customer)
        {
            var membership = await dbContext.CustomerMemberships.IgnoreQueryFilters().AsNoTracking()
                .SingleOrDefaultAsync(item => item.AccountId == account.Id && item.CompanyId == company.Id && item.IsActive, cancellationToken);
            if (membership is null) return new LoginResult(null, "Müşteri portal yetkisi bulunamadı.");
            role = membership.Role;
            customerId = membership.CustomerId;
            customerBranchId = membership.CustomerBranchId;
        }
        else
        {
            var membership = await dbContext.CompanyMemberships.IgnoreQueryFilters().AsNoTracking()
                .SingleOrDefaultAsync(item => item.AccountId == account.Id && item.CompanyId == company.Id && item.IsActive, cancellationToken);
            if (membership is null || portal == PortalType.Owner && membership.Role != CompanyRole.Owner)
                return new LoginResult(null, "Firma üyelik veya yetki bilgisi doğrulanamadı.");
            role = membership.Role;
        }

        var token = jwtTokenService.Create(account, company, role, customerId, customerBranchId);
        var response = new LoginResponse(
            token.Value,
            token.ExpiresAt,
            portal.ToString().ToLowerInvariant(),
            new CompanySummary(company.Id, company.LegalName, company.Code),
            new UserSummary(account.Id, account.DisplayName, account.Email, role.ToString()),
            customerId,
            customerBranchId);
        return new LoginResult(response);
    }
}
