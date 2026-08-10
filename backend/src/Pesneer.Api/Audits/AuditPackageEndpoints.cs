using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Commercial;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Quality;

namespace Pesneer.Api.Audits;

public static class AuditPackageEndpoints
{
    private const long MaximumPackageSourceSize = 150L * 1024 * 1024;
    private static readonly TimeSpan TurkeyOffset = TimeSpan.FromHours(3);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly HashSet<string> Profiles = new(StringComparer.OrdinalIgnoreCase)
    {
        "BRCGS", "IFS", "FSSC 22000", "ISO 22000", "EN 16636", "Kurumsal"
    };
    private static readonly IReadOnlyDictionary<string, string> SectionLabels = new Dictionary<string, string>
    {
        ["contracts"] = "Sözleşme ve hizmet planı",
        ["qualifications"] = "Firma, personel ve yetkinlik belgeleri",
        ["site-plans"] = "Kroki ve istasyon listesi",
        ["service-reports"] = "Saha uygulama raporları",
        ["product-safety"] = "Kullanılan ürünler ve GBF belgeleri",
        ["analyses"] = "Trend ve risk analizleri",
        ["corrective-actions"] = "Düzeltici faaliyetler",
        ["quality-controls"] = "Kalite kontrol kayıtları",
        ["waste"] = "Atık ve bertaraf kayıtları"
    };

    public static IEndpointRouteBuilder MapAuditPackageEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/audit-packages").RequireAuthorization();
        shared.MapGet("/", GetPackagesAsync);
        shared.MapGet("/{packageId:guid}", GetPackageAsync);
        shared.MapGet("/{packageId:guid}/pdf", DownloadPdfAsync);
        shared.MapGet("/{packageId:guid}/zip", DownloadZipAsync);
        shared.MapGet("/{packageId:guid}/items/{itemId:guid}/download", DownloadItemAsync);

        var staff = app.MapGroup("/api/audit-packages").RequireAuthorization("CompanyStaff");
        staff.MapPost("/preflight", PreflightAsync);
        staff.MapPost("/", CreatePackageAsync);
        return app;
    }

    private static async Task<IResult> GetPackagesAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var packages = await AccessiblePackages(dbContext, context).AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.Items)
            .AsSplitQuery().ToListAsync(cancellationToken);
        return Results.Ok(packages.OrderByDescending(item => item.CreatedAt).Select(ToResponse).ToArray());
    }

    private static async Task<IResult> GetPackageAsync(Guid packageId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var package = await LoadAccessiblePackageAsync(packageId, dbContext, context, cancellationToken);
        return package is null ? Results.NotFound(new { message = "Denetim dosyası bulunamadı." }) : Results.Ok(ToResponse(package));
    }

    private static async Task<IResult> DownloadPdfAsync(Guid packageId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var package = await AccessiblePackages(dbContext, context).AsNoTracking().SingleOrDefaultAsync(item => item.Id == packageId, cancellationToken);
        return package is null
            ? Results.NotFound(new { message = "Denetim dosyası bulunamadı." })
            : Results.File(package.PdfData, "application/pdf", $"{package.Number}.pdf");
    }

    private static async Task<IResult> DownloadZipAsync(Guid packageId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var package = await AccessiblePackages(dbContext, context).AsNoTracking().SingleOrDefaultAsync(item => item.Id == packageId, cancellationToken);
        return package is null
            ? Results.NotFound(new { message = "Denetim dosyası bulunamadı." })
            : Results.File(package.ZipData, "application/zip", $"{package.Number}.zip");
    }

    private static async Task<IResult> DownloadItemAsync(Guid packageId, Guid itemId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!await AccessiblePackages(dbContext, context).AsNoTracking().AnyAsync(item => item.Id == packageId, cancellationToken))
            return Results.NotFound(new { message = "Denetim dosyası bulunamadı." });
        var item = await dbContext.AuditPackageItems.AsNoTracking().SingleOrDefaultAsync(value => value.Id == itemId && value.AuditPackageId == packageId, cancellationToken);
        return item is null
            ? Results.NotFound(new { message = "Kanıt dosyası bulunamadı." })
            : Results.File(item.FileData, item.ContentType, item.FileName);
    }

    private static async Task<IResult> PreflightAsync(AuditPackageFilterRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var validation = Validate(request);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();
        var snapshot = await BuildSnapshotAsync(request, dbContext, context, cancellationToken);
        return Results.Ok(snapshot.Preflight);
    }

    private static async Task<IResult> CreatePackageAsync(CreateAuditPackageRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        var filter = new AuditPackageFilterRequest(request.CustomerId, request.BranchId, request.PeriodStart, request.PeriodEnd, request.AuditProfile, request.IncludeOptionalWaste);
        var validation = Validate(filter);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var snapshot = await BuildSnapshotAsync(filter, dbContext, context, cancellationToken);
        if (snapshot.Preflight.EstimatedSizeBytes > MaximumPackageSourceSize)
            return Results.Problem("Denetim paketinin kaynak dosyaları 150 MB sınırını aşıyor. Tarih aralığını daraltın veya gereksiz ekleri arşivden ayırın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        if (snapshot.Preflight.BlockingIssueCount > 0 && !request.AcknowledgeWarnings)
            return Results.Conflict(new { message = "Kritik ön kontrol bulguları var. Bulguları inceleyip eksikli paket oluşturmayı onaylayın.", preflight = snapshot.Preflight });

        var now = DateTimeOffset.UtcNow;
        var number = $"DNT-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
        var title = $"{snapshot.Customer.LegalName} - {snapshot.Branch?.Name ?? "Genel"} {filter.AuditProfile} Denetim Dosyası";
        var manifest = new AuditManifest(
            number, filter.AuditProfile, snapshot.Company.Id, snapshot.Company.LegalName,
            snapshot.Customer.Id, snapshot.Customer.LegalName, snapshot.Branch?.Id, snapshot.Branch?.Name ?? "Merkez / Genel",
            filter.PeriodStart, filter.PeriodEnd, snapshot.Preflight.ReadinessScore, now,
            snapshot.Evidence.Select(ToManifestEntry).ToArray());
        var manifestJson = JsonSerializer.Serialize(manifest, JsonOptions);
        var preflightJson = JsonSerializer.Serialize(snapshot.Preflight, JsonOptions);
        var pdfData = AuditPackageRenderer.RenderPackage(number, now, snapshot);
        var zipData = BuildZip(number, pdfData, manifestJson, snapshot.Evidence);
        var qualityDocument = new QualityDocument
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            CreatedByAccountId = context.AccountId.Value, Category = "AuditPackages", Title = title,
            Description = $"{filter.AuditProfile} · {filter.PeriodStart:dd.MM.yyyy}-{filter.PeriodEnd:dd.MM.yyyy} · Hazırlık %{snapshot.Preflight.ReadinessScore}",
            FileName = $"{number}.pdf", ContentType = "application/pdf", SizeBytes = pdfData.LongLength, FileData = pdfData, CreatedAt = now
        };
        var package = new AuditPackage
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            CreatedByAccountId = context.AccountId.Value, QualityDocumentId = qualityDocument.Id, Number = number, Title = title,
            AuditProfile = filter.AuditProfile, Status = snapshot.Preflight.BlockingIssueCount == 0 ? "Generated" : "GeneratedWithFindings",
            PeriodStart = filter.PeriodStart, PeriodEnd = filter.PeriodEnd, IncludeOptionalWaste = filter.IncludeOptionalWaste,
            ReadinessScore = snapshot.Preflight.ReadinessScore, PreflightJson = preflightJson, ManifestJson = manifestJson,
            PdfData = pdfData, ZipData = zipData, PdfSha256 = Hash(pdfData), ZipSha256 = Hash(zipData), CreatedAt = now,
            Items = snapshot.Evidence.Select(item => new AuditPackageItem
            {
                Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, Section = item.Section, SourceType = item.SourceType,
                SourceId = item.SourceId, DocumentNumber = item.DocumentNumber, Title = item.Title, FileName = item.FileName,
                ContentType = item.ContentType, Revision = item.Revision, Scope = item.Scope, SourceDate = item.SourceDate,
                Sha256 = item.Sha256, FileData = item.Data, CreatedAt = now
            }).ToList()
        };
        dbContext.QualityDocuments.Add(qualityDocument);
        dbContext.AuditPackages.Add(package);
        await dbContext.SaveChangesAsync(cancellationToken);
        var loaded = await LoadAccessiblePackageAsync(package.Id, dbContext, context, cancellationToken);
        return Results.Created($"/api/audit-packages/{package.Id}", ToResponse(loaded!));
    }

    private static async Task<AuditBuildSnapshot> BuildSnapshotAsync(AuditPackageFilterRequest filter, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId, cancellationToken);
        var customer = await dbContext.Customers.AsNoTracking().SingleAsync(item => item.Id == filter.CustomerId, cancellationToken);
        var branch = filter.BranchId.HasValue
            ? await dbContext.CustomerBranches.AsNoTracking().SingleAsync(item => item.Id == filter.BranchId.Value, cancellationToken)
            : null;
        var creator = await dbContext.Accounts.AsNoTracking().SingleAsync(item => item.Id == context.AccountId, cancellationToken);
        var rangeStart = new DateTimeOffset(filter.PeriodStart.ToDateTime(TimeOnly.MinValue), TurkeyOffset);
        var rangeEnd = new DateTimeOffset(filter.PeriodEnd.AddDays(1).ToDateTime(TimeOnly.MinValue), TurkeyOffset);

        var contracts = await dbContext.CustomerContracts.AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch)
            .Include(item => item.ServicePlans).ThenInclude(item => item.CustomerBranch)
            .Where(item => item.CustomerId == filter.CustomerId && item.Status != "Cancelled" && item.StartDate <= filter.PeriodEnd && item.EndDate >= filter.PeriodStart
                && (!filter.BranchId.HasValue || !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value))
            .AsSplitQuery().OrderByDescending(item => item.StartDate).ToListAsync(cancellationToken);

        var reportQuery = dbContext.ServiceReports.AsNoTracking()
            .Include(item => item.WorkOrder).ThenInclude(item => item.Customer)
            .Include(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
            .Include(item => item.WorkOrder).ThenInclude(item => item.Photos)
            .Include(item => item.CreatedByAccount).Include(item => item.Stations).Include(item => item.Products)
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == filter.CustomerId);
        if (filter.BranchId.HasValue) reportQuery = reportQuery.Where(item => item.WorkOrder.CustomerBranchId == filter.BranchId.Value);
        var reports = (await reportQuery.AsSplitQuery().ToListAsync(cancellationToken))
            .Where(item => item.WorkOrder.ScheduledAt >= rangeStart && item.WorkOrder.ScheduledAt < rangeEnd)
            .OrderBy(item => item.WorkOrder.ScheduledAt).ToList();

        var planQuery = dbContext.SitePlans.AsNoTracking().Include(item => item.Documents)
            .Where(item => item.CustomerId == filter.CustomerId);
        if (filter.BranchId.HasValue) planQuery = planQuery.Where(item => item.CustomerBranchId == filter.BranchId.Value);
        var plans = (await planQuery.ToListAsync(cancellationToken))
            .OrderByDescending(item => item.UpdatedAt).Take(filter.BranchId.HasValue ? 1 : 25).ToList();

        var analysisQuery = dbContext.QualityAnalyses.AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.Documents)
            .Where(item => item.CustomerId == filter.CustomerId && item.PeriodStart <= filter.PeriodEnd && item.PeriodEnd >= filter.PeriodStart);
        if (filter.BranchId.HasValue) analysisQuery = analysisQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
        var analyses = await analysisQuery
            .AsSplitQuery().OrderBy(item => item.PeriodEnd).ToListAsync(cancellationToken);

        var actionQuery = dbContext.CorrectiveActions.AsNoTracking().Include(item => item.Evidence)
            .Where(item => item.CustomerId == filter.CustomerId);
        if (filter.BranchId.HasValue) actionQuery = actionQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
        var actions = (await actionQuery.AsSplitQuery().ToListAsync(cancellationToken))
            .Where(item => item.CreatedAt < rangeEnd).OrderBy(item => item.DueDate).ToList();

        var reportIds = reports.Select(item => item.Id).ToArray();
        IReadOnlyList<QualityInspection> inspections = reportIds.Length == 0
            ? []
            : (await dbContext.QualityInspections.AsNoTracking().Where(item => reportIds.Contains(item.ServiceReportId)).ToListAsync(cancellationToken))
                .OrderBy(item => item.CreatedAt).ToList();

        IReadOnlyList<WasteDisposalRecord> waste = [];
        if (filter.IncludeOptionalWaste)
        {
            var wasteQuery = dbContext.WasteDisposalRecords.AsNoTracking().Include(item => item.Evidence)
                .Where(item => item.CustomerId == filter.CustomerId);
            if (filter.BranchId.HasValue) wasteQuery = wasteQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
            waste = (await wasteQuery.AsSplitQuery().ToListAsync(cancellationToken))
                .Where(item => item.GeneratedAt >= rangeStart && item.GeneratedAt < rangeEnd).OrderBy(item => item.GeneratedAt).ToList();
        }

        var documentQuery = dbContext.QualityDocuments.AsNoTracking()
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.Customer)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.CustomerBranch)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.CreatedByAccount)
            .Where(item => item.Category != "AuditPackages" && (!item.CustomerId.HasValue || item.CustomerId == filter.CustomerId));
        if (filter.BranchId.HasValue) documentQuery = documentQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
        var documents = (await documentQuery.AsSplitQuery().ToListAsync(cancellationToken))
            .Where(item => item.CreatedAt < rangeEnd).OrderByDescending(item => item.CreatedAt).Take(500).ToList();

        var evidence = BuildEvidence(company, customer, branch, contracts, reports, plans, analyses, actions, inspections, waste, documents);
        var preflight = BuildPreflight(filter, customer, branch, contracts, reports, plans, analyses, actions, inspections, waste, documents, evidence);
        return new AuditBuildSnapshot(company, customer, branch, creator, filter, preflight, evidence, contracts, reports, plans, analyses, actions, inspections, waste);
    }

    private static IReadOnlyList<AuditEvidenceFile> BuildEvidence(
        Company company,
        Customer customer,
        CustomerBranch? branch,
        IReadOnlyList<CustomerContract> contracts,
        IReadOnlyList<ServiceReport> reports,
        IReadOnlyList<SitePlan> plans,
        IReadOnlyList<QualityAnalysis> analyses,
        IReadOnlyList<CorrectiveAction> actions,
        IReadOnlyList<QualityInspection> inspections,
        IReadOnlyList<WasteDisposalRecord> waste,
        IReadOnlyList<QualityDocument> documents)
    {
        var evidence = new List<AuditEvidenceFile>();
        var includedDocuments = new HashSet<Guid>();

        foreach (var contract in contracts)
            AddEvidence(evidence, "contracts", "Contract", contract.Id, contract.Number, contract.Title, $"{contract.Number}.pdf", "application/pdf", null,
                contract.CustomerBranch?.Name ?? "Çatı müşteri / tüm şubeler", ToDateTimeOffset(contract.StartDate), CommercialPdfRenderer.Contract(contract, company));

        foreach (var document in documents.Where(item => item.Category == "Contracts"))
            AddDocument(evidence, includedDocuments, "contracts", document, company);

        foreach (var document in documents.Where(item => !item.CustomerId.HasValue && item.Category is "Certificates" or "General"))
            AddDocument(evidence, includedDocuments, "qualifications", document, company);

        foreach (var plan in plans)
        {
            var document = plan.Documents.OrderByDescending(item => item.CreatedAt).FirstOrDefault();
            if (document?.FileData is { Length: > 0 })
            {
                includedDocuments.Add(document.Id);
                AddEvidence(evidence, "site-plans", "SitePlan", plan.Id, plan.Number, plan.Title, document.FileName, document.ContentType,
                    $"Revizyon {plan.Revision}", plan.AreaName, plan.UpdatedAt, document.FileData);
            }
            AddEvidence(evidence, "site-plans", "StationList", plan.Id, plan.Number, $"{plan.Title} - istasyon veri seti", $"{plan.Number}-istasyon-listesi.json", "application/json",
                $"Revizyon {plan.Revision}", plan.AreaName, plan.UpdatedAt, Encoding.UTF8.GetBytes(plan.CanvasJson));
        }

        foreach (var report in reports)
        {
            AddEvidence(evidence, "service-reports", "ServiceReport", report.Id, report.ReportNumber, $"{report.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel"} saha raporu",
                $"{report.ReportNumber}.pdf", "application/pdf", null, report.WorkOrder.ServiceType, report.FinalizedAt ?? report.UpdatedAt, AuditPackageRenderer.RenderServiceReport(report, company));
            foreach (var photo in report.WorkOrder.Photos)
                AddEvidence(evidence, "service-reports", "WorkOrderPhoto", photo.Id, report.WorkOrder.Number, $"{report.WorkOrder.Number} saha fotoğrafı", photo.FileName,
                    photo.ContentType, null, report.WorkOrder.CustomerBranch?.Name ?? customer.LegalName, photo.UploadedAt, photo.Data);
        }

        var productNames = reports.SelectMany(item => item.Products).Select(item => item.ProductName).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (productNames.Length > 0)
        {
            var payload = reports.SelectMany(item => item.Products).GroupBy(item => item.ProductName, StringComparer.OrdinalIgnoreCase).Select(group => new
            {
                product = group.Key,
                amount = group.Sum(item => item.AmountUsed),
                unit = string.Join(", ", group.Select(item => item.Unit).Distinct()),
                licenseNumbers = group.Select(item => item.LicenseNumber).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct(),
                activeIngredients = group.Select(item => item.ActiveIngredient).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct()
            });
            AddJson(evidence, "product-safety", "ProductUsage", null, "URUN-KULLANIM", "Dönemsel ürün kullanım özeti", "urun-kullanim-ozeti.json",
                branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, payload);
        }

        foreach (var document in documents.Where(item => IsSafetyDocument(item, productNames)))
            AddDocument(evidence, includedDocuments, "product-safety", document, company);

        foreach (var analysis in analyses)
        {
            var document = analysis.Documents.FirstOrDefault();
            if (document is not null) AddDocument(evidence, includedDocuments, "analyses", document, company);
            else AddEvidence(evidence, "analyses", $"{analysis.AnalysisType}Analysis", analysis.Id, analysis.Number, analysis.Title, $"{analysis.Number}.pdf", "application/pdf",
                analysis.TemplateCode, analysis.CustomerBranch?.Name ?? "Genel", analysis.CreatedAt, QualityDocumentRenderer.Render(analysis, company.LegalName, company.LogoData));
        }

        if (actions.Count > 0)
        {
            AddJson(evidence, "corrective-actions", "CorrectiveActionRegister", null, "DÖF-LİSTE", "Düzeltici faaliyet izleme listesi", "duzeltici-faaliyetler.json",
                branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, actions.Select(item => new
                {
                    item.Number, item.Category, item.Title, item.Problem, item.RootCause, item.ProposedAction, item.ResponsibleParty,
                    item.Priority, item.Status, item.DueDate, item.CompletedAt, item.VerifiedAt, item.CustomerApprovalStatus, item.RecurrenceCount
                }));
            foreach (var action in actions)
                foreach (var file in action.Evidence)
                    AddEvidence(evidence, "corrective-actions", "CorrectiveActionEvidence", file.Id, action.Number, $"{action.Title} - {file.Stage}", file.FileName,
                        file.ContentType, null, action.Priority, file.CreatedAt, file.Data);
        }

        if (inspections.Count > 0)
            AddJson(evidence, "quality-controls", "QualityInspectionRegister", null, "KK-LİSTE", "Kalite kontrol ve ikinci kontrol listesi", "kalite-kontrolleri.json",
                branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, inspections.Select(item => new
                {
                    item.Number, item.InspectionType, item.SelectionReason, item.Status, item.ScheduledAt, item.InspectedAt,
                    item.PhotoQualityScore, item.StationCompletionScore, item.ProductDoseScore, item.SignatureScore,
                    item.TimelinessScore, item.ReportCompletenessScore, item.TotalScore, item.Grade, item.Findings, item.Notes
                }));

        if (waste.Count > 0)
        {
            AddJson(evidence, "waste", "WasteRegister", null, "ATIK-LİSTE", "Atık ve bertaraf izleme listesi", "atik-bertaraf-kayitlari.json",
                branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, waste.Select(item => new
                {
                    item.Number, item.WasteType, item.Quantity, item.Unit, item.Status, item.GeneratedAt, item.TemporaryStorage,
                    item.RecipientName, item.CarrierOrFacility, item.DisposalMethod, item.DocumentNumber, item.Notes
                }));
            foreach (var record in waste)
                foreach (var file in record.Evidence)
                    AddEvidence(evidence, "waste", "WasteEvidence", file.Id, record.Number, $"{record.Number} bertaraf kanıtı", file.FileName,
                        file.ContentType, null, record.DisposalMethod, file.CreatedAt, file.Data);
        }

        return evidence.OrderBy(item => Array.IndexOf(SectionLabels.Keys.ToArray(), item.Section)).ThenBy(item => item.SourceDate).ToArray();
    }

    private static AuditPreflightResponse BuildPreflight(
        AuditPackageFilterRequest filter,
        Customer customer,
        CustomerBranch? branch,
        IReadOnlyList<CustomerContract> contracts,
        IReadOnlyList<ServiceReport> reports,
        IReadOnlyList<SitePlan> plans,
        IReadOnlyList<QualityAnalysis> analyses,
        IReadOnlyList<CorrectiveAction> actions,
        IReadOnlyList<QualityInspection> inspections,
        IReadOnlyList<WasteDisposalRecord> waste,
        IReadOnlyList<QualityDocument> documents,
        IReadOnlyList<AuditEvidenceFile> evidence)
    {
        var issues = new List<AuditPreflightIssueResponse>();
        if (contracts.Count == 0) Blocking(issues, "CONTRACT_MISSING", "Geçerli sözleşme bulunmuyor", "Seçilen dönem ve lokasyonu kapsayan sözleşme kaydı yok.", "Sözleşme ve hizmet planını oluşturun veya dönemi kontrol edin.");
        if (reports.Count == 0) Blocking(issues, "REPORT_MISSING", "Saha raporu bulunmuyor", "Seçilen dönemde yayımlanmış saha uygulama raporu yok.", "Tamamlanan işleri imza ile yayımlayın.");
        var unsigned = reports.Count(item => string.IsNullOrWhiteSpace(item.ManagerSignatureData) || string.IsNullOrWhiteSpace(item.CustomerSignatureData));
        if (unsigned > 0) Blocking(issues, "REPORT_UNSIGNED", "İmzası eksik saha raporları var", $"{unsigned} raporda firma veya müşteri imzası eksik.", "Eksik imzaları tamamlayıp raporu yeniden yayımlayın.");
        if (plans.Count == 0) Blocking(issues, "SITE_PLAN_MISSING", "Güncel kroki bulunmuyor", "Lokasyona bağlı ekipman yerleşim planı bulunamadı.", "Kroki stüdyosundan plan yayımlayın.");
        else if (plans.Any(item => item.UpdatedAt < ToDateTimeOffset(filter.PeriodEnd.AddDays(-365)))) Warning(issues, "SITE_PLAN_STALE", "Kroki revizyonu eski", "En güncel yerleşim planının revizyon tarihi bir yıldan eski.", "Saha ile krokideki istasyonları karşılaştırıp revizyon yayınlayın.");

        var productNames = reports.SelectMany(item => item.Products).Select(item => item.ProductName).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (productNames.Length > 0 && !documents.Any(item => IsSafetyDocument(item, productNames)))
            Blocking(issues, "SDS_MISSING", "GBF / SDS belgesi eksik", $"{productNames.Length} kullanılan ürün için eşleşen güvenlik bilgi formu bulunamadı.", "Ürünlerin güncel GBF/SDS belgelerini Belge Arşivi'ne yükleyin.");
        if (!documents.Any(item => !item.CustomerId.HasValue && item.Category == "Certificates"))
            Warning(issues, "QUALIFICATION_MISSING", "Yetkinlik belgesi bulunmuyor", "Firma veya personel için eğitim, izin ya da yetkinlik belgesi bulunamadı.", "Geçerli sertifika ve eğitim kayıtlarını yükleyin.");
        if (!analyses.Any(item => item.AnalysisType == "Trend")) Warning(issues, "TREND_MISSING", "Trend analizi bulunmuyor", "Seçilen döneme ait trend analizi yok.", "Yayımlanmış saha raporlarından trend analizi oluşturun.");
        if (!analyses.Any(item => item.AnalysisType == "Risk")) Warning(issues, "RISK_MISSING", "Risk analizi bulunmuyor", "Seçilen dönem veya lokasyona ait risk analizi yok.", "Lokasyon bazlı risk değerlendirmesi oluşturun.");
        var criticalActions = actions.Count(item => item.Priority == "Critical" && item.Status is not "Verified" and not "Cancelled");
        var highActions = actions.Count(item => item.Priority == "High" && item.Status is not "Verified" and not "Cancelled");
        if (criticalActions > 0) Blocking(issues, "CRITICAL_ACTION_OPEN", "Kritik faaliyetler açık", $"{criticalActions} kritik düzeltici faaliyet henüz doğrulanmadı.", "Kök neden, uygulama kanıtı ve müşteri onayıyla faaliyetleri kapatın.");
        if (highActions > 0) Warning(issues, "HIGH_ACTION_OPEN", "Yüksek öncelikli faaliyetler açık", $"{highActions} yüksek öncelikli faaliyet izlenmeye devam ediyor.", "Termin ve sorumluları denetim öncesi gözden geçirin.");
        if (reports.Count > 0 && inspections.Count == 0) Warning(issues, "QUALITY_CONTROL_MISSING", "İkinci kontrol kaydı yok", "Dönemdeki saha raporları için kalite kontrol örneği bulunmuyor.", "Risk esaslı veya rastgele ikinci kontrol planlayın.");
        if (filter.IncludeOptionalWaste && waste.Count == 0) Warning(issues, "WASTE_EMPTY", "Atık kaydı bulunmuyor", "Opsiyonel atık ve bertaraf kapsamı seçildi ancak dönemde kayıt yok.", "Atık oluşmadıysa kapsam notu ekleyin; oluştuysa izlenebilir kayıt oluşturun.");
        if (evidence.Sum(item => item.Data.LongLength) > MaximumPackageSourceSize)
            Blocking(issues, "PACKAGE_TOO_LARGE", "Paket boyutu sınırı aşıyor", "Kaynak kanıtların toplam boyutu 150 MB sınırından büyük.", "Tarih aralığını daraltın veya gereksiz ekleri arşivden ayırın.");

        var blocking = issues.Count(item => item.Severity == "Blocking");
        var warnings = issues.Count(item => item.Severity == "Warning");
        var score = Math.Clamp(100 - blocking * 14 - warnings * 4, 0, 100);
        var findingSections = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["contracts"] = ["CONTRACT_MISSING"], ["qualifications"] = ["QUALIFICATION_MISSING"],
            ["site-plans"] = ["SITE_PLAN_MISSING", "SITE_PLAN_STALE"], ["service-reports"] = ["REPORT_MISSING", "REPORT_UNSIGNED"],
            ["product-safety"] = ["SDS_MISSING"], ["analyses"] = ["TREND_MISSING", "RISK_MISSING"],
            ["corrective-actions"] = ["CRITICAL_ACTION_OPEN", "HIGH_ACTION_OPEN"], ["quality-controls"] = ["QUALITY_CONTROL_MISSING"],
            ["waste"] = ["WASTE_EMPTY"]
        };
        var sections = SectionLabels.Select(pair =>
        {
            var count = evidence.Count(item => item.Section == pair.Key);
            var optional = pair.Key == "waste" && !filter.IncludeOptionalWaste;
            var hasFinding = findingSections[pair.Key].Any(code => issues.Any(issue => issue.Code == code));
            return new AuditSectionResponse(pair.Key, pair.Value, count, optional ? "Optional" : hasFinding ? "Finding" : "Complete");
        }).ToArray();
        return new AuditPreflightResponse(filter.CustomerId, customer.LegalName, branch?.Id, branch?.Name ?? "Merkez / Genel", filter.PeriodStart, filter.PeriodEnd,
            filter.AuditProfile, score, blocking == 0, blocking, warnings, evidence.Count, evidence.Sum(item => item.Data.LongLength), issues, sections);
    }

    private static void AddDocument(List<AuditEvidenceFile> evidence, HashSet<Guid> included, string section, QualityDocument document, Company company)
    {
        if (!included.Add(document.Id)) return;
        byte[]? data = document.FileData;
        var fileName = document.FileName;
        var contentType = document.ContentType;
        if (data is null && document.QualityAnalysis is not null)
        {
            data = QualityDocumentRenderer.Render(document.QualityAnalysis, company.LegalName, company.LogoData);
            fileName = Path.ChangeExtension(fileName, ".pdf");
            contentType = "application/pdf";
        }
        if (data is null || data.Length == 0) return;
        AddEvidence(evidence, section, "QualityDocument", document.Id, document.QualityAnalysis?.Number ?? document.Id.ToString("N")[..12].ToUpperInvariant(),
            document.Title, fileName, contentType, document.QualityAnalysis?.TemplateCode, document.CustomerBranch?.Name ?? document.Customer?.LegalName ?? "Firma içi",
            document.CreatedAt, data);
    }

    private static void AddJson(List<AuditEvidenceFile> evidence, string section, string sourceType, Guid? sourceId, string number, string title, string fileName, string? scope, DateTimeOffset sourceDate, object value)
        => AddEvidence(evidence, section, sourceType, sourceId, number, title, fileName, "application/json", null, scope, sourceDate, JsonSerializer.SerializeToUtf8Bytes(value, JsonOptions));

    private static void AddEvidence(List<AuditEvidenceFile> evidence, string section, string sourceType, Guid? sourceId, string number, string title, string fileName, string contentType, string? revision, string? scope, DateTimeOffset sourceDate, byte[] data)
    {
        if (data.Length == 0) return;
        evidence.Add(new AuditEvidenceFile(section, SectionLabels[section], sourceType, sourceId, number, title, SafeFileName(fileName), contentType, revision, scope, sourceDate, data, Hash(data)));
    }

    private static bool IsSafetyDocument(QualityDocument document, IReadOnlyCollection<string> productNames)
    {
        if (document.Category is not ("Certificates" or "General" or "Other")) return false;
        var haystack = $"{document.Title} {document.Description} {document.FileName}";
        if (ContainsAny(haystack, "gbf", "sds", "msds", "güvenlik bilgi", "safety data")) return true;
        return productNames.Any(product => product.Length >= 4 && haystack.Contains(product, StringComparison.OrdinalIgnoreCase));
    }

    private static byte[] BuildZip(string number, byte[] pdfData, string manifestJson, IReadOnlyList<AuditEvidenceFile> evidence)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true, Encoding.UTF8))
        {
            WriteEntry(archive, $"00_{number}.pdf", pdfData);
            WriteEntry(archive, "00_manifest.json", Encoding.UTF8.GetBytes(manifestJson));
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in evidence)
            {
                var folder = SafeFileName(item.SectionLabel);
                var baseName = $"{folder}/{SafeFileName(item.DocumentNumber)}_{SafeFileName(item.FileName)}";
                var name = baseName;
                var suffix = 2;
                while (!usedNames.Add(name)) name = $"{Path.GetDirectoryName(baseName)?.Replace('\\', '/')}/{Path.GetFileNameWithoutExtension(baseName)}_{suffix++}{Path.GetExtension(baseName)}";
                WriteEntry(archive, name, item.Data);
            }
        }
        return output.ToArray();
    }

    private static void WriteEntry(ZipArchive archive, string path, byte[] data)
    {
        var entry = archive.CreateEntry(path.Replace('\\', '/'), CompressionLevel.Optimal);
        using var stream = entry.Open();
        stream.Write(data);
    }

    private static IQueryable<AuditPackage> AccessiblePackages(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.AuditPackages.AsQueryable();
        if (context.Portal == PortalType.Customer)
            query = query.Where(item => item.CustomerId == context.CustomerId && (!context.CustomerBranchId.HasValue || !item.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId));
        else if (context.Portal == PortalType.Employee)
            query = query.Where(item => item.CreatedByAccountId == context.AccountId || dbContext.WorkOrders.Any(workOrder => workOrder.AssignedEmployeeAccountId == context.AccountId && workOrder.CustomerId == item.CustomerId && (!item.CustomerBranchId.HasValue || workOrder.CustomerBranchId == item.CustomerBranchId)));
        return query;
    }

    private static Task<AuditPackage?> LoadAccessiblePackageAsync(Guid id, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
        => AccessiblePackages(dbContext, context).AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.Items)
            .AsSplitQuery().SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

    private static async Task<bool> CanUseLocationAsync(Guid customerId, Guid? branchId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var exists = await dbContext.Customers.AsNoTracking().AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken)
            && (!branchId.HasValue || await dbContext.CustomerBranches.AsNoTracking().AnyAsync(item => item.Id == branchId.Value && item.CustomerId == customerId && item.IsActive, cancellationToken));
        if (!exists) return false;
        if (context.Portal == PortalType.Owner) return true;
        return context.AccountId.HasValue && await dbContext.WorkOrders.AsNoTracking().AnyAsync(item => item.AssignedEmployeeAccountId == context.AccountId.Value && item.CustomerId == customerId && (!branchId.HasValue || item.CustomerBranchId == branchId.Value), cancellationToken);
    }

    private static IResult? Validate(AuditPackageFilterRequest request)
    {
        if (request.PeriodEnd < request.PeriodStart) return Validation("periodEnd", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
        if (request.PeriodEnd.DayNumber - request.PeriodStart.DayNumber > 1095) return Validation("periodEnd", "Denetim dönemi en fazla 3 yıl olabilir.");
        if (!Profiles.Contains(request.AuditProfile)) return Validation("auditProfile", "Geçerli bir denetim profili seçin.");
        return null;
    }

    private static AuditPackageResponse ToResponse(AuditPackage item) => new(
        item.Id, item.Number, item.Title, item.AuditProfile, item.Status, item.CustomerId, item.Customer.LegalName,
        item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez / Genel", item.PeriodStart, item.PeriodEnd, item.IncludeOptionalWaste,
        item.ReadinessScore, item.Items.Count, item.CreatedByAccount.DisplayName, item.CreatedAt, item.PdfSha256, item.ZipSha256,
        $"/api/audit-packages/{item.Id}/pdf", $"/api/audit-packages/{item.Id}/zip",
        item.Items.OrderBy(value => value.Section).ThenBy(value => value.SourceDate).Select(value => new AuditPackageItemResponse(
            value.Id, value.Section, value.SourceType, value.SourceId, value.DocumentNumber, value.Title, value.FileName, value.ContentType,
            value.Revision, value.Scope, value.SourceDate, value.Sha256, value.FileData.LongLength,
            $"/api/audit-packages/{item.Id}/items/{value.Id}/download")).ToArray());

    private static AuditManifestEntry ToManifestEntry(AuditEvidenceFile item) => new(item.Section, item.SourceType, item.SourceId, item.DocumentNumber, item.Title, item.FileName,
        item.ContentType, item.Revision, item.Scope, item.SourceDate, item.Data.LongLength, item.Sha256);
    private static void Blocking(List<AuditPreflightIssueResponse> issues, string code, string title, string detail, string action) => issues.Add(new(code, "Blocking", title, detail, action));
    private static void Warning(List<AuditPreflightIssueResponse> issues, string code, string title, string detail, string action) => issues.Add(new(code, "Warning", title, detail, action));
    private static bool ContainsAny(string value, params string[] terms) => terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));
    private static string Hash(byte[] data) => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
    private static DateTimeOffset ToDateTimeOffset(DateOnly date) => new(date.ToDateTime(TimeOnly.MinValue), TurkeyOffset);
    private static string SafeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(value.Select(character => invalid.Contains(character) || character is '/' or '\\' ? '_' : character).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "belge" : cleaned[..Math.Min(cleaned.Length, 180)];
    }
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
