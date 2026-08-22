using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Optimization;
using Pesneer.Api.Storage;
using Pesneer.Api.WeatherRisk;

namespace Pesneer.Api.Health;

public static class HealthWasteEndpoints
{
    private const long MaximumEvidenceSize = 8 * 1024 * 1024;
    private static readonly HashSet<string> WasteTypes = ["DeadRodent", "UsedBait", "EmptyChemicalContainer", "DamagedStation", "GlueBoard", "UvLamp", "ContaminatedPpe", "Other"];
    private static readonly HashSet<string> WasteStatuses = ["Generated", "Stored", "Transferred", "Disposed"];

    public static IEndpointRouteBuilder MapHealthWasteEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/company/health-scores", GetCompanyHealthScoresAsync).RequireAuthorization("OwnerPortal");
        app.MapGet("/api/customer/portal/health-scores", GetCustomerHealthScoresAsync).RequireAuthorization("CustomerPortal");

        var waste = app.MapGroup("/api/company/waste-disposals").RequireAuthorization("CompanyStaff");
        waste.MapGet("/", GetWasteRecordsAsync);
        waste.MapPost("/", CreateWasteRecordAsync);
        waste.MapPut("/{recordId:guid}", UpdateWasteRecordAsync);
        waste.MapPost("/{recordId:guid}/evidence", UploadWasteEvidenceAsync).DisableAntiforgery();
        waste.MapGet("/evidence/{evidenceId:guid}", DownloadWasteEvidenceAsync);
        app.MapGet("/api/v2/waste-disposals", GetWastePageAsync).RequireAuthorization("CompanyStaff");
        app.MapGet("/api/v2/waste-disposals/{recordId:guid}", GetWasteDetailAsync).RequireAuthorization("CompanyStaff");
        return app;
    }

    private static async Task<IResult> GetWastePageAsync(
        int? limit, string? cursor, PesneerDbContext dbContext,
        ICompanyContext context, CancellationToken cancellationToken)
    {
        if (context.Portal == PortalType.Employee && !context.AccountId.HasValue) return Results.Forbid();
        var pageSize = CursorPaging.NormalizeLimit(limit);
        var hasCursor = CursorPaging.TryRead(cursor, out var position);
        if (!string.IsNullOrWhiteSpace(cursor) && !hasCursor)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["cursor"] = ["Sayfalama anahtarı geçerli değil."] });
        var snapshot = hasCursor ? position.Snapshot : DateTimeOffset.UtcNow;
        var query = AccessibleWaste(dbContext, context).AsNoTracking();
        WasteDisposalSummary[] rows;
        if (dbContext.Database.IsNpgsql())
        {
            query = query.Where(item => item.CreatedAt <= snapshot);
            if (hasCursor) query = query.Where(item => item.CreatedAt < position.Sort ||
                (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0));
            rows = await WasteSummaryQuery(query.OrderByDescending(item => item.CreatedAt)
                    .ThenByDescending(item => item.Id).Take(pageSize + 1)).ToArrayAsync(cancellationToken);
        }
        else
        {
            rows = (await WasteSummaryQuery(query).ToArrayAsync(cancellationToken))
                .Where(item => item.CreatedAt <= snapshot && (!hasCursor || item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0)))
                .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
                .Take(pageSize + 1).ToArray();
        }
        var hasMore = rows.Length > pageSize;
        if (hasMore) rows = rows[..pageSize];
        var last = rows.LastOrDefault();
        var nextCursor = hasMore && last is not null ? CursorPaging.Write(snapshot, last.CreatedAt, last.Id) : null;
        return Results.Ok(new CursorPage<WasteDisposalSummary>(rows, nextCursor, hasMore, snapshot.ToString("O")));
    }

    private static async Task<IResult> GetWasteDetailAsync(
        Guid recordId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (context.Portal == PortalType.Employee && !context.AccountId.HasValue) return Results.Forbid();
        var response = await LoadWasteAsync(recordId, dbContext, context, cancellationToken);
        return response is null ? Results.NotFound(new { message = "Atık kaydı bulunamadı." }) : Results.Ok(response);
    }

    private static IQueryable<WasteDisposalSummary> WasteSummaryQuery(IQueryable<WasteDisposalRecord> query) => query
        .Select(item => new WasteDisposalSummary(
            item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId,
            item.CustomerBranch != null ? item.CustomerBranch.Name : "Merkez", item.WorkOrderId,
            item.WorkOrder != null ? item.WorkOrder.Number : null, item.WasteType, item.Quantity, item.Unit,
            item.Status, item.GeneratedAt, item.CreatedAt, item.UpdatedAt, item.Evidence.Count,
            $"/api/v2/waste-disposals/{item.Id}"));

    private static async Task<IResult> GetCompanyHealthScoresAsync(PesneerDbContext dbContext, IWeatherRiskService weatherService, CancellationToken cancellationToken)
        => Results.Ok(await BuildHealthOverviewAsync(dbContext, weatherService, null, null, cancellationToken));

    private static async Task<IResult> GetCustomerHealthScoresAsync(PesneerDbContext dbContext, ICompanyContext context, IWeatherRiskService weatherService, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Results.Forbid();
        return Results.Ok(await BuildHealthOverviewAsync(dbContext, weatherService, context.CustomerId, context.CustomerBranchId, cancellationToken));
    }

    private static async Task<HealthScoreOverviewResponse> BuildHealthOverviewAsync(
        PesneerDbContext dbContext,
        IWeatherRiskService weatherService,
        Guid? customerScope,
        Guid? branchScope,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var currentStart = now.AddDays(-30);
        var previousStart = now.AddDays(-60);
        var customerRows = await dbContext.Customers.AsNoTracking()
            .Where(item => item.IsActive && (!customerScope.HasValue || item.Id == customerScope.Value))
            .Select(item => new HealthCustomerProjection(item.Id, item.LegalName, item.Address, item.City, item.MapUrl, item.Latitude, item.Longitude))
            .ToListAsync(cancellationToken);
        var customerIds = customerRows.Select(item => item.Id).ToArray();
        if (customerIds.Length == 0) return new HealthScoreOverviewResponse(now, 0, 0, 0, []);

        var branchRows = await dbContext.CustomerBranches.AsNoTracking()
            .Where(item => customerIds.Contains(item.CustomerId))
            .Select(item => new HealthBranch(item.Id, item.CustomerId, item.Name, item.Address, item.MapUrl, item.Latitude, item.Longitude, item.IsActive))
            .ToListAsync(cancellationToken);
        var branchesByCustomer = branchRows.ToLookup(item => item.CustomerId);
        var customers = customerRows.Select(item => new HealthCustomer(item.Id, item.LegalName, item.Address, item.City,
            item.MapUrl, item.Latitude, item.Longitude, branchesByCustomer[item.Id].ToArray())).ToArray();

        var reportQuery = dbContext.ServiceReports.AsNoTracking()
            .Where(item => item.FinalizedAt != null && customerIds.Contains(item.WorkOrder.CustomerId));
        var reportRows = dbContext.Database.IsSqlite()
            ? (await reportQuery.Select(item => new HealthReportProjection(item.Id, item.WorkOrder.CustomerId,
                item.WorkOrder.CustomerBranchId, item.FinalizedAt!.Value)).ToListAsync(cancellationToken))
                .Where(item => item.FinalizedAt >= previousStart).ToList()
            : await reportQuery.Where(item => item.FinalizedAt >= previousStart)
                .Select(item => new HealthReportProjection(item.Id, item.WorkOrder.CustomerId,
                    item.WorkOrder.CustomerBranchId, item.FinalizedAt!.Value)).ToListAsync(cancellationToken);
        var reportIds = reportRows.Select(item => item.Id).ToArray();
        var stationRows = reportIds.Length == 0
            ? []
            : await dbContext.ServiceReportStations.AsNoTracking()
                .Where(item => reportIds.Contains(item.ServiceReportId))
                .Select(item => new HealthStationProjection(item.ServiceReportId, item.HasActivity, item.DeviceStatus,
                    !string.IsNullOrWhiteSpace(item.InaccessibilityReason)))
                .ToListAsync(cancellationToken);
        var stationsByReport = stationRows.ToLookup(item => item.ServiceReportId);
        var reports = reportRows.Select(item => new HealthReport(item.CustomerId, item.BranchId, item.FinalizedAt,
            stationsByReport[item.Id].Select(station => new HealthStation(station.HasActivity, station.DeviceStatus, station.HasInaccessibilityReason)).ToArray())).ToArray();
        var actions = await dbContext.CorrectiveActions.AsNoTracking()
            .Where(item => customerIds.Contains(item.CustomerId) && item.Status != "Verified" && item.Status != "Cancelled")
            .Select(item => new HealthAction(item.CustomerId, item.CustomerBranchId, item.DueDate, item.ResponsibleParty))
            .ToListAsync(cancellationToken);
        var requestQuery = dbContext.EmergencyRequests.AsNoTracking()
            .Where(item => customerIds.Contains(item.CustomerId) && item.RequestType == "EmergencyCall");
        var requests = dbContext.Database.IsSqlite()
            ? (await requestQuery.Select(item => new HealthRequest(item.CustomerId, item.CustomerBranchId, item.RequestedAt))
                .ToListAsync(cancellationToken)).Where(item => item.RequestedAt >= previousStart).ToList()
            : await requestQuery.Where(item => item.RequestedAt >= previousStart)
                .Select(item => new HealthRequest(item.CustomerId, item.CustomerBranchId, item.RequestedAt))
                .ToListAsync(cancellationToken);

        var locations = BuildLocations(customers, reports, actions, requests, branchScope);
        WeatherRiskOverviewResponse? weather = null;
        try
        {
            weather = await weatherService.BuildAsync(locations.Select(ToWeatherLocation).ToArray(), false, cancellationToken);
        }
        catch
        {
            weather = null;
        }

        var weatherByLocation = weather?.Locations.ToDictionary(item => LocationKey(item.CustomerId, item.BranchId))
            ?? new Dictionary<string, LocationWeatherRiskResponse>();
        var scores = locations.Select(location => CalculateLocationHealth(
            location,
            reports.Where(item => Matches(item.CustomerId, item.BranchId, location)).ToArray(),
            actions.Where(item => Matches(item.CustomerId, item.BranchId, location)).ToArray(),
            requests.Where(item => Matches(item.CustomerId, item.BranchId, location)).ToArray(),
            weatherByLocation.GetValueOrDefault(LocationKey(location.CustomerId, location.BranchId)),
            currentStart,
            previousStart,
            now)).OrderBy(item => item.Score).ThenBy(item => item.CustomerName).ThenBy(item => item.BranchName).ToArray();

        return new HealthScoreOverviewResponse(
            now,
            scores.Length == 0 ? 0 : (int)Math.Round(scores.Average(item => item.Score)),
            scores.Count(item => item.Level == "High"),
            scores.Count(item => item.PeriodComparisonAvailable),
            scores);
    }

    private static HealthScoreLocationResponse CalculateLocationHealth(
        HealthLocation location,
        IReadOnlyCollection<HealthReport> reports,
        IReadOnlyCollection<HealthAction> actions,
        IReadOnlyCollection<HealthRequest> requests,
        LocationWeatherRiskResponse? weather,
        DateTimeOffset currentStart,
        DateTimeOffset previousStart,
        DateTimeOffset now)
    {
        var currentReports = reports.Where(item => item.FinalizedAt >= currentStart).ToArray();
        var previousReports = reports.Where(item => item.FinalizedAt >= previousStart && item.FinalizedAt < currentStart).ToArray();
        var currentStations = currentReports.SelectMany(item => item.Stations).ToArray();
        var previousStations = previousReports.SelectMany(item => item.Stations).ToArray();
        var hasCurrentStationData = currentStations.Length > 0;
        var activityRate = hasCurrentStationData ? Percentage(currentStations.Count(item => item.HasActivity), currentStations.Length) : (decimal?)null;
        var previousActivityRate = previousStations.Length > 0 ? Percentage(previousStations.Count(item => item.HasActivity), previousStations.Length) : (decimal?)null;
        var comparisonAvailable = activityRate.HasValue && previousActivityRate.HasValue;
        var activityChange = comparisonAvailable ? Math.Round(activityRate!.Value - previousActivityRate!.Value, 1) : (decimal?)null;

        var openActions = actions.Count;
        var overdueActions = actions.Count(item => item.DueDate < DateOnly.FromDateTime(now.UtcDateTime));
        var overdueCustomerActions = actions.Count(item => item.DueDate < DateOnly.FromDateTime(now.UtcDateTime) && item.ResponsibleParty is "Customer" or "Joint");
        var currentRequests = requests.Count(item => item.RequestedAt >= currentStart);
        var damagedCount = currentStations.Count(item => item.DeviceStatus is "Damaged" or "Missing" or "Broken");
        var inaccessibleCount = currentStations.Count(item => item.DeviceStatus == "Inaccessible" || item.HasInaccessibilityReason);

        var components = new List<HealthScoreComponentResponse>
        {
            Component("PestActivity", "Zararlı aktivitesi", hasCurrentStationData, activityRate.HasValue ? RoundPenalty(activityRate.Value / 100m * 25m, 25) : 0, 25, activityRate.HasValue ? $"Son 30 günde %{activityRate.Value:0.#} aktivite ({currentStations.Count(item => item.HasActivity)}/{currentStations.Length} istasyon)." : "Son 30 günde puanlanabilir istasyon kontrolü bulunmuyor."),
            Component("OpenActions", "Açık yapısal uygunsuzluklar", true, Math.Min(20, openActions * 3 + overdueActions * 2), 20, $"{openActions} açık, {overdueActions} gecikmiş düzeltici faaliyet."),
            Component("StationDamage", "İstasyon hasarları", hasCurrentStationData, hasCurrentStationData ? RoundPenalty((decimal)damagedCount / currentStations.Length * 10m, 10) : 0, 10, hasCurrentStationData ? $"{damagedCount}/{currentStations.Length} istasyon hasarlı veya eksik." : "İstasyon kontrol verisi bulunmuyor."),
            Component("Inaccessible", "Ulaşılamayan istasyonlar", hasCurrentStationData, hasCurrentStationData ? RoundPenalty((decimal)inaccessibleCount / currentStations.Length * 10m, 10) : 0, 10, hasCurrentStationData ? $"{inaccessibleCount}/{currentStations.Length} istasyona ulaşılamadı." : "İstasyon kontrol verisi bulunmuyor."),
            Component("Weather", "Konuma bağlı hava riski", weather?.Risk is not null, weather?.Risk is null ? 0 : RoundPenalty(weather.Risk.Score / 100m * 10m, 10), 10, weather?.Risk is null ? weather?.UnavailableReason ?? "Konum veya hava verisi bulunmuyor; puana dahil edilmedi." : $"Hava risk puanı {weather.Risk.Score}/100 ({weather.Risk.Label})."),
            Component("EmergencyCalls", "Acil çağrı sayısı", true, Math.Min(10, currentRequests * 3), 10, $"Son 30 günde {currentRequests} acil çağrı."),
            Component("CustomerActions", "Geciken müşteri aksiyonları", true, Math.Min(10, overdueCustomerActions * 4), 10, $"Müşteri sorumluluğunda {overdueCustomerActions} gecikmiş faaliyet."),
            Component("PeriodTrend", "Önceki döneme göre değişim", comparisonAvailable, comparisonAvailable && activityChange > 0 ? RoundPenalty(activityChange.Value / 20m * 5m, 5) : 0, 5, comparisonAvailable ? TrendDetail(previousActivityRate!.Value, activityRate!.Value, activityChange!.Value) : "Karşılaştırma için iki dönemde de yeterli saha verisi bulunmuyor; puana dahil edilmedi.")
        };

        var availableMax = components.Where(item => item.Available).Sum(item => item.MaxPenalty);
        var penalty = components.Where(item => item.Available).Sum(item => item.Penalty);
        var score = availableMax == 0 ? 100 : Math.Clamp((int)Math.Round((availableMax - penalty) / availableMax * 100m), 0, 100);
        var confidence = currentReports.Length >= 3 && components.Count(item => item.Available) >= 7 ? "High" : currentReports.Length > 0 ? "Medium" : "Low";
        var level = score >= 85 ? "Low" : score >= 70 ? "Medium" : "High";

        return new HealthScoreLocationResponse(
            location.CustomerId, location.CustomerName, location.BranchId, location.BranchName, location.Address,
            score, level, confidence, currentReports.Length, comparisonAvailable, previousActivityRate, activityRate,
            activityChange, currentStart, now, components);
    }

    private static async Task<IResult> GetWasteRecordsAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (context.Portal == PortalType.Employee && !context.AccountId.HasValue) return Results.Forbid();
        var query = AccessibleWaste(dbContext, context).AsNoTracking();
        if (dbContext.Database.IsSqlite())
        {
            var sqliteItems = await LoadWasteResponsesAsync(query, dbContext, cancellationToken);
            return Results.Ok(sqliteItems.OrderByDescending(item => item.GeneratedAt).ToArray());
        }
        return Results.Ok(await LoadWasteResponsesAsync(query.OrderByDescending(item => item.GeneratedAt), dbContext, cancellationToken));
    }

    private static async Task<IResult> CreateWasteRecordAsync(CreateWasteDisposalRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !context.CompanyId.HasValue) return Results.Forbid();
        var validation = ValidateWaste(request.WasteType, request.Quantity, request.Unit, request.Status);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, request.WorkOrderId, dbContext, context, cancellationToken)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Müşteri, şube veya iş emri yetki kapsamında bulunamadı."] });

        var year = DateTime.UtcNow.Year;
        var sequence = await dbContext.WasteDisposalRecords.CountAsync(cancellationToken) + 1;
        var record = new WasteDisposalRecord
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            WorkOrderId = request.WorkOrderId, CreatedByAccountId = context.AccountId.Value, Number = $"ATK-{year}-{sequence:0000}",
            WasteType = request.WasteType, Quantity = request.Quantity, Unit = request.Unit.Trim(), Status = request.Status,
            GeneratedAt = request.GeneratedAt, TemporaryStorage = Clean(request.TemporaryStorage, 240), RecipientName = Clean(request.RecipientName, 160),
            CarrierOrFacility = Clean(request.CarrierOrFacility, 240), DisposalMethod = Clean(request.DisposalMethod, 240),
            DocumentNumber = Clean(request.DocumentNumber, 100), Notes = Clean(request.Notes, 2000)
        };
        dbContext.WasteDisposalRecords.Add(record);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/waste-disposals/{record.Id}", await LoadWasteAsync(record.Id, dbContext, context, cancellationToken));
    }

    private static async Task<IResult> UpdateWasteRecordAsync(Guid recordId, UpdateWasteDisposalRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var record = await AccessibleWaste(dbContext, context).SingleOrDefaultAsync(item => item.Id == recordId, cancellationToken);
        if (record is null) return Results.NotFound();
        var validation = ValidateWaste(request.WasteType, request.Quantity, request.Unit, request.Status);
        if (validation is not null) return validation;
        record.WasteType = request.WasteType; record.Quantity = request.Quantity; record.Unit = request.Unit.Trim(); record.Status = request.Status;
        record.GeneratedAt = request.GeneratedAt; record.TemporaryStorage = Clean(request.TemporaryStorage, 240); record.RecipientName = Clean(request.RecipientName, 160);
        record.CarrierOrFacility = Clean(request.CarrierOrFacility, 240); record.DisposalMethod = Clean(request.DisposalMethod, 240);
        record.DocumentNumber = Clean(request.DocumentNumber, 100); record.Notes = Clean(request.Notes, 2000); record.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(await LoadWasteAsync(record.Id, dbContext, context, cancellationToken));
    }

    private static async Task<IResult> UploadWasteEvidenceAsync(Guid recordId, HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, IHybridFileStorage hybridFiles, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var record = await AccessibleWaste(dbContext, context).SingleOrDefaultAsync(item => item.Id == recordId, cancellationToken);
        if (record is null) return Results.NotFound();
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0 || file.Length > MaximumEvidenceSize) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["En fazla 8 MB büyüklüğünde bir kanıt dosyası seçin."] });
        var data = await UploadBuffers.ReadExactlyAsync(file, cancellationToken);
        var evidence = new WasteDisposalEvidence
        {
            Id = Guid.NewGuid(), CompanyId = record.CompanyId, WasteDisposalRecordId = record.Id, UploadedByAccountId = context.AccountId.Value,
            FileName = Path.GetFileName(file.FileName), ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            Data = data, Note = Clean(form["note"].ToString(), 1000)
        };
        dbContext.WasteDisposalEvidence.Add(evidence);
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await hybridFiles.TryDualWriteAsync(
            HybridFileResourceKind.WasteDisposalEvidence,
            evidence.CompanyId,
            evidence.Id,
            evidence.FileName,
            evidence.ContentType,
            evidence.Data,
            cancellationToken);
        return Results.Ok(await LoadWasteAsync(record.Id, dbContext, context, cancellationToken));
    }

    private static async Task<IResult> DownloadWasteEvidenceAsync(Guid evidenceId, HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, IHybridFileStorage hybridFiles, CancellationToken cancellationToken)
    {
        if (context.Portal == PortalType.Employee && !context.AccountId.HasValue) return Results.Forbid();
        var query = dbContext.WasteDisposalEvidence.AsNoTracking().Where(item => item.Id == evidenceId);
        query = context.Portal switch
        {
            PortalType.Owner => query,
            PortalType.Employee => query.Where(item => item.WasteDisposalRecord.CreatedByAccountId == context.AccountId ||
                item.WasteDisposalRecord.WorkOrder != null &&
                (item.WasteDisposalRecord.WorkOrder.AssignedEmployeeAccountId == context.AccountId ||
                    item.WasteDisposalRecord.WorkOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId))),
            _ => query.Where(_ => false)
        };
        var metadata = await query.Select(item => new { item.CompanyId, item.StoredObjectId, item.FileName, item.ContentType, item.CreatedAt }).SingleOrDefaultAsync(cancellationToken);
        if (metadata is null) return Results.NotFound();
        var storedResult = await hybridFiles.TryReadAsync(
            metadata.CompanyId,
            metadata.StoredObjectId,
            request,
            metadata.FileName,
            metadata.ContentType,
            metadata.CreatedAt,
            cancellationToken);
        if (storedResult is not null) return storedResult;
        var data = await dbContext.WasteDisposalEvidence.AsNoTracking()
            .Where(item => item.Id == evidenceId)
            .Select(item => (byte[]?)item.Data)
            .SingleOrDefaultAsync(cancellationToken);
        return data is null ? Results.NotFound() : PrivateFileResults.Exact(data, metadata.ContentType, metadata.FileName, metadata.CreatedAt);
    }

    private static IQueryable<WasteDisposalRecord> AccessibleWaste(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.WasteDisposalRecords.AsQueryable();
        if (context.Portal == PortalType.Employee) query = query.Where(item => item.CreatedByAccountId == context.AccountId ||
            (item.WorkOrder != null && (item.WorkOrder.AssignedEmployeeAccountId == context.AccountId ||
                item.WorkOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId))));
        return query;
    }

    private static async Task<bool> CanUseLocationAsync(Guid customerId, Guid? branchId, Guid? workOrderId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var locationExists = await dbContext.Customers.AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken)
            && (!branchId.HasValue || await dbContext.CustomerBranches.AnyAsync(item => item.Id == branchId && item.CustomerId == customerId && item.IsActive, cancellationToken));
        if (!locationExists) return false;
        if (workOrderId.HasValue && !await dbContext.WorkOrders.AnyAsync(item => item.Id == workOrderId && item.CustomerId == customerId && item.CustomerBranchId == branchId, cancellationToken)) return false;
        if (context.Portal == PortalType.Owner) return true;
        return await dbContext.WorkOrders.AnyAsync(item =>
            (!workOrderId.HasValue || item.Id == workOrderId.Value) &&
            (item.AssignedEmployeeAccountId == context.AccountId || item.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId)) &&
            item.CustomerId == customerId &&
            (!branchId.HasValue || item.CustomerBranchId == branchId), cancellationToken);
    }

    private static async Task<WasteDisposalResponse?> LoadWasteAsync(Guid id, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        return (await LoadWasteResponsesAsync(
            AccessibleWaste(dbContext, context).AsNoTracking().Where(record => record.Id == id),
            dbContext,
            cancellationToken)).SingleOrDefault();
    }

    private static async Task<WasteDisposalResponse[]> LoadWasteResponsesAsync(
        IQueryable<WasteDisposalRecord> query,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var items = await query.Select(item => new WasteDisposalProjection(
                item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId,
                item.CustomerBranch != null ? item.CustomerBranch.Name : "Merkez / Genel",
                item.WorkOrderId, item.WorkOrder != null ? item.WorkOrder.Number : null,
                item.WasteType, item.Quantity, item.Unit, item.Status, item.GeneratedAt, item.TemporaryStorage,
                item.RecipientName, item.CarrierOrFacility, item.DisposalMethod, item.DocumentNumber, item.Notes,
                item.CreatedByAccount.DisplayName, item.CreatedAt, item.UpdatedAt))
            .ToListAsync(cancellationToken);
        if (items.Count == 0) return [];

        var recordIds = items.Select(item => item.Id).ToArray();
        var evidenceQuery = dbContext.WasteDisposalEvidence.AsNoTracking()
            .Where(item => recordIds.Contains(item.WasteDisposalRecordId))
            .Select(item => new WasteEvidenceProjection(item.WasteDisposalRecordId, item.Id, item.FileName,
                item.ContentType, item.Note, item.CreatedAt, item.UploadedByAccount.DisplayName));
        var evidence = dbContext.Database.IsSqlite()
            ? (await evidenceQuery.ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).ToList()
            : await evidenceQuery.OrderByDescending(item => item.CreatedAt).ToListAsync(cancellationToken);
        var evidenceByRecord = evidence.ToLookup(item => item.WasteDisposalRecordId);
        return items.Select(item => new WasteDisposalResponse(
            item.Id, item.Number, item.CustomerId, item.CustomerName, item.BranchId, item.BranchName,
            item.WorkOrderId, item.WorkOrderNumber, item.WasteType, item.Quantity, item.Unit, item.Status, item.GeneratedAt,
            item.TemporaryStorage, item.RecipientName, item.CarrierOrFacility, item.DisposalMethod, item.DocumentNumber,
            item.Notes, item.CreatedBy, item.CreatedAt, item.UpdatedAt,
            evidenceByRecord[item.Id].Select(value => new WasteDisposalEvidenceResponse(
                value.Id, value.FileName, value.ContentType, value.Note, value.CreatedAt, value.UploadedBy,
                $"/api/company/waste-disposals/evidence/{value.Id}")).ToArray())).ToArray();
    }

    private sealed record WasteDisposalProjection(Guid Id, string Number, Guid CustomerId, string CustomerName,
        Guid? BranchId, string BranchName, Guid? WorkOrderId, string? WorkOrderNumber, string WasteType, decimal Quantity,
        string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName,
        string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes, string CreatedBy,
        DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

    private sealed record WasteEvidenceProjection(Guid WasteDisposalRecordId, Guid Id, string FileName,
        string ContentType, string? Note, DateTimeOffset CreatedAt, string UploadedBy);

    private static IResult? ValidateWaste(string wasteType, decimal quantity, string unit, string status)
        => !WasteTypes.Contains(wasteType) ? Validation("wasteType", "Atık türü geçersiz.")
            : quantity <= 0 ? Validation("quantity", "Miktar sıfırdan büyük olmalıdır.")
            : string.IsNullOrWhiteSpace(unit) || unit.Trim().Length > 24 ? Validation("unit", "Geçerli bir birim girin.")
            : !WasteStatuses.Contains(status) ? Validation("status", "Atık durumu geçersiz.") : null;

    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
    private static string? Clean(string? value, int maxLength) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, maxLength)];
    private static bool Matches(Guid customerId, Guid? branchId, HealthLocation location) => customerId == location.CustomerId && branchId == location.BranchId;
    private static string LocationKey(Guid customerId, Guid? branchId) => $"{customerId:N}:{branchId?.ToString("N") ?? "center"}";
    private static decimal Percentage(int count, int total) => total == 0 ? 0 : Math.Round((decimal)count / total * 100m, 1);
    private static int RoundPenalty(decimal value, int maximum) => Math.Clamp((int)Math.Round(value), 0, maximum);
    private static HealthScoreComponentResponse Component(string code, string label, bool available, int penalty, int maximum, string detail) => new(code, label, available, penalty, maximum, detail);
    private static string TrendDetail(decimal previous, decimal current, decimal change) => change switch { > 0 => $"Aktivite %{previous:0.#}'den %{current:0.#}'e yükseldi (+{change:0.#} puan).", < 0 => $"Aktivite %{previous:0.#}'den %{current:0.#}'e düştü ({change:0.#} puan).", _ => $"Aktivite oranı iki dönemde de %{current:0.#}." };

    private static HealthLocation[] BuildLocations(IReadOnlyCollection<HealthCustomer> customers, IReadOnlyCollection<HealthReport> reports, IReadOnlyCollection<HealthAction> actions, IReadOnlyCollection<HealthRequest> requests, Guid? branchScope)
    {
        var result = new List<HealthLocation>();
        foreach (var customer in customers)
        {
            var hasGeneralData = reports.Any(item => item.CustomerId == customer.Id && item.BranchId == null)
                || actions.Any(item => item.CustomerId == customer.Id && item.BranchId == null)
                || requests.Any(item => item.CustomerId == customer.Id && item.BranchId == null);
            if (!branchScope.HasValue && (customer.Branches.Count == 0 || hasGeneralData || customer.Latitude.HasValue || customer.Longitude.HasValue || !string.IsNullOrWhiteSpace(customer.MapUrl)))
                result.Add(new HealthLocation(customer.Id, customer.LegalName, null, "Merkez / Genel", customer.Address ?? customer.City ?? "Adres girilmedi", customer.MapUrl, customer.Latitude, customer.Longitude));
            result.AddRange(customer.Branches.Where(branch => branch.IsActive && (!branchScope.HasValue || branch.Id == branchScope.Value))
                .Select(branch => new HealthLocation(customer.Id, customer.LegalName, branch.Id, branch.Name, branch.Address, branch.MapUrl, branch.Latitude, branch.Longitude)));
        }
        return result.ToArray();
    }

    private static WeatherRiskLocation ToWeatherLocation(HealthLocation location) => new(location.CustomerId, location.CustomerName, location.BranchId, location.BranchName, location.Address, location.MapUrl, location.Latitude, location.Longitude, location.BranchId.HasValue ? "Branch" : "Customer");
    private sealed record HealthCustomerProjection(Guid Id, string LegalName, string? Address, string? City,
        string? MapUrl, decimal? Latitude, decimal? Longitude);
    private sealed record HealthCustomer(Guid Id, string LegalName, string? Address, string? City,
        string? MapUrl, decimal? Latitude, decimal? Longitude, IReadOnlyCollection<HealthBranch> Branches);
    private sealed record HealthBranch(Guid Id, Guid CustomerId, string Name, string Address, string? MapUrl,
        decimal? Latitude, decimal? Longitude, bool IsActive);
    private sealed record HealthReportProjection(Guid Id, Guid CustomerId, Guid? BranchId, DateTimeOffset FinalizedAt);
    private sealed record HealthStationProjection(Guid ServiceReportId, bool HasActivity, string DeviceStatus,
        bool HasInaccessibilityReason);
    private sealed record HealthReport(Guid CustomerId, Guid? BranchId, DateTimeOffset FinalizedAt,
        IReadOnlyCollection<HealthStation> Stations);
    private sealed record HealthStation(bool HasActivity, string DeviceStatus, bool HasInaccessibilityReason);
    private sealed record HealthAction(Guid CustomerId, Guid? BranchId, DateOnly DueDate, string ResponsibleParty);
    private sealed record HealthRequest(Guid CustomerId, Guid? BranchId, DateTimeOffset RequestedAt);
    private sealed record HealthLocation(Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, string Address, string? MapUrl, decimal? Latitude, decimal? Longitude);
}

public sealed record HealthScoreComponentResponse(string Code, string Label, bool Available, int Penalty, int MaxPenalty, string Detail);
public sealed record HealthScoreLocationResponse(Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, string Address, int Score, string Level, string Confidence, int CurrentReportCount, bool PeriodComparisonAvailable, decimal? PreviousActivityRate, decimal? CurrentActivityRate, decimal? ActivityRateChange, DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd, IReadOnlyCollection<HealthScoreComponentResponse> Components);
public sealed record HealthScoreOverviewResponse(DateTimeOffset GeneratedAt, int AverageScore, int HighRiskLocations, int ComparisonAvailableLocations, IReadOnlyCollection<HealthScoreLocationResponse> Locations);
public sealed record CreateWasteDisposalRequest(Guid CustomerId, Guid? BranchId, Guid? WorkOrderId, string WasteType, decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName, string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes);
public sealed record UpdateWasteDisposalRequest(string WasteType, decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName, string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes);
public sealed record WasteDisposalEvidenceResponse(Guid Id, string FileName, string ContentType, string? Note, DateTimeOffset CreatedAt, string UploadedBy, string DownloadUrl);
public sealed record WasteDisposalResponse(Guid Id, string Number, Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, Guid? WorkOrderId, string? WorkOrderNumber, string WasteType, decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName, string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyCollection<WasteDisposalEvidenceResponse> Evidence);
public sealed record WasteDisposalSummary(Guid Id, string Number, Guid CustomerId, string CustomerName,
    Guid? BranchId, string BranchName, Guid? WorkOrderId, string? WorkOrderNumber, string WasteType,
    decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt, int EvidenceCount, string DetailUrl);
