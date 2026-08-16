namespace Pesneer.Api.Auth;

public sealed record LoginRequest(string CompanyCode, string Email, string Password);
public sealed record CompanySummary(Guid Id, string Name, string Code);
public sealed record UserSummary(Guid Id, string Name, string Email, string Role, bool HasAcceptedTerms = false, DateTimeOffset? TermsAcceptedAt = null);
public sealed record AcceptTermsRequest(string? Version = "2026.1", bool ConsentMarketing = true);
public sealed record LoginResponse(
    string AccessToken,
    DateTimeOffset ExpiresAt,
    string Portal,
    CompanySummary Company,
    UserSummary User,
    Guid? CustomerId,
    Guid? CustomerBranchId);
