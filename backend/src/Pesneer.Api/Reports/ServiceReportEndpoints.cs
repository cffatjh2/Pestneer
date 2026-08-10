using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Inventory;
using Pesneer.Api.Compliance;

namespace Pesneer.Api.Reports;

public static class ServiceReportEndpoints
{
    private static readonly HashSet<string> DeviceStatuses = ["Unchecked", "NoActivity", "Activity", "Damaged", "Inaccessible", "Missing", "Replaced", "Passive", "Active"];
    private static readonly HashSet<string> ActivityTypes = ["Sighting", "Capture", "Droppings", "Gnawing", "Track", "Nest", "Other"];

    public static IEndpointRouteBuilder MapServiceReportEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/service-reports").RequireAuthorization("CompanyStaff");
        shared.MapGet("/work-orders/{workOrderId:guid}", GetByWorkOrderAsync);
        shared.MapPut("/work-orders/{workOrderId:guid}", UpsertAsync);
        shared.MapPost("/work-orders/{workOrderId:guid}/photos", UploadPhotosAsync).DisableAntiforgery();

        var company = app.MapGroup("/api/company/service-reports").RequireAuthorization("OwnerPortal");
        company.MapGet("/", GetCompanyReportsAsync);
        company.MapGet("/analytics", GetAnalyticsAsync);

        app.MapGet("/api/employee/service-reports", GetEmployeeReportsAsync).RequireAuthorization("EmployeePortal");
        app.MapGet("/api/customer/service-reports", GetCustomerReportsAsync).RequireAuthorization("CustomerPortal");
        return app;
    }

    private static async Task<IResult> GetByWorkOrderAsync(Guid workOrderId, PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, companyContext)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var report = await ReportQuery(dbContext).SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (report is null) return Results.NotFound(new { message = "Bu iş emri için henüz saha raporu oluşturulmadı." });
        return Results.Ok(ToResponse(report));
    }

    private static async Task<IResult> GetCompanyReportsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var reports = await ReportQuery(dbContext).ToListAsync(cancellationToken);
        return Results.Ok(reports.OrderByDescending(item => item.UpdatedAt).Select(ToResponse));
    }

    private static async Task<IResult> GetEmployeeReportsAsync(PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue) return Results.Forbid();
        var reports = await ReportQuery(dbContext)
            .Where(item => item.WorkOrder.AssignedEmployeeAccountId == companyContext.AccountId.Value)
            .ToListAsync(cancellationToken);
        return Results.Ok(reports.OrderByDescending(item => item.UpdatedAt).Select(ToResponse));
    }

    private static async Task<IResult> GetCustomerReportsAsync(PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        if (!companyContext.CustomerId.HasValue) return Results.Forbid();
        var reports = await ReportQuery(dbContext)
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == companyContext.CustomerId.Value)
            .Where(item => !companyContext.CustomerBranchId.HasValue || item.WorkOrder.CustomerBranchId == companyContext.CustomerBranchId.Value)
            .ToListAsync(cancellationToken);
        return Results.Ok(reports.OrderByDescending(item => item.FinalizedAt ?? item.UpdatedAt).Select(ToResponse));
    }

    private static async Task<IResult> UpsertAsync(
        Guid workOrderId,
        UpsertServiceReportRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IWebHostEnvironment environment,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, companyContext)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var validation = Validate(request);
        if (validation.Count > 0) return Results.ValidationProblem(validation);

        var report = await dbContext.ServiceReports
            .Include(item => item.Stations)
            .Include(item => item.Products)
            .SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (report is not null && report.Status == "Finalized" && companyContext.Portal == PortalType.Employee)
        {
            return Results.Conflict(new { message = "Tamamlanmış rapor yalnızca firma sahibi tarafından yeniden düzenlenebilir." });
        }
        if (report is not null && !request.ForceOverwrite && request.BaseUpdatedAt.HasValue &&
            Math.Abs((report.UpdatedAt - request.BaseUpdatedAt.Value).TotalMilliseconds) > 1)
        {
            return Results.Conflict(new
            {
                message = "Bu saha raporu başka bir cihazda güncellendi. Hangi sürümün korunacağını seçin.",
                current = ToResponse(report)
            });
        }

        var now = DateTimeOffset.UtcNow;
        if (report is null)
        {
            report = new ServiceReport
            {
                Id = Guid.NewGuid(),
                CompanyId = companyContext.CompanyId.Value,
                WorkOrderId = workOrderId,
                CreatedByAccountId = companyContext.AccountId.Value,
                ReportNumber = $"RPR-{workOrder.Number}",
                Status = "Draft",
                FirmName = request.FirmName.Trim(),
                VerificationCode = Guid.NewGuid().ToString()
            };
            dbContext.ServiceReports.Add(report);
        }
        else
        {
            dbContext.ServiceReportStations.RemoveRange(report.Stations);
            dbContext.ServiceReportProducts.RemoveRange(report.Products);
        }

        var previousUsages = await dbContext.VehicleStockMovements
            .Include(item => item.VehicleStockItem)
            .Where(item => item.ServiceReportId == report.Id && item.Type == "ApplicationUse")
            .ToListAsync(cancellationToken);
        foreach (var usage in previousUsages)
        {
            usage.VehicleStockItem.Quantity += usage.Quantity;
            usage.VehicleStockItem.LastMovementAt = now;
        }
        dbContext.VehicleStockMovements.RemoveRange(previousUsages);

        var stockValidation = await ApplyVehicleConsumptionAsync(request, report, workOrder, dbContext, companyContext, now, cancellationToken);
        if (stockValidation is not null) return Results.ValidationProblem(stockValidation);

        Apply(report, request);
        report.UpdatedAt = now;
        report.Status = request.Finalize ? "Finalized" : "Draft";
        report.FinalizedAt = request.Finalize ? now : null;
        var stations = request.Stations.Select(item => new ServiceReportStation
        {
            Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, ServiceReportId = report.Id,
            SitePlanId = item.SitePlanId, SitePlanElementId = NullIfEmpty(item.SitePlanElementId),
            DeviceNumber = item.DeviceNumber.Trim(), Area = item.Area.Trim(), DeviceType = item.DeviceType,
            TargetPest = NullIfEmpty(item.TargetPest), CaughtCount = item.CaughtCount,
            HasActivity = item.DeviceStatus == "Activity" || item.HasActivity || item.CaughtCount > 0, PlateChanged = item.PlateChanged,
            DeviceStatus = item.DeviceStatus, ActivityType = NullIfEmpty(item.ActivityType),
            InaccessibilityReason = NullIfEmpty(item.InaccessibilityReason),
            AppliedVehicleStockItemId = item.AppliedVehicleStockItemId, AppliedProductName = NullIfEmpty(item.AppliedProductName),
            AppliedAmount = item.AppliedAmount, AppliedUnit = NullIfEmpty(item.AppliedUnit),
            ReplacementVehicleStockItemId = item.ReplacementVehicleStockItemId, ReplacementProductName = NullIfEmpty(item.ReplacementProductName),
            ReplacementQuantity = item.ReplacementQuantity, ReplacementUnit = NullIfEmpty(item.ReplacementUnit), Notes = NullIfEmpty(item.Notes)
        }).ToList();
        var products = request.Products.Select(item => new ServiceReportProduct
        {
            Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, ServiceReportId = report.Id,
            VehicleStockItemId = item.VehicleStockItemId,
            ProductName = item.ProductName.Trim(), LicenseNumber = NullIfEmpty(item.LicenseNumber),
            ApplicationMethod = NullIfEmpty(item.ApplicationMethod), DilutionRate = NullIfEmpty(item.DilutionRate),
            ActiveIngredient = NullIfEmpty(item.ActiveIngredient), Antidote = NullIfEmpty(item.Antidote),
            PackingQuantity = NullIfEmpty(item.PackingQuantity), AmountUsed = item.AmountUsed, Unit = item.Unit.Trim()
        }).ToList();
        dbContext.ServiceReportStations.AddRange(stations);
        dbContext.ServiceReportProducts.AddRange(products);

        if (request.Finalize)
        {
            await CorrectiveActionAutomation.SyncAsync(
                dbContext, companyContext.CompanyId.Value, companyContext.AccountId.Value,
                workOrder.CustomerId, workOrder.CustomerBranchId, "ServiceReport", report.Id,
                "Saha Bulgusu", $"{workOrder.Number} saha bulgusu",
                string.Join("\n", new[] { request.Findings, request.ApplicationSummary }.Where(value => !string.IsNullOrWhiteSpace(value))),
                string.Join("\n", new[] { request.CorrectiveActions, request.Recommendations }.Where(value => !string.IsNullOrWhiteSpace(value))),
                "Joint", stations.Any(item => item.DeviceStatus is "Damaged" or "Missing") ? "High" : "Normal",
                DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7), cancellationToken);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.ChangeTracker.Clear();
            var saved = await ReportQuery(dbContext).SingleAsync(item => item.Id == report.Id, cancellationToken);
            return Results.Ok(ToResponse(saved));
        }
        catch (Exception exception)
        {
            return Results.Problem(environment.IsDevelopment() ? exception.ToString() : "Saha raporu kaydedilirken beklenmeyen bir hata oluştu.");
        }
    }

    private static async Task<IResult> UploadPhotosAsync(
        Guid workOrderId,
        HttpRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, companyContext)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        if (!request.HasFormContentType) return Results.ValidationProblem(new Dictionary<string, string[]> { ["photos"] = ["Fotoğraf dosyalarını seçin."] });

        var form = await request.ReadFormAsync(cancellationToken);
        var files = form.Files.Take(8).ToArray();
        if (files.Length == 0) return Results.Ok(Array.Empty<ServiceReportPhotoResponse>());
        var responses = new List<ServiceReportPhotoResponse>();
        foreach (var file in files)
        {
            if (file.Length is <= 0 or > 8 * 1024 * 1024 || !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["photos"] = ["Her fotoğraf JPG, PNG veya WebP biçiminde ve en fazla 8 MB olmalıdır."] });
            await using var stream = file.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);
            var photo = new WorkOrderPhoto
            {
                Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, WorkOrderId = workOrderId,
                FileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType, Data = memory.ToArray(), UploadedAt = DateTimeOffset.UtcNow
            };
            dbContext.WorkOrderPhotos.Add(photo);
            responses.Add(new ServiceReportPhotoResponse(photo.Id, photo.FileName, photo.ContentType, photo.UploadedAt, $"/api/work-orders/photos/{photo.Id}"));
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(responses);
    }

    private static async Task<IResult> GetAnalyticsAsync(
        DateOnly? from,
        DateOnly? to,
        Guid? customerId,
        Guid? branchId,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var fromDate = from ?? today.AddMonths(-2).AddDays(1 - today.Day);
        var toDate = to ?? today;
        if (toDate < fromDate || toDate.DayNumber - fromDate.DayNumber > 730) return Results.ValidationProblem(new Dictionary<string, string[]> { ["period"] = ["Geçerli ve en fazla iki yıllık bir tarih aralığı seçin."] });
        var fromOffset = new DateTimeOffset(fromDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toOffset = new DateTimeOffset(toDate.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var query = ReportQuery(dbContext).Where(item => item.Status == "Finalized");
        if (customerId.HasValue) query = query.Where(item => item.WorkOrder.CustomerId == customerId.Value);
        if (branchId.HasValue) query = query.Where(item => item.WorkOrder.CustomerBranchId == branchId.Value);
        var reports = (await query.ToListAsync(cancellationToken))
            .Where(item => item.WorkOrder.ScheduledAt >= fromOffset && item.WorkOrder.ScheduledAt < toOffset)
            .ToList();
        var allStations = reports.SelectMany(item => item.Stations).ToArray();
        var overall = CalculateRisk(allStations);
        var periods = reports.GroupBy(item => $"{item.WorkOrder.ScheduledAt:yyyy-MM}").OrderBy(item => item.Key).Select(group =>
        {
            var stations = group.SelectMany(item => item.Stations).ToArray();
            var risk = CalculateRisk(stations);
            return new TrendPeriodResponse(group.Key, group.Count(), stations.Length, stations.Count(item => item.HasActivity), stations.Count(item => item.PlateChanged), stations.Sum(item => item.CaughtCount), risk.ActivityRate, risk.Score, risk.Level);
        }).ToArray();
        var pests = allStations.Where(item => !string.IsNullOrWhiteSpace(item.TargetPest)).GroupBy(item => item.TargetPest!.Trim(), StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true)).Select(group => new PestTrendResponse(group.Key, group.Sum(item => item.CaughtCount))).OrderByDescending(item => item.TotalCaught).ToArray();
        return Results.Ok(new ServiceReportAnalyticsResponse(fromDate, toDate, reports.Count, allStations.Length, allStations.Count(item => item.HasActivity), allStations.Sum(item => item.CaughtCount), overall.ActivityRate, overall.Score, overall.Level, periods, pests));
    }

    private static IQueryable<ServiceReport> ReportQuery(PesneerDbContext dbContext) => dbContext.ServiceReports.AsNoTracking()
        .Include(item => item.WorkOrder).ThenInclude(item => item.Customer)
        .Include(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
        .Include(item => item.WorkOrder).ThenInclude(item => item.AssignedEmployeeAccount)
        .Include(item => item.WorkOrder).ThenInclude(item => item.Photos)
        .Include(item => item.Stations).Include(item => item.Products).AsSplitQuery();

    private static IQueryable<WorkOrder> WorkOrderQuery(PesneerDbContext dbContext) => dbContext.WorkOrders
        .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.AssignedEmployeeAccount);

    private static bool CanAccess(WorkOrder order, ICompanyContext companyContext) => companyContext.Portal == PortalType.Owner ||
        (companyContext.Portal == PortalType.Employee && companyContext.AccountId.HasValue && order.AssignedEmployeeAccountId == companyContext.AccountId.Value);

    private static Dictionary<string, string[]> Validate(UpsertServiceReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.FirmName.Trim().Length is < 2 or > 240) errors["firmName"] = ["Uygulayıcı firma adı 2-240 karakter arasında olmalıdır."];
        if (request.Stations.Count > 500) errors["stations"] = ["Bir raporda en fazla 500 istasyon kaydedilebilir."];
        if (request.Products.Count > 30) errors["products"] = ["Bir raporda en fazla 30 ürün kaydedilebilir."];
        for (var index = 0; index < request.Stations.Count; index++)
        {
            var item = request.Stations[index];
            if (item.DeviceNumber.Trim().Length is < 1 or > 80 || item.Area.Trim().Length is < 2 or > 240) errors[$"stations[{index}]"] = [$"{index + 1}. istasyonun numara ve alan bilgisini kontrol edin."];
            if (item.DeviceType.Trim().Length is < 1 or > 40 || !DeviceStatuses.Contains(item.DeviceStatus) || item.CaughtCount is < 0 or > 100000) errors[$"stations[{index}].status"] = [$"{index + 1}. istasyonun tür, durum veya gözlem adedi bilgisini kontrol edin."];
            if (!string.IsNullOrWhiteSpace(item.ActivityType) && !ActivityTypes.Contains(item.ActivityType)) errors[$"stations[{index}].activityType"] = [$"{index + 1}. istasyonun aktivite türü geçersiz."];
            if (item.AppliedAmount < 0 || item.ReplacementQuantity < 0) errors[$"stations[{index}].quantity"] = [$"{index + 1}. istasyonun kullanım miktarları negatif olamaz."];
            if (item.DeviceStatus == "Inaccessible" && string.IsNullOrWhiteSpace(item.InaccessibilityReason)) errors[$"stations[{index}].inaccessibilityReason"] = [$"{index + 1}. istasyona ulaşılamama nedenini yazın."];
            if (request.Finalize && item.DeviceStatus == "Unchecked") errors[$"stations[{index}].deviceStatus"] = [$"{index + 1}. istasyonun kontrol sonucunu seçin."];
            if (request.Finalize && item.DeviceStatus == "Activity")
            {
                if (string.IsNullOrWhiteSpace(item.TargetPest) || item.CaughtCount < 1) errors[$"stations[{index}].activity"] = [$"{index + 1}. istasyonda zararlı türünü ve gözlenen adedi girin."];
                if (!item.AppliedVehicleStockItemId.HasValue || item.AppliedAmount is null or <= 0 || string.IsNullOrWhiteSpace(item.AppliedUnit)) errors[$"stations[{index}].application"] = [$"{index + 1}. istasyonda kullanılan araç ürününü ve miktarını girin."];
            }
            if (request.Finalize && item.ReplacementQuantity > 0 && (!item.ReplacementVehicleStockItemId.HasValue || string.IsNullOrWhiteSpace(item.ReplacementUnit))) errors[$"stations[{index}].replacement"] = [$"{index + 1}. istasyon için kullanılan yeni ekipmanı seçin."];
        }
        for (var index = 0; index < request.Products.Count; index++)
        {
            var item = request.Products[index];
            if (item.ProductName.Trim().Length is < 2 or > 240 || item.AmountUsed < 0 || item.Unit.Trim().Length is < 1 or > 32) errors[$"products[{index}]"] = [$"{index + 1}. ürünün ad, miktar ve birim bilgisini kontrol edin."];
        }
        if (request.Finalize)
        {
            if (string.IsNullOrWhiteSpace(request.TargetPests)) errors["targetPests"] = ["Rapor tamamlanırken hedef zararlı bilgisi zorunludur."];
            if (string.IsNullOrWhiteSpace(request.ApplicationSummary)) errors["applicationSummary"] = ["Yapılan uygulama özeti zorunludur."];
            if (request.Stations.Count == 0 && request.Products.Count == 0) errors["details"] = ["En az bir istasyon veya kullanılan ürün ekleyin."];
            if (string.IsNullOrWhiteSpace(request.ManagerSignatureData) || string.IsNullOrWhiteSpace(request.CustomerSignatureData)) errors["signatures"] = ["Uygulayıcı ve müşteri yetkilisi imzaları zorunludur."];
        }
        return errors;
    }

    private static async Task<Dictionary<string, string[]>?> ApplyVehicleConsumptionAsync(
        UpsertServiceReportRequest request,
        ServiceReport report,
        WorkOrder workOrder,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (!request.Finalize) return null;
        var usedProducts = request.Products.Where(item => item.AmountUsed > 0)
            .Select(item => new StockUsage(item.VehicleStockItemId, item.ProductName, item.AmountUsed, item.Unit))
            .Concat(request.Stations.Where(item => item.AppliedAmount > 0)
                .Select(item => new StockUsage(item.AppliedVehicleStockItemId, item.AppliedProductName ?? item.DeviceNumber, item.AppliedAmount!.Value, item.AppliedUnit ?? string.Empty)))
            .Concat(request.Stations.Where(item => item.ReplacementQuantity > 0)
                .Select(item => new StockUsage(item.ReplacementVehicleStockItemId, item.ReplacementProductName ?? item.DeviceNumber, item.ReplacementQuantity!.Value, item.ReplacementUnit ?? string.Empty)))
            .ToArray();
        if (usedProducts.Length == 0) return null;
        if (usedProducts.Any(item => !item.VehicleStockItemId.HasValue))
            return new Dictionary<string, string[]> { ["products"] = ["Kullanılan her ürün için personele atanmış araç stoğundan bir ürün seçin."] };
        if (!workOrder.AssignedEmployeeAccountId.HasValue)
            return new Dictionary<string, string[]> { ["products"] = ["İlaç tüketimi kaydetmek için iş emrine önce saha personeli atayın."] };

        var itemIds = usedProducts.Select(item => item.VehicleStockItemId!.Value).Distinct().ToArray();
        var stockItems = await dbContext.VehicleStockItems
            .Include(item => item.Vehicle)
            .Where(item => itemIds.Contains(item.Id) && item.IsActive && item.Vehicle.IsActive)
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        if (stockItems.Count != itemIds.Length || stockItems.Values.Any(item => item.Vehicle.AssignedEmployeeAccountId != workOrder.AssignedEmployeeAccountId))
            return new Dictionary<string, string[]> { ["products"] = ["Seçilen ürünlerden biri iş emrine atanmış personelin aktif aracında bulunmuyor."] };

        var deductions = new Dictionary<Guid, decimal>();
        foreach (var product in usedProducts)
        {
            var stockItem = stockItems[product.VehicleStockItemId!.Value];
            if (!InventoryUnitConverter.TryConvert(product.Amount, product.Unit, stockItem.Unit, out var quantity))
                return new Dictionary<string, string[]> { ["products"] = [$"{product.ProductName} için {product.Unit} ile araç stok birimi {stockItem.Unit} uyumlu değil."] };
            deductions[stockItem.Id] = deductions.GetValueOrDefault(stockItem.Id) + quantity;
        }

        foreach (var deduction in deductions)
        {
            var stockItem = stockItems[deduction.Key];
            if (stockItem.Quantity < deduction.Value)
                return new Dictionary<string, string[]> { ["products"] = [$"{stockItem.ProductName} için araç stoğu yetersiz. Mevcut: {stockItem.Quantity:0.###} {stockItem.Unit}."] };
        }

        foreach (var deduction in deductions)
        {
            var stockItem = stockItems[deduction.Key];
            stockItem.Quantity -= deduction.Value;
            stockItem.LastMovementAt = now;
            dbContext.VehicleStockMovements.Add(new VehicleStockMovement
            {
                Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId!.Value, VehicleStockItemId = stockItem.Id,
                InventoryItemId = stockItem.InventoryItemId, ServiceReportId = report.Id,
                PerformedByAccountId = companyContext.AccountId, Type = "ApplicationUse", Quantity = deduction.Value,
                Unit = stockItem.Unit, Note = $"{workOrder.Number} numaralı iş emri saha uygulaması", OccurredAt = now
            });
        }

        return null;
    }

    private static void Apply(ServiceReport report, UpsertServiceReportRequest request)
    {
        report.FirmName = request.FirmName.Trim(); report.FirmAddress = NullIfEmpty(request.FirmAddress); report.FirmPhone = NullIfEmpty(request.FirmPhone); report.FirmWeb = NullIfEmpty(request.FirmWeb);
        report.ResponsibleManager = NullIfEmpty(request.ResponsibleManager); report.PermissionNumber = NullIfEmpty(request.PermissionNumber); report.TeamManager = NullIfEmpty(request.TeamManager);
        report.TargetPests = NullIfEmpty(request.TargetPests); report.ResidenceType = NullIfEmpty(request.ResidenceType); report.AreaSquareMeters = request.AreaSquareMeters; report.WorkType = NullIfEmpty(request.WorkType);
        report.Consumables = NullIfEmpty(request.Consumables); report.SafetyMeasures = NullIfEmpty(request.SafetyMeasures); report.ApplicationSummary = NullIfEmpty(request.ApplicationSummary);
        report.Findings = NullIfEmpty(request.Findings); report.CorrectiveActions = NullIfEmpty(request.CorrectiveActions); report.Recommendations = NullIfEmpty(request.Recommendations);
        report.CustomerRepresentativeName = NullIfEmpty(request.CustomerRepresentativeName); report.ManagerSignatureData = NullIfEmpty(request.ManagerSignatureData); report.CustomerSignatureData = NullIfEmpty(request.CustomerSignatureData);
    }

    private static (decimal ActivityRate, int Score, string Level, bool Infestation) CalculateRisk(IEnumerable<ServiceReportStation> source)
    {
        var stations = source.ToArray(); var total = stations.Length; var active = stations.Count(item => item.HasActivity || item.CaughtCount > 0); var caught = stations.Sum(item => item.CaughtCount);
        var rate = total == 0 ? 0 : Math.Round(active * 100m / total, 1);
        var score = caught == 0 ? 0 : caught < 20 ? Math.Min(39, 10 + caught) : caught < 30 ? 40 + (caught - 20) * 2 : Math.Min(100, 70 + caught - 30);
        score = Math.Min(100, score + (int)Math.Round(rate / 10m) + stations.Count(item => item.DeviceStatus is "Damaged" or "Missing") * 3);
        var level = caught >= 30 || score >= 70 ? "High" : caught >= 20 || score >= 40 ? "Medium" : "Low";
        var infestation = stations.Any(item => item.CaughtCount > 0 && ((item.TargetPest?.Contains("hamam", StringComparison.OrdinalIgnoreCase) ?? false) || (item.TargetPest?.Contains("kemirgen", StringComparison.OrdinalIgnoreCase) ?? false) || ((item.TargetPest?.Contains("sinek", StringComparison.OrdinalIgnoreCase) ?? false) && item.CaughtCount >= 5)));
        return (rate, score, level, infestation);
    }

    private static ServiceReportResponse ToResponse(ServiceReport report)
    {
        var risk = CalculateRisk(report.Stations);
        return new ServiceReportResponse(report.Id, report.WorkOrderId, report.WorkOrder.Number, report.ReportNumber, report.Status,
            report.WorkOrder.CustomerId, report.WorkOrder.Customer.LegalName, report.WorkOrder.CustomerBranchId,
            report.WorkOrder.CustomerBranch?.Name ?? "Merkez", report.WorkOrder.CustomerBranch?.Address ?? report.WorkOrder.Customer.Address ?? string.Empty,
            report.WorkOrder.ScheduledAt, report.WorkOrder.StartedAt, report.WorkOrder.CompletedAt,
            report.WorkOrder.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", report.FirmName, report.FirmAddress, report.FirmPhone, report.FirmWeb,
            report.ResponsibleManager, report.PermissionNumber, report.TeamManager, report.TargetPests, report.ResidenceType, report.AreaSquareMeters,
            report.WorkType, report.Consumables, report.SafetyMeasures, report.ApplicationSummary, report.Findings, report.CorrectiveActions,
            report.Recommendations, report.CustomerRepresentativeName, report.ManagerSignatureData, report.CustomerSignatureData,
            report.VerificationCode, report.UpdatedAt, report.FinalizedAt, report.Stations.Count, report.Stations.Count(item => item.HasActivity),
            report.Stations.Count(item => item.PlateChanged), report.Stations.Sum(item => item.CaughtCount), risk.ActivityRate, risk.Score, risk.Level, risk.Infestation,
            report.Stations.OrderBy(item => item.DeviceNumber).Select(item => new ServiceReportStationResponse(item.Id, item.SitePlanId, item.SitePlanElementId, item.DeviceNumber, item.Area, item.DeviceType, item.TargetPest, item.CaughtCount, item.HasActivity, item.PlateChanged, item.DeviceStatus, item.ActivityType, item.InaccessibilityReason, item.AppliedVehicleStockItemId, item.AppliedProductName, item.AppliedAmount, item.AppliedUnit, item.ReplacementVehicleStockItemId, item.ReplacementProductName, item.ReplacementQuantity, item.ReplacementUnit, item.Notes)).ToArray(),
            report.Products.Select(item => new ServiceReportProductResponse(item.Id, item.VehicleStockItemId, item.ProductName, item.LicenseNumber, item.ApplicationMethod, item.DilutionRate, item.ActiveIngredient, item.Antidote, item.PackingQuantity, item.AmountUsed, item.Unit)).ToArray(),
            report.WorkOrder.Photos.OrderBy(item => item.UploadedAt).Select(item => new ServiceReportPhotoResponse(item.Id, item.FileName, item.ContentType, item.UploadedAt, $"/api/work-orders/photos/{item.Id}")).ToArray());
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private sealed record StockUsage(Guid? VehicleStockItemId, string ProductName, decimal Amount, string Unit);
}
