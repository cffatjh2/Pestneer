using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Compliance;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.QualityControl;

public static class QualityInspectionEndpoints
{
    private static readonly HashSet<string> InspectionTypes = ["Random", "ManagerVisit", "RiskBased", "ComplaintFollowUp", "SecondControl"];

    public static IEndpointRouteBuilder MapQualityInspectionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/company/quality-inspections").RequireAuthorization("OwnerPortal");
        group.MapGet("/", GetAsync);
        group.MapGet("/summary", GetSummaryAsync);
        group.MapGet("/candidates", GetCandidatesAsync);
        group.MapPost("/", CreateAsync);
        group.MapPut("/{inspectionId:guid}/complete", CompleteAsync);
        return app;
    }

    private static async Task<IResult> GetAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var items = await InspectionQuery(dbContext).ToListAsync(cancellationToken);
        return Results.Ok(items.OrderBy(item => item.Status == "Completed").ThenByDescending(item => item.CreatedAt).Select(ToResponse).ToArray());
    }

    private static async Task<IResult> GetSummaryAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var items = await dbContext.QualityInspections.AsNoTracking().ToListAsync(cancellationToken);
        var completed = items.Where(item => item.Status == "Completed").ToArray();
        var employees = await dbContext.CompanyMemberships.AsNoTracking()
            .Where(item => item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
            .Select(item => new { item.AccountId, item.Account.DisplayName }).ToListAsync(cancellationToken);
        var employeeScores = employees.Select(employee =>
        {
            var scores = completed.Where(item => item.EmployeeAccountId == employee.AccountId).Select(item => item.TotalScore).ToArray();
            return new EmployeeQualityScoreResponse(employee.AccountId, employee.DisplayName, scores.Length, scores.Length == 0 ? null : Math.Round(scores.Average(), 1), scores.Length == 0 ? "Pending" : Grade((int)Math.Round(scores.Average())));
        }).OrderByDescending(item => item.AverageScore ?? -1).ToArray();
        return Results.Ok(new QualityInspectionSummaryResponse(
            items.Count(item => item.Status != "Completed"), completed.Length,
            completed.Length == 0 ? null : Math.Round(completed.Average(item => item.TotalScore), 1),
            completed.Count(item => item.RequiresCorrectiveAction), employeeScores));
    }

    private static async Task<IResult> GetCandidatesAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var activeInspectionReportIds = await dbContext.QualityInspections.AsNoTracking().Where(item => item.Status != "Completed").Select(item => item.ServiceReportId).ToListAsync(cancellationToken);
        var reports = await dbContext.ServiceReports.AsNoTracking()
            .Where(item => item.Status == "Finalized" && !activeInspectionReportIds.Contains(item.Id))
            .Include(item => item.WorkOrder).ThenInclude(item => item.Customer)
            .Include(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
            .Include(item => item.WorkOrder).ThenInclude(item => item.AssignedEmployeeAccount)
            .Include(item => item.WorkOrder).ThenInclude(item => item.Photos)
            .Include(item => item.CreatedByAccount)
            .Include(item => item.Stations).Include(item => item.Products).AsSplitQuery()
            .ToListAsync(cancellationToken);
        var candidates = reports.OrderByDescending(item => item.FinalizedAt).Take(100).Select(item =>
        {
            var recommendation = Recommendation(item);
            var defaults = DefaultScores(item);
            return new QualityInspectionCandidateResponse(item.Id, item.ReportNumber, item.WorkOrder.Number, item.WorkOrder.Customer.LegalName,
                item.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel", item.WorkOrder.AssignedEmployeeAccountId,
                item.WorkOrder.AssignedEmployeeAccount?.DisplayName ?? item.CreatedByAccount.DisplayName, item.FinalizedAt ?? item.UpdatedAt,
                recommendation.Recommended, recommendation.Reason, item.Stations.Count, item.WorkOrder.Photos.Count, defaults.Total);
        }).ToArray();
        return Results.Ok(candidates.OrderByDescending(item => item.Recommended).ThenByDescending(item => item.FinalizedAt).ToArray());
    }

    private static async Task<IResult> CreateAsync(CreateQualityInspectionRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        if (!InspectionTypes.Contains(request.InspectionType)) return Validation("inspectionType", "Geçerli bir kontrol türü seçin.");
        var report = await dbContext.ServiceReports.AsNoTracking().Include(item => item.WorkOrder)
            .SingleOrDefaultAsync(item => item.Id == request.ServiceReportId && item.Status == "Finalized", cancellationToken);
        if (report is null) return Validation("serviceReportId", "Yayınlanmış saha raporu bulunamadı.");
        if (!report.WorkOrder.AssignedEmployeeAccountId.HasValue) return Validation("serviceReportId", "İş emrinde atanmış personel bulunmuyor.");
        if (await dbContext.QualityInspections.AnyAsync(item => item.ServiceReportId == request.ServiceReportId && item.Status != "Completed", cancellationToken))
            return Results.Conflict(new { message = "Bu rapor için açık bir kalite kontrolü zaten bulunuyor." });
        var now = DateTimeOffset.UtcNow;
        var item = new QualityInspection
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, ServiceReportId = report.Id,
            InspectorAccountId = context.AccountId.Value, EmployeeAccountId = report.WorkOrder.AssignedEmployeeAccountId.Value,
            Number = $"KK-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}", InspectionType = request.InspectionType,
            SelectionReason = Clean(request.SelectionReason, 500) ?? "Yönetici ikinci kontrolü", Status = "Planned", Grade = "Pending",
            ScheduledAt = request.ScheduledAt, CreatedAt = now, UpdatedAt = now
        };
        dbContext.QualityInspections.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/quality-inspections/{item.Id}", ToResponse((await LoadAsync(item.Id, dbContext, cancellationToken))!));
    }

    private static async Task<IResult> CompleteAsync(Guid inspectionId, CompleteQualityInspectionRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        var scores = new[] { request.PhotoQualityScore, request.StationCompletionScore, request.ProductDoseScore, request.SignatureScore, request.TimelinessScore, request.ReportCompletenessScore };
        if (scores.Any(score => score is < 0 or > 100)) return Validation("scores", "Tüm kalite puanları 0-100 arasında olmalıdır.");
        var item = await dbContext.QualityInspections.Include(value => value.ServiceReport).ThenInclude(value => value.WorkOrder).SingleOrDefaultAsync(value => value.Id == inspectionId, cancellationToken);
        if (item is null) return Results.NotFound(new { message = "Kalite kontrol kaydı bulunamadı." });
        if (item.Status == "Completed") return Results.Conflict(new { message = "Bu kalite kontrolü daha önce tamamlanmış." });
        var total = WeightedScore(request); var now = DateTimeOffset.UtcNow;
        item.PhotoQualityScore = request.PhotoQualityScore; item.StationCompletionScore = request.StationCompletionScore;
        item.ProductDoseScore = request.ProductDoseScore; item.SignatureScore = request.SignatureScore;
        item.TimelinessScore = request.TimelinessScore; item.ReportCompletenessScore = request.ReportCompletenessScore;
        item.TotalScore = total; item.Grade = Grade(total); item.Findings = Clean(request.Findings, 4000); item.Notes = Clean(request.Notes, 2000);
        item.RequiresCorrectiveAction = request.CreateCorrectiveAction || total < 70; item.Status = "Completed"; item.InspectedAt = now; item.UpdatedAt = now;
        if (item.RequiresCorrectiveAction)
        {
            var workOrder = item.ServiceReport.WorkOrder;
            await CorrectiveActionAutomation.SyncAsync(dbContext, item.CompanyId, context.AccountId.Value, workOrder.CustomerId, workOrder.CustomerBranchId,
                "QualityInspection", item.Id, "Kalite Kontrol", $"{item.Number} kalite kontrol bulgusu",
                item.Findings ?? $"Saha uygulaması kalite puanı {total}/100 ({item.Grade}) olarak değerlendirildi.",
                "Kalite kontrol bulguları için kök neden belirlenmeli, kalıcı faaliyet uygulanmalı ve kanıtla kapatılmalıdır.",
                "Company", total < 50 ? "Critical" : "High", DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)), cancellationToken);
            item.CorrectiveActionId = dbContext.CorrectiveActions.Local.SingleOrDefault(value => value.SourceType == "QualityInspection" && value.SourceId == item.Id)?.Id;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse((await LoadAsync(item.Id, dbContext, cancellationToken))!));
    }

    private static IQueryable<QualityInspection> InspectionQuery(PesneerDbContext dbContext) => dbContext.QualityInspections.AsNoTracking()
        .Include(item => item.ServiceReport).ThenInclude(item => item.WorkOrder).ThenInclude(item => item.Customer)
        .Include(item => item.ServiceReport).ThenInclude(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
        .Include(item => item.InspectorAccount).Include(item => item.EmployeeAccount).Include(item => item.CorrectiveAction).AsSplitQuery();
    private static Task<QualityInspection?> LoadAsync(Guid id, PesneerDbContext dbContext, CancellationToken cancellationToken) => InspectionQuery(dbContext).SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

    private static QualityInspectionResponse ToResponse(QualityInspection item) => new(item.Id, item.Number, item.InspectionType, item.SelectionReason, item.Status,
        item.ServiceReportId, item.ServiceReport.ReportNumber, item.ServiceReport.WorkOrder.Number, item.ServiceReport.WorkOrder.Customer.LegalName,
        item.ServiceReport.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel", item.EmployeeAccountId, item.EmployeeAccount.DisplayName,
        item.InspectorAccount.DisplayName, item.ScheduledAt, item.InspectedAt, item.PhotoQualityScore, item.StationCompletionScore,
        item.ProductDoseScore, item.SignatureScore, item.TimelinessScore, item.ReportCompletenessScore, item.TotalScore, item.Grade,
        item.RequiresCorrectiveAction, item.Findings, item.Notes, item.CorrectiveActionId, item.CorrectiveAction?.Number, item.CreatedAt, item.UpdatedAt);

    private static (bool Recommended, string Reason) Recommendation(ServiceReport report)
    {
        if (report.WorkOrder.Photos.Count == 0) return (true, "Fotoğraf kanıtı bulunmuyor");
        if (report.Stations.Count == 0) return (true, "İstasyon kontrol kaydı bulunmuyor");
        if (report.Stations.Count(item => item.DeviceStatus is "Broken" or "Inaccessible") > 0) return (true, "Hasarlı veya ulaşılamayan istasyon var");
        if (report.Stations.Count(item => item.HasActivity) * 100m / report.Stations.Count >= 25) return (true, "Yüksek saha aktivitesi");
        return report.Id.ToByteArray()[0] % 10 == 0 ? (true, "Rastgele kalite örneklemi") : (false, "Yönetici seçimine uygun");
    }

    private static (int Photo, int Station, int Dose, int Signature, int Timeliness, int Completeness, int Total) DefaultScores(ServiceReport report)
    {
        var photo = report.WorkOrder.Photos.Count >= 2 ? 100 : report.WorkOrder.Photos.Count == 1 ? 70 : 30;
        var station = report.Stations.Count > 0 ? Math.Max(40, 100 - report.Stations.Count(item => item.DeviceStatus == "Inaccessible") * 10) : 30;
        var dose = report.Products.Count > 0 && report.Products.All(item => item.AmountUsed > 0 && !string.IsNullOrWhiteSpace(item.Unit)) ? 100 : report.Stations.Any(item => item.AppliedAmount > 0) ? 80 : 50;
        var signature = !string.IsNullOrWhiteSpace(report.ManagerSignatureData) && !string.IsNullOrWhiteSpace(report.CustomerSignatureData) ? 100 : 30;
        var timeliness = report.WorkOrder.CompletedAt.HasValue && report.WorkOrder.CompletedAt <= report.WorkOrder.ScheduledAt.AddMinutes(report.WorkOrder.DurationMinutes + 60) ? 100 : 70;
        var completeness = new[] { report.ApplicationSummary, report.Findings, report.Recommendations }.Count(value => !string.IsNullOrWhiteSpace(value)) * 20 + (report.Stations.Count > 0 ? 20 : 0) + (report.Products.Count > 0 ? 20 : 0);
        var total = (int)Math.Round(photo * .15m + station * .25m + dose * .20m + signature * .15m + timeliness * .10m + completeness * .15m);
        return (photo, station, dose, signature, timeliness, Math.Min(100, completeness), total);
    }

    private static int WeightedScore(CompleteQualityInspectionRequest request) => (int)Math.Round(request.PhotoQualityScore * .15m + request.StationCompletionScore * .25m + request.ProductDoseScore * .20m + request.SignatureScore * .15m + request.TimelinessScore * .10m + request.ReportCompletenessScore * .15m);
    private static string Grade(int score) => score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 70 ? "Acceptable" : score >= 50 ? "NeedsImprovement" : "Critical";
    private static string? Clean(string? value, int maxLength) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, maxLength)];
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}

public sealed record CreateQualityInspectionRequest(Guid ServiceReportId, string InspectionType, string SelectionReason, DateTimeOffset? ScheduledAt);
public sealed record CompleteQualityInspectionRequest(int PhotoQualityScore, int StationCompletionScore, int ProductDoseScore, int SignatureScore, int TimelinessScore, int ReportCompletenessScore, string? Findings, string? Notes, bool CreateCorrectiveAction);
public sealed record QualityInspectionCandidateResponse(Guid ServiceReportId, string ReportNumber, string WorkOrderNumber, string CustomerName, string BranchName, Guid? EmployeeAccountId, string EmployeeName, DateTimeOffset FinalizedAt, bool Recommended, string RecommendationReason, int StationCount, int PhotoCount, int PreliminaryScore);
public sealed record EmployeeQualityScoreResponse(Guid EmployeeAccountId, string EmployeeName, int InspectionCount, double? AverageScore, string Grade);
public sealed record QualityInspectionSummaryResponse(int OpenCount, int CompletedCount, double? AverageScore, int CorrectiveActionCount, IReadOnlyList<EmployeeQualityScoreResponse> Employees);
public sealed record QualityInspectionResponse(Guid Id, string Number, string InspectionType, string SelectionReason, string Status, Guid ServiceReportId, string ReportNumber, string WorkOrderNumber, string CustomerName, string BranchName, Guid EmployeeAccountId, string EmployeeName, string InspectorName, DateTimeOffset? ScheduledAt, DateTimeOffset? InspectedAt, int PhotoQualityScore, int StationCompletionScore, int ProductDoseScore, int SignatureScore, int TimelinessScore, int ReportCompletenessScore, int TotalScore, string Grade, bool RequiresCorrectiveAction, string? Findings, string? Notes, Guid? CorrectiveActionId, string? CorrectiveActionNumber, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
