namespace Pesneer.Api.Auth;

public sealed record LoginRequest(string CompanyCode, string Email, string Password);
public sealed record CompanySummary(Guid Id, string Name, string Code);
public sealed record UserSummary(Guid Id, string Name, string Email, string Role);
public sealed record LoginResponse(
    string AccessToken,
    DateTimeOffset ExpiresAt,
    string Portal,
    CompanySummary Company,
    UserSummary User,
    Guid? CustomerId);
