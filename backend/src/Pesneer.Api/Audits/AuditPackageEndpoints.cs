using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using Pesneer.Api.Commercial;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Quality;
using Pesneer.Api.Optimization;
using Pesneer.Api.Storage;

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
        app.MapGet("/api/v2/audit-packages", GetPackagePageAsync).RequireAuthorization();
        app.MapGet("/api/v2/audit-packages/{packageId:guid}", GetPackageAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetPackagePageAsync(
        int? limit,
        string? cursor,
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        var pageSize = CursorPaging.NormalizeLimit(limit);
        var hasCursor = CursorPaging.TryRead(cursor, out var position);
        if (!string.IsNullOrWhiteSpace(cursor) && !hasCursor)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["cursor"] = ["Sayfalama anahtarı geçerli değil."] });
        var snapshot = hasCursor ? position.Snapshot : DateTimeOffset.UtcNow;
        List<AuditPackageResponse> rows;
        if (dbContext.Database.IsNpgsql())
        {
            var query = AccessiblePackages(dbContext, context).Where(item => item.CreatedAt <= snapshot);
            if (hasCursor)
                query = query.Where(item => item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0));
            query = query.OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id).Take(pageSize + 1);
            rows = (await LoadPackageResponsesAsync(query, dbContext, cancellationToken)).ToList();
        }
        else
        {
            rows = (await LoadPackageResponsesAsync(AccessiblePackages(dbContext, context), dbContext, cancellationToken))
                .Where(item => item.CreatedAt <= snapshot && (!hasCursor || item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0)))
                .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
                .Take(pageSize + 1).ToList();
        }
        var hasMore = rows.Count > pageSize;
        if (hasMore) rows.RemoveAt(rows.Count - 1);
        var last = rows.LastOrDefault();
        var nextCursor = hasMore && last is not null ? CursorPaging.Write(snapshot, last.CreatedAt, last.Id) : null;
        return Results.Ok(new CursorPage<AuditPackageResponse>(rows, nextCursor, hasMore, snapshot.ToString("O")));
    }

    private static async Task<IResult> GetPackagesAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        var packages = await LoadPackageResponsesAsync(AccessiblePackages(dbContext, context), dbContext, cancellationToken);
        return Results.Ok(packages);
    }

    private static async Task<IResult> GetPackageAsync(Guid packageId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        var packages = await LoadPackageResponsesAsync(AccessiblePackages(dbContext, context).Where(item => item.Id == packageId), dbContext, cancellationToken);
        return packages.Count == 0 ? Results.NotFound(new { message = "Denetim dosyası bulunamadı." }) : Results.Ok(packages[0]);
    }

    private static async Task<IResult> DownloadPdfAsync(Guid packageId, HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, IHybridFileStorage hybridFiles, CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        var package = await AccessiblePackages(dbContext, context).AsNoTracking()
            .Where(item => item.Id == packageId)
            .Select(item => new
            {
                item.Id,
                item.CompanyId,
                item.PdfStoredObjectId,
                item.Number,
                item.PdfSha256,
                item.CreatedAt,
                HasPdfData = item.PdfData != null
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (package is null) return Results.NotFound(new { message = "Denetim dosyası bulunamadı." });
        var fileName = $"{package.Number}.pdf";
        var storedResult = await hybridFiles.TryReadAsync(
            package.CompanyId,
            package.PdfStoredObjectId,
            request,
            fileName,
            "application/pdf",
            package.CreatedAt,
            cancellationToken,
            storageRequired: !package.HasPdfData && package.PdfStoredObjectId.HasValue);
        if (storedResult is not null) return storedResult;
        var data = await dbContext.AuditPackages.AsNoTracking()
            .Where(item => item.Id == package.Id)
            .Select(item => item.PdfData)
            .SingleOrDefaultAsync(cancellationToken);
        if (data is null) return Results.NotFound(new { message = "Denetim PDF içeriği bulunamadı." });
        return PrivateFileResults.Exact(data, "application/pdf", fileName, package.CreatedAt, package.PdfSha256);
    }

    private static async Task<IResult> DownloadZipAsync(
        Guid packageId,
        HttpRequest request,
        PesneerDbContext dbContext,
        ICompanyContext context,
        IHybridFileStorage hybridFiles,
        CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        var package = await AccessiblePackages(dbContext, context).AsNoTracking()
            .Where(item => item.Id == packageId)
            .Select(item => new AuditZipDownload(
                item.Id, item.CompanyId, item.ZipStoredObjectId, item.ZipData != null,
                item.Number, item.ZipSha256, item.CreatedAt, item.ManifestJson,
                item.Customer.LegalName, item.CustomerBranch != null ? item.CustomerBranch.Name : null))
            .SingleOrDefaultAsync(cancellationToken);
        if (package is null)
            return Results.NotFound(new { message = "Denetim dosyası bulunamadı." });

        // Historical ZIP blobs may require the legacy one-time JSON-to-DOCX normalization. They
        // remain on the exact legacy path. Storage-only ZIPs are normalized before canonical upload.
        if (!package.HasZipData)
        {
            var storedResult = await hybridFiles.TryReadAsync(
                package.CompanyId,
                package.ZipStoredObjectId,
                request,
                $"{package.Number}.zip",
                "application/zip",
                package.CreatedAt,
                cancellationToken,
                storageRequired: package.ZipStoredObjectId.HasValue);
            if (storedResult is not null) return storedResult;
            return Results.NotFound(new { message = "Denetim ZIP içeriği bulunamadı." });
        }

        var rawZip = await dbContext.AuditPackages.AsNoTracking()
            .Where(item => item.Id == package.Id)
            .Select(item => item.ZipData)
            .SingleOrDefaultAsync(cancellationToken);
        if (rawZip is null) return Results.NotFound(new { message = "Denetim ZIP içeriği bulunamadı." });
        var sanitizedZip = EnsureNoJsonInZip(rawZip, package);
        return PrivateFileResults.Exact(sanitizedZip, "application/zip", $"{package.Number}.zip", package.CreatedAt, Hash(sanitizedZip));
    }

    private static async Task<IResult> DownloadItemAsync(Guid packageId, Guid itemId, HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, IHybridFileStorage hybridFiles, CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        if (!await AccessiblePackages(dbContext, context).AsNoTracking().AnyAsync(item => item.Id == packageId, cancellationToken))
            return Results.NotFound(new { message = "Denetim dosyası bulunamadı." });
        var item = await dbContext.AuditPackageItems.AsNoTracking()
            .Where(value => value.Id == itemId && value.AuditPackageId == packageId)
            .Select(value => new
            {
                value.Id,
                value.CompanyId,
                value.StoredObjectId,
                value.ContentType,
                value.FileName,
                value.Sha256,
                value.CreatedAt,
                HasFileData = value.FileData != null
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (item is null) return Results.NotFound(new { message = "Kanıt dosyası bulunamadı." });
        var storedResult = await hybridFiles.TryReadAsync(
            item.CompanyId,
            item.StoredObjectId,
            request,
            item.FileName,
            item.ContentType,
            item.CreatedAt,
            cancellationToken,
            storageRequired: !item.HasFileData && item.StoredObjectId.HasValue);
        if (storedResult is not null) return storedResult;
        var data = await dbContext.AuditPackageItems.AsNoTracking()
            .Where(value => value.Id == item.Id)
            .Select(value => value.FileData)
            .SingleOrDefaultAsync(cancellationToken);
        if (data is null) return Results.NotFound(new { message = "Kanıt dosyası içeriği bulunamadı." });
        return PrivateFileResults.Exact(data, item.ContentType, item.FileName, item.CreatedAt, item.Sha256);
    }

    private static async Task<IResult> PreflightAsync(
        AuditPackageFilterRequest request,
        PesneerDbContext dbContext,
        ICompanyContext context,
        IHybridFileStorage hybridFiles,
        CancellationToken cancellationToken)
    {
        if (HasMissingPortalIdentity(context)) return Results.Forbid();
        var validation = Validate(request);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();
        AuditBuildSnapshot snapshot;
        try
        {
            snapshot = await BuildSnapshotAsync(request, dbContext, context, hybridFiles, cancellationToken);
        }
        catch (RequiredFileStorageUnavailableException)
        {
            return RequiredStorageUnavailable();
        }
        return Results.Ok(snapshot.Preflight);
    }

    private static async Task<IResult> CreatePackageAsync(CreateAuditPackageRequest request, PesneerDbContext dbContext, ICompanyContext context, IHybridFileStorage hybridFiles, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        var filter = new AuditPackageFilterRequest(request.CustomerId, request.BranchId, request.PeriodStart, request.PeriodEnd, request.AuditProfile, request.IncludeOptionalWaste);
        var validation = Validate(filter);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        AuditBuildSnapshot snapshot;
        try
        {
            snapshot = await BuildSnapshotAsync(filter, dbContext, context, hybridFiles, cancellationToken);
        }
        catch (RequiredFileStorageUnavailableException)
        {
            return RequiredStorageUnavailable();
        }
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
        var rawZipData = BuildZip(number, pdfData, manifest, manifestJson, snapshot.Evidence);
        // New artifacts are normalized once before persistence. This is byte-equivalent to the
        // existing download contract and avoids re-building the ZIP on every future request.
        var zipData = EnsureNoJsonInZip(rawZipData, new AuditZipDownload(
            Guid.Empty,
            context.CompanyId.Value,
            null,
            true,
            number,
            Hash(rawZipData),
            now,
            manifestJson,
            snapshot.Customer.LegalName,
            snapshot.Branch?.Name));

        CanonicalStoredObject? pdfStoredObject = null;
        CanonicalStoredObject? zipStoredObject = null;
        var itemStoredObjects = new Dictionary<Guid, CanonicalStoredObject?>();
        var packageItems = snapshot.Evidence.Select(item => new AuditPackageItem
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, Section = item.Section, SourceType = item.SourceType,
            SourceId = item.SourceId, DocumentNumber = item.DocumentNumber, Title = item.Title, FileName = item.FileName,
            ContentType = item.ContentType, Revision = item.Revision, Scope = item.Scope, SourceDate = item.SourceDate,
            Sha256 = item.Sha256, FileData = item.Data, SizeBytes = item.Data.LongLength, CreatedAt = now
        }).ToList();

        if (dbContext.Database.IsNpgsql() && hybridFiles.CanUseStorageOnly(context.CompanyId.Value))
        {
            pdfStoredObject = await hybridFiles.StoreCanonicalAsync(
                context.CompanyId.Value, $"{number}.pdf", "application/pdf", pdfData, cancellationToken);
            zipStoredObject = await hybridFiles.StoreCanonicalAsync(
                context.CompanyId.Value, $"{number}.zip", "application/zip", zipData, cancellationToken);
            foreach (var pair in packageItems.Zip(snapshot.Evidence))
            {
                itemStoredObjects[pair.First.Id] = await hybridFiles.StoreCanonicalAsync(
                    context.CompanyId.Value,
                    pair.First.FileName,
                    pair.First.ContentType,
                    pair.Second.Data,
                    cancellationToken);
            }
        }

        var storageOnly = pdfStoredObject is not null && zipStoredObject is not null &&
            packageItems.All(item => itemStoredObjects.GetValueOrDefault(item.Id) is not null);
        foreach (var item in packageItems)
        {
            item.StoredObjectId = itemStoredObjects.GetValueOrDefault(item.Id)?.Id;
            if (storageOnly) item.FileData = null;
        }
        var qualityDocument = new QualityDocument
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            CreatedByAccountId = context.AccountId.Value, Category = "AuditPackages", Title = title,
            Description = $"{filter.AuditProfile} · {filter.PeriodStart:dd.MM.yyyy}-{filter.PeriodEnd:dd.MM.yyyy} · Hazırlık %{snapshot.Preflight.ReadinessScore}",
            FileName = $"{number}.pdf", ContentType = "application/pdf", SizeBytes = pdfData.LongLength,
            FileData = storageOnly ? null : pdfData, StoredObjectId = pdfStoredObject?.Id, CreatedAt = now
        };
        var package = new AuditPackage
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            CreatedByAccountId = context.AccountId.Value, QualityDocumentId = qualityDocument.Id, Number = number, Title = title,
            AuditProfile = filter.AuditProfile, Status = snapshot.Preflight.BlockingIssueCount == 0 ? "Generated" : "GeneratedWithFindings",
            PeriodStart = filter.PeriodStart, PeriodEnd = filter.PeriodEnd, IncludeOptionalWaste = filter.IncludeOptionalWaste,
            ReadinessScore = snapshot.Preflight.ReadinessScore, PreflightJson = preflightJson, ManifestJson = manifestJson,
            PdfData = storageOnly ? null : pdfData, ZipData = storageOnly ? null : zipData,
            PdfStoredObjectId = pdfStoredObject?.Id, ZipStoredObjectId = zipStoredObject?.Id,
            PdfSha256 = Hash(pdfData), ZipSha256 = Hash(zipData), CreatedAt = now,
            Items = packageItems
        };
        dbContext.QualityDocuments.Add(qualityDocument);
        dbContext.AuditPackages.Add(package);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (qualityDocument.FileData is { Length: > 0 } qualityDocumentData)
            await hybridFiles.TryDualWriteAsync(
                HybridFileResourceKind.QualityDocument,
                qualityDocument.CompanyId,
                qualityDocument.Id,
                qualityDocument.FileName,
                qualityDocument.ContentType,
                qualityDocumentData,
                cancellationToken);
        if (package.PdfData is { Length: > 0 } packagePdfData)
            await hybridFiles.TryDualWriteAsync(
                HybridFileResourceKind.AuditPackagePdf,
                package.CompanyId,
                package.Id,
                $"{package.Number}.pdf",
                "application/pdf",
                packagePdfData,
                cancellationToken);
        if (package.ZipData is { Length: > 0 } packageZipData)
            await hybridFiles.TryDualWriteAsync(
                HybridFileResourceKind.AuditPackageZip,
                package.CompanyId,
                package.Id,
                $"{package.Number}.zip",
                "application/zip",
                packageZipData,
                cancellationToken);
        await Parallel.ForEachAsync(
            package.Items.Where(item => item.FileData is { Length: > 0 }),
            new ParallelOptions { MaxDegreeOfParallelism = 3, CancellationToken = cancellationToken },
            (item, token) => new ValueTask(hybridFiles.TryDualWriteAsync(
                HybridFileResourceKind.AuditPackageItem,
                item.CompanyId,
                item.Id,
                item.FileName,
                item.ContentType,
                item.FileData!,
                token)));
        var loaded = await LoadPackageResponsesAsync(AccessiblePackages(dbContext, context).Where(item => item.Id == package.Id), dbContext, cancellationToken);
        return Results.Created($"/api/audit-packages/{package.Id}", loaded[0]);
    }

    private static async Task<AuditBuildSnapshot> BuildSnapshotAsync(
        AuditPackageFilterRequest filter,
        PesneerDbContext dbContext,
        ICompanyContext context,
        IHybridFileStorage hybridFiles,
        CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId, cancellationToken);
        var customer = await dbContext.Customers.AsNoTracking().SingleAsync(item => item.Id == filter.CustomerId, cancellationToken);
        var branch = filter.BranchId.HasValue
            ? await dbContext.CustomerBranches.AsNoTracking().SingleAsync(item => item.Id == filter.BranchId.Value, cancellationToken)
            : null;
        var creator = await dbContext.Accounts.AsNoTracking().SingleAsync(item => item.Id == context.AccountId, cancellationToken);
        var rangeStart = new DateTimeOffset(filter.PeriodStart.ToDateTime(TimeOnly.MinValue), TurkeyOffset).ToUniversalTime();
        var rangeEnd = new DateTimeOffset(filter.PeriodEnd.AddDays(1).ToDateTime(TimeOnly.MinValue), TurkeyOffset).ToUniversalTime();

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
        var reports = dbContext.Database.IsNpgsql()
            ? await reportQuery.Where(item => item.WorkOrder.ScheduledAt >= rangeStart && item.WorkOrder.ScheduledAt < rangeEnd)
                .AsSplitQuery().OrderBy(item => item.WorkOrder.ScheduledAt).ToListAsync(cancellationToken)
            : (await reportQuery.AsSplitQuery().ToListAsync(cancellationToken))
                .Where(item => item.WorkOrder.ScheduledAt >= rangeStart && item.WorkOrder.ScheduledAt < rangeEnd)
                .OrderBy(item => item.WorkOrder.ScheduledAt).ToList();

        var planQuery = dbContext.SitePlans.AsNoTracking().Include(item => item.Documents)
            .Where(item => item.CustomerId == filter.CustomerId);
        if (filter.BranchId.HasValue) planQuery = planQuery.Where(item => item.CustomerBranchId == filter.BranchId.Value);
        var planLimit = filter.BranchId.HasValue ? 1 : 25;
        var plans = dbContext.Database.IsNpgsql()
            ? await planQuery.OrderByDescending(item => item.UpdatedAt).Take(planLimit).ToListAsync(cancellationToken)
            : (await planQuery.ToListAsync(cancellationToken)).OrderByDescending(item => item.UpdatedAt).Take(planLimit).ToList();

        var analysisQuery = dbContext.QualityAnalyses.AsNoTracking()
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount).Include(item => item.Documents)
            .Where(item => item.CustomerId == filter.CustomerId && item.PeriodStart <= filter.PeriodEnd && item.PeriodEnd >= filter.PeriodStart);
        if (filter.BranchId.HasValue) analysisQuery = analysisQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
        var analyses = await analysisQuery
            .AsSplitQuery().OrderBy(item => item.PeriodEnd).ToListAsync(cancellationToken);

        var actionQuery = dbContext.CorrectiveActions.AsNoTracking().Include(item => item.Evidence)
            .Where(item => item.CustomerId == filter.CustomerId);
        if (filter.BranchId.HasValue) actionQuery = actionQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
        var actions = dbContext.Database.IsNpgsql()
            ? await actionQuery.Where(item => item.CreatedAt < rangeEnd).AsSplitQuery().OrderBy(item => item.DueDate).ToListAsync(cancellationToken)
            : (await actionQuery.AsSplitQuery().ToListAsync(cancellationToken)).Where(item => item.CreatedAt < rangeEnd).OrderBy(item => item.DueDate).ToList();

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
            waste = dbContext.Database.IsNpgsql()
                ? await wasteQuery.Where(item => item.GeneratedAt >= rangeStart && item.GeneratedAt < rangeEnd)
                    .AsSplitQuery().OrderBy(item => item.GeneratedAt).ToListAsync(cancellationToken)
                : (await wasteQuery.AsSplitQuery().ToListAsync(cancellationToken))
                    .Where(item => item.GeneratedAt >= rangeStart && item.GeneratedAt < rangeEnd).OrderBy(item => item.GeneratedAt).ToList();
        }

        var documentQuery = dbContext.QualityDocuments.AsNoTracking()
            .Include(item => item.InventoryItem)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.Customer)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.CustomerBranch)
            .Include(item => item.QualityAnalysis).ThenInclude(item => item!.CreatedByAccount)
            .Where(item => item.Category != "AuditPackages" && (!item.CustomerId.HasValue || item.CustomerId == filter.CustomerId));
        if (filter.BranchId.HasValue) documentQuery = documentQuery.Where(item => !item.CustomerBranchId.HasValue || item.CustomerBranchId == filter.BranchId.Value);
        var documents = dbContext.Database.IsNpgsql()
            ? await documentQuery.Where(item => item.CreatedAt < rangeEnd).AsSplitQuery().OrderByDescending(item => item.CreatedAt).Take(500).ToListAsync(cancellationToken)
            : (await documentQuery.AsSplitQuery().ToListAsync(cancellationToken))
                .Where(item => item.CreatedAt < rangeEnd).OrderByDescending(item => item.CreatedAt).Take(500).ToList();

        await HydrateStoredQualityDocumentsAsync(
            documents
                .Concat(plans.SelectMany(item => item.Documents))
                .Concat(analyses.SelectMany(item => item.Documents)),
            company.Id,
            hybridFiles,
            cancellationToken);

        var evidence = BuildEvidence(company, customer, branch, filter, contracts, reports, plans, analyses, actions, inspections, waste, documents);
        var preflight = BuildPreflight(filter, customer, branch, contracts, reports, plans, analyses, actions, inspections, waste, documents, evidence);
        return new AuditBuildSnapshot(company, customer, branch, creator, filter, preflight, evidence, contracts, reports, plans, analyses, actions, inspections, waste);
    }

    private static async Task HydrateStoredQualityDocumentsAsync(
        IEnumerable<QualityDocument> source,
        Guid companyId,
        IHybridFileStorage hybridFiles,
        CancellationToken cancellationToken)
    {
        foreach (var group in source
                     .Where(item => item.FileData is null && item.StoredObjectId.HasValue)
                     .GroupBy(item => item.Id))
        {
            var first = group.First();
            var data = await hybridFiles.TryReadBytesAsync(
                companyId,
                first.StoredObjectId,
                15L * 1024 * 1024,
                cancellationToken);
            if (data is null) throw new RequiredFileStorageUnavailableException();
            foreach (var document in group) document.FileData = data;
        }
    }

    private static IReadOnlyList<AuditEvidenceFile> BuildEvidence(
        Company company,
        Customer customer,
        CustomerBranch? branch,
        AuditPackageFilterRequest filter,
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

        foreach (var document in documents.Where(item => !item.CustomerId.HasValue && item.Category is "Certificates" or "Licenses" or "General"))
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
            var stationDocx = AuditDocxHelper.CreateStationListDocx(plan, company.LegalName, customer.LegalName, plan.AreaName);
            AddEvidence(evidence, "site-plans", "StationList", plan.Id, plan.Number, $"{plan.Title} - İstasyon Yerleşim Listesi", $"{plan.Number}-İstasyon-Listesi.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                $"Revizyon {plan.Revision}", plan.AreaName, plan.UpdatedAt, stationDocx);
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
            var productItems = reports.SelectMany(item => item.Products).GroupBy(item => item.ProductName, StringComparer.OrdinalIgnoreCase).Select(group => (
                Product: group.Key,
                Amount: group.Sum(item => item.AmountUsed),
                Unit: string.Join(", ", group.Select(item => item.Unit).Distinct()),
                License: string.Join(", ", group.Select(item => item.LicenseNumber).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct()),
                ActiveIngredient: string.Join(", ", group.Select(item => item.ActiveIngredient).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct())
            )).ToArray();
            var productDocx = AuditDocxHelper.CreateProductUsageDocx(company.LegalName, customer.LegalName, branch?.Name, filter.PeriodStart, filter.PeriodEnd, productItems);
            AddEvidence(evidence, "product-safety", "ProductUsage", null, "URUN-KULLANIM", "Dönemsel Ürün Kullanım Özeti", "Dönemsel-Ürün-Kullanım-Özeti.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", null, branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, productDocx);
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
            var actionsDocx = AuditDocxHelper.CreateCorrectiveActionsDocx(company.LegalName, customer.LegalName, branch?.Name, filter.PeriodStart, filter.PeriodEnd, actions);
            AddEvidence(evidence, "corrective-actions", "CorrectiveActionRegister", null, "DÖF-LİSTE", "Düzeltici ve Önleyici Faaliyetler (DÖF) Listesi", "Düzeltici-Faaliyetler-Listesi.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", null, branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, actionsDocx);
            foreach (var action in actions)
                foreach (var file in action.Evidence)
                    AddEvidence(evidence, "corrective-actions", "CorrectiveActionEvidence", file.Id, action.Number, $"{action.Title} - {file.Stage}", file.FileName,
                        file.ContentType, null, action.Priority, file.CreatedAt, file.Data);
        }

        if (inspections.Count > 0)
        {
            var inspectionsDocx = AuditDocxHelper.CreateQualityInspectionsDocx(company.LegalName, customer.LegalName, branch?.Name, filter.PeriodStart, filter.PeriodEnd, inspections);
            AddEvidence(evidence, "quality-controls", "QualityInspectionRegister", null, "KK-LİSTE", "Kalite Kontrol ve İç Denetim Kayıtları", "Kalite-Kontrolleri-Listesi.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", null, branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, inspectionsDocx);
        }

        if (waste.Count > 0)
        {
            var wasteDocx = AuditDocxHelper.CreateWasteRecordsDocx(company.LegalName, customer.LegalName, branch?.Name, filter.PeriodStart, filter.PeriodEnd, waste);
            AddEvidence(evidence, "waste", "WasteRegister", null, "ATIK-LİSTE", "Atık ve Bertaraf İzleme Listesi", "Atık-ve-Bertaraf-Kayıtları.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", null, branch?.Name ?? customer.LegalName, DateTimeOffset.UtcNow, wasteDocx);
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
        if (!documents.Any(item => !item.CustomerId.HasValue && item.Category is "Certificates" or "Licenses"))
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
        if (document.Category == "SafetyDataSheets")
            return !document.InventoryItemId.HasValue || productNames.Any(product => string.Equals(product, document.InventoryItem?.Name, StringComparison.OrdinalIgnoreCase));
        if (document.Category is not ("Certificates" or "Licenses" or "General" or "Other")) return false;
        var haystack = $"{document.Title} {document.Description} {document.FileName}";
        if (ContainsAny(haystack, "gbf", "sds", "msds", "güvenlik bilgi", "safety data")) return true;
        return productNames.Any(product => product.Length >= 4 && haystack.Contains(product, StringComparison.OrdinalIgnoreCase));
    }

    private static byte[] BuildZip(string number, byte[] pdfData, AuditManifest manifest, string manifestJson, IReadOnlyList<AuditEvidenceFile> evidence)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true, Encoding.UTF8))
        {
            WriteEntry(archive, $"00_{number}.pdf", pdfData);
            WriteEntry(archive, "00_DENETIM_DOSYASI_OZETI.docx", AuditDocxHelper.CreateManifestSummaryDocx(manifest, evidence));
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

    private static byte[] EnsureNoJsonInZip(byte[] rawZip, AuditZipDownload package)
    {
        try
        {
            using var inputStream = new MemoryStream(rawZip);
            using var inArchive = new ZipArchive(inputStream, ZipArchiveMode.Read);

            var hasJson = inArchive.Entries.Any(e => e.FullName.EndsWith(".json", StringComparison.OrdinalIgnoreCase));
            if (!hasJson) return rawZip;

            using var outputStream = new MemoryStream();
            using (var outArchive = new ZipArchive(outputStream, ZipArchiveMode.Create, true, Encoding.UTF8))
            {
                AuditManifest? manifest = null;
                if (!string.IsNullOrWhiteSpace(package.ManifestJson))
                {
                    try { manifest = JsonSerializer.Deserialize<AuditManifest>(package.ManifestJson, JsonOptions); } catch { }
                }

                var hasWordDoc = inArchive.Entries.Any(e => e.FullName.EndsWith(".docx", StringComparison.OrdinalIgnoreCase));
                if (!hasWordDoc && manifest is not null)
                {
                    var summaryDocx = AuditDocxHelper.CreateManifestSummaryDocx(manifest, []);
                    WriteEntry(outArchive, "00_DENETIM_DOSYASI_OZETI.docx", summaryDocx);
                }

                foreach (var entry in inArchive.Entries)
                {
                    if (entry.FullName.Equals("00_manifest.json", StringComparison.OrdinalIgnoreCase) ||
                        entry.FullName.EndsWith("/00_manifest.json", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    using var entryStream = entry.Open();
                    using var ms = new MemoryStream();
                    entryStream.CopyTo(ms);
                    var entryData = ms.ToArray();

                    if (entry.FullName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                    {
                        var jsonText = Encoding.UTF8.GetString(entryData);
                        var docxData = AuditDocxHelper.CreateGenericJsonDocx(
                            Path.GetFileName(entry.FullName),
                            jsonText,
                            package.CustomerName,
                            package.CustomerName,
                            package.BranchName
                        );

                        var dir = Path.GetDirectoryName(entry.FullName)?.Replace('\\', '/');
                        var fileNameWithoutExt = Path.GetFileNameWithoutExtension(entry.FullName);
                        var newPath = string.IsNullOrEmpty(dir)
                            ? $"{fileNameWithoutExt}.docx"
                            : $"{dir}/{fileNameWithoutExt}.docx";

                        WriteEntry(outArchive, newPath, docxData);
                    }
                    else
                    {
                        WriteEntry(outArchive, entry.FullName, entryData);
                    }
                }
            }
            return outputStream.ToArray();
        }
        catch
        {
            return rawZip;
        }
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
            query = query.Where(item => item.CreatedByAccountId == context.AccountId || dbContext.WorkOrders.Any(workOrder =>
                (workOrder.AssignedEmployeeAccountId == context.AccountId || workOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId)) &&
                workOrder.CustomerId == item.CustomerId &&
                (!item.CustomerBranchId.HasValue || workOrder.CustomerBranchId == item.CustomerBranchId)));
        return query;
    }

    private static bool HasMissingPortalIdentity(ICompanyContext context) => context.Portal switch
    {
        PortalType.Employee => !context.AccountId.HasValue,
        PortalType.Customer => !context.CustomerId.HasValue,
        PortalType.Owner => !context.CompanyId.HasValue || !context.AccountId.HasValue,
        _ => true
    };

    private static async Task<IReadOnlyList<AuditPackageResponse>> LoadPackageResponsesAsync(
        IQueryable<AuditPackage> query,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var metadataQuery = query.AsNoTracking().Select(item => new AuditPackageMetadata(
                item.Id, item.Number, item.Title, item.AuditProfile, item.Status, item.CustomerId, item.Customer.LegalName,
                item.CustomerBranchId, item.CustomerBranch != null ? item.CustomerBranch.Name : "Merkez / Genel",
                item.PeriodStart, item.PeriodEnd, item.IncludeOptionalWaste, item.ReadinessScore, item.Items.Count,
                item.CreatedByAccount.DisplayName, item.CreatedAt, item.PdfSha256, item.ZipSha256));
        var packages = dbContext.Database.IsNpgsql()
            ? await metadataQuery.OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id).ToListAsync(cancellationToken)
            : (await metadataQuery.ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id).ToList();
        if (packages.Count == 0) return [];

        var packageIds = packages.Select(item => item.Id).ToArray();
        var items = await dbContext.AuditPackageItems.AsNoTracking()
            .Where(item => packageIds.Contains(item.AuditPackageId))
            .OrderBy(item => item.Section).ThenBy(item => item.SourceDate)
            .Select(item => new AuditItemMetadata(
                item.AuditPackageId, item.Id, item.Section, item.SourceType, item.SourceId, item.DocumentNumber,
                item.Title, item.FileName, item.ContentType, item.Revision, item.Scope, item.SourceDate,
                item.Sha256, item.SizeBytes ?? (item.FileData != null ? (long)item.FileData.Length : 0L)))
            .ToListAsync(cancellationToken);
        var itemsByPackage = items.GroupBy(item => item.AuditPackageId).ToDictionary(group => group.Key, group => group.ToArray());

        return packages.Select(item => new AuditPackageResponse(
            item.Id, item.Number, item.Title, item.AuditProfile, item.Status, item.CustomerId, item.CustomerName,
            item.BranchId, item.BranchName, item.PeriodStart, item.PeriodEnd, item.IncludeOptionalWaste,
            item.ReadinessScore, item.ItemCount, item.CreatedBy, item.CreatedAt, item.PdfSha256, item.ZipSha256,
            $"/api/audit-packages/{item.Id}/pdf", $"/api/audit-packages/{item.Id}/zip",
            itemsByPackage.GetValueOrDefault(item.Id, []).Select(value => new AuditPackageItemResponse(
                value.Id, value.Section, value.SourceType, value.SourceId, value.DocumentNumber, value.Title,
                value.FileName, value.ContentType, value.Revision, value.Scope, value.SourceDate, value.Sha256,
                value.SizeBytes, $"/api/audit-packages/{item.Id}/items/{value.Id}/download")).ToArray())).ToArray();
    }

    private static async Task<bool> CanUseLocationAsync(Guid customerId, Guid? branchId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var exists = await dbContext.Customers.AsNoTracking().AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken)
            && (!branchId.HasValue || await dbContext.CustomerBranches.AsNoTracking().AnyAsync(item => item.Id == branchId.Value && item.CustomerId == customerId && item.IsActive, cancellationToken));
        if (!exists) return false;
        if (context.Portal == PortalType.Owner) return true;
        return context.AccountId.HasValue && await dbContext.WorkOrders.AsNoTracking().AnyAsync(item =>
            (item.AssignedEmployeeAccountId == context.AccountId.Value || item.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId.Value)) &&
            item.CustomerId == customerId &&
            (!branchId.HasValue || item.CustomerBranchId == branchId.Value), cancellationToken);
    }

    private static IResult? Validate(AuditPackageFilterRequest request)
    {
        if (request.PeriodEnd < request.PeriodStart) return Validation("periodEnd", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
        if (request.PeriodEnd.DayNumber - request.PeriodStart.DayNumber > 1095) return Validation("periodEnd", "Denetim dönemi en fazla 3 yıl olabilir.");
        if (!Profiles.Contains(request.AuditProfile)) return Validation("auditProfile", "Geçerli bir denetim profili seçin.");
        return null;
    }

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
    private static IResult RequiredStorageUnavailable() => Results.Problem(
        title: "Denetim kanıtı geçici olarak kullanılamıyor.",
        detail: "Storage-only bir kanıt doğrulanmış depolama alanından okunamadı; paket oluşturulmadı.",
        statusCode: StatusCodes.Status503ServiceUnavailable);

    private sealed record AuditPackageMetadata(
        Guid Id, string Number, string Title, string AuditProfile, string Status, Guid CustomerId, string CustomerName,
        Guid? BranchId, string BranchName, DateOnly PeriodStart, DateOnly PeriodEnd, bool IncludeOptionalWaste,
        int ReadinessScore, int ItemCount, string CreatedBy, DateTimeOffset CreatedAt, string PdfSha256, string ZipSha256);

    private sealed record AuditItemMetadata(
        Guid AuditPackageId, Guid Id, string Section, string SourceType, Guid? SourceId, string DocumentNumber,
        string Title, string FileName, string ContentType, string? Revision, string? Scope, DateTimeOffset SourceDate,
        string Sha256, long SizeBytes);

    private sealed record AuditZipDownload(
        Guid Id, Guid CompanyId, Guid? ZipStoredObjectId, bool HasZipData,
        string Number, string ZipSha256, DateTimeOffset CreatedAt, string ManifestJson,
        string CustomerName, string? BranchName);
}
