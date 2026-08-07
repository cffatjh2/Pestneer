using System.Net.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Employees;

public static class EmployeeEndpoints
{
    private static readonly HashSet<CompanyRole> EmployeeRoles =
    [
        CompanyRole.Administrator,
        CompanyRole.OperationsManager,
        CompanyRole.Technician
    ];

    public static IEndpointRouteBuilder MapEmployeeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/company/employees")
            .RequireAuthorization("OwnerPortal");

        group.MapGet("/", GetEmployeesAsync);
        group.MapPost("/", CreateEmployeeAsync);
        group.MapPut("/{accountId:guid}", UpdateEmployeeAsync);

        return app;
    }

    private static async Task<IResult> GetEmployeesAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();

        if (!await IsActiveCompanyAsync(dbContext, companyContext.CompanyId.Value, cancellationToken))
        {
            return ExpiredSession();
        }

        var employees = await dbContext.CompanyMemberships.AsNoTracking()
            .Where(item =>
                item.CompanyId == companyContext.CompanyId.Value &&
                item.IsActive &&
                item.Account.Portal == PortalType.Employee)
            .OrderBy(item => item.Account.DisplayName)
            .Select(item => new EmployeeResponse(
                item.AccountId,
                item.Account.DisplayName,
                item.Account.Email,
                item.Account.PhoneNumber ?? string.Empty,
                item.Role.ToString(),
                item.Account.IsActive))
            .ToListAsync(cancellationToken);

        return Results.Ok(employees);
    }

    private static async Task<IResult> CreateEmployeeAsync(
        CreateEmployeeRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IPasswordHasher<Account> passwordHasher,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();

        if (!await IsActiveCompanyAsync(dbContext, companyContext.CompanyId.Value, cancellationToken))
        {
            return ExpiredSession();
        }

        var validationProblem = Validate(request);
        if (validationProblem is not null) return validationProblem;

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var accountExists = await dbContext.Accounts.AnyAsync(item =>
            item.Portal == PortalType.Employee && item.NormalizedEmail == normalizedEmail,
            cancellationToken);
        if (accountExists)
        {
            return Results.Conflict(new { message = "Bu e-posta adresiyle daha önce bir çalışan hesabı oluşturulmuş." });
        }

        var role = Enum.Parse<CompanyRole>(request.Role, true);
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim(),
            NormalizedEmail = normalizedEmail,
            DisplayName = $"{request.FirstName.Trim()} {request.LastName.Trim()}",
            PhoneNumber = request.PhoneNumber.Trim(),
            PasswordHash = string.Empty,
            Portal = PortalType.Employee
        };
        account.PasswordHash = passwordHasher.HashPassword(account, request.Password);

        try
        {
            dbContext.Accounts.Add(account);
            dbContext.CompanyMemberships.Add(new CompanyMembership
            {
                Id = Guid.NewGuid(),
                AccountId = account.Id,
                CompanyId = companyContext.CompanyId.Value,
                Role = role
            });

            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            loggerFactory.CreateLogger("EmployeeEndpoints")
                .LogError(exception, "Çalışan hesabı oluşturulurken veritabanı bütünlüğü hatası oluştu.");
            return Results.Problem(
                title: "Personel hesabı oluşturulamadı",
                detail: "Kayıt sırasında beklenmeyen bir veri hatası oluştu. Lütfen tekrar deneyin.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var response = new EmployeeResponse(
            account.Id,
            account.DisplayName,
            account.Email,
            account.PhoneNumber,
            role.ToString(),
            account.IsActive);

        return Results.Created($"/api/company/employees/{account.Id}", response);
    }

    private static async Task<IResult> UpdateEmployeeAsync(
        Guid accountId,
        UpdateEmployeeRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IPasswordHasher<Account> passwordHasher,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();

        if (!await IsActiveCompanyAsync(dbContext, companyContext.CompanyId.Value, cancellationToken))
        {
            return ExpiredSession();
        }

        var validationProblem = Validate(request);
        if (validationProblem is not null) return validationProblem;

        var membership = await dbContext.CompanyMemberships
            .Include(item => item.Account)
            .SingleOrDefaultAsync(item =>
                item.CompanyId == companyContext.CompanyId.Value &&
                item.AccountId == accountId &&
                item.Account.Portal == PortalType.Employee,
                cancellationToken);
        if (membership is null)
        {
            return Results.NotFound(new { message = "Personel hesabı bulunamadı." });
        }

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var emailInUse = await dbContext.Accounts.AnyAsync(item =>
            item.Id != accountId &&
            item.Portal == PortalType.Employee &&
            item.NormalizedEmail == normalizedEmail,
            cancellationToken);
        if (emailInUse)
        {
            return Results.Conflict(new { message = "Bu e-posta adresi başka bir çalışan hesabında kullanılıyor." });
        }

        var role = Enum.Parse<CompanyRole>(request.Role, true);
        membership.Role = role;
        membership.Account.DisplayName = $"{request.FirstName.Trim()} {request.LastName.Trim()}";
        membership.Account.Email = request.Email.Trim();
        membership.Account.NormalizedEmail = normalizedEmail;
        membership.Account.PhoneNumber = request.PhoneNumber.Trim();
        membership.Account.IsActive = request.IsActive;

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            membership.Account.PasswordHash = passwordHasher.HashPassword(membership.Account, request.NewPassword);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            loggerFactory.CreateLogger("EmployeeEndpoints")
                .LogError(exception, "Çalışan hesabı güncellenirken veritabanı bütünlüğü hatası oluştu.");
            return Results.Problem(
                title: "Personel hesabı güncellenemedi",
                detail: "Güncelleme sırasında beklenmeyen bir veri hatası oluştu. Lütfen tekrar deneyin.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Ok(new EmployeeResponse(
            membership.Account.Id,
            membership.Account.DisplayName,
            membership.Account.Email,
            membership.Account.PhoneNumber ?? string.Empty,
            membership.Role.ToString(),
            membership.Account.IsActive));
    }

    private static IResult? Validate(CreateEmployeeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        AddLengthError(errors, "firstName", request.FirstName, "Ad", 2, 80);
        AddLengthError(errors, "lastName", request.LastName, "Soyad", 2, 80);

        if (!MailAddress.TryCreate(request.Email.Trim(), out _))
        {
            errors["email"] = ["Geçerli bir e-posta adresi girin."];
        }

        var phone = request.PhoneNumber.Trim();
        if (phone.Length < 10 || phone.Length > 24 || phone.Count(char.IsDigit) < 10)
        {
            errors["phoneNumber"] = ["Geçerli bir telefon numarası girin."];
        }

        if (!Enum.TryParse<CompanyRole>(request.Role, true, out var role) || !EmployeeRoles.Contains(role))
        {
            errors["role"] = ["Geçerli bir personel yetkisi seçin."];
        }

        if (request.Password.Length < 6)
        {
            errors["password"] = ["Şifre en az 6 karakter olmalıdır."];
        }

        return errors.Count == 0 ? null : Results.ValidationProblem(errors);
    }

    private static IResult? Validate(UpdateEmployeeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        AddLengthError(errors, "firstName", request.FirstName, "Ad", 2, 80);
        AddLengthError(errors, "lastName", request.LastName, "Soyad", 2, 80);

        if (!MailAddress.TryCreate(request.Email.Trim(), out _))
        {
            errors["email"] = ["Geçerli bir e-posta adresi girin."];
        }

        var phone = request.PhoneNumber.Trim();
        if (phone.Length < 10 || phone.Length > 24 || phone.Count(char.IsDigit) < 10)
        {
            errors["phoneNumber"] = ["Geçerli bir telefon numarası girin."];
        }

        if (!Enum.TryParse<CompanyRole>(request.Role, true, out var role) || !EmployeeRoles.Contains(role))
        {
            errors["role"] = ["Geçerli bir personel yetkisi seçin."];
        }

        if (!string.IsNullOrEmpty(request.NewPassword) && request.NewPassword.Length < 6)
        {
            errors["newPassword"] = ["Yeni şifre en az 6 karakter olmalıdır."];
        }

        return errors.Count == 0 ? null : Results.ValidationProblem(errors);
    }

    private static Task<bool> IsActiveCompanyAsync(
        PesneerDbContext dbContext,
        Guid companyId,
        CancellationToken cancellationToken) =>
        dbContext.Companies.AsNoTracking()
            .AnyAsync(company => company.Id == companyId && company.IsActive, cancellationToken);

    private static IResult ExpiredSession() => Results.Json(
        new { message = "Oturum bilgileri güncel değil. Lütfen yeniden giriş yapın." },
        statusCode: StatusCodes.Status401Unauthorized);

    private static void AddLengthError(
        IDictionary<string, string[]> errors,
        string key,
        string value,
        string label,
        int minimum,
        int maximum)
    {
        var length = value.Trim().Length;
        if (length < minimum || length > maximum)
        {
            errors[key] = [$"{label} {minimum}-{maximum} karakter arasında olmalıdır."];
        }
    }
}
