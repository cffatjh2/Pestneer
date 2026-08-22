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
        var query = InspectionResponseQuery(dbContext);
        var items = dbContext.Database.IsSqlite()
            ? await query.ToListAsync(cancellationToken)
            : await query.OrderBy(item => item.Status == "Completed")
                .ThenByDescending(item => item.CreatedAt)
                .ToListAsync(cancellationToken);
        return Results.Ok(items.OrderBy(item => item.Status == "Completed").ThenByDescending(item => item.CreatedAt).ToArray());
    }

    private static async Task<IResult> GetSummaryAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var summary = await dbContext.QualityInspections.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(group => new
            {
                OpenCount = group.Count(item => item.Status != "Completed"),
                CompletedCount = group.Count(item => item.Status == "Completed"),
                AverageScore = group.Where(item => item.Status == "Completed").Select(item => (double?)item.TotalScore).Average(),
                CorrectiveActionCount = group.Count(item => item.Status == "Completed" && item.RequiresCorrectiveAction)
            })
            .SingleOrDefaultAsync(cancellationToken);
        var employees = await dbContext.CompanyMemberships.AsNoTracking()
            .Where(item => item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
            .Select(item => new
            {
                item.AccountId,
                item.Account.DisplayName,
                InspectionCount = dbContext.QualityInspections.Count(inspection => inspection.Status == "Completed" && inspection.EmployeeAccountId == item.AccountId),
                AverageScore = dbContext.QualityInspections
                    .Where(inspection => inspection.Status == "Completed" && inspection.EmployeeAccountId == item.AccountId)
                    .Select(inspection => (double?)inspection.TotalScore)
                    .Average()
            })
            .ToListAsync(cancellationToken);
        var employeeScores = employees.Select(employee => new EmployeeQualityScoreResponse(
                employee.AccountId,
                employee.DisplayName,
                employee.InspectionCount,
                employee.AverageScore.HasValue ? Math.Round(employee.AverageScore.Value, 1) : null,
                employee.AverageScore.HasValue ? Grade((int)Math.Round(employee.AverageScore.Value)) : "Pending"))
            .OrderByDescending(item => item.AverageScore ?? -1)
            .ToArray();
        return Results.Ok(new QualityInspectionSummaryResponse(
            summary?.OpenCount ?? 0,
            summary?.CompletedCount ?? 0,
            summary?.AverageScore is double averageScore ? Math.Round(averageScore, 1) : null,
            summary?.CorrectiveActionCount ?? 0,
            employeeScores));
    }

    private static async Task<IResult> GetCandidatesAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var reportQuery = dbContext.ServiceReports.AsNoTracking()
            .Where(item => item.Status == "Finalized" && !dbContext.QualityInspections.Any(inspection => inspection.Status != "Completed" && inspection.ServiceReportId == item.Id))
            .Select(item => new QualityInspectionCandidateProjection(
                item.Id,
                item.ReportNumber,
                item.WorkOrder.Number,
                item.WorkOrder.Customer.LegalName,
                item.WorkOrder.CustomerBranch != null ? item.WorkOrder.CustomerBranch.Name : "Merkez / Genel",
                item.WorkOrder.AssignedEmployeeAccountId,
                item.WorkOrder.AssignedEmployeeAccount != null ? item.WorkOrder.AssignedEmployeeAccount.DisplayName : item.CreatedByAccount.DisplayName,
                item.FinalizedAt ?? item.UpdatedAt,
                item.Stations.Count,
                item.WorkOrder.Photos.Count,
                item.Stations.Count(station => station.DeviceStatus == "Broken" || station.DeviceStatus == "Inaccessible"),
                item.Stations.Count(station => station.DeviceStatus == "Inaccessible"),
                item.Stations.Count(station => station.HasActivity),
                item.Stations.Any(station => station.AppliedAmount > 0),
                item.Products.Count,
                item.Products.Count(product => product.AmountUsed <= 0 || string.IsNullOrWhiteSpace(product.Unit)),
                !string.IsNullOrWhiteSpace(item.ManagerSignatureData),
                !string.IsNullOrWhiteSpace(item.CustomerSignatureData),
                item.WorkOrder.CompletedAt,
                item.WorkOrder.ScheduledAt,
                item.WorkOrder.DurationMinutes,
                item.ApplicationSummary,
                item.Findings,
                item.Recommendations));
        var reports = dbContext.Database.IsSqlite()
            ? (await reportQuery.ToListAsync(cancellationToken)).OrderByDescending(item => item.FinalizedAt).Take(100).ToList()
            : await reportQuery.OrderByDescending(item => item.FinalizedAt).Take(100).ToListAsync(cancellationToken);
        var candidates = reports.Select(item =>
        {
            var recommendation = Recommendation(item);
            var defaults = DefaultScores(item);
            return new QualityInspectionCandidateResponse(item.Id, item.ReportNumber, item.WorkOrderNumber, item.CustomerName,
                item.BranchName, item.EmployeeAccountId, item.EmployeeName, item.FinalizedAt,
                recommendation.Recommended, recommendation.Reason, item.StationCount, item.PhotoCount, defaults.Total);
        }).ToArray();
        return Results.Ok(candidates.OrderByDescending(item => item.Recommended).ThenByDescending(item => item.FinalizedAt).ToArray());
    }

    private static async Task<IResult> CreateAsync(CreateQualityInspectionRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        if (!InspectionTypes.Contains(request.InspectionType)) return Validation("inspectionType", "Geçerli bir kontrol türü seçin.");
        var report = await dbContext.ServiceReports.AsNoTracking()
            .Where(item => item.Id == request.ServiceReportId && item.Status == "Finalized")
            .Select(item => new { item.Id, item.WorkOrder.AssignedEmployeeAccountId })
            .SingleOrDefaultAsync(cancellationToken);
        if (report is null) return Validation("serviceReportId", "Yayınlanmış saha raporu bulunamadı.");
        if (!report.AssignedEmployeeAccountId.HasValue) return Validation("serviceReportId", "İş emrinde atanmış personel bulunmuyor.");
        if (await dbContext.QualityInspections.AnyAsync(item => item.ServiceReportId == request.ServiceReportId && item.Status != "Completed", cancellationToken))
            return Results.Conflict(new { message = "Bu rapor için açık bir kalite kontrolü zaten bulunuyor." });
        var now = DateTimeOffset.UtcNow;
        var item = new QualityInspection
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, ServiceReportId = report.Id,
            InspectorAccountId = context.AccountId.Value, EmployeeAccountId = report.AssignedEmployeeAccountId.Value,
            Number = $"KK-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}", InspectionType = request.InspectionType,
            SelectionReason = Clean(request.SelectionReason, 500) ?? "Yönetici ikinci kontrolü", Status = "Planned", Grade = "Pending",
            ScheduledAt = request.ScheduledAt, CreatedAt = now, UpdatedAt = now
        };
        dbContext.QualityInspections.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/quality-inspections/{item.Id}", await LoadResponseAsync(item.Id, dbContext, cancellationToken));
    }

    private static async Task<IResult> CompleteAsync(Guid inspectionId, CompleteQualityInspectionRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        var scores = new[] { request.PhotoQualityScore, request.StationCompletionScore, request.ProductDoseScore, request.SignatureScore, request.TimelinessScore, request.ReportCompletenessScore };
        if (scores.Any(score => score is < 0 or > 100)) return Validation("scores", "Tüm kalite puanları 0-100 arasında olmalıdır.");
        var item = await dbContext.QualityInspections.SingleOrDefaultAsync(value => value.Id == inspectionId, cancellationToken);
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
            var location = await dbContext.ServiceReports.AsNoTracking()
                .Where(report => report.Id == item.ServiceReportId)
                .Select(report => new { report.WorkOrder.CustomerId, report.WorkOrder.CustomerBranchId })
                .SingleAsync(cancellationToken);
            await CorrectiveActionAutomation.SyncAsync(dbContext, item.CompanyId, context.AccountId.Value, location.CustomerId, location.CustomerBranchId,
                "QualityInspection", item.Id, "Kalite Kontrol", $"{item.Number} kalite kontrol bulgusu",
                item.Findings ?? $"Saha uygulaması kalite puanı {total}/100 ({item.Grade}) olarak değerlendirildi.",
                "Kalite kontrol bulguları için kök neden belirlenmeli, kalıcı faaliyet uygulanmalı ve kanıtla kapatılmalıdır.",
                "Company", total < 50 ? "Critical" : "High", DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)), cancellationToken);
            item.CorrectiveActionId = dbContext.CorrectiveActions.Local.SingleOrDefault(value => value.SourceType == "QualityInspection" && value.SourceId == item.Id)?.Id;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(await LoadResponseAsync(item.Id, dbContext, cancellationToken));
    }

    private static IQueryable<QualityInspectionResponse> InspectionResponseQuery(PesneerDbContext dbContext, Guid? inspectionId = null)
    {
        var query = dbContext.QualityInspections.AsNoTracking().AsQueryable();
        if (inspectionId.HasValue) query = query.Where(item => item.Id == inspectionId.Value);
        return query.Select(item => new QualityInspectionResponse(
                item.Id, item.Number, item.InspectionType, item.SelectionReason, item.Status,
                item.ServiceReportId, item.ServiceReport.ReportNumber, item.ServiceReport.WorkOrder.Number, item.ServiceReport.WorkOrder.Customer.LegalName,
                item.ServiceReport.WorkOrder.CustomerBranch != null ? item.ServiceReport.WorkOrder.CustomerBranch.Name : "Merkez / Genel",
                item.EmployeeAccountId, item.EmployeeAccount.DisplayName, item.InspectorAccount.DisplayName, item.ScheduledAt, item.InspectedAt,
                item.PhotoQualityScore, item.StationCompletionScore, item.ProductDoseScore, item.SignatureScore, item.TimelinessScore,
                item.ReportCompletenessScore, item.TotalScore, item.Grade, item.RequiresCorrectiveAction, item.Findings, item.Notes,
                item.CorrectiveActionId, item.CorrectiveAction != null ? item.CorrectiveAction.Number : null, item.CreatedAt, item.UpdatedAt));
    }

    private static Task<QualityInspectionResponse> LoadResponseAsync(Guid id, PesneerDbContext dbContext, CancellationToken cancellationToken) =>
        InspectionResponseQuery(dbContext, id).SingleAsync(cancellationToken);

    private static (bool Recommended, string Reason) Recommendation(QualityInspectionCandidateProjection report)
    {
        if (report.PhotoCount == 0) return (true, "Fotoğraf kanıtı bulunmuyor");
        if (report.StationCount == 0) return (true, "İstasyon kontrol kaydı bulunmuyor");
        if (report.BrokenOrInaccessibleStationCount > 0) return (true, "Hasarlı veya ulaşılamayan istasyon var");
        if (report.ActiveStationCount * 100m / report.StationCount >= 25) return (true, "Yüksek saha aktivitesi");
        return report.Id.ToByteArray()[0] % 10 == 0 ? (true, "Rastgele kalite örneklemi") : (false, "Yönetici seçimine uygun");
    }

    private static (int Photo, int Station, int Dose, int Signature, int Timeliness, int Completeness, int Total) DefaultScores(QualityInspectionCandidateProjection report)
    {
        var photo = report.PhotoCount >= 2 ? 100 : report.PhotoCount == 1 ? 70 : 30;
        var station = report.StationCount > 0 ? Math.Max(40, 100 - report.InaccessibleStationCount * 10) : 30;
        var dose = report.ProductCount > 0 && report.InvalidProductDoseCount == 0 ? 100 : report.HasAppliedStationAmount ? 80 : 50;
        var signature = report.HasManagerSignature && report.HasCustomerSignature ? 100 : 30;
        var timeliness = report.WorkOrderCompletedAt.HasValue && report.WorkOrderCompletedAt <= report.WorkOrderScheduledAt.AddMinutes(report.WorkOrderDurationMinutes + 60) ? 100 : 70;
        var completeness = new[] { report.ApplicationSummary, report.Findings, report.Recommendations }.Count(value => !string.IsNullOrWhiteSpace(value)) * 20 + (report.StationCount > 0 ? 20 : 0) + (report.ProductCount > 0 ? 20 : 0);
        var total = (int)Math.Round(photo * .15m + station * .25m + dose * .20m + signature * .15m + timeliness * .10m + completeness * .15m);
        return (photo, station, dose, signature, timeliness, Math.Min(100, completeness), total);
    }

    private sealed record QualityInspectionCandidateProjection(
        Guid Id,
        string ReportNumber,
        string WorkOrderNumber,
        string CustomerName,
        string BranchName,
        Guid? EmployeeAccountId,
        string EmployeeName,
        DateTimeOffset FinalizedAt,
        int StationCount,
        int PhotoCount,
        int BrokenOrInaccessibleStationCount,
        int InaccessibleStationCount,
        int ActiveStationCount,
        bool HasAppliedStationAmount,
        int ProductCount,
        int InvalidProductDoseCount,
        bool HasManagerSignature,
        bool HasCustomerSignature,
        DateTimeOffset? WorkOrderCompletedAt,
        DateTimeOffset WorkOrderScheduledAt,
        int WorkOrderDurationMinutes,
        string? ApplicationSummary,
        string? Findings,
        string? Recommendations);

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
