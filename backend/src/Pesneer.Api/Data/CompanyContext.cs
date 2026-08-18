using System.Security.Claims;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public interface ICompanyContext
{
    Guid? AccountId { get; }
    Guid? CompanyId { get; }
    Guid? CustomerId { get; }
    Guid? CustomerBranchId { get; }
    PortalType? Portal { get; }
}

public sealed class HttpCompanyContext(IHttpContextAccessor httpContextAccessor) : ICompanyContext
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    private Guid? _accountId;
    private bool _accountIdParsed;
    private Guid? _companyId;
    private bool _companyIdParsed;
    private Guid? _customerId;
    private bool _customerIdParsed;
    private Guid? _customerBranchId;
    private bool _customerBranchIdParsed;
    private PortalType? _portal;
    private bool _portalParsed;

    public Guid? AccountId
    {
        get
        {
            if (!_accountIdParsed) { _accountId = ParseGuidClaim(ClaimTypes.NameIdentifier) ?? ParseGuidClaim("sub"); _accountIdParsed = true; }
            return _accountId;
        }
    }

    public Guid? CompanyId
    {
        get
        {
            if (!_companyIdParsed) { _companyId = ParseGuidClaim("company_id"); _companyIdParsed = true; }
            return _companyId;
        }
    }

    public Guid? CustomerId
    {
        get
        {
            if (!_customerIdParsed) { _customerId = ParseGuidClaim("customer_id"); _customerIdParsed = true; }
            return _customerId;
        }
    }

    public Guid? CustomerBranchId
    {
        get
        {
            if (!_customerBranchIdParsed) { _customerBranchId = ParseGuidClaim("customer_branch_id"); _customerBranchIdParsed = true; }
            return _customerBranchId;
        }
    }

    public PortalType? Portal
    {
        get
        {
            if (!_portalParsed) { _portal = Enum.TryParse<PortalType>(User?.FindFirstValue("portal"), true, out var portal) ? portal : null; _portalParsed = true; }
            return _portal;
        }
    }

    private Guid? ParseGuidClaim(string claimType) => Guid.TryParse(User?.FindFirstValue(claimType), out var value)
        ? value
        : null;
}
