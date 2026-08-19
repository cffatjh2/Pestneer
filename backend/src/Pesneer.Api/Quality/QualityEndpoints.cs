using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.WeatherRisk;
using Pesneer.Api.Compliance;
using Pesneer.Api.StationActivations;
using Pesneer.Api.SitePlans;

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
        "General", "CommercialProposals", "Contracts", "ServiceReports", "StationActivations", "TrendAnalyses", "RiskAnalyses", "SitePlans", "Certificates", "Licenses", "SafetyDataSheets", "AuditPackages", "Photos", "FieldInspections", "SalesForms", "Other"
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

    private static async Task<IResult> GetDocumentsAsync(
        string? category,
        string? search,
        Guid? customerId,
        Guid? branchId,
        Guid? inventoryItemId,
        string? contentType,
        DateOnly? dateFrom,
        DateOnly? dateTo,
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        if (dateFrom.HasValue && dateTo.HasValue && dateTo < dateFrom)
            return Validation("dateTo", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
        if (!string.IsNullOrWhiteSpace(category) && !Categories.Contains(category))
            return Validation("category", "Geçerli bir belge kategorisi seçin.");
        var normalizedContentType = Clean(contentType, 20)?.ToLowerInvariant();
        if (normalizedContentType is not null && normalizedContentType is not ("pdf" or "office" or "image" or "text"))
            return Validation("contentType", "Geçerli bir dosya türü filtresi seçin.");
        var query = AccessibleDocuments(dbContext, context).AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.QualityAnalysis).Include(item => item.InventoryItem).AsQueryable();
        if (!string.IsNullOrWhiteSpace(category)) query = query.Where(item => item.Category == category);
        if (customerId.HasValue) query = query.Where(item => item.CustomerId == customerId.Value);
        if (branchId.HasValue) query = query.Where(item => item.CustomerBranchId == branchId.Value);
        if (inventoryItemId.HasValue) query = query.Where(item => item.InventoryItemId == inventoryItemId.Value);
        if (normalizedContentType is not null)
        {
            query = normalizedContentType switch
            {
                "pdf" => query.Where(item => item.ContentType == "application/pdf" || item.FileName.EndsWith(".pdf")),
                "office" => query.Where(item => item.FileName.EndsWith(".doc") || item.FileName.EndsWith(".docx") || item.FileName.EndsWith(".xls") || item.FileName.EndsWith(".xlsx") || item.FileName.EndsWith(".csv")),
                "image" => query.Where(item => item.ContentType.StartsWith("image/")),
                "text" => query.Where(item => item.ContentType.StartsWith("text/") || item.FileName.EndsWith(".txt")),
                _ => query
            };
        }
        if (dateFrom.HasValue)
        {
            var from = new DateTimeOffset(dateFrom.Value.ToDateTime(TimeOnly.MinValue), TurkeyOffset).ToUniversalTime();
            query = query.Where(item => item.CreatedAt >= from);
        }
        if (dateTo.HasValue)
        {
            var to = new DateTimeOffset(dateTo.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TurkeyOffset).ToUniversalTime();
            query = query.Where(item => item.CreatedAt < to);
        }
        var normalizedSearch = Clean(search, 120)?.ToUpper();
        if (normalizedSearch is not null)
            query = query.Where(item => item.Title.ToUpper().Contains(normalizedSearch) || item.FileName.ToUpper().Contains(normalizedSearch) ||
                (item.Description != null && item.Description.ToUpper().Contains(normalizedSearch)) ||
                (item.LicenseNumber != null && item.LicenseNumber.ToUpper().Contains(normalizedSearch)) ||
                (item.Customer != null && item.Customer.LegalName.ToUpper().Contains(normalizedSearch)) ||
                (item.CustomerBranch != null && item.CustomerBranch.Name.ToUpper().Contains(normalizedSearch)) ||
                (item.InventoryItem != null && item.InventoryItem.Name.ToUpper().Contains(normalizedSearch)));
        return Results.Ok((await query.ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).Take(1000).Select(ToDocumentResponse).ToArray());
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
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId, cancellationToken);
        return Results.File(QualityDocumentRenderer.Render(document.QualityAnalysis, company.LegalName, company.LogoData), "application/pdf", Path.ChangeExtension(document.FileName, ".pdf"));
    }

    private static async Task<IResult> CreateTrendAnalysisAsync(CreateTrendAnalysisRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (request.PeriodEnd < request.PeriodStart) return Validation("periodEnd", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
        if (request.PeriodEnd.DayNumber - request.PeriodStart.DayNumber > 366) return Validation("periodEnd", "Trend dönemi en fazla 12 ay olabilir.");
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var start = new DateTimeOffset(request.PeriodStart.ToDateTime(TimeOnly.MinValue), TurkeyOffset).ToUniversalTime();
        var end = new DateTimeOffset(request.PeriodEnd.AddDays(1).ToDateTime(TimeOnly.MinValue), TurkeyOffset).ToUniversalTime();
        var reportQuery = dbContext.ServiceReports.AsNoTracking().Include(item => item.WorkOrder).Include(item => item.Stations).ThenInclude(item => item.PestObservations)
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == request.CustomerId);
        if (request.BranchId.HasValue) reportQuery = reportQuery.Where(item => item.WorkOrder.CustomerBranchId == request.BranchId.Value);
        var reports = (await reportQuery.ToListAsync(cancellationToken))
            .Where(item => item.WorkOrder.ScheduledAt >= start && item.WorkOrder.ScheduledAt < end)
            .OrderBy(item => item.WorkOrder.ScheduledAt)
            .ToList();
        var activationQuery = dbContext.StationActivations.AsNoTracking().Include(item => item.WorkOrder)
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == request.CustomerId);
        if (request.BranchId.HasValue) activationQuery = activationQuery.Where(item => item.WorkOrder.CustomerBranchId == request.BranchId.Value);
        var activations = (await activationQuery.ToListAsync(cancellationToken))
            .Where(item => item.WorkOrder.ScheduledAt >= start && item.WorkOrder.ScheduledAt < end)
            .OrderBy(item => item.WorkOrder.ScheduledAt)
            .ToList();
        if (reports.Count == 0 && activations.Count == 0) return Validation("periodStart", "Seçilen dönemde onaylanmış saha raporu veya aktivasyon listesi bulunmuyor.");

        var customer = await dbContext.Customers.AsNoTracking().SingleAsync(item => item.Id == request.CustomerId, cancellationToken);
        var branch = request.BranchId.HasValue ? await dbContext.CustomerBranches.AsNoTracking().SingleOrDefaultAsync(item => item.Id == request.BranchId, cancellationToken) : null;
        var sources = reports.Where(item => item.Stations.Count > 0).Select(item => new TrendSource(item.WorkOrder.ScheduledAt, item.Stations.Select(station => new TrendStation(
                station.HasActivity, station.PlateChanged, station.CaughtCount, station.TargetPest,
                station.PestObservations.Select(pest => new TrendPest(pest.PestName, pest.ApprovedCount)).ToArray())).ToArray()))
            .Concat(activations.Select(item => new TrendSource(item.WorkOrder.ScheduledAt, StationActivationData.Deserialize(item.StationsJson).Select(station => new TrendStation(
                station.HasActivity, station.PlateChanged, station.CaughtCount, station.TargetPest,
                (station.PestObservations ?? []).Select(pest => new TrendPest(pest.PestName, pest.ApprovedCount)).ToArray())).ToArray())))
            .OrderBy(item => item.ScheduledAt).ToArray();
        var allStations = sources.SelectMany(item => item.Stations).ToArray();
        var periods = sources.GroupBy(item => item.ScheduledAt.ToString("yyyy-MM")).Select(group =>
        {
            var stations = group.SelectMany(item => item.Stations).ToArray();
            return new TrendPeriodPayload(group.Key, group.Count(), stations.Length, stations.Count(item => item.HasActivity), stations.Count(item => item.PlateChanged), stations.Sum(item => item.CaughtCount), Percentage(stations.Count(item => item.HasActivity), stations.Length));
        }).OrderBy(item => item.Period).ToArray();
        var visionPests = allStations.SelectMany(item => item.Pests).Where(item => item.Count > 0)
            .GroupBy(item => item.Name.Trim(), StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTotalPayload(group.Key, group.Sum(item => item.Count)));
        var legacyPests = allStations.Where(item => item.Pests.Count == 0 && !string.IsNullOrWhiteSpace(item.TargetPest))
            .GroupBy(item => item.TargetPest!.Trim(), StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTotalPayload(group.Key, group.Sum(item => item.CaughtCount)));
        var pests = visionPests.Concat(legacyPests).GroupBy(item => item.Pest, StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTotalPayload(group.Key, group.Sum(item => item.TotalCaught))).OrderByDescending(item => item.TotalCaught).ToArray();
        var activityRate = Percentage(allStations.Count(item => item.HasActivity), allStations.Length);
        var trendDirection = TrendDirection(periods);
        var summary = $"{sources.Length} saha kaydında {allStations.Length} istasyon değerlendirildi. {allStations.Count(item => item.HasActivity)} istasyonda aktivite görüldü; aktivite oranı %{activityRate:0.#}. Dönemsel eğilim: {trendDirection}.";
        var payload = new TrendAnalysisPayload(sources.Length, allStations.Length, allStations.Count(item => item.HasActivity), allStations.Count(item => item.PlateChanged), allStations.Sum(item => item.CaughtCount), activityRate, trendDirection, periods, pests);
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
        if (request.RiskMatrix.Count > 100 || request.RiskMatrix.Any(item => item.Severity is < 1 or > 3 || item.Likelihood is < 1 or > 3 || string.IsNullOrWhiteSpace(item.Location) || string.IsNullOrWhiteSpace(item.PestCategory))) return Validation("riskMatrix", "Lokasyon risk matrisindeki şiddet ve olasılık değerleri 1-3 arasında olmalıdır.");
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var customer = await dbContext.Customers.AsNoTracking().SingleAsync(item => item.Id == request.CustomerId, cancellationToken);
        var branch = request.BranchId.HasValue ? await dbContext.CustomerBranches.AsNoTracking().SingleOrDefaultAsync(item => item.Id == request.BranchId, cancellationToken) : null;
        var location = new WeatherRiskLocation(customer.Id, customer.LegalName, branch?.Id, branch?.Name ?? "Merkez", branch?.Address ?? customer.Address ?? string.Empty, branch?.MapUrl ?? customer.MapUrl, branch?.Latitude ?? customer.Latitude, branch?.Longitude ?? customer.Longitude, branch is null ? "Customer" : "Branch");
        var weatherOverview = await weatherRiskService.BuildAsync([location], false, cancellationToken);
        var weatherLocation = weatherOverview.Locations.FirstOrDefault();
        var structuralScore = (int)Math.Round((decimal)request.Answers.Average(item => item.Score) / 4m * 100m);
        var weatherScore = weatherLocation?.Risk?.Score ?? 0;
        var matrixScore = request.RiskMatrix.Count == 0 ? 0 : (int)Math.Round(request.RiskMatrix.Max(item => item.Severity * item.Likelihood) / 9m * 100m);
        var overallScore = weatherLocation?.Risk is null
            ? (int)Math.Round(structuralScore * .75m + matrixScore * .25m)
            : (int)Math.Round(structuralScore * .55m + matrixScore * .25m + weatherScore * .20m);
        var level = RiskLevel(overallScore);
        var generatedRecommendations = request.Answers.Where(item => item.Score >= 3 && !string.IsNullOrWhiteSpace(item.Recommendation)).Select(item => item.Recommendation!.Trim())
            .Concat(weatherLocation?.Pests.Where(item => item.Score >= 35).Take(3).SelectMany(item => item.Recommendations.Take(1)) ?? [])
            .Distinct(StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true)).ToArray();
        var recommendationText = JoinText(request.Recommendations, generatedRecommendations);
        var frequency = RecommendedFrequency(overallScore, request.SectorType);
        var summary = $"Yapısal ve operasyonel risk {structuralScore}/100, lokasyon matrisi {matrixScore}/100, konuma bağlı hava riski {(weatherLocation?.Risk is null ? "hesaplanamadı" : $"{weatherScore}/100")}. Birleşik risk puanı {overallScore}/100 ({RiskLabel(level)}). Önerilen kontrol sıklığı: {frequency}.";

        var sitePlanQuery = dbContext.SitePlans.AsNoTracking().Where(p => p.CustomerId == request.CustomerId);
        if (request.SitePlanId.HasValue)
        {
            sitePlanQuery = sitePlanQuery.Where(p => p.Id == request.SitePlanId.Value);
        }
        else if (request.BranchId.HasValue)
        {
            sitePlanQuery = sitePlanQuery.Where(p => p.CustomerBranchId == request.BranchId.Value);
        }
        var sitePlan = await sitePlanQuery.OrderByDescending(p => p.UpdatedAt).FirstOrDefaultAsync(cancellationToken);

        SitePlanRiskMapPayload? sitePlanRiskMap = null;
        if (sitePlan is not null)
        {
            try
            {
                var canvas = JsonSerializer.Deserialize<SitePlanCanvasInput>(sitePlan.CanvasJson, PayloadOptions);
                if (canvas is not null)
                {
                    var hotspots = new List<RiskHotspotPayload>();
                    foreach (var item in request.RiskMatrix)
                    {
                        var loc = item.Location.Trim();
                        var score = item.Severity * item.Likelihood;
                        var hotLevel = score >= 6 ? "High" : score >= 3 ? "Medium" : "Low";

                        var matched = canvas.Elements.FirstOrDefault(e =>
                            (!string.IsNullOrWhiteSpace(e.StationNumber) && (loc.Contains(e.StationNumber, StringComparison.OrdinalIgnoreCase) || e.StationNumber.Contains(loc, StringComparison.OrdinalIgnoreCase))) ||
                            (!string.IsNullOrWhiteSpace(e.Text) && (loc.Contains(e.Text, StringComparison.OrdinalIgnoreCase) || e.Text.Contains(loc, StringComparison.OrdinalIgnoreCase)))
                        );

                        hotspots.Add(new RiskHotspotPayload(
                            loc,
                            item.PestCategory,
                            item.Severity,
                            item.Likelihood,
                            score,
                            hotLevel,
                            item.Note,
                            matched?.Id,
                            matched?.X,
                            matched?.Y,
                            matched?.Width,
                            matched?.Height
                        ));
                    }

                    sitePlanRiskMap = new SitePlanRiskMapPayload(
                        sitePlan.Id,
                        sitePlan.Number,
                        sitePlan.Title,
                        sitePlan.AreaName,
                        sitePlan.Revision,
                        canvas,
                        hotspots
                    );
                }
            }
            catch
            {
                // ignore
            }
        }

        var payload = new RiskAnalysisPayload(structuralScore, matrixScore, weatherScore, overallScore, level, Clean(request.SectorType, 40), Clean(request.CurrentFrequency, 120), frequency, request.Answers, request.RiskMatrix, weatherLocation, generatedRecommendations, "Bu analiz açıklanabilir karar destek amaçlıdır; saha keşfi, mesul müdür değerlendirmesi ve mevzuata uygun uygulama sorumluluğunun yerini almaz.", sitePlanRiskMap);
        var analysis = NewAnalysis(context, request.CustomerId, request.BranchId, "Risk", "PEST-RISK-TR-v2", request.Title, $"{customer.LegalName} - {branch?.Name ?? "Genel"} Detaylı Risk Analizi", request.AssessmentDate, request.AssessmentDate, overallScore, level, summary, JoinText(request.Findings, [request.CorrectiveActions ?? string.Empty]), recommendationText, payload);
        dbContext.QualityAnalyses.Add(analysis);
        var document = NewGeneratedDocument(analysis, "RiskAnalyses");
        dbContext.QualityDocuments.Add(document);
        if (overallScore >= 40 || !string.IsNullOrWhiteSpace(request.CorrectiveActions))
        {
            await CorrectiveActionAutomation.SyncAsync(
                dbContext, context.CompanyId!.Value, context.AccountId!.Value, request.CustomerId, request.BranchId,
                "RiskAnalysis", analysis.Id, "Risk Analizi", $"{analysis.Title} faaliyeti", analysis.Findings,
                recommendationText, "Customer", overallScore >= 70 ? "Critical" : "High",
                request.AssessmentDate.AddDays(overallScore >= 70 ? 7 : 14), cancellationToken);
        }
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
        var inventoryItemId = Guid.TryParse(form["inventoryItemId"], out var parsedInventoryItemId) ? parsedInventoryItemId : (Guid?)null;
        var licenseNumber = Clean(form["licenseNumber"].ToString(), 160);
        InventoryItem? inventoryItem = null;
        if (category is "Licenses" or "SafetyDataSheets")
        {
            if (context.Portal != PortalType.Owner) return Results.Forbid();
            if (!inventoryItemId.HasValue) return Validation("inventoryItemId", category == "Licenses" ? "Ruhsatın bağlı olduğu stok ürününü seçin." : "MSDS / GBF belgesinin bağlı olduğu stok ürününü seçin.");
            if (category == "Licenses" && licenseNumber is null) return Validation("licenseNumber", "Ürün ruhsat numarasını girin.");
            inventoryItem = await dbContext.InventoryItems.SingleOrDefaultAsync(item => item.Id == inventoryItemId && item.IsActive, cancellationToken);
            if (inventoryItem is null) return Validation("inventoryItemId", "Bağlanacak aktif stok ürünü bulunamadı.");
            customerId = null;
            branchId = null;
        }
        if (customerId.HasValue && !await CanUseLocationAsync(customerId.Value, branchId, dbContext, context, cancellationToken)) return Results.Forbid();
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        var document = new QualityDocument
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId!.Value, CustomerId = customerId, CustomerBranchId = branchId, InventoryItemId = inventoryItemId,
            CreatedByAccountId = context.AccountId!.Value, Category = category, Title = Clean(form["title"].ToString(), 240) ?? Path.GetFileNameWithoutExtension(file.FileName),
            Description = Clean(form["description"].ToString(), 2000), LicenseNumber = licenseNumber, FileName = Path.GetFileName(file.FileName),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            SizeBytes = file.Length, FileData = stream.ToArray(), CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.QualityDocuments.Add(document);
        if (inventoryItem is not null && category == "Licenses") inventoryItem.LicenseNumber = licenseNumber;
        await dbContext.SaveChangesAsync(cancellationToken);
        var loaded = await dbContext.QualityDocuments.AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.QualityAnalysis).Include(item => item.InventoryItem)
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
            query = query.Where(item =>
                (item.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || !item.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId)) ||
                (item.Category == "Licenses" && dbContext.ServiceReportProducts.Any(product => product.LicenseDocumentId == item.Id && product.ServiceReport.Status == "Finalized" && product.ServiceReport.WorkOrder.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || product.ServiceReport.WorkOrder.CustomerBranchId == context.CustomerBranchId))) ||
                (item.Category == "SafetyDataSheets" && item.InventoryItemId.HasValue && dbContext.ServiceReportProducts.Any(product => product.VehicleStockItem != null && product.VehicleStockItem.InventoryItemId == item.InventoryItemId && product.ServiceReport.Status == "Finalized" && product.ServiceReport.WorkOrder.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || product.ServiceReport.WorkOrder.CustomerBranchId == context.CustomerBranchId))));
        }
        else if (context.Portal == PortalType.Employee)
        {
            query = query.Where(item => item.CreatedByAccountId == context.AccountId ||
                (item.CustomerId.HasValue && dbContext.WorkOrders.Any(workOrder =>
                    (workOrder.AssignedEmployeeAccountId == context.AccountId || workOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId)) &&
                    workOrder.CustomerId == item.CustomerId && (!item.CustomerBranchId.HasValue || workOrder.CustomerBranchId == item.CustomerBranchId))) ||
                ((item.Category == "Licenses" || item.Category == "SafetyDataSheets") && item.InventoryItemId.HasValue && dbContext.VehicleStockItems.Any(stock =>
                    stock.InventoryItemId == item.InventoryItemId && stock.IsActive && stock.Vehicle.IsActive && stock.Vehicle.AssignedEmployeeAccountId == context.AccountId)));
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
        item.CreatedByAccount.DisplayName, item.CreatedAt, item.InventoryItemId, item.InventoryItem?.Name, item.LicenseNumber,
        item.QualityAnalysisId, item.QualityAnalysis?.AnalysisType, $"/api/quality/documents/{item.Id}/download");

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
    private static string RecommendedFrequency(int score, string? sectorType)
    {
        var foodAdjustment = string.Equals(sectorType, "Food", StringComparison.OrdinalIgnoreCase) ? 5 : 0;
        var adjusted = Math.Min(100, score + foodAdjustment);
        return adjusted >= 75 ? "Haftalık izleme ve ayda en az 4 kapsamlı kontrol"
            : adjusted >= 55 ? "İki haftada bir izleme ve ayda en az 2 kapsamlı kontrol"
            : adjusted >= 30 ? "Ayda en az 1 kapsamlı kontrol"
            : "Risk esaslı aylık kontrol; bulgu halinde sıklık artırımı";
    }
    private static string RiskLabel(string level) => level == "High" ? "Yüksek" : level == "Medium" ? "Orta" : "Düşük";
    private static string? Clean(string? value, int maxLength) { value = value?.Trim(); return string.IsNullOrWhiteSpace(value) ? null : value[..Math.Min(value.Length, maxLength)]; }
    private static string? JoinText(string? primary, IEnumerable<string> values)
    {
        var parts = new[] { Clean(primary, 5000) }.Concat(values.Select(item => Clean(item, 1000))).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct().ToArray();
        return parts.Length == 0 ? null : string.Join(Environment.NewLine, parts.Select(item => $"• {item!.TrimStart('•', ' ')}"));
    }
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    private sealed record TrendSource(DateTimeOffset ScheduledAt, IReadOnlyList<TrendStation> Stations);
    private sealed record TrendStation(bool HasActivity, bool PlateChanged, int CaughtCount, string? TargetPest, IReadOnlyList<TrendPest> Pests);
    private sealed record TrendPest(string Name, int Count);
    private sealed record TrendPeriodPayload(string Period, int ReportCount, int TotalStations, int ActiveStations, int PlateChanges, int TotalCaught, decimal ActivityRate);
    private sealed record PestTotalPayload(string Pest, int TotalCaught);
    private sealed record TrendAnalysisPayload(int ReportCount, int TotalStations, int ActiveStations, int PlateChanges, int TotalCaught, decimal ActivityRate, string TrendDirection, IReadOnlyList<TrendPeriodPayload> Periods, IReadOnlyList<PestTotalPayload> PestTotals);
    public sealed record RiskHotspotPayload(string Location, string PestCategory, int Severity, int Likelihood, int Score, string Level, string? Note, string? MatchedElementId, decimal? X, decimal? Y, decimal? Width, decimal? Height);
    public sealed record SitePlanRiskMapPayload(Guid Id, string Number, string Title, string AreaName, int Revision, SitePlanCanvasInput Canvas, IReadOnlyList<RiskHotspotPayload> Hotspots);
    private sealed record RiskAnalysisPayload(int StructuralRiskScore, int MatrixRiskScore, int WeatherRiskScore, int OverallRiskScore, string RiskLevel, string? SectorType, string? CurrentFrequency, string RecommendedFrequency, IReadOnlyList<RiskAnswerInput> Answers, IReadOnlyList<RiskMatrixInput> RiskMatrix, LocationWeatherRiskResponse? Weather, IReadOnlyList<string> GeneratedRecommendations, string Disclaimer, SitePlanRiskMapPayload? SitePlan = null);
}
