using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Auth;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Email;

public sealed record GoogleEmailConnectionStatus(bool OAuthAvailable, bool Connected, string? SenderEmail, DateTimeOffset? ConnectedAt, string? LastError);
public sealed record GoogleEmailConnectionResult(Guid CompanyId, string SenderEmail);

public interface IEmailCredentialProtector
{
    string Protect(string value);
    string Unprotect(string value);
}

public sealed class EmailCredentialProtector(IOptions<JwtOptions> jwtOptions) : IEmailCredentialProtector
{
    private readonly byte[] key = SHA256.HashData(Encoding.UTF8.GetBytes($"pestneer-email-credentials-v1:{jwtOptions.Value.SigningKey}"));

    public string Protect(string value)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintext = Encoding.UTF8.GetBytes(value);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(key, tag.Length);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);
        return $"v1.{Base64UrlTextEncoder.Encode(nonce)}.{Base64UrlTextEncoder.Encode(tag)}.{Base64UrlTextEncoder.Encode(ciphertext)}";
    }

    public string Unprotect(string value)
    {
        var parts = value.Split('.');
        if (parts.Length != 4 || parts[0] != "v1") throw new CryptographicException("E-posta bağlantı anahtarı geçersiz.");
        var nonce = Base64UrlTextEncoder.Decode(parts[1]);
        var tag = Base64UrlTextEncoder.Decode(parts[2]);
        var ciphertext = Base64UrlTextEncoder.Decode(parts[3]);
        var plaintext = new byte[ciphertext.Length];
        using var aes = new AesGcm(key, tag.Length);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return Encoding.UTF8.GetString(plaintext);
    }
}

public interface IEmailOAuthStateService
{
    string Create(Guid companyId, Guid accountId);
    bool TryValidate(string state, out Guid companyId, out Guid accountId);
}

public sealed class EmailOAuthStateService(IOptions<JwtOptions> jwtOptions) : IEmailOAuthStateService
{
    private readonly byte[] key = SHA256.HashData(Encoding.UTF8.GetBytes($"pestneer-email-oauth-state-v1:{jwtOptions.Value.SigningKey}"));

    public string Create(Guid companyId, Guid accountId)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new OAuthState(companyId, accountId, DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds(), Guid.NewGuid().ToString("N")));
        var encodedPayload = Base64UrlTextEncoder.Encode(payload);
        var signature = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(encodedPayload));
        return $"{encodedPayload}.{Base64UrlTextEncoder.Encode(signature)}";
    }

    public bool TryValidate(string state, out Guid companyId, out Guid accountId)
    {
        companyId = Guid.Empty;
        accountId = Guid.Empty;
        var parts = state.Split('.');
        if (parts.Length != 2) return false;
        byte[] suppliedSignature;
        try { suppliedSignature = Base64UrlTextEncoder.Decode(parts[1]); }
        catch (FormatException) { return false; }
        var expectedSignature = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(parts[0]));
        if (!CryptographicOperations.FixedTimeEquals(suppliedSignature, expectedSignature)) return false;
        try
        {
            var payload = JsonSerializer.Deserialize<OAuthState>(Base64UrlTextEncoder.Decode(parts[0]));
            if (payload is null || payload.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return false;
            companyId = payload.CompanyId;
            accountId = payload.AccountId;
            return companyId != Guid.Empty && accountId != Guid.Empty;
        }
        catch (JsonException) { return false; }
        catch (FormatException) { return false; }
    }

    private sealed record OAuthState(Guid CompanyId, Guid AccountId, long ExpiresAt, string Nonce);
}

public interface IGoogleEmailConnectionService
{
    bool OAuthAvailable { get; }
    string? ConfigurationError { get; }
    string CreateAuthorizationUrl(Guid companyId, Guid accountId);
    Task<GoogleEmailConnectionResult> CompleteAsync(string code, string state, CancellationToken cancellationToken);
    Task<GoogleEmailConnectionStatus> GetStatusAsync(Guid companyId, CancellationToken cancellationToken);
    Task<bool> SendAsync(OutboundEmail email, CancellationToken cancellationToken);
}

public sealed class GoogleEmailConnectionService(
    PesneerDbContext dbContext,
    IOptions<EmailDeliveryOptions> options,
    IEmailCredentialProtector credentialProtector,
    IEmailOAuthStateService stateService,
    IHttpClientFactory httpClientFactory,
    ILogger<GoogleEmailConnectionService> logger) : IGoogleEmailConnectionService
{
    private const string GmailSendScope = "https://www.googleapis.com/auth/gmail.send";
    private const string UserEmailScope = "https://www.googleapis.com/auth/userinfo.email";
    private readonly EmailDeliveryOptions options = options.Value;

    public bool OAuthAvailable => !string.IsNullOrWhiteSpace(options.GoogleClientId) &&
        !string.IsNullOrWhiteSpace(options.GoogleClientSecret) &&
        Uri.TryCreate(options.PublicBaseUrl, UriKind.Absolute, out _) &&
        Uri.TryCreate(options.FrontendBaseUrl, UriKind.Absolute, out _);

    public string? ConfigurationError => OAuthAvailable ? null :
        "Gmail bağlantısı için sunucuda Email__GoogleClientId ve Email__GoogleClientSecret tanımlanmalıdır.";

    public string CreateAuthorizationUrl(Guid companyId, Guid accountId)
    {
        if (!OAuthAvailable) throw new InvalidOperationException(ConfigurationError);
        return QueryHelpers.AddQueryString(options.GoogleAuthorizationUrl, new Dictionary<string, string?>
        {
            ["client_id"] = options.GoogleClientId,
            ["redirect_uri"] = RedirectUri,
            ["response_type"] = "code",
            ["scope"] = $"openid {UserEmailScope} {GmailSendScope}",
            ["access_type"] = "offline",
            ["include_granted_scopes"] = "true",
            ["prompt"] = "consent select_account",
            ["state"] = stateService.Create(companyId, accountId)
        });
    }

    public async Task<GoogleEmailConnectionResult> CompleteAsync(string code, string state, CancellationToken cancellationToken)
    {
        if (!OAuthAvailable) throw new InvalidOperationException(ConfigurationError);
        if (string.IsNullOrWhiteSpace(code) || !stateService.TryValidate(state, out var companyId, out var accountId))
            throw new InvalidOperationException("Gmail yetkilendirme isteği geçersiz veya süresi dolmuş.");

        var authorized = await dbContext.CompanyMemberships.IgnoreQueryFilters().AsNoTracking()
            .AnyAsync(item => item.CompanyId == companyId && item.AccountId == accountId && item.IsActive &&
                item.Account.IsActive && item.Company.IsActive && item.Role == CompanyRole.Owner, cancellationToken);
        if (!authorized) throw new InvalidOperationException("Firma sahibi yetkisi doğrulanamadı.");

        var tokenPayload = await ExchangeCodeAsync(code, cancellationToken);
        var accessToken = RequiredString(tokenPayload, "access_token", "Google erişim anahtarı alınamadı.");
        var refreshToken = RequiredString(tokenPayload, "refresh_token", "Google kalıcı erişim anahtarı döndürmedi. Bağlantıyı yeniden deneyin.");
        var senderEmail = await GetSenderEmailAsync(accessToken, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var connection = await dbContext.CompanyEmailConnections.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.CompanyId == companyId && item.Provider == "Google", cancellationToken);
        if (connection is null)
        {
            connection = new CompanyEmailConnection
            {
                Id = Guid.NewGuid(), CompanyId = companyId, Provider = "Google", SenderEmail = senderEmail,
                EncryptedRefreshToken = credentialProtector.Protect(refreshToken), ConnectedAt = now, UpdatedAt = now
            };
            dbContext.CompanyEmailConnections.Add(connection);
        }
        else
        {
            connection.SenderEmail = senderEmail;
            connection.EncryptedRefreshToken = credentialProtector.Protect(refreshToken);
            connection.IsActive = true;
            connection.ConnectedAt = now;
            connection.UpdatedAt = now;
            connection.LastError = null;
        }
        await dbContext.SaveEmailConnectionChangesAsync(companyId, cancellationToken);
        return new GoogleEmailConnectionResult(companyId, senderEmail);
    }

    public async Task<GoogleEmailConnectionStatus> GetStatusAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var connection = await dbContext.CompanyEmailConnections.IgnoreQueryFilters().AsNoTracking()
            .SingleOrDefaultAsync(item => item.CompanyId == companyId && item.Provider == "Google", cancellationToken);
        return new GoogleEmailConnectionStatus(OAuthAvailable, OAuthAvailable && connection?.IsActive == true,
            connection?.SenderEmail, connection?.ConnectedAt, connection?.LastError ?? ConfigurationError);
    }

    public async Task<bool> SendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!OAuthAvailable) return false;
        var connection = await dbContext.CompanyEmailConnections.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.CompanyId == email.CompanyId && item.Provider == "Google" && item.IsActive, cancellationToken);
        if (connection is null) return false;
        try
        {
            var refreshToken = credentialProtector.Unprotect(connection.EncryptedRefreshToken);
            var accessToken = await RefreshAccessTokenAsync(refreshToken, cancellationToken);
            var client = httpClientFactory.CreateClient("Gmail");
            using var request = new HttpRequestMessage(HttpMethod.Post, "users/me/messages/send");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { raw = BuildRawMessage(email) }),
                Encoding.UTF8,
                "application/json");
            using var response = await client.SendAsync(request, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"Gmail teslimatı başarısız ({(int)response.StatusCode}): {responseBody}");
            connection.LastSuccessfulSendAt = DateTimeOffset.UtcNow;
            connection.UpdatedAt = DateTimeOffset.UtcNow;
            connection.LastError = null;
            await dbContext.SaveEmailConnectionChangesAsync(connection.CompanyId, cancellationToken);
            return true;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Google email delivery failed for company {CompanyId}", email.CompanyId);
            connection.LastError = Truncate(exception.Message, 2000);
            connection.UpdatedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveEmailConnectionChangesAsync(connection.CompanyId, cancellationToken);
            throw;
        }
    }

    private async Task<JsonElement> ExchangeCodeAsync(string code, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("GoogleOAuth");
        using var response = await client.PostAsync(options.GoogleTokenUrl, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = options.GoogleClientId!,
            ["client_secret"] = options.GoogleClientSecret!,
            ["redirect_uri"] = RedirectUri,
            ["grant_type"] = "authorization_code"
        }), cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Google yetkilendirmesi tamamlanamadı ({(int)response.StatusCode}): {body}");
        using var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }

    private async Task<string> RefreshAccessTokenAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("GoogleOAuth");
        using var response = await client.PostAsync(options.GoogleTokenUrl, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["refresh_token"] = refreshToken,
            ["client_id"] = options.GoogleClientId!,
            ["client_secret"] = options.GoogleClientSecret!,
            ["grant_type"] = "refresh_token"
        }), cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Google erişimi yenilenemedi ({(int)response.StatusCode}): {body}");
        using var document = JsonDocument.Parse(body);
        return RequiredString(document.RootElement, "access_token", "Google erişim anahtarı yenilenemedi.");
    }

    private async Task<string> GetSenderEmailAsync(string accessToken, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("GoogleOAuth");
        using var request = new HttpRequestMessage(HttpMethod.Get, options.GoogleUserInfoUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Google hesap bilgisi alınamadı ({(int)response.StatusCode}): {body}");
        using var document = JsonDocument.Parse(body);
        return RequiredString(document.RootElement, "email", "Google hesabının e-posta adresi alınamadı.");
    }

    private static string BuildRawMessage(OutboundEmail email)
    {
        var boundary = $"pestneer-{Guid.NewGuid():N}";
        var builder = new StringBuilder();
        builder.Append("To: ").Append(email.Recipient).Append("\r\n")
            .Append("Subject: =?UTF-8?B?").Append(Convert.ToBase64String(Encoding.UTF8.GetBytes(email.Subject))).Append("?=\r\n")
            .Append("Message-ID: <").Append(email.DeliveryKey).Append("@pestneer.app>\r\n")
            .Append("MIME-Version: 1.0\r\n")
            .Append("Content-Type: multipart/mixed; boundary=\"").Append(boundary).Append("\"\r\n\r\n")
            .Append("--").Append(boundary).Append("\r\n")
            .Append("Content-Type: text/html; charset=utf-8\r\n")
            .Append("Content-Transfer-Encoding: base64\r\n\r\n")
            .Append(WrapBase64(Encoding.UTF8.GetBytes(email.HtmlBody))).Append("\r\n");
        if (email.AttachmentData is { Length: > 0 })
        {
            var fileName = email.AttachmentName.Replace("\"", string.Empty);
            builder.Append("--").Append(boundary).Append("\r\n")
                .Append("Content-Type: ").Append(email.AttachmentContentType).Append("; name=\"").Append(fileName).Append("\"\r\n")
                .Append("Content-Disposition: attachment; filename=\"").Append(fileName).Append("\"\r\n")
                .Append("Content-Transfer-Encoding: base64\r\n\r\n")
                .Append(WrapBase64(email.AttachmentData)).Append("\r\n");
        }
        builder.Append("--").Append(boundary).Append("--\r\n");
        return Base64UrlTextEncoder.Encode(Encoding.UTF8.GetBytes(builder.ToString()));
    }

    private static string WrapBase64(byte[] value)
    {
        var encoded = Convert.ToBase64String(value);
        return string.Join("\r\n", Enumerable.Range(0, (encoded.Length + 75) / 76)
            .Select(index => encoded.Substring(index * 76, Math.Min(76, encoded.Length - index * 76))));
    }

    private static string RequiredString(JsonElement payload, string property, string error)
    {
        if (payload.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()))
            return value.GetString()!;
        throw new InvalidOperationException(error);
    }

    private string RedirectUri => $"{options.PublicBaseUrl.TrimEnd('/')}/api/company/branding/email/google/callback";
    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
