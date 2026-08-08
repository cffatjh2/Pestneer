using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.WeatherRisk;

namespace Pesneer.Api.Quality;

public static class QualityEndpoints
{
    private const long MaximumFileSize = 15 * 1024 * 1024;
    private static readonly TimeSpan TurkeyOffset = TimeSpan.FromHours(3);
    private static readonly JsonSerializerOptions PayloadOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".webp"
    };
    private static readonly HashSet<string> Categories = new(StringComparer.OrdinalIgnoreCase)
    {
        "General", "Contracts", "ServiceReports", "TrendAnalyses", "RiskAnalyses", "Certificates", "Photos", "Other"
    };

    public static IEndpointRouteBuilder MapQualityEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/quality").RequireAuthorization();
        shared.MapGet("/analyses", GetAnalysesAsync);
        shared.MapGet("/analyses/{analysisId:guid}", GetAnalysisAsync);
        shared.MapGet("/documents", GetDocumentsAsync);
        shared.MapGet("/documents/{documentId:guid}/download", DownloadDocumentAsync);

        var staff = app.MapGroup("/api/quality").RequireAuthorization("CompanyStaff");
        staff.MapGet("/locations", GetLocationsAsync);
        staff.MapPost("/trend-analyses", CreateTrendAnalysisAsync);
        staff.MapPost("/risk-analyses", CreateRiskAnalysisAsync);
        staff.MapPost("/documents/upload", UploadDocumentAsync).DisableAntiforgery();
        return app;
    }

    private static async Task<IResult> GetLocationsAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (context.Portal == PortalType.Owner)
        {
            var customers = await dbContext.Customers.AsNoTracking().Include(item => item.Branches)
                .Where(item => item.IsActive).OrderBy(item => item.LegalName).ToListAsync(cancellationToken);
            return Results.Ok(ToLocationResponses(customers));
        }

        var keys = await dbContext.WorkOrders.AsNoTracking()
            .Where(item => item.AssignedEmployeeAccountId == context.AccountId)
            .Select(item => new { item.CustomerId, item.CustomerBranchId }).Distinct().ToListAsync(cancellationToken);
        var customerIds = keys.Select(item => item.CustomerId).Distinct().ToArray();
        var permittedBranches = keys.Where(item => item.CustomerBranchId.HasValue).Select(item => item.CustomerBranchId!.Value).ToHashSet();
        var permittedCustomers = await dbContext.Customers.AsNoTracking().Include(item => item.Branches)
            .Where(item => customerIds.Contains(item.Id) && item.IsActive).OrderBy(item => item.LegalName).ToListAsync(cancellationToken);
        var locations = ToLocationResponses(permittedCustomers)
            .Where(item => !item.BranchId.HasValue || permittedBranches.Contains(item.BranchId.Value)).ToArray();
        return Results.Ok(locations);
    }

    private static async Task<IResult> GetAnalysesAsync(string? type, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var query = AccessibleAnalyses(dbContext, context).AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).AsQueryable();
        if (!string.IsNullOrWhiteSpace(type)) query = query.Where(item => item.AnalysisType == type);
        var analyses = (await query.ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).ToList();
        var ids = analyses.Select(item => item.Id).ToArray();
        var documentIds = await dbContext.QualityDocuments.AsNoTracking().Where(item => item.QualityAnalysisId.HasValue && ids.Contains(item.QualityAnalysisId.Value))
            .ToDictionaryAsync(item => item.QualityAnalysisId!.Value, item => item.Id, cancellationToken);
        return Results.Ok(analyses.Select(item => ToAnalysisResponse(item, documentIds.GetValueOrDefault(item.Id))).ToArray());
    }

    private static async Task<IResult> GetAnalysisAsync(Guid analysisId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var analysis = await AccessibleAnalyses(dbContext, context).AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount)
            .SingleOrDefaultAsync(item => item.Id == analysisId, cancellationToken);
        if (analysis is null) return Results.NotFound(new { message = "Analiz kaydı bulunamadı." });
        var documentId = await dbContext.QualityDocuments.AsNoTracking().Where(item => item.QualityAnalysisId == analysis.Id)
            .Select(item => (Guid?)item.Id).FirstOrDefaultAsync(cancellationToken);
        return Results.Ok(ToAnalysisResponse(analysis, documentId));
    }

    private static async Task<IResult> GetDocumentsAsync(string? category, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var query = AccessibleDocuments(dbContext, context).AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.QualityAnalysis).AsQueryable();
        if (!string.IsNullOrWhiteSpace(category)) query = query.Where(item => item.Category == category);
        return Results.Ok((await query.ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).Select(ToDocumentResponse).ToArray());
    }

    private static async Task<IResult> DownloadDocumentAsync(Guid documentId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var document = await AccessibleDocuments(dbContext, context).AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.Customer)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.CustomerBranch)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.CreatedByAccount)
            .SingleOrDefaultAsync(item => item.Id == documentId, cancellationToken);
        if (document is null) return Results.NotFound(new { message = "Belge bulunamadı." });
        if (document.FileData is not null) return Results.File(document.FileData, document.ContentType, document.FileName);
        if (document.QualityAnalysis is null) return Results.NotFound(new { message = "Belge içeriği bulunamadı." });
        return Results.File(QualityDocumentRenderer.Render(document.QualityAnalysis), "application/pdf", Path.ChangeExtension(document.FileName, ".pdf"));
    }

    private static async Task<IResult> CreateTrendAnalysisAsync(CreateTrendAnalysisRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (request.PeriodEnd < request.PeriodStart) return Validation("periodEnd", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
        if (request.PeriodEnd.DayNumber - request.PeriodStart.DayNumber > 366) return Validation("periodEnd", "Trend dönemi en fazla 12 ay olabilir.");
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var start = new DateTimeOffset(request.PeriodStart.ToDateTime(TimeOnly.MinValue), TurkeyOffset);
        var end = new DateTimeOffset(request.PeriodEnd.AddDays(1).ToDateTime(TimeOnly.MinValue), TurkeyOffset);
        var reportQuery = dbContext.ServiceReports.AsNoTracking().Include(item => item.WorkOrder).Include(item => item.Stations)
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == request.CustomerId);
        if (request.BranchId.HasValue) reportQuery = reportQuery.Where(item => item.WorkOrder.CustomerBranchId == request.BranchId.Value);
        var reports = (await reportQuery.ToListAsync(cancellationToken))
            .Where(item => item.WorkOrder.ScheduledAt >= start && item.WorkOrder.ScheduledAt < end)
            .OrderBy(item => item.WorkOrder.ScheduledAt)
            .ToList();
        if (reports.Count == 0) return Validation("periodStart", "Seçilen dönemde onaylanmış saha raporu bulunmuyor.");

        var customer = await dbContext.Customers.AsNoTracking().SingleAsync(item => item.Id == request.CustomerId, cancellationToken);
        var branch = request.BranchId.HasValue ? await dbContext.CustomerBranches.AsNoTracking().SingleOrDefaultAsync(item => item.Id == request.BranchId, cancellationToken) : null;
        var allStations = reports.SelectMany(item => item.Stations).ToArray();
        var periods = reports.GroupBy(item => item.WorkOrder.ScheduledAt.ToString("yyyy-MM")).Select(group =>
        {
            var stations = group.SelectMany(item => item.Stations).ToArray();
            return new TrendPeriodPayload(group.Key, group.Count(), stations.Length, stations.Count(item => item.HasActivity), stations.Count(item => item.PlateChanged), stations.Sum(item => item.CaughtCount), Percentage(stations.Count(item => item.HasActivity), stations.Length));
        }).OrderBy(item => item.Period).ToArray();
        var pests = allStations.Where(item => !string.IsNullOrWhiteSpace(item.TargetPest)).GroupBy(item => item.TargetPest!.Trim(), StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTotalPayload(group.Key, group.Sum(item => item.CaughtCount))).OrderByDescending(item => item.TotalCaught).ToArray();
        var activityRate = Percentage(allStations.Count(item => item.HasActivity), allStations.Length);
        var trendDirection = TrendDirection(periods);
        var summary = $"{reports.Count} saha raporunda {allStations.Length} istasyon değerlendirildi. {allStations.Count(item => item.HasActivity)} istasyonda aktivite görüldü; aktivite oranı %{activityRate:0.#}. Dönemsel eğilim: {trendDirection}.";
        var payload = new TrendAnalysisPayload(reports.Count, allStations.Length, allStations.Count(item => item.HasActivity), allStations.Count(item => item.PlateChanged), allStations.Sum(item => item.CaughtCount), activityRate, trendDirection, periods, pests);
        var analysis = NewAnalysis(context, request.CustomerId, request.BranchId, "Trend", "LIVE-CAPTURE-TREND-v1", request.Title, $"{customer.LegalName} - {branch?.Name ?? "Genel"} Trend Analizi", request.PeriodStart, request.PeriodEnd, (int)Math.Round(activityRate), trendDirection, summary, request.Findings, request.Recommendations, payload);
        dbContext.QualityAnalyses.Add(analysis);
        var document = NewGeneratedDocument(analysis, "TrendAnalyses");
        dbContext.QualityDocuments.Add(document);
        await dbContext.SaveChangesAsync(cancellationToken);
        analysis.Customer = customer; analysis.CustomerBranch = branch; analysis.CreatedByAccount = await dbContext.Accounts.AsNoTracking().SingleAsync(item => item.Id == context.AccountId, cancellationToken);
        return Results.Created($"/api/quality/analyses/{analysis.Id}", ToAnalysisResponse(analysis, document.Id));
    }

    private static async Task<IResult> CreateRiskAnalysisAsync(CreateRiskAnalysisRequest request, PesneerDbContext dbContext, ICompanyContext context, IWeatherRiskService weatherRiskService, CancellationToken cancellationToken)
    {
        if (request.Answers.Count == 0) return Validation("answers", "Risk kontrol maddelerini değerlendirin.");
        if (request.Answers.Any(item => item.Score is < 0 or > 4)) return Validation("answers", "Her risk maddesi 0 ile 4 arasında puanlanmalıdır.");
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var customer = await dbContext.Customers.AsNoTracking().SingleAsync(item => item.Id == request.CustomerId, cancellationToken);
        var branch = request.BranchId.HasValue ? await dbContext.CustomerBranches.AsNoTracking().SingleOrDefaultAsync(item => item.Id == request.BranchId, cancellationToken) : null;
        var location = new WeatherRiskLocation(customer.Id, customer.LegalName, branch?.Id, branch?.Name ?? "Merkez", branch?.Address ?? customer.Address ?? string.Empty, branch?.MapUrl ?? customer.MapUrl, branch?.Latitude ?? customer.Latitude, branch?.Longitude ?? customer.Longitude, branch is null ? "Customer" : "Branch");
        var weatherOverview = await weatherRiskService.BuildAsync([location], false, cancellationToken);
        var weatherLocation = weatherOverview.Locations.FirstOrDefault();
        var structuralScore = (int)Math.Round((decimal)request.Answers.Average(item => item.Score) / 4m * 100m);
        var weatherScore = weatherLocation?.Risk?.Score ?? 0;
        var overallScore = weatherLocation?.Risk is null ? structuralScore : (int)Math.Round(structuralScore * .7m + weatherScore * .3m);
        var level = RiskLevel(overallScore);
        var generatedRecommendations = request.Answers.Where(item => item.Score >= 3 && !string.IsNullOrWhiteSpace(item.Recommendation)).Select(item => item.Recommendation!.Trim())
            .Concat(weatherLocation?.Pests.Where(item => item.Score >= 35).Take(3).SelectMany(item => item.Recommendations.Take(1)) ?? [])
            .Distinct(StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true)).ToArray();
        var recommendationText = JoinText(request.Recommendations, generatedRecommendations);
        var summary = $"Yapısal ve operasyonel risk {structuralScore}/100, konuma bağlı hava riski {(weatherLocation?.Risk is null ? "hesaplanamadı" : $"{weatherScore}/100")}. Birleşik risk puanı {overallScore}/100 ({RiskLabel(level)}).";
        var payload = new RiskAnalysisPayload(structuralScore, weatherScore, overallScore, level, request.Answers, weatherLocation, generatedRecommendations, "Bu analiz karar destek amaçlıdır; saha keşfi, mesul müdür değerlendirmesi ve mevzuata uygun uygulama sorumluluğunun yerini almaz.");
        var analysis = NewAnalysis(context, request.CustomerId, request.BranchId, "Risk", "PEST-RISK-TR-v1", request.Title, $"{customer.LegalName} - {branch?.Name ?? "Genel"} Risk Analizi", request.AssessmentDate, request.AssessmentDate, overallScore, level, summary, JoinText(request.Findings, [request.CorrectiveActions ?? string.Empty]), recommendationText, payload);
        dbContext.QualityAnalyses.Add(analysis);
        var document = NewGeneratedDocument(analysis, "RiskAnalyses");
        dbContext.QualityDocuments.Add(document);
        await dbContext.SaveChangesAsync(cancellationToken);
        analysis.Customer = customer; analysis.CustomerBranch = branch; analysis.CreatedByAccount = await dbContext.Accounts.AsNoTracking().SingleAsync(item => item.Id == context.AccountId, cancellationToken);
        return Results.Created($"/api/quality/analyses/{analysis.Id}", ToAnalysisResponse(analysis, document.Id));
    }

    private static async Task<IResult> UploadDocumentAsync(HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType) return Results.BadRequest(new { message = "Belge multipart/form-data olarak yüklenmelidir." });
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0) return Validation("file", "Yüklenecek belgeyi seçin.");
        if (file.Length > MaximumFileSize) return Validation("file", "Belge boyutu en fazla 15 MB olabilir.");
        if (!AllowedExtensions.Contains(Path.GetExtension(file.FileName))) return Validation("file", "PDF, Word, Excel, metin veya görsel dosyası yükleyin.");
        var category = Categories.Contains(form["category"].ToString()) ? form["category"].ToString() : "Other";
        var customerId = Guid.TryParse(form["customerId"], out var parsedCustomerId) ? parsedCustomerId : (Guid?)null;
        var branchId = Guid.TryParse(form["branchId"], out var parsedBranchId) ? parsedBranchId : (Guid?)null;
        if (customerId.HasValue && !await CanUseLocationAsync(customerId.Value, branchId, dbContext, context, cancellationToken)) return Results.Forbid();
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        var document = new QualityDocument
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId!.Value, CustomerId = customerId, CustomerBranchId = branchId,
            CreatedByAccountId = context.AccountId!.Value, Category = category, Title = Clean(form["title"].ToString(), 240) ?? Path.GetFileNameWithoutExtension(file.FileName),
            Description = Clean(form["description"].ToString(), 2000), FileName = Path.GetFileName(file.FileName),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            SizeBytes = file.Length, FileData = stream.ToArray(), CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.QualityDocuments.Add(document);
        await dbContext.SaveChangesAsync(cancellationToken);
        var loaded = await dbContext.QualityDocuments.AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.QualityAnalysis)
            .SingleAsync(item => item.Id == document.Id, cancellationToken);
        return Results.Created($"/api/quality/documents/{document.Id}", ToDocumentResponse(loaded));
    }

    private static IQueryable<QualityAnalysis> AccessibleAnalyses(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.QualityAnalyses.AsQueryable();
        if (context.Portal == PortalType.Customer)
        {
            query = query.Where(item => item.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || !item.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId));
        }
        else if (context.Portal == PortalType.Employee)
        {
            query = query.Where(item => item.CreatedByAccountId == context.AccountId || dbContext.WorkOrders.Any(workOrder => workOrder.AssignedEmployeeAccountId == context.AccountId && workOrder.CustomerId == item.CustomerId && (!item.CustomerBranchId.HasValue || workOrder.CustomerBranchId == item.CustomerBranchId)));
        }
        return query;
    }

    private static IQueryable<QualityDocument> AccessibleDocuments(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.QualityDocuments.AsQueryable();
        if (context.Portal == PortalType.Customer)
        {
            query = query.Where(item => item.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || !item.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId));
        }
        else if (context.Portal == PortalType.Employee)
        {
            query = query.Where(item => item.CreatedByAccountId == context.AccountId || (item.CustomerId.HasValue && dbContext.WorkOrders.Any(workOrder => workOrder.AssignedEmployeeAccountId == context.AccountId && workOrder.CustomerId == item.CustomerId && (!item.CustomerBranchId.HasValue || workOrder.CustomerBranchId == item.CustomerBranchId))));
        }
        return query;
    }

    private static async Task<bool> CanUseLocationAsync(Guid customerId, Guid? branchId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var exists = await dbContext.Customers.AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken)
            && (!branchId.HasValue || await dbContext.CustomerBranches.AnyAsync(item => item.Id == branchId && item.CustomerId == customerId && item.IsActive, cancellationToken));
        if (!exists) return false;
        if (context.Portal == PortalType.Owner) return true;
        return await dbContext.WorkOrders.AnyAsync(item => item.AssignedEmployeeAccountId == context.AccountId && item.CustomerId == customerId && (!branchId.HasValue || item.CustomerBranchId == branchId), cancellationToken);
    }

    private static QualityAnalysis NewAnalysis(ICompanyContext context, Guid customerId, Guid? branchId, string type, string template, string? requestedTitle, string defaultTitle, DateOnly start, DateOnly end, int score, string level, string summary, string? findings, string? recommendations, object payload) => new()
    {
        Id = Guid.NewGuid(), CompanyId = context.CompanyId!.Value, CustomerId = customerId, CustomerBranchId = branchId,
        CreatedByAccountId = context.AccountId!.Value, Number = $"{(type == "Trend" ? "TRD" : "RSK")}-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}"[..19].ToUpperInvariant(),
        AnalysisType = type, TemplateCode = template, Title = Clean(requestedTitle, 240) ?? defaultTitle, Status = "Published",
        PeriodStart = start, PeriodEnd = end, Score = score, Level = level, Summary = summary,
        Findings = Clean(findings, 5000), Recommendations = Clean(recommendations, 5000), PayloadJson = JsonSerializer.Serialize(payload, PayloadOptions),
        CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
    };

    private static QualityDocument NewGeneratedDocument(QualityAnalysis analysis, string category) => new()
    {
        Id = Guid.NewGuid(), CompanyId = analysis.CompanyId, CustomerId = analysis.CustomerId, CustomerBranchId = analysis.CustomerBranchId,
        CreatedByAccountId = analysis.CreatedByAccountId, QualityAnalysisId = analysis.Id, Category = category, Title = analysis.Title,
        Description = analysis.Summary, FileName = $"{analysis.Number}.pdf", ContentType = "application/pdf", SizeBytes = 0, CreatedAt = analysis.CreatedAt
    };

    private static QualityAnalysisResponse ToAnalysisResponse(QualityAnalysis item, Guid? documentId) => new(
        item.Id, item.Number, item.AnalysisType, item.TemplateCode, item.Title, item.Status, item.CustomerId, item.Customer.LegalName,
        item.CustomerBranchId, item.CustomerBranch?.Name ?? "Genel", item.PeriodStart, item.PeriodEnd, item.Score, item.Level,
        item.Summary, item.Findings, item.Recommendations, item.CreatedByAccount.DisplayName, item.CreatedAt, PayloadElement(item.PayloadJson), documentId);

    private static QualityDocumentResponse ToDocumentResponse(QualityDocument item) => new(
        item.Id, item.Category, item.Title, item.Description,
        item.QualityAnalysisId.HasValue ? Path.ChangeExtension(item.FileName, ".pdf") : item.FileName,
        item.QualityAnalysisId.HasValue ? "application/pdf" : item.ContentType, item.SizeBytes, item.CustomerId,
        item.Customer?.LegalName ?? "Firma içi", item.CustomerBranchId, item.CustomerBranch?.Name ?? (item.CustomerId.HasValue ? "Genel" : "Firma içi"),
        item.CreatedByAccount.DisplayName, item.CreatedAt, item.QualityAnalysisId, item.QualityAnalysis?.AnalysisType, $"/api/quality/documents/{item.Id}/download");

    private static IReadOnlyList<QualityLocationResponse> ToLocationResponses(IEnumerable<Customer> customers) => customers.SelectMany(customer =>
        new[] { new QualityLocationResponse(customer.Id, customer.LegalName, null, "Genel / Merkez", customer.Address ?? string.Empty) }
            .Concat(customer.Branches.Where(branch => branch.IsActive).OrderBy(branch => branch.Name).Select(branch => new QualityLocationResponse(customer.Id, customer.LegalName, branch.Id, branch.Name, branch.Address))))
        .ToArray();

    private static JsonElement PayloadElement(string json) { using var document = JsonDocument.Parse(json); return document.RootElement.Clone(); }
    private static decimal Percentage(int value, int total) => total == 0 ? 0 : Math.Round((decimal)value / total * 100, 1);
    private static string TrendDirection(IReadOnlyList<TrendPeriodPayload> periods)
    {
        if (periods.Count < 2) return "Tek dönem";
        var change = periods[^1].ActivityRate - periods[0].ActivityRate;
        return change >= 5 ? "Artış" : change <= -5 ? "Azalış" : "Stabil";
    }
    private static string RiskLevel(int score) => score >= 65 ? "High" : score >= 35 ? "Medium" : "Low";
    private static string RiskLabel(string level) => level == "High" ? "Yüksek" : level == "Medium" ? "Orta" : "Düşük";
    private static string? Clean(string? value, int maxLength) { value = value?.Trim(); return string.IsNullOrWhiteSpace(value) ? null : value[..Math.Min(value.Length, maxLength)]; }
    private static string? JoinText(string? primary, IEnumerable<string> values)
    {
        var parts = new[] { Clean(primary, 5000) }.Concat(values.Select(item => Clean(item, 1000))).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct().ToArray();
        return parts.Length == 0 ? null : string.Join(Environment.NewLine, parts.Select(item => $"• {item!.TrimStart('•', ' ')}"));
    }
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    private sealed record TrendPeriodPayload(string Period, int ReportCount, int TotalStations, int ActiveStations, int PlateChanges, int TotalCaught, decimal ActivityRate);
    private sealed record PestTotalPayload(string Pest, int TotalCaught);
    private sealed record TrendAnalysisPayload(int ReportCount, int TotalStations, int ActiveStations, int PlateChanges, int TotalCaught, decimal ActivityRate, string TrendDirection, IReadOnlyList<TrendPeriodPayload> Periods, IReadOnlyList<PestTotalPayload> PestTotals);
    private sealed record RiskAnalysisPayload(int StructuralRiskScore, int WeatherRiskScore, int OverallRiskScore, string RiskLevel, IReadOnlyList<RiskAnswerInput> Answers, LocationWeatherRiskResponse? Weather, IReadOnlyList<string> GeneratedRecommendations, string Disclaimer);
}
