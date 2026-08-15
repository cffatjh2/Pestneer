using System.Net;
using System.Net.Mail;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Pesneer.Api.Email;

public sealed record OutboundEmail(string Recipient, string Subject, string HtmlBody, string AttachmentName, string AttachmentContentType, byte[] AttachmentData);

public interface IEmailSender
{
    bool IsConfigured { get; }
    string ProviderName { get; }
    string? ConfigurationError { get; }
    Task SendAsync(OutboundEmail email, CancellationToken cancellationToken);
}

public sealed class ReliableEmailSender(IOptions<EmailDeliveryOptions> options, IHttpClientFactory httpClientFactory) : IEmailSender
{
    private readonly EmailDeliveryOptions options = options.Value;

    private bool ResendConfigured => options.Enabled && !string.IsNullOrWhiteSpace(options.ApiKey) && ValidFromAddress;
    private bool SmtpConfigured => options.Enabled && !string.IsNullOrWhiteSpace(options.Host) && ValidFromAddress;
    private bool ValidFromAddress => !string.IsNullOrWhiteSpace(options.FromAddress) && MailAddress.TryCreate(options.FromAddress, out _);
    private bool PreferResend => options.Provider.Equals("Resend", StringComparison.OrdinalIgnoreCase) ||
        options.Provider.Equals("Auto", StringComparison.OrdinalIgnoreCase) && ResendConfigured;

    public bool IsConfigured => PreferResend ? ResendConfigured : SmtpConfigured;
    public string ProviderName => PreferResend ? "Resend" : "SMTP";
    public string? ConfigurationError => IsConfigured ? null : !options.Enabled
        ? "E-posta teslimatı devre dışı. Email__Enabled=true olmalıdır."
        : !ValidFromAddress
            ? "Geçerli bir Email__FromAddress tanımlanmalıdır."
            : options.Provider.Equals("Resend", StringComparison.OrdinalIgnoreCase)
                ? "Email__ApiKey tanımlanmalıdır."
                : "SMTP için Email__Host veya Resend için Email__ApiKey tanımlanmalıdır.";

    public async Task SendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!IsConfigured) throw new InvalidOperationException(ConfigurationError ?? "E-posta servisi yapılandırılmadı.");
        if (!PreferResend)
        {
            await SendWithSmtpAsync(email, cancellationToken);
            return;
        }

        try
        {
            await SendWithResendAsync(email, cancellationToken);
        }
        catch when (options.Provider.Equals("Auto", StringComparison.OrdinalIgnoreCase) && SmtpConfigured)
        {
            await SendWithSmtpAsync(email, cancellationToken);
        }
    }

    private async Task SendWithResendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("Resend");
        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"pestneer-{Guid.NewGuid():N}");
        request.Content = JsonContent.Create(new
        {
            from = $"{options.FromName} <{options.FromAddress}>",
            to = new[] { email.Recipient },
            subject = email.Subject,
            html = email.HtmlBody,
            reply_to = string.IsNullOrWhiteSpace(options.ReplyTo) ? null : options.ReplyTo,
            attachments = new[] { new { filename = email.AttachmentName, content = Convert.ToBase64String(email.AttachmentData) } }
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
            From = new MailAddress(options.FromAddress, options.FromName),
            Subject = email.Subject,
            Body = email.HtmlBody,
            IsBodyHtml = true
        };
        message.To.Add(new MailAddress(email.Recipient));
        if (!string.IsNullOrWhiteSpace(options.ReplyTo) && MailAddress.TryCreate(options.ReplyTo, out var replyTo)) message.ReplyToList.Add(replyTo);
        var attachmentStream = new MemoryStream(email.AttachmentData, writable: false);
        message.Attachments.Add(new Attachment(attachmentStream, email.AttachmentName, email.AttachmentContentType));

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
