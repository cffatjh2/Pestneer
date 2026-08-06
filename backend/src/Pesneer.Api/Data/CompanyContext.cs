using System.Security.Claims;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public interface ICompanyContext
{
    Guid? AccountId { get; }
    Guid? CompanyId { get; }
    Guid? CustomerId { get; }
    PortalType? Portal { get; }
}

public sealed class HttpCompanyContext(IHttpContextAccessor httpContextAccessor) : ICompanyContext
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public Guid? AccountId => ParseGuidClaim(ClaimTypes.NameIdentifier) ?? ParseGuidClaim("sub");
    public Guid? CompanyId => ParseGuidClaim("company_id");
    public Guid? CustomerId => ParseGuidClaim("customer_id");

    public PortalType? Portal => Enum.TryParse<PortalType>(User?.FindFirstValue("portal"), true, out var portal)
        ? portal
        : null;

    private Guid? ParseGuidClaim(string claimType) => Guid.TryParse(User?.FindFirstValue(claimType), out var value)
        ? value
        : null;
}
