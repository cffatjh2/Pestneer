using System.Net.Mail;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Audits;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Email;

public static class ReportEmailAutomation
{
    public static async Task SyncRecipientsAsync(
        PesneerDbContext dbContext,
        ServiceReport report,
        WorkOrder workOrder,
        IReadOnlyCollection<string> additionalRecipients,
        CancellationToken cancellationToken)
    {
        var normalizedAdditional = additionalRecipients.Select(value => value.Trim()).Where(value => MailAddress.TryCreate(value, out _))
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        report.AdditionalEmailRecipients = normalizedAdditional.Length == 0 ? null : string.Join(';', normalizedAdditional);
        if (report.Status != "Finalized") return;

        var recipients = new Dictionary<string, (string Email, string Type)>(StringComparer.OrdinalIgnoreCase);
        void Add(string? email, string type)
        {
            if (!string.IsNullOrWhiteSpace(email) && MailAddress.TryCreate(email.Trim(), out _))
                recipients.TryAdd(email.Trim(), (email.Trim(), type));
        }

        var company = await dbContext.Companies.SingleAsync(item => item.Id == report.CompanyId, cancellationToken);
        Add(company.ReportNotificationEmail, "Company");
        var companyAccounts = await dbContext.CompanyMemberships
            .Include(item => item.Account)
            .Where(item => item.CompanyId == report.CompanyId && item.IsActive && item.Account.IsActive &&
                (item.Role == CompanyRole.Owner || item.Role == CompanyRole.Administrator))
            .Select(item => item.Account.Email).ToListAsync(cancellationToken);
        foreach (var email in companyAccounts) Add(email, "Company");

        Add(workOrder.Customer.Email, "Customer");
        var customerAccounts = await dbContext.CustomerMemberships.Include(item => item.Account)
            .Where(item => item.CustomerId == workOrder.CustomerId && item.IsActive && item.Account.IsActive && item.CustomerBranchId == null)
            .Select(item => item.Account.Email).ToListAsync(cancellationToken);
        foreach (var email in customerAccounts) Add(email, "Customer");

        if (workOrder.CustomerBranch is not null)
        {
            Add(workOrder.CustomerBranch.Email, "Branch");
            var branchAccounts = await dbContext.CustomerMemberships.Include(item => item.Account)
                .Where(item => item.CustomerBranchId == workOrder.CustomerBranchId && item.IsActive && item.Account.IsActive)
                .Select(item => item.Account.Email).ToListAsync(cancellationToken);
            foreach (var email in branchAccounts) Add(email, "Branch");
        }
        foreach (var email in normalizedAdditional) Add(email, "Additional");

        var existing = await dbContext.ReportEmailDeliveries.Where(item => item.ServiceReportId == report.Id)
            .Select(item => item.NormalizedRecipientEmail).ToListAsync(cancellationToken);
        var existingSet = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var recipient in recipients.Values)
        {
            var normalized = recipient.Email.ToUpperInvariant();
            if (existingSet.Contains(normalized)) continue;
            dbContext.ReportEmailDeliveries.Add(new ReportEmailDelivery
            {
                Id = Guid.NewGuid(), CompanyId = report.CompanyId, ServiceReportId = report.Id,
                RecipientEmail = recipient.Email, NormalizedRecipientEmail = normalized, RecipientType = recipient.Type,
                Status = "Pending", NextAttemptAt = DateTimeOffset.UtcNow
            });
            existingSet.Add(normalized);
        }
    }
}

public interface IReportEmailDispatcher
{
    Task<int> DispatchPendingAsync(CancellationToken cancellationToken);
}

public sealed class ReportEmailDispatcher(
    PesneerDbContext dbContext,
    IEmailSender emailSender,
    IOptions<EmailDeliveryOptions> options,
    ILogger<ReportEmailDispatcher> logger) : IReportEmailDispatcher
{
    private readonly EmailDeliveryOptions options = options.Value;

    public async Task<int> DispatchPendingAsync(CancellationToken cancellationToken)
    {
        if (!emailSender.IsConfigured) return 0;
        var now = DateTimeOffset.UtcNow;
        var stale = await dbContext.ReportEmailDeliveries.IgnoreQueryFilters()
            .Where(item => item.Status == "Sending" && item.LastAttemptAt < now.AddMinutes(-10)).ToListAsync(cancellationToken);
        foreach (var item in stale) item.Status = "Pending";
        if (stale.Count > 0) await dbContext.SaveChangesAsync(cancellationToken);

        var deliveries = await dbContext.ReportEmailDeliveries.IgnoreQueryFilters()
            .Where(item => item.Status == "Pending" && (!item.NextAttemptAt.HasValue || item.NextAttemptAt <= now))
            .OrderBy(item => item.CreatedAt).Take(10).ToListAsync(cancellationToken);
        var sent = 0;
        foreach (var delivery in deliveries)
        {
            delivery.Status = "Sending";
            delivery.AttemptCount++;
            delivery.LastAttemptAt = now;
            await dbContext.SaveChangesAsync(cancellationToken);
            try
            {
                var report = await dbContext.ServiceReports.IgnoreQueryFilters().AsNoTracking()
                    .Include(item => item.WorkOrder).ThenInclude(item => item.Customer)
                    .Include(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
                    .Include(item => item.WorkOrder).ThenInclude(item => item.AssignedEmployeeAccount)
                    .Include(item => item.CreatedByAccount).Include(item => item.Stations).Include(item => item.Products)
                    .AsSplitQuery().SingleAsync(item => item.Id == delivery.ServiceReportId, cancellationToken);
                var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == delivery.CompanyId, cancellationToken);
                var location = report.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel";
                var subject = $"{report.ReportNumber} · {report.WorkOrder.Customer.LegalName} / {location} saha raporu";
                var body = BuildBody(company, report, location);
                var pdf = AuditPackageRenderer.RenderServiceReport(report, company);
                await emailSender.SendAsync(new OutboundEmail(delivery.RecipientEmail, subject, body, $"{report.ReportNumber}.pdf", "application/pdf", pdf), cancellationToken);
                delivery.Status = "Sent";
                delivery.SentAt = DateTimeOffset.UtcNow;
                delivery.NextAttemptAt = null;
                delivery.LastError = null;
                sent++;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Report email delivery {DeliveryId} failed", delivery.Id);
                delivery.Status = delivery.AttemptCount >= 8 ? "Failed" : "Pending";
                delivery.NextAttemptAt = delivery.Status == "Failed" ? null : DateTimeOffset.UtcNow.AddMinutes(RetryMinutes(delivery.AttemptCount));
                delivery.LastError = exception.Message.Length > 2000 ? exception.Message[..2000] : exception.Message;
            }
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.ChangeTracker.Clear();
        }
        return sent;
    }

    private string BuildBody(Company company, ServiceReport report, string location)
    {
        static string Safe(string value) => WebUtility.HtmlEncode(value);
        var portalUrl = options.PublicBaseUrl.TrimEnd('/');
        return $"""
            <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#18324b">
              <div style="border-bottom:3px solid #10a37f;padding:18px 0"><strong style="font-size:20px">{Safe(company.LegalName)}</strong></div>
              <h2 style="margin:24px 0 8px">Saha uygulama raporu tamamlandı</h2>
              <p>{Safe(report.WorkOrder.Customer.LegalName)} · {Safe(location)} için oluşturulan imzalı saha raporu ekte PDF olarak sunulmuştur.</p>
              <table style="width:100%;border-collapse:collapse;background:#f4f8fb;margin:20px 0">
                <tr><td style="padding:10px">Rapor no</td><td style="padding:10px"><strong>{Safe(report.ReportNumber)}</strong></td></tr>
                <tr><td style="padding:10px">İş emri</td><td style="padding:10px">{Safe(report.WorkOrder.Number)}</td></tr>
                <tr><td style="padding:10px">Hizmet</td><td style="padding:10px">{Safe(report.WorkOrder.ServiceType)}</td></tr>
                <tr><td style="padding:10px">Tarih</td><td style="padding:10px">{report.WorkOrder.ScheduledAt.ToOffset(TimeSpan.FromHours(3)):dd.MM.yyyy HH:mm}</td></tr>
              </table>
              <p><a href="{Safe(portalUrl)}" style="display:inline-block;background:#176fc0;color:white;text-decoration:none;padding:12px 18px;border-radius:8px">Pestneer portalını aç</a></p>
              <p style="font-size:12px;color:#6d8296;margin-top:24px">Bu ileti otomatik oluşturulmuştur. Raporun doğrulama kodu: {Safe(report.VerificationCode)}</p>
            </div>
            """;
    }

    private static int RetryMinutes(int attempt) => attempt switch { 1 => 1, 2 => 5, 3 => 15, 4 => 30, _ => 60 };
}

public sealed class ReportEmailDeliveryWorker(IServiceScopeFactory scopeFactory, ILogger<ReportEmailDeliveryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(8), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IReportEmailDispatcher>().DispatchPendingAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception) { logger.LogError(exception, "Report email delivery worker failed"); }
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
}
