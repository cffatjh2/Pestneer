using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Compliance;

public static class CorrectiveActionAutomation
{
    public static async Task SyncAsync(
        PesneerDbContext dbContext,
        Guid companyId,
        Guid accountId,
        Guid customerId,
        Guid? branchId,
        string sourceType,
        Guid sourceId,
        string category,
        string title,
        string? problem,
        string? proposedAction,
        string responsibleParty,
        string priority,
        DateOnly dueDate,
        CancellationToken cancellationToken)
    {
        var actionText = Clean(proposedAction, 4000);
        var problemText = Clean(problem, 4000);
        if (actionText is null && problemText is null) return;

        var existing = await dbContext.CorrectiveActions
            .SingleOrDefaultAsync(item => item.SourceType == sourceType && item.SourceId == sourceId, cancellationToken);
        if (existing is not null)
        {
            existing.Title = Clean(title, 240) ?? existing.Title;
            existing.Problem = problemText ?? existing.Problem;
            existing.ProposedAction = actionText ?? existing.ProposedAction;
            existing.Priority = priority;
            existing.DueDate = dueDate;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
            return;
        }

        var recurrenceKey = Normalize($"{category}:{title}");
        var recurrenceCount = await dbContext.CorrectiveActions.AsNoTracking()
            .CountAsync(item => item.CustomerId == customerId && item.CustomerBranchId == branchId && item.RecurrenceKey == recurrenceKey, cancellationToken) + 1;
        var now = DateTimeOffset.UtcNow;
        var action = new CorrectiveAction
        {
            Id = Guid.NewGuid(), CompanyId = companyId, CustomerId = customerId, CustomerBranchId = branchId,
            CreatedByAccountId = accountId, Number = Number(now), SourceType = sourceType, SourceId = sourceId,
            Category = Clean(category, 80) ?? "Saha Bulgusu", Title = Clean(title, 240) ?? "Düzeltici faaliyet",
            Problem = problemText ?? actionText!, ProposedAction = actionText ?? "Saha bulgusu değerlendirilerek kalıcı faaliyet planlanmalıdır.",
            ResponsibleParty = responsibleParty, Priority = priority, Status = "Open", DueDate = dueDate,
            CustomerApprovalStatus = "Pending", RecurrenceKey = recurrenceKey, RecurrenceCount = recurrenceCount,
            CreatedAt = now, UpdatedAt = now
        };
        action.History.Add(new CorrectiveActionHistory
        {
            Id = Guid.NewGuid(), CompanyId = companyId, CorrectiveActionId = action.Id, ChangedByAccountId = accountId,
            ToStatus = "Open", Note = $"{sourceType} kaynağından otomatik oluşturuldu.", OccurredAt = now
        });
        dbContext.CorrectiveActions.Add(action);
    }

    public static string Number(DateTimeOffset now) => $"DZF-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

    public static string Normalize(string value)
    {
        var normalized = string.Concat(value.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit));
        return normalized[..Math.Min(160, normalized.Length)];
    }

    private static string? Clean(string? value, int maxLength) => string.IsNullOrWhiteSpace(value)
        ? null
        : value.Trim()[..Math.Min(value.Trim().Length, maxLength)];
}
