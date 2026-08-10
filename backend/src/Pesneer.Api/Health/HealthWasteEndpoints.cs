using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
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
        return app;
    }

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
        var customers = await dbContext.Customers.AsNoTracking().Include(item => item.Branches)
            .Where(item => item.IsActive && (!customerScope.HasValue || item.Id == customerScope.Value))
            .AsSplitQuery().ToListAsync(cancellationToken);
        var customerIds = customers.Select(item => item.Id).ToArray();
        if (customerIds.Length == 0) return new HealthScoreOverviewResponse(now, 0, 0, 0, []);

        var reportCandidates = await dbContext.ServiceReports.AsNoTracking()
            .Include(item => item.WorkOrder).Include(item => item.Stations)
            .Where(item => item.FinalizedAt != null && customerIds.Contains(item.WorkOrder.CustomerId))
            .AsSplitQuery().ToListAsync(cancellationToken);
        var reports = reportCandidates.Where(item => item.FinalizedAt >= previousStart).ToArray();
        var actions = await dbContext.CorrectiveActions.AsNoTracking()
            .Where(item => customerIds.Contains(item.CustomerId) && item.Status != "Verified" && item.Status != "Cancelled")
            .ToListAsync(cancellationToken);
        var requestCandidates = await dbContext.EmergencyRequests.AsNoTracking()
            .Where(item => customerIds.Contains(item.CustomerId) && item.RequestType == "EmergencyCall")
            .ToListAsync(cancellationToken);
        var requests = requestCandidates.Where(item => item.RequestedAt >= previousStart).ToArray();

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
            reports.Where(item => Matches(item.WorkOrder.CustomerId, item.WorkOrder.CustomerBranchId, location)).ToArray(),
            actions.Where(item => Matches(item.CustomerId, item.CustomerBranchId, location)).ToArray(),
            requests.Where(item => Matches(item.CustomerId, item.CustomerBranchId, location)).ToArray(),
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
        IReadOnlyCollection<ServiceReport> reports,
        IReadOnlyCollection<CorrectiveAction> actions,
        IReadOnlyCollection<EmergencyRequest> requests,
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
        var inaccessibleCount = currentStations.Count(item => item.DeviceStatus == "Inaccessible" || !string.IsNullOrWhiteSpace(item.InaccessibilityReason));

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
        var query = AccessibleWaste(dbContext, context).AsNoTracking();
        var records = await query.Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.WorkOrder)
            .Include(item => item.CreatedByAccount).Include(item => item.Evidence).ThenInclude(item => item.UploadedByAccount)
            .AsSplitQuery().ToListAsync(cancellationToken);
        return Results.Ok(records.OrderByDescending(item => item.GeneratedAt).Select(ToWasteResponse));
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

    private static async Task<IResult> UploadWasteEvidenceAsync(Guid recordId, HttpRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var record = await AccessibleWaste(dbContext, context).SingleOrDefaultAsync(item => item.Id == recordId, cancellationToken);
        if (record is null) return Results.NotFound();
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0 || file.Length > MaximumEvidenceSize) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["En fazla 8 MB büyüklüğünde bir kanıt dosyası seçin."] });
        await using var memory = new MemoryStream(); await file.CopyToAsync(memory, cancellationToken);
        dbContext.WasteDisposalEvidence.Add(new WasteDisposalEvidence
        {
            Id = Guid.NewGuid(), CompanyId = record.CompanyId, WasteDisposalRecordId = record.Id, UploadedByAccountId = context.AccountId.Value,
            FileName = Path.GetFileName(file.FileName), ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            Data = memory.ToArray(), Note = Clean(form["note"].ToString(), 1000)
        });
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(await LoadWasteAsync(record.Id, dbContext, context, cancellationToken));
    }

    private static async Task<IResult> DownloadWasteEvidenceAsync(Guid evidenceId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var evidence = await dbContext.WasteDisposalEvidence.AsNoTracking().Include(item => item.WasteDisposalRecord).SingleOrDefaultAsync(item => item.Id == evidenceId, cancellationToken);
        if (evidence is null || !CanAccessWaste(evidence.WasteDisposalRecord, context)) return Results.NotFound();
        return Results.File(evidence.Data, evidence.ContentType, evidence.FileName);
    }

    private static IQueryable<WasteDisposalRecord> AccessibleWaste(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.WasteDisposalRecords.AsQueryable();
        if (context.Portal == PortalType.Employee) query = query.Where(item => item.CreatedByAccountId == context.AccountId || (item.WorkOrder != null && item.WorkOrder.AssignedEmployeeAccountId == context.AccountId));
        return query;
    }

    private static bool CanAccessWaste(WasteDisposalRecord item, ICompanyContext context) => context.Portal == PortalType.Owner || (context.Portal == PortalType.Employee && (item.CreatedByAccountId == context.AccountId || item.WorkOrder != null && item.WorkOrder.AssignedEmployeeAccountId == context.AccountId));

    private static async Task<bool> CanUseLocationAsync(Guid customerId, Guid? branchId, Guid? workOrderId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var locationExists = await dbContext.Customers.AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken)
            && (!branchId.HasValue || await dbContext.CustomerBranches.AnyAsync(item => item.Id == branchId && item.CustomerId == customerId && item.IsActive, cancellationToken));
        if (!locationExists) return false;
        if (workOrderId.HasValue && !await dbContext.WorkOrders.AnyAsync(item => item.Id == workOrderId && item.CustomerId == customerId && item.CustomerBranchId == branchId, cancellationToken)) return false;
        if (context.Portal == PortalType.Owner) return true;
        return await dbContext.WorkOrders.AnyAsync(item => item.AssignedEmployeeAccountId == context.AccountId && item.CustomerId == customerId && (!branchId.HasValue || item.CustomerBranchId == branchId), cancellationToken);
    }

    private static async Task<WasteDisposalResponse?> LoadWasteAsync(Guid id, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var item = await AccessibleWaste(dbContext, context).AsNoTracking().Include(record => record.Customer).Include(record => record.CustomerBranch).Include(record => record.WorkOrder)
            .Include(record => record.CreatedByAccount).Include(record => record.Evidence).ThenInclude(evidence => evidence.UploadedByAccount)
            .AsSplitQuery().SingleOrDefaultAsync(record => record.Id == id, cancellationToken);
        return item is null ? null : ToWasteResponse(item);
    }

    private static WasteDisposalResponse ToWasteResponse(WasteDisposalRecord item) => new(
        item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez / Genel",
        item.WorkOrderId, item.WorkOrder?.Number, item.WasteType, item.Quantity, item.Unit, item.Status, item.GeneratedAt,
        item.TemporaryStorage, item.RecipientName, item.CarrierOrFacility, item.DisposalMethod, item.DocumentNumber, item.Notes,
        item.CreatedByAccount.DisplayName, item.CreatedAt, item.UpdatedAt,
        item.Evidence.OrderByDescending(evidence => evidence.CreatedAt).Select(evidence => new WasteDisposalEvidenceResponse(evidence.Id, evidence.FileName, evidence.ContentType, evidence.Note, evidence.CreatedAt, evidence.UploadedByAccount.DisplayName, $"/api/company/waste-disposals/evidence/{evidence.Id}")).ToArray());

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

    private static HealthLocation[] BuildLocations(IReadOnlyCollection<Customer> customers, IReadOnlyCollection<ServiceReport> reports, IReadOnlyCollection<CorrectiveAction> actions, IReadOnlyCollection<EmergencyRequest> requests, Guid? branchScope)
    {
        var result = new List<HealthLocation>();
        foreach (var customer in customers)
        {
            var hasGeneralData = reports.Any(item => item.WorkOrder.CustomerId == customer.Id && item.WorkOrder.CustomerBranchId == null)
                || actions.Any(item => item.CustomerId == customer.Id && item.CustomerBranchId == null)
                || requests.Any(item => item.CustomerId == customer.Id && item.CustomerBranchId == null);
            if (!branchScope.HasValue && (customer.Branches.Count == 0 || hasGeneralData || customer.Latitude.HasValue || customer.Longitude.HasValue || !string.IsNullOrWhiteSpace(customer.MapUrl)))
                result.Add(new HealthLocation(customer.Id, customer.LegalName, null, "Merkez / Genel", customer.Address ?? customer.City ?? "Adres girilmedi", customer.MapUrl, customer.Latitude, customer.Longitude));
            result.AddRange(customer.Branches.Where(branch => branch.IsActive && (!branchScope.HasValue || branch.Id == branchScope.Value))
                .Select(branch => new HealthLocation(customer.Id, customer.LegalName, branch.Id, branch.Name, branch.Address, branch.MapUrl, branch.Latitude, branch.Longitude)));
        }
        return result.ToArray();
    }

    private static WeatherRiskLocation ToWeatherLocation(HealthLocation location) => new(location.CustomerId, location.CustomerName, location.BranchId, location.BranchName, location.Address, location.MapUrl, location.Latitude, location.Longitude, location.BranchId.HasValue ? "Branch" : "Customer");
    private sealed record HealthLocation(Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, string Address, string? MapUrl, decimal? Latitude, decimal? Longitude);
}

public sealed record HealthScoreComponentResponse(string Code, string Label, bool Available, int Penalty, int MaxPenalty, string Detail);
public sealed record HealthScoreLocationResponse(Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, string Address, int Score, string Level, string Confidence, int CurrentReportCount, bool PeriodComparisonAvailable, decimal? PreviousActivityRate, decimal? CurrentActivityRate, decimal? ActivityRateChange, DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd, IReadOnlyCollection<HealthScoreComponentResponse> Components);
public sealed record HealthScoreOverviewResponse(DateTimeOffset GeneratedAt, int AverageScore, int HighRiskLocations, int ComparisonAvailableLocations, IReadOnlyCollection<HealthScoreLocationResponse> Locations);
public sealed record CreateWasteDisposalRequest(Guid CustomerId, Guid? BranchId, Guid? WorkOrderId, string WasteType, decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName, string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes);
public sealed record UpdateWasteDisposalRequest(string WasteType, decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName, string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes);
public sealed record WasteDisposalEvidenceResponse(Guid Id, string FileName, string ContentType, string? Note, DateTimeOffset CreatedAt, string UploadedBy, string DownloadUrl);
public sealed record WasteDisposalResponse(Guid Id, string Number, Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, Guid? WorkOrderId, string? WorkOrderNumber, string WasteType, decimal Quantity, string Unit, string Status, DateTimeOffset GeneratedAt, string? TemporaryStorage, string? RecipientName, string? CarrierOrFacility, string? DisposalMethod, string? DocumentNumber, string? Notes, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyCollection<WasteDisposalEvidenceResponse> Evidence);
