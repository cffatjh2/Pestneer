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
        if (string.IsNullOrWhiteSpace(request.CompanyCode) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return new LoginResult(null, "Lütfen firma kodu, e-posta ve şifrenizi girin.");
        }

        var companyCode = request.CompanyCode.Trim().ToUpperInvariant();
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var rawPassword = request.Password;
        var trimmedPassword = request.Password.Trim();

        var company = await dbContext.Companies.IgnoreQueryFilters().AsNoTracking()
            .SingleOrDefaultAsync(item => item.Code == companyCode && item.IsActive, cancellationToken);

        if (company is null)
        {
            return new LoginResult(null, $"'{companyCode}' koduna sahip aktif bir firma bulunamadı. Lütfen firma kodunu kontrol edin.");
        }

        // Fetch candidate accounts by normalized email
        var candidateAccounts = await dbContext.Accounts.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.NormalizedEmail == normalizedEmail && item.IsActive)
            .ToListAsync(cancellationToken);

        if (candidateAccounts.Count == 0)
        {
            return new LoginResult(null, "Bu e-posta adresi ile kayıtlı aktif bir hesap bulunamadı.");
        }

        // Verify password against candidate accounts (prioritizing selected portal)
        Account? matchedAccount = null;
        var orderedCandidates = candidateAccounts.OrderBy(a => a.Portal == portal ? 0 : 1).ToList();

        foreach (var candidate in orderedCandidates)
        {
            if (VerifyAccountPassword(passwordHasher, candidate, rawPassword, trimmedPassword))
            {
                matchedAccount = candidate;
                break;
            }
        }

        if (matchedAccount is null)
        {
            return new LoginResult(null, "Girdiğiniz şifre hatalı. Lütfen kontrol edip tekrar deneyin.");
        }

        if (company.IsTrial && company.TrialEndsAt.HasValue && company.TrialEndsAt.Value < DateTimeOffset.UtcNow && portal != PortalType.SystemAdmin)
        {
            return new LoginResult(null, "1 haftalık deneme süreniz sona ermiştir. Verileriniz sistemde güvenle saklanmaktadır. Hesabınızı tam sürüme geçirmek ve erişimi yeniden açmak için lütfen Pestneer ile iletişime geçin.", IsTrialExpired: true);
        }

        // Check memberships in this company
        var staffMembership = await dbContext.CompanyMemberships.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(item => item.AccountId == matchedAccount.Id && item.CompanyId == company.Id && item.IsActive, cancellationToken);

        var customerMembership = await dbContext.CustomerMemberships.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(item => item.AccountId == matchedAccount.Id && item.CompanyId == company.Id && item.IsActive, cancellationToken);

        CompanyRole role;
        Guid? customerId = null;
        Guid? customerBranchId = null;
        var effectivePortal = portal;

        if (portal == PortalType.Customer)
        {
            if (customerMembership is null)
            {
                if (staffMembership is not null)
                {
                    role = staffMembership.Role;
                    effectivePortal = role == CompanyRole.Owner ? PortalType.Owner : PortalType.Employee;
                }
                else
                {
                    return new LoginResult(null, "Bu firmanın müşteri portalında yetkili bir hesabınız bulunmamaktadır.");
                }
            }
            else
            {
                role = customerMembership.Role;
                customerId = customerMembership.CustomerId;
                customerBranchId = customerMembership.CustomerBranchId;
            }
        }
        else
        {
            // Owner or Employee
            if (staffMembership is null)
            {
                if (customerMembership is not null)
                {
                    role = customerMembership.Role;
                    effectivePortal = PortalType.Customer;
                    customerId = customerMembership.CustomerId;
                    customerBranchId = customerMembership.CustomerBranchId;
                }
                else
                {
                    return new LoginResult(null, $"Bu hesap '{company.LegalName}' firmasına bağlı bir personel veya yönetici olarak tanımlanmamış.");
                }
            }
            else
            {
                role = staffMembership.Role;
                if (portal == PortalType.Owner && role != CompanyRole.Owner)
                {
                    effectivePortal = PortalType.Employee;
                }
            }
        }

        var token = jwtTokenService.Create(matchedAccount, company, role, customerId, customerBranchId);
        var response = new LoginResponse(
            token.Value,
            token.ExpiresAt,
            effectivePortal.ToString().ToLowerInvariant(),
            new CompanySummary(company.Id, company.LegalName, company.Code),
            new UserSummary(matchedAccount.Id, matchedAccount.DisplayName, matchedAccount.Email, role.ToString(), matchedAccount.HasAcceptedTerms, matchedAccount.TermsAcceptedAt),
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

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            return new LoginResult(null, "Şifre boş bırakılamaz.");
        }

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        if (!normalizedEmail.Contains('@') || !normalizedEmail.Contains('.'))
        {
            return new LoginResult(null, "Lütfen geçerli bir e-posta adresi girin.");
        }

        string finalCode;
        if (!string.IsNullOrWhiteSpace(request.CompanyCode))
        {
            var cleanedCustomCode = GenerateCodeFromName(request.CompanyCode);
            if (cleanedCustomCode.Length < 2)
            {
                return new LoginResult(null, "Firma etiketi (TAG) en az 2 karakter olmalıdır.");
            }

            if (await dbContext.Companies.IgnoreQueryFilters().AnyAsync(c => c.Code == cleanedCustomCode, cancellationToken))
            {
                return new LoginResult(null, $"'{cleanedCustomCode}' firma etiketi (TAG) zaten başka bir firma tarafından kullanılıyor. Lütfen farklı bir TAG belirleyin.");
            }
            finalCode = cleanedCustomCode;
        }
        else
        {
            var parts = request.CompanyName.Trim().Split([' ', '-', '_', '.', ','], StringSplitOptions.RemoveEmptyEntries);
            var candidate = parts.Length > 0 ? GenerateCodeFromName(parts[0]) : GenerateCodeFromName(request.CompanyName);
            if (candidate.Length < 2 && parts.Length > 1) candidate = GenerateCodeFromName(parts[0] + parts[1]);
            if (candidate.Length < 2) candidate = "PEST-" + candidate;

            if (await dbContext.Companies.IgnoreQueryFilters().AnyAsync(c => c.Code == candidate, cancellationToken))
            {
                return new LoginResult(null, $"'{candidate}' firma etiketi (TAG) zaten başka bir firma tarafından kullanılıyor. Lütfen benzersiz bir TAG belirleyin.");
            }
            finalCode = candidate;
        }

        if (await dbContext.Accounts.IgnoreQueryFilters().AnyAsync(a => a.Portal == PortalType.Owner && a.NormalizedEmail == normalizedEmail, cancellationToken))
        {
            return new LoginResult(null, "Bu e-posta adresi ile kayıtlı bir firma sahibi hesabı zaten mevcut.");
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

    private static bool VerifyAccountPassword(IPasswordHasher<Account> hasher, Account account, string rawPassword, string trimmedPassword)
    {
        if (string.IsNullOrEmpty(account.PasswordHash)) return false;

        try
        {
            if (hasher.VerifyHashedPassword(account, account.PasswordHash, rawPassword) != PasswordVerificationResult.Failed)
                return true;
            if (rawPassword != trimmedPassword && hasher.VerifyHashedPassword(account, account.PasswordHash, trimmedPassword) != PasswordVerificationResult.Failed)
                return true;
        }
        catch
        {
            // Fall through in case the hash format is not a standard ASP.NET Identity Base64 hash
        }

        if (account.PasswordHash == rawPassword || account.PasswordHash == trimmedPassword)
            return true;

        return false;
    }
}
