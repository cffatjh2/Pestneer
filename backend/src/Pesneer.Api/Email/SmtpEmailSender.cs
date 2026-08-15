using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace Pesneer.Api.Email;

public sealed record OutboundEmail(
    Guid CompanyId,
    string DeliveryKey,
    string Recipient,
    string Subject,
    string HtmlBody,
    string AttachmentName,
    string AttachmentContentType,
    byte[]? AttachmentData);

public sealed record EmailSenderStatus(
    bool IsConfigured,
    string ProviderName,
    string? ConfigurationError,
    GoogleEmailConnectionStatus Google);

public interface IEmailSender
{
    Task<EmailSenderStatus> GetStatusAsync(Guid companyId, CancellationToken cancellationToken);
    Task SendAsync(OutboundEmail email, CancellationToken cancellationToken);
}

public sealed class ReliableEmailSender(
    IOptions<EmailDeliveryOptions> options,
    IHttpClientFactory httpClientFactory,
    IGoogleEmailConnectionService googleEmailConnectionService) : IEmailSender
{
    private readonly EmailDeliveryOptions options = options.Value;

    private string EffectiveFromAddress => MailAddress.TryCreate(options.FromAddress, out _)
        ? options.FromAddress
        : MailAddress.TryCreate(options.Username, out _)
            ? options.Username!
            : "onboarding@resend.dev";
    private bool ResendConfigured => options.Enabled && !string.IsNullOrWhiteSpace(options.ApiKey) && ValidFromAddress;
    private bool SmtpConfigured => options.Enabled && !string.IsNullOrWhiteSpace(options.Host) && ValidFromAddress;
    private bool ValidFromAddress => MailAddress.TryCreate(EffectiveFromAddress, out _);
    private bool PreferResend => options.Provider.Equals("Resend", StringComparison.OrdinalIgnoreCase) ||
        options.Provider.Equals("Auto", StringComparison.OrdinalIgnoreCase) && ResendConfigured;

    public async Task<EmailSenderStatus> GetStatusAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var google = await googleEmailConnectionService.GetStatusAsync(companyId, cancellationToken);
        if (google.Connected)
            return new EmailSenderStatus(true, $"Gmail · {google.SenderEmail}", null, google);

        var fallbackConfigured = PreferResend ? ResendConfigured : SmtpConfigured;
        if (fallbackConfigured)
            return new EmailSenderStatus(true, PreferResend ? "Resend" : "SMTP", null, google);

        var fallbackError = !options.Enabled
            ? "Sunucu e-posta teslimatı devre dışı. Gmail bağlantısı kurabilir veya Email__Enabled=true ayarlayabilirsiniz."
            : !ValidFromAddress
                ? "Geçerli bir Email__FromAddress tanımlanmalıdır."
                : options.Provider.Equals("Resend", StringComparison.OrdinalIgnoreCase)
                    ? "Email__ApiKey tanımlanmalıdır."
                    : "Gmail hesabını bağlayın veya sunucuda SMTP/Resend bilgilerini tanımlayın.";
        return new EmailSenderStatus(false, "Bağlantı bekleniyor", google.LastError ?? fallbackError, google);
    }

    public async Task SendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (await googleEmailConnectionService.SendAsync(email, cancellationToken)) return;

        if (PreferResend && ResendConfigured)
        {
            try
            {
                await SendWithResendAsync(email, cancellationToken);
                return;
            }
            catch when (options.Provider.Equals("Auto", StringComparison.OrdinalIgnoreCase) && SmtpConfigured)
            {
                await SendWithSmtpAsync(email, cancellationToken);
                return;
            }
        }

        if (SmtpConfigured)
        {
            await SendWithSmtpAsync(email, cancellationToken);
            return;
        }

        var status = await GetStatusAsync(email.CompanyId, cancellationToken);
        throw new InvalidOperationException(status.ConfigurationError ?? "E-posta servisi yapılandırılmadı.");
    }

    private async Task SendWithResendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("Resend");
        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        request.Headers.TryAddWithoutValidation("Idempotency-Key", email.DeliveryKey);
        request.Content = JsonContent.Create(new
        {
            from = $"{options.FromName} <{EffectiveFromAddress}>",
            to = new[] { email.Recipient },
            subject = email.Subject,
            html = email.HtmlBody,
            reply_to = string.IsNullOrWhiteSpace(options.ReplyTo) ? null : options.ReplyTo,
            attachments = email.AttachmentData is { Length: > 0 }
                ? new[] { new { filename = email.AttachmentName, content = Convert.ToBase64String(email.AttachmentData) } }
                : null
        });
        using var response = await client.SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode) return;
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        throw new InvalidOperationException($"Resend e-posta teslimatı başarısız ({(int)response.StatusCode}): {responseBody}");
    }

    private async Task SendWithSmtpAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        using var message = new MailMessage
        {
            From = new MailAddress(EffectiveFromAddress, options.FromName),
            Subject = email.Subject,
            Body = email.HtmlBody,
            IsBodyHtml = true
        };
        message.Headers.Add("Message-ID", $"<{email.DeliveryKey}@pestneer.app>");
        message.To.Add(new MailAddress(email.Recipient));
        if (!string.IsNullOrWhiteSpace(options.ReplyTo) && MailAddress.TryCreate(options.ReplyTo, out var replyTo))
            message.ReplyToList.Add(replyTo);
        if (email.AttachmentData is { Length: > 0 })
        {
            var attachmentStream = new MemoryStream(email.AttachmentData, writable: false);
            message.Attachments.Add(new Attachment(attachmentStream, email.AttachmentName, email.AttachmentContentType));
        }

        using var client = new SmtpClient(options.Host, options.Port)
        {
            EnableSsl = options.EnableSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            UseDefaultCredentials = false
        };
        if (!string.IsNullOrWhiteSpace(options.Username))
            client.Credentials = new NetworkCredential(options.Username, options.Password);
        await client.SendMailAsync(message, cancellationToken);
    }
}
