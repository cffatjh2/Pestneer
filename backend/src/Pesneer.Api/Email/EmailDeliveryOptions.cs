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
    public string PublicBaseUrl { get; set; } = "https://pesneer.onrender.com";
}
