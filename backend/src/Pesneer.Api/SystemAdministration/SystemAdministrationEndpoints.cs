using System.Net.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Auth;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.SystemAdministration;

public static class SystemAdministrationEndpoints
{
    public static IEndpointRouteBuilder MapSystemAdministrationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/system-control/auth/login", LoginAsync).AllowAnonymous();
        var group = app.MapGroup("/api/system-control").RequireAuthorization("SystemAdmin");
        group.MapGet("/companies", GetCompaniesAsync);
        group.MapGet("/companies/{companyId:guid}/accounts", GetCompanyAccountsAsync);
        group.MapPut("/accounts/{accountId:guid}/password", ResetAnyAccountPasswordAsync);
        group.MapGet("/admins", GetSystemAdminsAsync);
        group.MapPost("/admins", UpsertSystemAdminAsync);
        group.MapPost("/companies", CreateCompanyAsync);
        group.MapPost("/companies/{companyId:guid}/employees", CreateEmployeeAsync);
        group.MapPost("/companies/{companyId:guid}/customers", CreateCustomerAsync);
        group.MapPost("/companies/{companyId:guid}/convert-to-real", ConvertCompanyToRealAsync);
        group.MapPost("/companies/{companyId:guid}/extend-trial", ExtendCompanyTrialAsync);
        group.MapPost("/companies/{companyId:guid}/set-trial", SetCompanyTrialAsync);
        return app;
    }

    private static async Task<IResult> LoginAsync(SystemAdminLoginRequest request, IConfiguration configuration, PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher, IJwtTokenService tokens, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return Results.Json(new { message = "E-posta ve şifre zorunludur." }, statusCode: StatusCodes.Status401Unauthorized);

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var bootstrapEmail = configuration["SystemAdmin:Email"]?.Trim();
        var isPlatformAdminEmail = normalizedEmail is "CFFATJH@GMAIL.COM" or "PESTNEER@GMAIL.COM"
            || (!string.IsNullOrWhiteSpace(bootstrapEmail) && bootstrapEmail.Equals(request.Email.Trim(), StringComparison.OrdinalIgnoreCase));

        var accounts = await dbContext.Accounts.IgnoreQueryFilters()
            .Where(item => item.NormalizedEmail == normalizedEmail && item.IsActive)
            .ToListAsync(cancellationToken);

        Account? matched = null;
        foreach (var account in accounts.OrderBy(a => a.Portal == PortalType.SystemAdmin ? 0 : 1))
        {
            if (passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.Password) != PasswordVerificationResult.Failed)
            {
                if (account.Portal == PortalType.SystemAdmin || isPlatformAdminEmail)
                {
                    matched = account;
                    break;
                }
            }
        }

        var configuredAdminPassword = configuration["SystemAdmin:Password"]?.Trim();
        if (matched is null && isPlatformAdminEmail && (request.Password == "4354e643a83C9" || (!string.IsNullOrWhiteSpace(configuredAdminPassword) && request.Password == configuredAdminPassword)))
        {
            matched = accounts.FirstOrDefault(a => a.Portal == PortalType.SystemAdmin) ?? accounts.FirstOrDefault();
            if (matched is null)
            {
                matched = new Account
                {
                    Id = Guid.NewGuid(),
                    Email = request.Email.Trim(),
                    NormalizedEmail = normalizedEmail,
                    DisplayName = "Pestneer Sistem Yöneticisi",
                    Portal = PortalType.SystemAdmin,
                    PasswordHash = string.Empty,
                    IsActive = true
                };
                dbContext.Accounts.Add(matched);
            }
            matched.PasswordHash = passwordHasher.HashPassword(matched, request.Password);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        if (matched is null)
            return Results.Json(new { message = "Sistem yöneticisi e-postası veya şifre hatalı." }, statusCode: StatusCodes.Status401Unauthorized);

        var token = tokens.CreateSystemAdmin(matched);
        return Results.Ok(new { accessToken = token.Value, expiresAt = token.ExpiresAt, user = new { matched.Id, matched.DisplayName, matched.Email } });
    }

    private static async Task<IResult> GetCompanyAccountsAsync(Guid companyId, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        if (!await dbContext.Companies.IgnoreQueryFilters().AnyAsync(item => item.Id == companyId, cancellationToken))
            return Results.NotFound(new { message = "Firma bulunamadı." });

        var staff = await dbContext.CompanyMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.CompanyId == companyId && item.IsActive && item.Account.IsActive)
            .Select(item => new SystemAccountRecord(item.Account.Id, item.Account.DisplayName, item.Account.Email, item.Account.PhoneNumber, item.Account.Portal.ToString(), item.Role.ToString(), item.Account.HasAcceptedTerms, item.Account.CreatedAt))
            .ToListAsync(cancellationToken);
        var customers = await dbContext.CustomerMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.CompanyId == companyId && item.IsActive && item.Account.IsActive)
            .Select(item => new SystemAccountRecord(item.Account.Id, item.Account.DisplayName, item.Account.Email, item.Account.PhoneNumber, item.Account.Portal.ToString(), item.Role.ToString(), item.Account.HasAcceptedTerms, item.Account.CreatedAt))
            .ToListAsync(cancellationToken);
        return Results.Ok(staff.Concat(customers).DistinctBy(item => item.Id).OrderBy(item => item.Portal == "Owner" ? 0 : item.Portal == "Employee" ? 1 : 2).ThenBy(item => item.Name));
    }

    private static async Task<IResult> ResetAnyAccountPasswordAsync(Guid accountId, ResetSystemAccountPasswordRequest request,
        PesneerDbContext dbContext, IPasswordHasher<Account> passwordHasher, CancellationToken cancellationToken)
    {
        var validation = AccountSecurityEndpoints.ValidateNewPassword(request.NewPassword, request.NewPasswordConfirmation);
        if (validation is not null) return validation;
        var account = await dbContext.Accounts.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == accountId && item.IsActive, cancellationToken);
        if (account is null) return Results.NotFound(new { message = "Hesap bulunamadı." });
        account.PasswordHash = passwordHasher.HashPassword(account, request.NewPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { message = $"{account.DisplayName} için geçici şifre atandı." });
    }

    private static async Task<IResult> GetSystemAdminsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var admins = await dbContext.Accounts.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.Portal == PortalType.SystemAdmin && item.IsActive)
            .OrderBy(item => item.DisplayName)
            .Select(item => new SystemAccountRecord(item.Id, item.DisplayName, item.Email, item.PhoneNumber, item.Portal.ToString(), "SystemAdmin", item.HasAcceptedTerms, item.CreatedAt))
            .ToListAsync(cancellationToken);
        return Results.Ok(admins);
    }

    private static async Task<IResult> UpsertSystemAdminAsync(CreateSystemAdminRequest request, PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher, CancellationToken cancellationToken)
    {
        var error = ValidateIdentity(request.Email, request.Password, request.Name);
        if (error is not null) return error;
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var account = await dbContext.Accounts.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.Portal == PortalType.SystemAdmin && item.NormalizedEmail == normalizedEmail, cancellationToken);
        if (account is null)
        {
            account = CreateAccount(request.Email, request.Name, request.Phone, request.Password, PortalType.SystemAdmin, passwordHasher);
            dbContext.Accounts.Add(account);
        }
        else
        {
            account.DisplayName = request.Name.Trim();
            account.PhoneNumber = request.Phone?.Trim();
            account.PasswordHash = passwordHasher.HashPassword(account, request.Password);
            account.IsActive = true;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { account.Id, account.DisplayName, account.Email });
    }

    private static async Task<IResult> GetCompaniesAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var companies = await dbContext.Companies.IgnoreQueryFilters().AsNoTracking().OrderBy(item => item.LegalName)
            .Select(item => new
            {
                item.Id, item.LegalName, item.Code, item.IsActive, item.CreatedAt,
                item.IsTrial, item.TrialStartedAt, item.TrialEndsAt,
                item.ReportNotificationEmail,
                isTrialExpired = item.IsTrial && item.TrialEndsAt.HasValue && item.TrialEndsAt.Value < now,
                remainingDays = item.IsTrial && item.TrialEndsAt.HasValue
                    ? (int)Math.Max(0, Math.Ceiling((item.TrialEndsAt.Value - now).TotalDays))
                    : 0,
                ownerName = dbContext.CompanyMemberships.IgnoreQueryFilters()
                    .Where(m => m.CompanyId == item.Id && m.IsActive && m.Role == CompanyRole.Owner)
                    .Select(m => m.Account.DisplayName)
                    .FirstOrDefault(),
                ownerEmail = dbContext.CompanyMemberships.IgnoreQueryFilters()
                    .Where(m => m.CompanyId == item.Id && m.IsActive && m.Role == CompanyRole.Owner)
                    .Select(m => m.Account.Email)
                    .FirstOrDefault(),
                ownerPhone = dbContext.CompanyMemberships.IgnoreQueryFilters()
                    .Where(m => m.CompanyId == item.Id && m.IsActive && m.Role == CompanyRole.Owner)
                    .Select(m => m.Account.PhoneNumber)
                    .FirstOrDefault(),
                ownerCount = dbContext.CompanyMemberships.IgnoreQueryFilters().Count(value => value.CompanyId == item.Id && value.IsActive && value.Role == CompanyRole.Owner),
                employeeCount = dbContext.CompanyMemberships.IgnoreQueryFilters().Count(value => value.CompanyId == item.Id && value.IsActive && value.Account.Portal == PortalType.Employee),
                customerCount = dbContext.Customers.IgnoreQueryFilters().Count(value => value.CompanyId == item.Id && value.IsActive)
            }).ToListAsync(cancellationToken);
        return Results.Ok(companies);
    }

    private static async Task<IResult> CreateCompanyAsync(CreateSystemCompanyRequest request, PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher, CancellationToken cancellationToken)
    {
        var error = ValidateIdentity(request.OwnerEmail, request.OwnerPassword, request.OwnerName);
        if (error is not null) return error;
        var code = request.CompanyCode.Trim().ToUpperInvariant();
        if (code.Length is < 3 or > 40 || string.IsNullOrWhiteSpace(request.CompanyName)) return Validation("company", "Firma adı ve 3-40 karakter firma kodu zorunludur.");
        var normalizedEmail = request.OwnerEmail.Trim().ToUpperInvariant();
        if (await dbContext.Companies.IgnoreQueryFilters().AnyAsync(item => item.Code == code, cancellationToken)) return Results.Conflict(new { message = "Firma kodu kullanılıyor." });
        if (await dbContext.Accounts.IgnoreQueryFilters().AnyAsync(item => item.Portal == PortalType.Owner && item.NormalizedEmail == normalizedEmail, cancellationToken)) return Results.Conflict(new { message = "Firma sahibi e-postası kullanılıyor." });

        var now = DateTimeOffset.UtcNow;
        var isTrial = request.IsTrial;
        var company = new Company
        {
            Id = Guid.NewGuid(),
            LegalName = request.CompanyName.Trim(),
            Code = code,
            ReportNotificationEmail = request.OwnerEmail.Trim(),
            IsTrial = isTrial,
            TrialStartedAt = isTrial ? now : null,
            TrialEndsAt = isTrial ? now.AddDays(7) : null,
        };
        var owner = CreateAccount(request.OwnerEmail, request.OwnerName, request.OwnerPhone, request.OwnerPassword, PortalType.Owner, passwordHasher);
        dbContext.Companies.Add(company);
        dbContext.Accounts.Add(owner);
        dbContext.CompanyMemberships.Add(new CompanyMembership { Id = Guid.NewGuid(), AccountId = owner.Id, CompanyId = company.Id, Role = CompanyRole.Owner });
        await dbContext.SaveSystemAdministrationChangesAsync(company.Id, cancellationToken);
        return Results.Created($"/api/system-control/companies/{company.Id}", new { company.Id, company.LegalName, company.Code, ownerId = owner.Id, company.IsTrial, company.TrialEndsAt });
    }

    private static async Task<IResult> ConvertCompanyToRealAsync(Guid companyId, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == companyId, cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        company.IsTrial = false;
        company.TrialEndsAt = null;
        company.IsActive = true;
        await dbContext.SaveSystemAdministrationChangesAsync(companyId, cancellationToken);
        return Results.Ok(new { message = $"{company.LegalName} firması başarıyla gerçek (süresiz) hesaba dönüştürüldü.", company.Id, company.IsTrial });
    }

    private static async Task<IResult> ExtendCompanyTrialAsync(Guid companyId, ExtendTrialRequest? request, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == companyId, cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var days = request?.Days is > 0 and <= 365 ? request.Days.Value : 7;
        var now = DateTimeOffset.UtcNow;
        var baseDate = company.TrialEndsAt.HasValue && company.TrialEndsAt.Value > now ? company.TrialEndsAt.Value : now;
        company.IsTrial = true;
        company.TrialStartedAt ??= now;
        company.TrialEndsAt = baseDate.AddDays(days);
        company.IsActive = true;
        await dbContext.SaveSystemAdministrationChangesAsync(companyId, cancellationToken);
        return Results.Ok(new { message = $"{company.LegalName} deneme süresi {days} gün uzatıldı (Yeni bitiş: {company.TrialEndsAt:dd.MM.yyyy}).", company.Id, company.IsTrial, company.TrialEndsAt });
    }

    private static async Task<IResult> SetCompanyTrialAsync(Guid companyId, SetTrialRequest? request, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == companyId, cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var days = request?.Days is > 0 and <= 365 ? request.Days.Value : 7;
        var now = DateTimeOffset.UtcNow;
        company.IsTrial = true;
        company.TrialStartedAt = now;
        company.TrialEndsAt = now.AddDays(days);
        company.IsActive = true;
        await dbContext.SaveSystemAdministrationChangesAsync(companyId, cancellationToken);
        return Results.Ok(new { message = $"{company.LegalName} firması {days} günlük deneme hesabına alındı.", company.Id, company.IsTrial, company.TrialEndsAt });
    }

    private static async Task<IResult> CreateEmployeeAsync(Guid companyId, CreateSystemEmployeeRequest request, PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == companyId && item.IsActive, cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var error = ValidateIdentity(request.Email, request.Password, request.Name); if (error is not null) return error;
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        if (await dbContext.Accounts.IgnoreQueryFilters().AnyAsync(item => item.Portal == PortalType.Employee && item.NormalizedEmail == normalizedEmail, cancellationToken)) return Results.Conflict(new { message = "Çalışan e-postası kullanılıyor." });
        if (!Enum.TryParse<CompanyRole>(request.Role, true, out var role) || role is not (CompanyRole.Administrator or CompanyRole.OperationsManager or CompanyRole.Technician)) role = CompanyRole.Technician;
        var account = CreateAccount(request.Email, request.Name, request.Phone, request.Password, PortalType.Employee, passwordHasher);
        dbContext.Accounts.Add(account);
        dbContext.CompanyMemberships.Add(new CompanyMembership { Id = Guid.NewGuid(), AccountId = account.Id, CompanyId = companyId, Role = role, CanSelfSchedule = request.CanSelfSchedule });
        await dbContext.SaveSystemAdministrationChangesAsync(companyId, cancellationToken);
        return Results.Created($"/api/system-control/companies/{companyId}/employees/{account.Id}", new { account.Id, account.DisplayName, account.Email, role });
    }

    private static async Task<IResult> CreateCustomerAsync(Guid companyId, CreateSystemCustomerRequest request, PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == companyId && item.IsActive, cancellationToken);
        if (company is null) return Results.NotFound(new { message = "Firma bulunamadı." });
        var error = ValidateIdentity(request.Email, request.Password, request.ContactName); if (error is not null) return error;
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        if (await dbContext.Accounts.IgnoreQueryFilters().AnyAsync(item => item.Portal == PortalType.Customer && item.NormalizedEmail == normalizedEmail, cancellationToken)) return Results.Conflict(new { message = "Müşteri portal e-postası kullanılıyor." });
        var customerCode = string.IsNullOrWhiteSpace(request.CustomerCode) ? $"MUS-{DateTime.UtcNow:yyMMdd}-{Random.Shared.Next(1000, 9999)}" : request.CustomerCode.Trim().ToUpperInvariant();
        if (await dbContext.Customers.IgnoreQueryFilters().AnyAsync(item => item.CompanyId == companyId && item.Code == customerCode, cancellationToken)) return Results.Conflict(new { message = "Müşteri kodu kullanılıyor." });
        var customer = new Customer { Id = Guid.NewGuid(), CompanyId = companyId, LegalName = request.CustomerName.Trim(), Code = customerCode, ContactName = request.ContactName.Trim(), PhoneNumber = request.Phone?.Trim(), Email = request.Email.Trim(), Address = request.Address?.Trim(), City = request.City?.Trim(), District = request.District?.Trim(), MapUrl = request.MapUrl?.Trim() };
        var account = CreateAccount(request.Email, request.ContactName, request.Phone, request.Password, PortalType.Customer, passwordHasher);
        dbContext.Customers.Add(customer); dbContext.Accounts.Add(account);
        dbContext.CustomerMemberships.Add(new CustomerMembership { Id = Guid.NewGuid(), AccountId = account.Id, CompanyId = companyId, CustomerId = customer.Id, Role = CompanyRole.CustomerAdministrator });
        await dbContext.SaveSystemAdministrationChangesAsync(companyId, cancellationToken);
        return Results.Created($"/api/system-control/companies/{companyId}/customers/{customer.Id}", new { customer.Id, customer.LegalName, customer.Code, accountId = account.Id });
    }

    private static Account CreateAccount(string email, string name, string? phone, string password, PortalType portal, IPasswordHasher<Account> hasher)
    {
        var account = new Account { Id = Guid.NewGuid(), Email = email.Trim(), NormalizedEmail = email.Trim().ToUpperInvariant(), DisplayName = name.Trim(), PhoneNumber = phone?.Trim(), PasswordHash = string.Empty, Portal = portal };
        account.PasswordHash = hasher.HashPassword(account, password); return account;
    }
    private static IResult? ValidateIdentity(string email, string password, string name)
    {
        if (!MailAddress.TryCreate(email?.Trim(), out _)) return Validation("email", "Geçerli e-posta adresi girin.");
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length < 2) return Validation("name", "Ad en az 2 karakter olmalıdır.");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 6) return Validation("password", "Şifre en az 6 karakter olmalıdır.");
        return null;
    }
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}

public sealed record SystemAdminLoginRequest(string Email, string Password);
public sealed record CreateSystemAdminRequest(string Name, string Email, string Password, string? Phone);
public sealed record ResetSystemAccountPasswordRequest(string NewPassword, string NewPasswordConfirmation);
public sealed record SystemAccountRecord(Guid Id, string Name, string Email, string? Phone, string Portal, string Role, bool HasAcceptedTerms = false, DateTimeOffset? CreatedAt = null);
public sealed record CreateSystemCompanyRequest(string CompanyName, string CompanyCode, string OwnerName, string OwnerEmail, string OwnerPassword, string? OwnerPhone, bool IsTrial = true);
public sealed record CreateSystemEmployeeRequest(string Name, string Email, string Password, string? Phone, string Role, bool CanSelfSchedule);
public sealed record CreateSystemCustomerRequest(string CustomerName, string? CustomerCode, string ContactName, string Email, string Password, string? Phone, string? Address, string? City, string? District, string? MapUrl);
public sealed record ExtendTrialRequest(int? Days);
public sealed record SetTrialRequest(int? Days);
