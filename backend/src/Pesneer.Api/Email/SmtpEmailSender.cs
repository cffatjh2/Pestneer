using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace Pesneer.Api.Email;

public sealed record OutboundEmail(string Recipient, string Subject, string HtmlBody, string AttachmentName, string AttachmentContentType, byte[] AttachmentData);

public interface IEmailSender
{
    bool IsConfigured { get; }
    Task SendAsync(OutboundEmail email, CancellationToken cancellationToken);
}

public sealed class SmtpEmailSender(IOptions<EmailDeliveryOptions> options) : IEmailSender
{
    private readonly EmailDeliveryOptions options = options.Value;

    public bool IsConfigured => options.Enabled && !string.IsNullOrWhiteSpace(options.Host) &&
        !string.IsNullOrWhiteSpace(options.FromAddress) && MailAddress.TryCreate(options.FromAddress, out _);

    public async Task SendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        if (!IsConfigured) throw new InvalidOperationException("E-posta servisi yapılandırılmadı.");
        using var message = new MailMessage
        {
            From = new MailAddress(options.FromAddress, options.FromName),
            Subject = email.Subject,
            Body = email.HtmlBody,
            IsBodyHtml = true
        };
        message.To.Add(new MailAddress(email.Recipient));
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
