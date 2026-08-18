using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Auth;

public sealed record LoginResult(LoginResponse? Response, string? ErrorMessage = null, bool IsTrialExpired = false);

public interface ILoginService
{
    Task<LoginResult> SignInAsync(PortalType portal, LoginRequest request, CancellationToken cancellationToken);
    Task<LoginResult> RegisterDemoAsync(DemoRegisterRequest request, CancellationToken cancellationToken);
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
            new UserSummary(account.Id, account.DisplayName, account.Email, role.ToString(), account.HasAcceptedTerms, account.TermsAcceptedAt),
            customerId,
            customerBranchId);
        return new LoginResult(response);
    }

    public async Task<LoginResult> RegisterDemoAsync(DemoRegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CompanyName) || string.IsNullOrWhiteSpace(request.FullName) ||
            string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return new LoginResult(null, "Lütfen tüm zorunlu alanları eksiksiz doldurun.");
        }

        if (request.Password.Trim().Length < 6)
        {
            return new LoginResult(null, "Şifre en az 6 karakter olmalıdır.");
        }

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        if (!normalizedEmail.Contains('@') || !normalizedEmail.Contains('.'))
        {
            return new LoginResult(null, "Lütfen geçerli bir e-posta adresi girin.");
        }

        var baseCode = string.IsNullOrWhiteSpace(request.CompanyCode)
            ? GenerateCodeFromName(request.CompanyName)
            : request.CompanyCode.Trim().ToUpperInvariant();

        if (baseCode.Length < 3) baseCode = "PEST-" + baseCode;

        if (await dbContext.Accounts.IgnoreQueryFilters().AnyAsync(a => a.Portal == PortalType.Owner && a.NormalizedEmail == normalizedEmail, cancellationToken))
        {
            return new LoginResult(null, "Bu e-posta adresi ile kayıtlı bir firma sahibi hesabı zaten mevcut.");
        }

        var finalCode = baseCode;
        var suffix = 1;
        while (await dbContext.Companies.IgnoreQueryFilters().AnyAsync(c => c.Code == finalCode, cancellationToken))
        {
            finalCode = $"{baseCode}-{suffix++}";
        }

        var now = DateTimeOffset.UtcNow;
        var company = new Company
        {
            Id = Guid.NewGuid(),
            LegalName = request.CompanyName.Trim(),
            Code = finalCode,
            ReportNotificationEmail = request.Email.Trim(),
            IsTrial = true,
            TrialStartedAt = now,
            TrialEndsAt = now.AddDays(7),
            IsActive = true,
            CreatedAt = now
        };

        var owner = new Account
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim(),
            NormalizedEmail = normalizedEmail,
            DisplayName = request.FullName.Trim(),
            PhoneNumber = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            Portal = PortalType.Owner,
            IsActive = true,
            HasAcceptedTerms = false,
            PasswordHash = string.Empty,
            CreatedAt = now
        };
        owner.PasswordHash = passwordHasher.HashPassword(owner, request.Password.Trim());

        var membership = new CompanyMembership
        {
            Id = Guid.NewGuid(),
            AccountId = owner.Id,
            CompanyId = company.Id,
            Role = CompanyRole.Owner,
            IsActive = true
        };

        dbContext.Companies.Add(company);
        dbContext.Accounts.Add(owner);
        dbContext.CompanyMemberships.Add(membership);

        await dbContext.SavePublicRegistrationChangesAsync(company.Id, cancellationToken);

        var token = jwtTokenService.Create(owner, company, CompanyRole.Owner, null, null);
        var response = new LoginResponse(
            token.Value,
            token.ExpiresAt,
            "owner",
            new CompanySummary(company.Id, company.LegalName, company.Code),
            new UserSummary(owner.Id, owner.DisplayName, owner.Email, "Owner", owner.HasAcceptedTerms, owner.TermsAcceptedAt),
            null,
            null);

        return new LoginResult(response);
    }

    private static string GenerateCodeFromName(string name)
    {
        var trMap = new Dictionary<char, char>
        {
            {'ç', 'C'}, {'Ç', 'C'}, {'ğ', 'G'}, {'Ğ', 'G'}, {'ı', 'I'}, {'İ', 'I'},
            {'ö', 'O'}, {'Ö', 'O'}, {'ş', 'S'}, {'Ş', 'S'}, {'ü', 'U'}, {'Ü', 'U'}
        };
        var sb = new StringBuilder();
        foreach (var c in name.Trim())
        {
            if (trMap.TryGetValue(c, out var rep))
            {
                sb.Append(rep);
            }
            else if (char.IsAsciiLetterOrDigit(c))
            {
                sb.Append(char.ToUpperInvariant(c));
            }
            else if (char.IsWhiteSpace(c) || c == '-' || c == '_' || c == '.')
            {
                sb.Append('-');
            }
        }
        var raw = sb.ToString();
        while (raw.Contains("--")) raw = raw.Replace("--", "-");
        var code = raw.Trim('-');

        if (string.IsNullOrWhiteSpace(code)) return "DEMO-" + Random.Shared.Next(1000, 9999);
        if (code.Length > 18) code = code[..18].Trim('-');
        return code.Length < 3 ? "PEST-" + code : code;
    }
}
