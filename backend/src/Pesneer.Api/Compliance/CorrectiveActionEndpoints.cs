using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Compliance;

public static class CorrectiveActionEndpoints
{
    private const long MaximumEvidenceSize = 8 * 1024 * 1024;
    private static readonly HashSet<string> Priorities = ["Low", "Normal", "High", "Critical"];
    private static readonly HashSet<string> Parties = ["Customer", "Company", "Joint"];
    private static readonly HashSet<string> Statuses = ["Open", "InProgress", "AwaitingCustomer", "Completed", "Verified", "Rejected", "Cancelled"];
    private static readonly HashSet<string> EvidenceStages = ["Before", "After", "Supporting"];

    public static IEndpointRouteBuilder MapCorrectiveActionEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/corrective-actions").RequireAuthorization();
        shared.MapGet("/", GetAsync);
        shared.MapGet("/{actionId:guid}", GetByIdAsync);
        shared.MapGet("/evidence/{evidenceId:guid}", DownloadEvidenceAsync);

        var staff = app.MapGroup("/api/corrective-actions").RequireAuthorization("CompanyStaff");
        staff.MapPost("/", CreateAsync);
        staff.MapPut("/{actionId:guid}", UpdateAsync);
        staff.MapPost("/{actionId:guid}/evidence", UploadEvidenceAsync).DisableAntiforgery();

        var customer = app.MapGroup("/api/customer/portal/corrective-actions").RequireAuthorization("CustomerPortal");
        customer.MapPost("/{actionId:guid}/approval", ApproveAsync);
        customer.MapPost("/{actionId:guid}/evidence", UploadEvidenceAsync).DisableAntiforgery();
        return app;
    }

    private static async Task<IResult> GetAsync(string? status, Guid? customerId, Guid? branchId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var query = Accessible(dbContext, context).AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(item => item.Status == status);
        if (customerId.HasValue) query = query.Where(item => item.CustomerId == customerId.Value);
        if (branchId.HasValue) query = query.Where(item => item.CustomerBranchId == branchId.Value);
        var items = await query.Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.AssignedAccount)
            .Include(item => item.Evidence).ThenInclude(item => item.UploadedByAccount)
            .Include(item => item.History).ThenInclude(item => item.ChangedByAccount)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        return Results.Ok(items.OrderBy(item => item.Status is "Verified" or "Cancelled").ThenBy(item => item.DueDate).ThenByDescending(item => item.CreatedAt).Select(ToResponse).ToArray());
    }

    private static async Task<IResult> GetByIdAsync(Guid actionId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var item = await LoadAsync(actionId, dbContext, context, cancellationToken);
        return item is null ? Results.NotFound(new { message = "Düzeltici faaliyet bulunamadı." }) : Results.Ok(ToResponse(item));
    }

    private static async Task<IResult> CreateAsync(CreateCorrectiveActionRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        var validation = Validate(request.Title, request.Problem, request.ProposedAction, request.ResponsibleParty, request.Priority, request.DueDate);
        if (validation is not null) return validation;
        if (!await LocationExistsAsync(request.CustomerId, request.BranchId, dbContext, cancellationToken)) return Validation("customerId", "Müşteri veya şube bulunamadı.");
        if (context.Portal == PortalType.Employee && !await EmployeeCanUseLocationAsync(context.AccountId.Value, request.CustomerId, request.BranchId, dbContext, cancellationToken)) return Results.Forbid();
        if (request.AssignedAccountId.HasValue && !await ActiveEmployeeExistsAsync(request.AssignedAccountId.Value, dbContext, cancellationToken)) return Validation("assignedAccountId", "Aktif personel bulunamadı.");
        if (context.Portal == PortalType.Employee && request.AssignedAccountId.HasValue && request.AssignedAccountId != context.AccountId) return Results.Forbid();

        var now = DateTimeOffset.UtcNow;
        var recurrenceKey = CorrectiveActionAutomation.Normalize(string.IsNullOrWhiteSpace(request.RecurrenceKey) ? $"{request.Category}:{request.Title}" : request.RecurrenceKey);
        var recurrenceCount = await dbContext.CorrectiveActions.AsNoTracking().CountAsync(item => item.CustomerId == request.CustomerId && item.CustomerBranchId == request.BranchId && item.RecurrenceKey == recurrenceKey, cancellationToken) + 1;
        var item = new CorrectiveAction
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            CreatedByAccountId = context.AccountId.Value, AssignedAccountId = request.AssignedAccountId ?? (context.Portal == PortalType.Employee ? context.AccountId : null),
            Number = CorrectiveActionAutomation.Number(now), SourceType = "Manual", Category = Clean(request.Category, 80) ?? "Manuel Kayıt",
            Title = Clean(request.Title, 240)!, Problem = Clean(request.Problem, 4000)!, RootCause = Clean(request.RootCause, 4000),
            ProposedAction = Clean(request.ProposedAction, 4000)!, ResponsibleParty = request.ResponsibleParty, Priority = request.Priority,
            Status = "Open", DueDate = request.DueDate, CustomerApprovalStatus = "Pending", RecurrenceKey = recurrenceKey,
            RecurrenceCount = recurrenceCount, CreatedAt = now, UpdatedAt = now
        };
        item.History.Add(NewHistory(item, context.AccountId.Value, null, "Open", request.Note ?? "Düzeltici faaliyet açıldı.", now));
        dbContext.CorrectiveActions.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/corrective-actions/{item.Id}", ToResponse((await LoadAsync(item.Id, dbContext, context, cancellationToken))!));
    }

    private static async Task<IResult> UpdateAsync(Guid actionId, UpdateCorrectiveActionRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var item = await dbContext.CorrectiveActions.Include(action => action.History).SingleOrDefaultAsync(action => action.Id == actionId, cancellationToken);
        if (item is null || (context.Portal == PortalType.Employee && item.AssignedAccountId != context.AccountId)) return Results.NotFound(new { message = "Düzeltici faaliyet bulunamadı." });
        if (!Statuses.Contains(request.Status)) return Validation("status", "Geçerli bir durum seçin.");
        if (!Priorities.Contains(request.Priority) || !Parties.Contains(request.ResponsibleParty)) return Validation("priority", "Öncelik veya sorumlu taraf geçersiz.");
        if (request.AssignedAccountId.HasValue && !await ActiveEmployeeExistsAsync(request.AssignedAccountId.Value, dbContext, cancellationToken)) return Validation("assignedAccountId", "Aktif personel bulunamadı.");
        if (context.Portal == PortalType.Employee && request.AssignedAccountId != context.AccountId) return Results.Forbid();

        var previousStatus = item.Status; var now = DateTimeOffset.UtcNow;
        item.Title = Clean(request.Title, 240) ?? item.Title; item.Problem = Clean(request.Problem, 4000) ?? item.Problem;
        item.RootCause = Clean(request.RootCause, 4000); item.ProposedAction = Clean(request.ProposedAction, 4000) ?? item.ProposedAction;
        item.ResponsibleParty = request.ResponsibleParty; item.Priority = request.Priority; item.DueDate = request.DueDate;
        item.AssignedAccountId = request.AssignedAccountId; item.Status = request.Status; item.UpdatedAt = now;
        if (request.Status == "Completed" && item.CompletedAt is null) item.CompletedAt = now;
        if (request.Status == "Verified" && item.VerifiedAt is null) item.VerifiedAt = now;
        if (previousStatus != request.Status || !string.IsNullOrWhiteSpace(request.Note)) dbContext.CorrectiveActionHistories.Add(NewHistory(item, context.AccountId.Value, previousStatus, request.Status, request.Note, now));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse((await LoadAsync(item.Id, dbContext, context, cancellationToken))!));
    }

    private static async Task<IResult> ApproveAsync(Guid actionId, CustomerApprovalRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !context.CustomerId.HasValue) return Results.Forbid();
        var item = await dbContext.CorrectiveActions.Include(action => action.History).SingleOrDefaultAsync(action => action.Id == actionId && action.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || action.CustomerBranchId == context.CustomerBranchId), cancellationToken);
        if (item is null) return Results.NotFound(new { message = "Düzeltici faaliyet bulunamadı." });
        if (item.Status is not "Completed" and not "AwaitingCustomer") return Results.Conflict(new { message = "Müşteri onayı yalnızca tamamlanan faaliyetlerde verilebilir." });
        var now = DateTimeOffset.UtcNow; var next = request.Approved ? "Approved" : "Rejected"; var previousStatus = item.Status;
        item.CustomerApprovalStatus = next; item.CustomerApprovalAt = now; item.CustomerApprovalNote = Clean(request.Note, 2000); item.UpdatedAt = now;
        if (!request.Approved && item.Status == "Completed") item.Status = "Rejected";
        dbContext.CorrectiveActionHistories.Add(NewHistory(item, context.AccountId.Value, previousStatus, item.Status, $"Müşteri onayı: {next}. {request.Note}", now));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse((await LoadAsync(item.Id, dbContext, context, cancellationToken))!));
    }

    private static async Task<IResult> UploadEvidenceAsync(Guid actionId, HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var item = await Accessible(dbContext, context).SingleOrDefaultAsync(action => action.Id == actionId, cancellationToken);
        if (item is null) return Results.NotFound(new { message = "Düzeltici faaliyet bulunamadı." });
        if (!request.HasFormContentType) return Validation("file", "Kanıt dosyasını seçin.");
        var form = await request.ReadFormAsync(cancellationToken); var file = form.Files.GetFile("file"); var stage = form["stage"].ToString();
        if (file is null || file.Length is <= 0 or > MaximumEvidenceSize || !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) return Validation("file", "Kanıt JPG, PNG veya WebP biçiminde ve en fazla 8 MB olmalıdır.");
        if (!EvidenceStages.Contains(stage)) return Validation("stage", "Kanıt aşamasını seçin.");
        await using var memory = new MemoryStream(); await file.CopyToAsync(memory, cancellationToken);
        var evidence = new CorrectiveActionEvidence { Id = Guid.NewGuid(), CompanyId = item.CompanyId, CorrectiveActionId = item.Id, UploadedByAccountId = context.AccountId.Value, Stage = stage, FileName = Path.GetFileName(file.FileName), ContentType = file.ContentType, Data = memory.ToArray(), Note = Clean(form["note"].ToString(), 1000), CreatedAt = DateTimeOffset.UtcNow };
        dbContext.CorrectiveActionEvidence.Add(evidence); item.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new CorrectiveActionEvidenceResponse(evidence.Id, evidence.Stage, evidence.FileName, evidence.ContentType, evidence.Note, evidence.CreatedAt, string.Empty, $"/api/corrective-actions/evidence/{evidence.Id}"));
    }

    private static async Task<IResult> DownloadEvidenceAsync(Guid evidenceId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var evidence = await dbContext.CorrectiveActionEvidence.AsNoTracking().Include(item => item.CorrectiveAction).SingleOrDefaultAsync(item => item.Id == evidenceId, cancellationToken);
        if (evidence is null || !CanAccess(evidence.CorrectiveAction, context)) return Results.NotFound();
        return Results.File(evidence.Data, evidence.ContentType, evidence.FileName);
    }

    private static IQueryable<CorrectiveAction> Accessible(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.CorrectiveActions.AsQueryable();
        if (context.Portal == PortalType.Customer) query = query.Where(item => item.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId));
        if (context.Portal == PortalType.Employee) query = query.Where(item => item.AssignedAccountId == context.AccountId);
        return query;
    }

    private static bool CanAccess(CorrectiveAction item, ICompanyContext context) => context.Portal == PortalType.Owner || (context.Portal == PortalType.Employee && item.AssignedAccountId == context.AccountId) || (context.Portal == PortalType.Customer && item.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId));
    private static async Task<CorrectiveAction?> LoadAsync(Guid id, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) => await Accessible(dbContext, context).AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.AssignedAccount).Include(item => item.Evidence).ThenInclude(item => item.UploadedByAccount).Include(item => item.History).ThenInclude(item => item.ChangedByAccount).AsSplitQuery().SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    private static async Task<bool> LocationExistsAsync(Guid customerId, Guid? branchId, PesneerDbContext dbContext, CancellationToken cancellationToken) => await dbContext.Customers.AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken) && (!branchId.HasValue || await dbContext.CustomerBranches.AnyAsync(item => item.Id == branchId && item.CustomerId == customerId && item.IsActive, cancellationToken));
    private static async Task<bool> EmployeeCanUseLocationAsync(Guid accountId, Guid customerId, Guid? branchId, PesneerDbContext dbContext, CancellationToken cancellationToken) => await dbContext.WorkOrders.AsNoTracking().AnyAsync(item => item.AssignedEmployeeAccountId == accountId && item.CustomerId == customerId && (!branchId.HasValue || item.CustomerBranchId == branchId), cancellationToken);
    private static async Task<bool> ActiveEmployeeExistsAsync(Guid accountId, PesneerDbContext dbContext, CancellationToken cancellationToken) => await dbContext.CompanyMemberships.AnyAsync(item => item.AccountId == accountId && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee, cancellationToken);
    private static IResult? Validate(string title, string problem, string proposedAction, string party, string priority, DateOnly dueDate) => title.Trim().Length is < 3 or > 240 ? Validation("title", "Başlık 3-240 karakter arasında olmalıdır.") : problem.Trim().Length is < 3 or > 4000 ? Validation("problem", "Sorun açıklaması 3-4000 karakter arasında olmalıdır.") : proposedAction.Trim().Length is < 3 or > 4000 ? Validation("proposedAction", "Önerilen faaliyet 3-4000 karakter arasında olmalıdır.") : !Parties.Contains(party) ? Validation("responsibleParty", "Sorumlu taraf geçersiz.") : !Priorities.Contains(priority) ? Validation("priority", "Öncelik geçersiz.") : dueDate < DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-1) ? Validation("dueDate", "Geçerli bir termin tarihi seçin.") : null;
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
    private static string? Clean(string? value, int maxLength) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, maxLength)];
    private static CorrectiveActionHistory NewHistory(CorrectiveAction item, Guid accountId, string? from, string to, string? note, DateTimeOffset at) => new() { Id = Guid.NewGuid(), CompanyId = item.CompanyId, CorrectiveActionId = item.Id, ChangedByAccountId = accountId, FromStatus = from, ToStatus = to, Note = Clean(note, 2000), OccurredAt = at };
    private static CorrectiveActionResponse ToResponse(CorrectiveAction item) => new(item.Id, item.Number, item.SourceType, item.SourceId, item.Category, item.Title, item.Problem, item.RootCause, item.ProposedAction, item.ResponsibleParty, item.Priority, item.Status, item.DueDate, item.DueDate < DateOnly.FromDateTime(DateTime.UtcNow) && item.Status is not "Verified" and not "Cancelled", item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez / Genel", item.AssignedAccountId, item.AssignedAccount?.DisplayName, item.CustomerApprovalStatus, item.CustomerApprovalAt, item.CustomerApprovalNote, item.RecurrenceCount, item.CreatedAt, item.UpdatedAt, item.CompletedAt, item.VerifiedAt, item.Evidence.OrderByDescending(e => e.CreatedAt).Select(e => new CorrectiveActionEvidenceResponse(e.Id, e.Stage, e.FileName, e.ContentType, e.Note, e.CreatedAt, e.UploadedByAccount.DisplayName, $"/api/corrective-actions/evidence/{e.Id}")).ToArray(), item.History.OrderByDescending(h => h.OccurredAt).Select(h => new CorrectiveActionHistoryResponse(h.Id, h.FromStatus, h.ToStatus, h.Note, h.OccurredAt, h.ChangedByAccount.DisplayName)).ToArray());
}

public sealed record CreateCorrectiveActionRequest(Guid CustomerId, Guid? BranchId, string Category, string Title, string Problem, string? RootCause, string ProposedAction, string ResponsibleParty, Guid? AssignedAccountId, string Priority, DateOnly DueDate, string? RecurrenceKey, string? Note);
public sealed record UpdateCorrectiveActionRequest(string Title, string Problem, string? RootCause, string ProposedAction, string ResponsibleParty, Guid? AssignedAccountId, string Priority, DateOnly DueDate, string Status, string? Note);
public sealed record CustomerApprovalRequest(bool Approved, string? Note);
public sealed record CorrectiveActionEvidenceResponse(Guid Id, string Stage, string FileName, string ContentType, string? Note, DateTimeOffset CreatedAt, string UploadedBy, string DownloadUrl);
public sealed record CorrectiveActionHistoryResponse(Guid Id, string? FromStatus, string ToStatus, string? Note, DateTimeOffset OccurredAt, string ChangedBy);
public sealed record CorrectiveActionResponse(Guid Id, string Number, string SourceType, Guid? SourceId, string Category, string Title, string Problem, string? RootCause, string ProposedAction, string ResponsibleParty, string Priority, string Status, DateOnly DueDate, bool IsOverdue, Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, Guid? AssignedAccountId, string? AssignedAccountName, string CustomerApprovalStatus, DateTimeOffset? CustomerApprovalAt, string? CustomerApprovalNote, int RecurrenceCount, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? CompletedAt, DateTimeOffset? VerifiedAt, IReadOnlyCollection<CorrectiveActionEvidenceResponse> Evidence, IReadOnlyCollection<CorrectiveActionHistoryResponse> History);
