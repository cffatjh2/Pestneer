using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Auth;

public static class AccountSecurityEndpoints
{
    public static IEndpointRouteBuilder MapAccountSecurityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/account/password", ChangeOwnPasswordAsync).RequireAuthorization();

        var ownerGroup = app.MapGroup("/api/company/account-security").RequireAuthorization("OwnerPortal");
        ownerGroup.MapGet("/accounts", GetCompanyAccountsAsync);
        ownerGroup.MapPut("/accounts/{accountId:guid}/password", ResetCompanyAccountPasswordAsync);
        return app;
    }

    private static async Task<IResult> ChangeOwnPasswordAsync(
        ClaimsPrincipal user,
        ChangeOwnPasswordRequest request,
        PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher,
        CancellationToken cancellationToken)
    {
        var accountId = GetAccountId(user);
        if (!accountId.HasValue) return Results.Unauthorized();

        var validation = ValidateNewPassword(request.NewPassword, request.NewPasswordConfirmation);
        if (validation is not null) return validation;

        var account = await dbContext.Accounts.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.Id == accountId.Value && item.IsActive, cancellationToken);
        if (account is null) return Results.Unauthorized();

        if (passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["currentPassword"] = ["Mevcut şifre doğrulanamadı."] });

        if (passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.NewPassword) != PasswordVerificationResult.Failed)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["newPassword"] = ["Yeni şifre mevcut şifreden farklı olmalıdır."] });

        account.PasswordHash = passwordHasher.HashPassword(account, request.NewPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { message = "Şifreniz güncellendi. Yeni şifrenizle tekrar giriş yapın." });
    }

    private static async Task<IResult> GetCompanyAccountsAsync(
        ICompanyContext companyContext,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Unauthorized();
        var companyId = companyContext.CompanyId.Value;

        var staff = await dbContext.CompanyMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.CompanyId == companyId && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
            .Select(item => new AccountSecurityRecord(item.Account.Id, item.Account.DisplayName, item.Account.Email, item.Account.Portal.ToString(), item.Role.ToString()))
            .ToListAsync(cancellationToken);
        var customers = await dbContext.CustomerMemberships.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.CompanyId == companyId && item.IsActive && item.Account.IsActive)
            .Select(item => new AccountSecurityRecord(item.Account.Id, item.Account.DisplayName, item.Account.Email, item.Account.Portal.ToString(), item.Role.ToString()))
            .ToListAsync(cancellationToken);

        return Results.Ok(staff.Concat(customers).DistinctBy(item => item.Id).OrderBy(item => item.Portal).ThenBy(item => item.Name));
    }

    private static async Task<IResult> ResetCompanyAccountPasswordAsync(
        Guid accountId,
        ResetAccountPasswordRequest request,
        ICompanyContext companyContext,
        PesneerDbContext dbContext,
        IPasswordHasher<Account> passwordHasher,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Unauthorized();
        var validation = ValidateNewPassword(request.NewPassword, request.NewPasswordConfirmation);
        if (validation is not null) return validation;

        var companyId = companyContext.CompanyId.Value;
        var belongsToCompany = await dbContext.CompanyMemberships.IgnoreQueryFilters().AnyAsync(
            item => item.CompanyId == companyId && item.AccountId == accountId && item.IsActive && item.Account.Portal == PortalType.Employee, cancellationToken)
            || await dbContext.CustomerMemberships.IgnoreQueryFilters().AnyAsync(
                item => item.CompanyId == companyId && item.AccountId == accountId && item.IsActive, cancellationToken);
        if (!belongsToCompany) return Results.NotFound(new { message = "Hesap bu firmaya bağlı değil." });

        var account = await dbContext.Accounts.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Id == accountId && item.IsActive, cancellationToken);
        if (account is null) return Results.NotFound(new { message = "Hesap bulunamadı." });
        account.PasswordHash = passwordHasher.HashPassword(account, request.NewPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { message = $"{account.DisplayName} için geçici şifre atandı." });
    }

    internal static IResult? ValidateNewPassword(string password, string confirmation)
    {
        if (password != confirmation)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["newPasswordConfirmation"] = ["Şifre tekrarı eşleşmiyor."] });
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8 || !password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["newPassword"] = ["Şifre en az 8 karakter olmalı, harf ve rakam içermelidir."] });
        return null;
    }

    private static Guid? GetAccountId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var accountId) ? accountId : null;
    }
}

public sealed record ChangeOwnPasswordRequest(string CurrentPassword, string NewPassword, string NewPasswordConfirmation);
public sealed record ResetAccountPasswordRequest(string NewPassword, string NewPasswordConfirmation);
public sealed record AccountSecurityRecord(Guid Id, string Name, string Email, string Portal, string Role);
