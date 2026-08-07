using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Auth;

public sealed record TokenResult(string Value, DateTimeOffset ExpiresAt);

public interface IJwtTokenService
{
    TokenResult Create(Account account, Company company, CompanyRole role, Guid? customerId, Guid? customerBranchId);
}

public sealed class JwtTokenService(IOptions<JwtOptions> options) : IJwtTokenService
{
    private readonly JwtOptions _options = options.Value;

    public TokenResult Create(Account account, Company company, CompanyRole role, Guid? customerId, Guid? customerBranchId)
    {
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(_options.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, account.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, account.Email),
            new(ClaimTypes.Name, account.DisplayName),
            new(ClaimTypes.Role, role.ToString()),
            new("portal", account.Portal.ToString()),
            new("company_id", company.Id.ToString())
        };

        if (customerId.HasValue)
        {
            claims.Add(new Claim("customer_id", customerId.Value.ToString()));
        }

        if (customerBranchId.HasValue)
        {
            claims.Add(new Claim("customer_branch_id", customerBranchId.Value.ToString()));
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey));
        var token = new JwtSecurityToken(
            _options.Issuer,
            _options.Audience,
            claims,
            expires: expiresAt.UtcDateTime,
            signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256));

        return new TokenResult(new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
