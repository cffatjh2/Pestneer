namespace Pesneer.Api.Email;

public sealed class EmailDeliveryOptions
{
    public const string SectionName = "Email";
    public bool Enabled { get; set; }
    public string Provider { get; set; } = "Auto";
    public string ApiBaseUrl { get; set; } = "https://api.resend.com";
    public string? ApiKey { get; set; }
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "Pestneer Raporlama";
    public string? ReplyTo { get; set; }
    public bool EnableSsl { get; set; } = true;
    public string PublicBaseUrl { get; set; } = "https://api.pestneer.com";
    public string FrontendBaseUrl { get; set; } = "https://www.pestneer.com";
    public string? GoogleClientId { get; set; }
    public string? GoogleClientSecret { get; set; }
    public string GoogleAuthorizationUrl { get; set; } = "https://accounts.google.com/o/oauth2/v2/auth";
    public string GoogleTokenUrl { get; set; } = "https://oauth2.googleapis.com/token";
    public string GoogleUserInfoUrl { get; set; } = "https://openidconnect.googleapis.com/v1/userinfo";
    public string GoogleGmailApiBaseUrl { get; set; } = "https://gmail.googleapis.com/gmail/v1/";
}
