using Microsoft.EntityFrameworkCore;
using System.Net.Mail;
using System.Text.Json;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Inventory;
using Pesneer.Api.Compliance;
using Pesneer.Api.Email;
using Pesneer.Api.WorkOrders;
using Pesneer.Api.StationActivations;
using Pesneer.Api.Audits;

namespace Pesneer.Api.Reports;

public static class ServiceReportEndpoints
{
    private static readonly HashSet<string> DeviceStatuses = ["Unchecked", "NoActivity", "Activity", "Damaged", "Inaccessible", "Missing", "Replaced", "Passive", "Active"];
    private static readonly HashSet<string> ActivityTypes = ["Sighting", "Capture", "Droppings", "Gnawing", "Track", "Nest", "Other"];

    public static IEndpointRouteBuilder MapServiceReportEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/service-reports").RequireAuthorization("CompanyStaff");
        shared.MapGet("/work-orders/{workOrderId:guid}", GetByWorkOrderAsync);
        shared.MapGet("/catalog", () => Results.Ok(new ServiceReportCatalogResponse(
            ServiceReportCatalog.PestTypes, ServiceReportCatalog.ActivityTypes, ServiceReportCatalog.EquipmentTypes,
            ServiceReportCatalog.InaccessibilityReasons, ServiceReportCatalog.ResidenceTypes, ServiceReportCatalog.WorkTypes,
            ServiceReportCatalog.SafetyMeasures, ServiceReportCatalog.ApplicationMethods, ServiceReportCatalog.ProductUnits,
            Enumerable.Range(1, 10).ToArray())));
        shared.MapGet("/work-orders/{workOrderId:guid}/previous", GetPreviousByWorkOrderAsync);
        shared.MapPut("/work-orders/{workOrderId:guid}", UpsertAsync);
        shared.MapPost("/work-orders/{workOrderId:guid}/photos", UploadPhotosAsync).DisableAntiforgery();

        var company = app.MapGroup("/api/company/service-reports").RequireAuthorization("OwnerPortal");
        company.MapGet("/", GetCompanyReportsAsync);
        company.MapGet("/analytics", GetAnalyticsAsync);

        app.MapGet("/api/employee/service-reports", GetEmployeeReportsAsync).RequireAuthorization("EmployeePortal");
        app.MapGet("/api/customer/service-reports", GetCustomerReportsAsync).RequireAuthorization("CustomerPortal");
        app.MapGet("/api/service-reports/{reportId:guid}/pdf", DownloadPdfAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> DownloadPdfAsync(
        Guid reportId,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        var report = await ReportQuery(dbContext).SingleOrDefaultAsync(item => item.Id == reportId, cancellationToken);
        if (report is null || !CanViewReport(report, companyContext))
            return Results.NotFound(new { message = "Hizmet raporu bulunamadı." });

        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == report.CompanyId, cancellationToken);
        var pdf = AuditPackageRenderer.RenderOfficialEk1Form(report, company);
        return Results.File(pdf, "application/pdf", $"{report.ReportNumber}_EK1.pdf");
    }

    private static async Task<IResult> GetByWorkOrderAsync(Guid workOrderId, PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, companyContext)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var report = await ReportQuery(dbContext).SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (report is null) return Results.NotFound(new { message = "Bu iş emri için henüz saha raporu oluşturulmadı." });
        return Results.Ok(ToResponse(report));
    }

    private static async Task<IResult> GetPreviousByWorkOrderAsync(Guid workOrderId, PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        var workOrder = await WorkOrderQuery(dbContext).AsNoTracking().SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, companyContext)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var reports = await ReportQuery(dbContext)
            .Where(item => item.WorkOrderId != workOrderId && item.Status == "Finalized")
            .Where(item => item.WorkOrder.CustomerId == workOrder.CustomerId && item.WorkOrder.CustomerBranchId == workOrder.CustomerBranchId)
            .ToListAsync(cancellationToken);
        var report = reports.OrderByDescending(item => item.FinalizedAt ?? item.UpdatedAt).FirstOrDefault();
        return Results.Ok(report is null ? null : ToResponse(report));
    }

    private static async Task<IResult> GetCompanyReportsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var reports = await ReportQuery(dbContext).ToListAsync(cancellationToken);
        return Results.Ok(reports.OrderByDescending(item => item.UpdatedAt).Select(item => ToResponse(item)));
    }

    private static async Task<IResult> GetEmployeeReportsAsync(PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue) return Results.Forbid();
        var reports = await ReportQuery(dbContext)
            .Where(item => item.WorkOrder.AssignedEmployeeAccountId == companyContext.AccountId.Value ||
                           item.WorkOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == companyContext.AccountId.Value))
            .ToListAsync(cancellationToken);
        return Results.Ok(reports.OrderByDescending(item => item.UpdatedAt).Select(item => ToResponse(item)));
    }

    private static async Task<IResult> GetCustomerReportsAsync(PesneerDbContext dbContext, ICompanyContext companyContext, CancellationToken cancellationToken)
    {
        if (!companyContext.CustomerId.HasValue) return Results.Forbid();
        var reports = await ReportQuery(dbContext)
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == companyContext.CustomerId.Value)
            .Where(item => !companyContext.CustomerBranchId.HasValue || item.WorkOrder.CustomerBranchId == companyContext.CustomerBranchId.Value)
            .ToListAsync(cancellationToken);
        return Results.Ok(reports.OrderByDescending(item => item.FinalizedAt ?? item.UpdatedAt).Select(item => ToResponse(item, false)));
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
        var participantIds = workOrder.Assignments.Select(item => item.EmployeeAccountId)
            .Concat(workOrder.AssignedEmployeeAccountId.HasValue ? [workOrder.AssignedEmployeeAccountId.Value] : [])
            .Distinct().ToArray();
        if (request.Finalize && companyContext.Portal == PortalType.Employee)
        {
            var pendingIds = participantIds.Where(id => id != companyContext.AccountId.Value &&
                !workOrder.VisitSessions.Any(session => session.EmployeeAccountId == id && session.Status == "Completed")).ToHashSet();
            if (pendingIds.Count > 0)
            {
                var pendingEmployees = workOrder.Assignments.Where(item => pendingIds.Contains(item.EmployeeAccountId)).Select(item => item.EmployeeAccount.DisplayName)
                    .Concat(workOrder.AssignedEmployeeAccountId.HasValue && pendingIds.Contains(workOrder.AssignedEmployeeAccountId.Value)
                        ? [workOrder.AssignedEmployeeAccount?.DisplayName ?? "Atanmış personel"] : [])
                    .Distinct().ToArray();
                return Results.Conflict(new { message = $"Rapor kapatılamadı. Ekipte saha payını tamamlamayan personel bulunuyor: {string.Join(", ", pendingEmployees)}." });
            }
        }

        var report = await dbContext.ServiceReports
            .Include(item => item.Stations).ThenInclude(item => item.PestObservations)
            .Include(item => item.Products)
            .SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (report is not null && report.Status == "Finalized" && companyContext.Portal == PortalType.Employee)
        {
            return Results.Conflict(new { message = "Tamamlanmış rapor yalnızca firma sahibi tarafından yeniden düzenlenebilir." });
        }
        var staleCollaborativeUpdate = report is not null && companyContext.Portal == PortalType.Employee && participantIds.Length > 1 &&
            request.BaseUpdatedAt.HasValue && Math.Abs((report.UpdatedAt - request.BaseUpdatedAt.Value).TotalMilliseconds) > 1;
        if (report is not null && !request.ForceOverwrite && !staleCollaborativeUpdate && request.BaseUpdatedAt.HasValue &&
            Math.Abs((report.UpdatedAt - request.BaseUpdatedAt.Value).TotalMilliseconds) > 1)
        {
            return Results.Conflict(new
            {
                message = "Bu saha raporu başka bir cihazda güncellendi. Hangi sürümün korunacağını seçin.",
                current = ToResponse(report)
            });
        }
        if (report is not null && staleCollaborativeUpdate)
        {
            request = request with
            {
                Stations = MergeStations(report.Stations, request.Stations),
                Products = MergeProducts(report.Products, request.Products)
            };
        }
        var validation = Validate(request);
        if (validation.Count > 0) return Results.ValidationProblem(validation);
        var licenseResolution = await ResolveProductLicensesAsync(request.Products, dbContext, cancellationToken);
        if (licenseResolution.Errors is not null) return Results.ValidationProblem(licenseResolution.Errors);
        request = request with { Products = licenseResolution.Products };

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

        Apply(report, request, staleCollaborativeUpdate);
        report.UpdatedAt = now;
        report.Status = request.Finalize ? "Finalized" : "Draft";
        report.FinalizedAt = request.Finalize ? now : null;
        var stations = request.Stations.Select(item =>
        {
            var stationId = Guid.NewGuid();
            var observations = (item.PestObservations ?? []).Where(observation => observation.ApprovedCount > 0 || observation.DetectedCount > 0)
                .Select(observation => new ServiceReportPestObservation
                {
                    Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, ServiceReportStationId = stationId,
                    PestKey = observation.PestKey.Trim(), PestName = observation.PestName.Trim(),
                    DetectedCount = observation.DetectedCount, ApprovedCount = observation.ApprovedCount,
                    MeanConfidence = observation.MeanConfidence, Source = observation.Source,
                    ModelName = NullIfEmpty(observation.ModelName), ModelVersion = NullIfEmpty(observation.ModelVersion),
                    ReviewStatus = observation.ReviewStatus, VisionResultJson = NullIfEmpty(observation.VisionResultJson),
                    AnalyzedAt = observation.AnalyzedAt, ReviewedAt = now, ReviewedByAccountId = companyContext.AccountId
                }).ToList();
            var approvedTotal = observations.Sum(observation => observation.ApprovedCount);
            var dominantPest = observations.OrderByDescending(observation => observation.ApprovedCount).FirstOrDefault()?.PestName;
            return new ServiceReportStation
            {
                Id = stationId, CompanyId = companyContext.CompanyId.Value, ServiceReportId = report.Id,
                SitePlanId = item.SitePlanId, SitePlanElementId = NullIfEmpty(item.SitePlanElementId),
                DeviceNumber = item.DeviceNumber.Trim(), Area = item.Area.Trim(), DeviceType = item.DeviceType,
                TargetPest = NullIfEmpty(dominantPest ?? item.TargetPest), CaughtCount = observations.Count > 0 ? approvedTotal : item.CaughtCount,
                HasActivity = item.DeviceStatus == "Activity" || item.HasActivity || approvedTotal > 0 || item.CaughtCount > 0, PlateChanged = item.PlateChanged,
                DeviceStatus = item.DeviceStatus, ActivityType = NullIfEmpty(item.ActivityType),
                InaccessibilityReason = NullIfEmpty(item.InaccessibilityReason),
                AppliedVehicleStockItemId = item.AppliedVehicleStockItemId, AppliedProductName = NullIfEmpty(item.AppliedProductName),
                AppliedAmount = item.AppliedAmount, AppliedUnit = NullIfEmpty(item.AppliedUnit),
                ReplacementVehicleStockItemId = item.ReplacementVehicleStockItemId, ReplacementProductName = NullIfEmpty(item.ReplacementProductName),
                ReplacementQuantity = item.ReplacementQuantity, ReplacementUnit = NullIfEmpty(item.ReplacementUnit), Notes = NullIfEmpty(item.Notes),
                PestObservations = observations
            };
        }).ToList();
        var products = request.Products.Select(item => new ServiceReportProduct
        {
            Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, ServiceReportId = report.Id,
            VehicleStockItemId = item.VehicleStockItemId,
            LicenseDocumentId = item.LicenseDocumentId,
            ProductName = item.ProductName.Trim(), LicenseNumber = NullIfEmpty(item.LicenseNumber),
            ApplicationMethod = NullIfEmpty(item.ApplicationMethod), DilutionRate = NullIfEmpty(item.DilutionRate),
            ActiveIngredient = NullIfEmpty(item.ActiveIngredient), Antidote = NullIfEmpty(item.Antidote),
            PackingQuantity = NullIfEmpty(item.PackingQuantity), AmountUsed = item.AmountUsed, Unit = item.Unit.Trim()
        }).ToList();
        dbContext.ServiceReportStations.AddRange(stations);
        dbContext.ServiceReportProducts.AddRange(products);

        if (request.Finalize)
        {
            var previousStatus = workOrder.Status;
            workOrder.Status = "Completed";
            workOrder.CompletedAt = now;
            workOrder.CompletionNote = NullIfEmpty(request.ApplicationSummary);
            workOrder.Recommendation = NullIfEmpty(request.Recommendations);
            WorkOrderEndpoints.CloseVisitSessions(workOrder, now);
            if (previousStatus != "Completed")
            {
                dbContext.WorkOrderStatusHistories.Add(new WorkOrderStatusHistory
                {
                    Id = Guid.NewGuid(), CompanyId = workOrder.CompanyId, WorkOrderId = workOrder.Id,
                    ChangedByAccountId = companyContext.AccountId.Value, FromStatus = previousStatus, ToStatus = "Completed",
                    Note = "İmzalı saha raporu onaylandı ve ziyaret tamamlandı.", OccurredAt = now
                });
            }
            await CorrectiveActionAutomation.SyncAsync(
                dbContext, companyContext.CompanyId.Value, companyContext.AccountId.Value,
                workOrder.CustomerId, workOrder.CustomerBranchId, "ServiceReport", report.Id,
                "Saha Bulgusu", $"{workOrder.Number} saha bulgusu",
                string.Join("\n", new[] { request.Findings, request.ApplicationSummary }.Where(value => !string.IsNullOrWhiteSpace(value))),
                string.Join("\n", new[] { request.CorrectiveActions, request.Recommendations }.Where(value => !string.IsNullOrWhiteSpace(value))),
                "Joint", stations.Any(item => item.DeviceStatus is "Damaged" or "Missing") ? "High" : "Normal",
                DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7), cancellationToken);
            await ReportEmailAutomation.SyncRecipientsAsync(dbContext, report, workOrder, request.AdditionalEmailRecipients ?? [], cancellationToken);
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
        List<ServiceReportPhotoMetadata> metadata;
        try { metadata = JsonSerializer.Deserialize<List<ServiceReportPhotoMetadata>>(form["metadata"].FirstOrDefault() ?? "[]", new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? []; }
        catch (JsonException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["metadata"] = ["Fotoğraf açıklama bilgileri okunamadı."] }); }
        var responses = new List<ServiceReportPhotoResponse>();
        for (var index = 0; index < files.Length; index++)
        {
            var file = files[index];
            var detail = index < metadata.Count ? metadata[index] : null;
            if (file.Length is <= 0 or > 8 * 1024 * 1024 || !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["photos"] = ["Her fotoğraf JPG, PNG veya WebP biçiminde ve en fazla 8 MB olmalıdır."] });
            if (detail?.Location?.Length > 240 || detail?.Status?.Length > 80 || detail?.Description?.Length > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["metadata"] = ["Fotoğraf yer, durum veya açıklama alanı izin verilen uzunluğu aşıyor."] });
            await using var stream = file.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);
            var photo = new WorkOrderPhoto
            {
                Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, WorkOrderId = workOrderId,
                FileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType, Data = memory.ToArray(), Location = NullIfEmpty(detail?.Location),
                Status = NullIfEmpty(detail?.Status), Description = NullIfEmpty(detail?.Description), UploadedAt = DateTimeOffset.UtcNow
            };
            dbContext.WorkOrderPhotos.Add(photo);
            responses.Add(new ServiceReportPhotoResponse(photo.Id, photo.FileName, photo.ContentType, photo.UploadedAt, $"/api/work-orders/photos/{photo.Id}", photo.Location, photo.Status, photo.Description));
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
        var activationQuery = dbContext.StationActivations.AsNoTracking().Include(item => item.WorkOrder).Where(item => item.Status == "Finalized");
        if (customerId.HasValue) activationQuery = activationQuery.Where(item => item.WorkOrder.CustomerId == customerId.Value);
        if (branchId.HasValue) activationQuery = activationQuery.Where(item => item.WorkOrder.CustomerBranchId == branchId.Value);
        var activations = (await activationQuery.ToListAsync(cancellationToken))
            .Where(item => item.WorkOrder.ScheduledAt >= fromOffset && item.WorkOrder.ScheduledAt < toOffset)
            .ToList();
        var sources = reports.Where(item => item.Stations.Count > 0).Select(item => new AnalyticsSource(item.WorkOrder.ScheduledAt, item.Stations.Select(station => new AnalyticsStation(
                station.HasActivity, station.PlateChanged, station.CaughtCount, station.DeviceStatus, station.TargetPest,
                station.PestObservations.Select(pest => new AnalyticsPest(pest.PestName, pest.ApprovedCount)).ToArray())).ToArray()))
            .Concat(activations.Select(item => new AnalyticsSource(item.WorkOrder.ScheduledAt, StationActivationData.Deserialize(item.StationsJson).Select(station => new AnalyticsStation(
                station.HasActivity, station.PlateChanged, station.CaughtCount, station.DeviceStatus, station.TargetPest,
                (station.PestObservations ?? []).Select(pest => new AnalyticsPest(pest.PestName, pest.ApprovedCount)).ToArray())).ToArray())))
            .ToArray();
        var allStations = sources.SelectMany(item => item.Stations).ToArray();
        var overall = CalculateRisk(allStations);
        var periods = sources.GroupBy(item => $"{item.ScheduledAt:yyyy-MM}").OrderBy(item => item.Key).Select(group =>
        {
            var stations = group.SelectMany(item => item.Stations).ToArray();
            var risk = CalculateRisk(stations);
            return new TrendPeriodResponse(group.Key, group.Count(), stations.Length, stations.Count(item => item.HasActivity), stations.Count(item => item.PlateChanged), stations.Sum(item => item.CaughtCount), risk.ActivityRate, risk.Score, risk.Level);
        }).ToArray();
        var observationPests = allStations.SelectMany(item => item.Pests)
            .Where(item => item.Count > 0)
            .GroupBy(item => item.Name.Trim(), StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTrendResponse(group.Key, group.Sum(item => item.Count)));
        var legacyPests = allStations.Where(item => item.Pests.Count == 0 && !string.IsNullOrWhiteSpace(item.TargetPest))
            .GroupBy(item => item.TargetPest!.Trim(), StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTrendResponse(group.Key, group.Sum(item => item.CaughtCount)));
        var pests = observationPests.Concat(legacyPests).GroupBy(item => item.Pest, StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .Select(group => new PestTrendResponse(group.Key, group.Sum(item => item.TotalCaught))).OrderByDescending(item => item.TotalCaught).ToArray();
        return Results.Ok(new ServiceReportAnalyticsResponse(fromDate, toDate, sources.Length, allStations.Length, allStations.Count(item => item.HasActivity), allStations.Sum(item => item.CaughtCount), overall.ActivityRate, overall.Score, overall.Level, periods, pests));
    }

    private static IQueryable<ServiceReport> ReportQuery(PesneerDbContext dbContext) => dbContext.ServiceReports.AsNoTracking()
        .Include(item => item.CreatedByAccount)
        .Include(item => item.WorkOrder).ThenInclude(item => item.Customer)
        .Include(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
        .Include(item => item.WorkOrder).ThenInclude(item => item.AssignedEmployeeAccount)
        .Include(item => item.WorkOrder).ThenInclude(item => item.Assignments).ThenInclude(item => item.EmployeeAccount)
        .Include(item => item.WorkOrder).ThenInclude(item => item.VisitSessions).ThenInclude(item => item.EmployeeAccount)
        .Include(item => item.WorkOrder).ThenInclude(item => item.Photos)
        .Include(item => item.Stations).ThenInclude(item => item.PestObservations)
        .Include(item => item.Products).Include(item => item.EmailDeliveries).AsSplitQuery();

    private static IQueryable<WorkOrder> WorkOrderQuery(PesneerDbContext dbContext) => dbContext.WorkOrders
        .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.AssignedEmployeeAccount)
        .Include(item => item.Assignments).ThenInclude(item => item.EmployeeAccount)
        .Include(item => item.VisitSessions).ThenInclude(item => item.EmployeeAccount);

    private static bool CanAccess(WorkOrder order, ICompanyContext companyContext) => companyContext.Portal == PortalType.Owner ||
        (companyContext.Portal == PortalType.Employee && companyContext.AccountId.HasValue &&
            (order.AssignedEmployeeAccountId == companyContext.AccountId.Value || order.Assignments.Any(item => item.EmployeeAccountId == companyContext.AccountId.Value)));

    private static bool CanViewReport(ServiceReport report, ICompanyContext companyContext)
    {
        if (companyContext.Portal == PortalType.Customer)
            return report.Status == "Finalized" && companyContext.CustomerId.HasValue &&
                   report.WorkOrder.CustomerId == companyContext.CustomerId.Value &&
                   (!companyContext.CustomerBranchId.HasValue || report.WorkOrder.CustomerBranchId == companyContext.CustomerBranchId.Value);

        return CanAccess(report.WorkOrder, companyContext);
    }

    private static Dictionary<string, string[]> Validate(UpsertServiceReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var additionalRecipients = request.AdditionalEmailRecipients ?? [];
        if (additionalRecipients.Count > 10) errors["additionalEmailRecipients"] = ["En fazla 10 ek e-posta alıcısı ekleyebilirsiniz."];
        for (var index = 0; index < additionalRecipients.Count; index++)
            if (!MailAddress.TryCreate(additionalRecipients[index]?.Trim(), out _)) errors[$"additionalEmailRecipients[{index}]"] = [$"{index + 1}. ek e-posta adresi geçerli değil."];
        if (request.FirmName.Trim().Length is < 2 or > 240) errors["firmName"] = ["Uygulayıcı firma adı 2-240 karakter arasında olmalıdır."];
        if (request.Stations.Count > 500) errors["stations"] = ["Bir raporda en fazla 500 istasyon kaydedilebilir."];
        if (request.Products.Count > 30) errors["products"] = ["Bir raporda en fazla 30 ürün kaydedilebilir."];
        if (!ServiceReportCatalog.IsKnownList(request.TargetPests, ServiceReportCatalog.PestTypes)) errors["targetPests"] = ["Hedef zararlı listesinden bir değer seçin; listede yoksa Diğer seçeneğini kullanın."];
        if (!ServiceReportCatalog.IsKnownOrOther(request.ResidenceType, ServiceReportCatalog.ResidenceTypes)) errors["residenceType"] = ["Mahal türü listesinden bir değer seçin; listede yoksa Diğer seçeneğini kullanın."];
        if (!ServiceReportCatalog.IsKnownList(request.WorkType, ServiceReportCatalog.WorkTypes)) errors["workType"] = ["İş türü listesinden seçim yapın; listede yoksa Diğer seçeneğini kullanın."];
        if (!ServiceReportCatalog.IsKnownList(request.SafetyMeasures, ServiceReportCatalog.SafetyMeasures)) errors["safetyMeasures"] = ["Güvenlik önlemlerini listeden seçin; listede yoksa Diğer seçeneğini kullanın."];
        for (var index = 0; index < request.Stations.Count; index++)
        {
            var item = request.Stations[index];
            var observations = item.PestObservations ?? [];
            if (observations.Count > 20) errors[$"stations[{index}].pestObservations"] = [$"{index + 1}. istasyonda en fazla 20 zararlı sınıfı kaydedilebilir."];
            if (observations.Any(observation =>
                    observation.PestKey.Trim().Length is < 1 or > 64
                    || observation.PestName.Trim().Length is < 1 or > 120
                    || observation.DetectedCount is < 0 or > 100000
                    || observation.ApprovedCount is < 0 or > 100000
                    || observation.MeanConfidence is < 0 or > 1
                    || observation.VisionResultJson?.Length > 200000
                    || observation.Source.Trim() is not ("PestneerVision" or "VisionEdited" or "Manual")
                    || observation.ReviewStatus.Trim() is not ("Approved" or "PendingReview" or "Reviewed")))
                errors[$"stations[{index}].pestObservations"] = [$"{index + 1}. istasyonun PestneerVision sonuçları geçerli değil."];
            if (item.DeviceNumber.Trim().Length is < 1 or > 80 || item.Area.Trim().Length is < 2 or > 240) errors[$"stations[{index}]"] = [$"{index + 1}. istasyonun numara ve alan bilgisini kontrol edin."];
            if (item.DeviceType.Trim().Length is < 1 or > 40 || !DeviceStatuses.Contains(item.DeviceStatus) || item.CaughtCount is < 0 or > 100000) errors[$"stations[{index}].status"] = [$"{index + 1}. istasyonun tür, durum veya gözlem adedi bilgisini kontrol edin."];
            if (!ServiceReportCatalog.IsKnownOrOther(item.TargetPest, ServiceReportCatalog.PestTypes)) errors[$"stations[{index}].targetPest"] = [$"{index + 1}. istasyonun zararlı türünü listeden seçin; listede yoksa Diğer seçeneğini kullanın."];
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
            if (!ServiceReportCatalog.IsKnownOrOther(item.ApplicationMethod, ServiceReportCatalog.ApplicationMethods)) errors[$"products[{index}].applicationMethod"] = [$"{index + 1}. ürünün uygulama yöntemini listeden seçin; listede yoksa Diğer seçeneğini kullanın."];
            if (!ServiceReportCatalog.IsKnownOrOther(item.Unit, ServiceReportCatalog.ProductUnits)) errors[$"products[{index}].unit"] = [$"{index + 1}. ürünün birimini listeden seçin; listede yoksa Diğer seçeneğini kullanın."];
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
        var assignedEmployeeIds = workOrder.Assignments.Select(item => item.EmployeeAccountId)
            .Concat(workOrder.AssignedEmployeeAccountId.HasValue ? [workOrder.AssignedEmployeeAccountId.Value] : []).ToHashSet();
        if (assignedEmployeeIds.Count == 0)
            return new Dictionary<string, string[]> { ["products"] = ["İlaç tüketimi kaydetmek için iş emrine önce saha personeli atayın."] };

        var itemIds = usedProducts.Select(item => item.VehicleStockItemId!.Value).Distinct().ToArray();
        var stockItems = await dbContext.VehicleStockItems
            .Include(item => item.Vehicle)
            .Where(item => itemIds.Contains(item.Id) && item.IsActive && item.Vehicle.IsActive)
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        if (stockItems.Count != itemIds.Length || stockItems.Values.Any(item => !item.Vehicle.AssignedEmployeeAccountId.HasValue || !assignedEmployeeIds.Contains(item.Vehicle.AssignedEmployeeAccountId.Value)))
            return new Dictionary<string, string[]> { ["products"] = ["Seçilen ürünlerden biri iş emrine atanmış ekip üyelerinin aktif araçlarında bulunmuyor."] };

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

    private static async Task<ProductLicenseResolution> ResolveProductLicensesAsync(
        IReadOnlyList<ServiceReportProductInput> products,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var stockItemIds = products.Where(item => item.VehicleStockItemId.HasValue)
            .Select(item => item.VehicleStockItemId!.Value).Distinct().ToArray();
        if (stockItemIds.Length == 0) return new ProductLicenseResolution(products, null);

        var stockItems = await dbContext.VehicleStockItems.AsNoTracking()
            .Include(item => item.InventoryItem).ThenInclude(item => item!.LicenseDocuments)
            .Where(item => stockItemIds.Contains(item.Id) && item.IsActive)
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        if (stockItems.Count != stockItemIds.Length)
            return new ProductLicenseResolution(products, new Dictionary<string, string[]> { ["products"] = ["Seçilen araç stok ürünlerinden biri artık kullanılamıyor."] });

        var resolved = products.Select(item =>
        {
            if (!item.VehicleStockItemId.HasValue || !stockItems.TryGetValue(item.VehicleStockItemId.Value, out var stockItem) || stockItem.InventoryItem is null)
                return item;
            var license = stockItem.InventoryItem.LicenseDocuments.Where(document => document.Category == "Licenses")
                .OrderByDescending(document => document.CreatedAt).FirstOrDefault();
            return license is null
                ? item with { LicenseDocumentId = null, LicenseNumber = stockItem.InventoryItem.LicenseNumber ?? item.LicenseNumber }
                : item with { LicenseDocumentId = license.Id, LicenseNumber = license.LicenseNumber ?? stockItem.InventoryItem.LicenseNumber };
        }).ToArray();
        return new ProductLicenseResolution(resolved, null);
    }

    private static IReadOnlyList<ServiceReportStationInput> MergeStations(
        IEnumerable<ServiceReportStation> existingStations,
        IReadOnlyList<ServiceReportStationInput> incomingStations)
    {
        var merged = existingStations.Select(ToInput).GroupBy(StationKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Last(), StringComparer.OrdinalIgnoreCase);
        foreach (var incoming in incomingStations)
        {
            var key = StationKey(incoming);
            if (!merged.TryGetValue(key, out var existing) || incoming.DeviceStatus != "Unchecked" || existing.DeviceStatus == "Unchecked")
                merged[key] = incoming;
        }
        return merged.Values.OrderBy(item => item.DeviceNumber, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static IReadOnlyList<ServiceReportProductInput> MergeProducts(
        IEnumerable<ServiceReportProduct> existingProducts,
        IReadOnlyList<ServiceReportProductInput> incomingProducts)
    {
        var merged = existingProducts.Select(item => new ServiceReportProductInput(
                item.VehicleStockItemId, item.LicenseDocumentId, item.ProductName, item.LicenseNumber, item.ApplicationMethod, item.DilutionRate,
                item.ActiveIngredient, item.Antidote, item.PackingQuantity, item.AmountUsed, item.Unit))
            .GroupBy(ProductKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Last(), StringComparer.OrdinalIgnoreCase);
        foreach (var incoming in incomingProducts.Where(item => !string.IsNullOrWhiteSpace(item.ProductName)))
        {
            var key = ProductKey(incoming);
            if (!merged.TryGetValue(key, out var existing) || incoming.AmountUsed > 0 || existing.AmountUsed <= 0)
                merged[key] = incoming;
        }
        return merged.Values.ToArray();
    }

    private static ServiceReportStationInput ToInput(ServiceReportStation item) => new(
        item.SitePlanId, item.SitePlanElementId, item.DeviceNumber, item.Area, item.DeviceType, item.TargetPest,
        item.CaughtCount, item.HasActivity, item.PlateChanged, item.DeviceStatus, item.ActivityType, item.InaccessibilityReason,
        item.AppliedVehicleStockItemId, item.AppliedProductName, item.AppliedAmount, item.AppliedUnit,
        item.ReplacementVehicleStockItemId, item.ReplacementProductName, item.ReplacementQuantity, item.ReplacementUnit, item.Notes,
        item.PestObservations.Select(observation => new ServiceReportPestObservationInput(
            observation.PestKey, observation.PestName, observation.DetectedCount, observation.ApprovedCount,
            observation.MeanConfidence, observation.Source, observation.ModelName, observation.ModelVersion,
            observation.ReviewStatus, observation.VisionResultJson, observation.AnalyzedAt)).ToArray());

    private static string StationKey(ServiceReportStationInput item) => !string.IsNullOrWhiteSpace(item.SitePlanElementId)
        ? $"plan:{item.SitePlanId}:{item.SitePlanElementId.Trim()}"
        : $"manual:{item.DeviceNumber.Trim()}";

    private static string ProductKey(ServiceReportProductInput item) => item.VehicleStockItemId.HasValue
        ? $"stock:{item.VehicleStockItemId.Value}"
        : $"manual:{item.ProductName.Trim()}:{item.Unit.Trim()}";

    private static void Apply(ServiceReport report, UpsertServiceReportRequest request, bool preserveExisting)
    {
        report.FirmName = request.FirmName.Trim(); report.FirmAddress = Keep(report.FirmAddress, request.FirmAddress, preserveExisting); report.FirmPhone = Keep(report.FirmPhone, request.FirmPhone, preserveExisting); report.FirmWeb = Keep(report.FirmWeb, request.FirmWeb, preserveExisting);
        report.ResponsibleManager = Keep(report.ResponsibleManager, request.ResponsibleManager, preserveExisting); report.PermissionNumber = Keep(report.PermissionNumber, request.PermissionNumber, preserveExisting); report.TeamManager = Keep(report.TeamManager, request.TeamManager, preserveExisting);
        report.TargetPests = Keep(report.TargetPests, request.TargetPests, preserveExisting); report.ResidenceType = Keep(report.ResidenceType, request.ResidenceType, preserveExisting); report.AreaSquareMeters = preserveExisting && !request.AreaSquareMeters.HasValue ? report.AreaSquareMeters : request.AreaSquareMeters; report.WorkType = Keep(report.WorkType, request.WorkType, preserveExisting);
        report.Consumables = Keep(report.Consumables, request.Consumables, preserveExisting); report.SafetyMeasures = Keep(report.SafetyMeasures, request.SafetyMeasures, preserveExisting); report.ApplicationSummary = Keep(report.ApplicationSummary, request.ApplicationSummary, preserveExisting);
        report.Findings = Keep(report.Findings, request.Findings, preserveExisting); report.CorrectiveActions = Keep(report.CorrectiveActions, request.CorrectiveActions, preserveExisting); report.Recommendations = Keep(report.Recommendations, request.Recommendations, preserveExisting);
        report.CustomerRepresentativeName = Keep(report.CustomerRepresentativeName, request.CustomerRepresentativeName, preserveExisting); report.ManagerSignatureData = Keep(report.ManagerSignatureData, request.ManagerSignatureData, preserveExisting); report.CustomerSignatureData = Keep(report.CustomerSignatureData, request.CustomerSignatureData, preserveExisting);
        var existingRecipients = preserveExisting && !string.IsNullOrWhiteSpace(report.AdditionalEmailRecipients)
            ? report.AdditionalEmailRecipients.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) : [];
        var recipients = existingRecipients.Concat(request.AdditionalEmailRecipients ?? []).Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        report.AdditionalEmailRecipients = recipients.Length > 0 ? string.Join(';', recipients) : null;
    }

    private static string? Keep(string? current, string? incoming, bool preserveExisting) =>
        preserveExisting && string.IsNullOrWhiteSpace(incoming) ? current : NullIfEmpty(incoming);

    private static (decimal ActivityRate, int Score, string Level, bool Infestation) CalculateRisk(IEnumerable<ServiceReportStation> source)
    {
        return CalculateRisk(source.Select(item => new AnalyticsStation(item.HasActivity, item.PlateChanged, item.CaughtCount, item.DeviceStatus, item.TargetPest, [])));
    }

    private static (decimal ActivityRate, int Score, string Level, bool Infestation) CalculateRisk(IEnumerable<AnalyticsStation> source)
    {
        var stations = source.ToArray(); var total = stations.Length; var active = stations.Count(item => item.HasActivity || item.CaughtCount > 0); var caught = stations.Sum(item => item.CaughtCount);
        var rate = total == 0 ? 0 : Math.Round(active * 100m / total, 1);
        var score = caught == 0 ? 0 : caught < 20 ? Math.Min(39, 10 + caught) : caught < 30 ? 40 + (caught - 20) * 2 : Math.Min(100, 70 + caught - 30);
        score = Math.Min(100, score + (int)Math.Round(rate / 10m) + stations.Count(item => item.DeviceStatus is "Damaged" or "Missing") * 3);
        var level = caught >= 30 || score >= 70 ? "High" : caught >= 20 || score >= 40 ? "Medium" : "Low";
        var infestation = stations.Any(item => item.CaughtCount > 0 && ((item.TargetPest?.Contains("hamam", StringComparison.OrdinalIgnoreCase) ?? false) || (item.TargetPest?.Contains("kemirgen", StringComparison.OrdinalIgnoreCase) ?? false) || ((item.TargetPest?.Contains("sinek", StringComparison.OrdinalIgnoreCase) ?? false) && item.CaughtCount >= 5)));
        return (rate, score, level, infestation);
    }

    private sealed record AnalyticsSource(DateTimeOffset ScheduledAt, IReadOnlyList<AnalyticsStation> Stations);
    private sealed record AnalyticsStation(bool HasActivity, bool PlateChanged, int CaughtCount, string DeviceStatus, string? TargetPest, IReadOnlyList<AnalyticsPest> Pests);
    private sealed record AnalyticsPest(string Name, int Count);

    private static ServiceReportResponse ToResponse(ServiceReport report, bool includeEmailDetails = true)
    {
        var risk = CalculateRisk(report.Stations);
        var emailStatus = EmailDeliveryStatus(report.EmailDeliveries);
        var additionalRecipients = includeEmailDetails && !string.IsNullOrWhiteSpace(report.AdditionalEmailRecipients)
            ? report.AdditionalEmailRecipients.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : [];
        return new ServiceReportResponse(report.Id, report.WorkOrderId, report.WorkOrder.Number, report.ReportNumber, report.Status,
            report.WorkOrder.CustomerId, report.WorkOrder.Customer.LegalName, report.WorkOrder.CustomerBranchId,
            report.WorkOrder.CustomerBranch?.Name ?? "Merkez", report.WorkOrder.CustomerBranch?.Address ?? report.WorkOrder.Customer.Address ?? string.Empty,
            report.WorkOrder.ScheduledAt, report.WorkOrder.StartedAt, report.WorkOrder.CompletedAt, report.WorkOrder.CustomerDurationMinutes, report.WorkOrder.TotalLaborMinutes,
            report.WorkOrder.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", report.FirmName, report.FirmAddress, report.FirmPhone, report.FirmWeb,
            report.ResponsibleManager, report.PermissionNumber, report.TeamManager, report.TargetPests, report.ResidenceType, report.AreaSquareMeters,
            report.WorkType, report.Consumables, report.SafetyMeasures, report.ApplicationSummary, report.Findings, report.CorrectiveActions,
            report.Recommendations, report.CustomerRepresentativeName, report.ManagerSignatureData, report.CustomerSignatureData,
            report.VerificationCode, report.UpdatedAt, report.FinalizedAt, report.Stations.Count, report.Stations.Count(item => item.HasActivity),
            report.Stations.Count(item => item.PlateChanged), report.Stations.Sum(item => item.CaughtCount), risk.ActivityRate, risk.Score, risk.Level, risk.Infestation,
            additionalRecipients, emailStatus, report.EmailDeliveries.Count(item => item.Status == "Sent"), report.EmailDeliveries.Count,
            report.Stations.OrderBy(item => item.DeviceNumber).Select(item => new ServiceReportStationResponse(
                item.Id, item.SitePlanId, item.SitePlanElementId, item.DeviceNumber, item.Area, item.DeviceType,
                item.TargetPest, item.CaughtCount, item.HasActivity, item.PlateChanged, item.DeviceStatus, item.ActivityType,
                item.InaccessibilityReason, item.AppliedVehicleStockItemId, item.AppliedProductName, item.AppliedAmount,
                item.AppliedUnit, item.ReplacementVehicleStockItemId, item.ReplacementProductName, item.ReplacementQuantity,
                item.ReplacementUnit, item.Notes,
                item.PestObservations.OrderByDescending(observation => observation.ApprovedCount).Select(observation =>
                    new ServiceReportPestObservationResponse(observation.Id, observation.PestKey, observation.PestName,
                        observation.DetectedCount, observation.ApprovedCount, observation.MeanConfidence, observation.Source,
                        observation.ModelName, observation.ModelVersion, observation.ReviewStatus, observation.AnalyzedAt,
                        observation.ReviewedAt)).ToArray())).ToArray(),
            report.Products.Select(item => new ServiceReportProductResponse(item.Id, item.VehicleStockItemId, item.LicenseDocumentId, item.ProductName, item.LicenseNumber, item.ApplicationMethod, item.DilutionRate, item.ActiveIngredient, item.Antidote, item.PackingQuantity, item.AmountUsed, item.Unit)).ToArray(),
            report.WorkOrder.Photos.OrderBy(item => item.UploadedAt).Select(item => new ServiceReportPhotoResponse(item.Id, item.FileName, item.ContentType, item.UploadedAt, $"/api/work-orders/photos/{item.Id}", item.Location, item.Status, item.Description)).ToArray());
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string EmailDeliveryStatus(ICollection<ReportEmailDelivery> deliveries)
    {
        if (deliveries.Count == 0) return "NotQueued";
        var sent = deliveries.Count(item => item.Status == "Sent");
        if (sent == deliveries.Count) return "Sent";
        if (sent > 0) return "Partial";
        if (deliveries.All(item => item.Status == "Failed")) return "Failed";
        return "Pending";
    }
    private sealed record StockUsage(Guid? VehicleStockItemId, string ProductName, decimal Amount, string Unit);
    private sealed record ProductLicenseResolution(IReadOnlyList<ServiceReportProductInput> Products, Dictionary<string, string[]>? Errors);
    private sealed record ServiceReportPhotoMetadata(string? Location, string? Status, string? Description);
}
