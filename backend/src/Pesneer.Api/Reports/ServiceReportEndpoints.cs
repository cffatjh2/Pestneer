using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Reports;

public static class ServiceReportEndpoints
{
    private static readonly HashSet<string> DeviceTypes = ["EFT", "LiveCapture", "Rodent", "InsectMonitor", "Other"];
    private static readonly HashSet<string> DeviceStatuses = ["Active", "Damaged", "Missing", "Replaced", "Passive"];

    public static IEndpointRouteBuilder MapServiceReportEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/service-reports").RequireAuthorization("CompanyStaff");
        shared.MapGet("/work-orders/{workOrderId:guid}", GetByWorkOrderAsync);
        shared.MapPut("/work-orders/{workOrderId:guid}", UpsertAsync);

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

        var report = await dbContext.ServiceReports.SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (report is not null && report.Status == "Finalized" && companyContext.Portal == PortalType.Employee)
        {
            return Results.Conflict(new { message = "Tamamlanmış rapor yalnızca firma sahibi tarafından yeniden düzenlenebilir." });
        }

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
            await dbContext.ServiceReportStations.Where(item => item.ServiceReportId == report.Id).ExecuteDeleteAsync(cancellationToken);
            await dbContext.ServiceReportProducts.Where(item => item.ServiceReportId == report.Id).ExecuteDeleteAsync(cancellationToken);
        }

        Apply(report, request);
        report.UpdatedAt = DateTimeOffset.UtcNow;
        report.Status = request.Finalize ? "Finalized" : "Draft";
        report.FinalizedAt = request.Finalize ? DateTimeOffset.UtcNow : null;
        var stations = request.Stations.Select(item => new ServiceReportStation
        {
            Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, ServiceReportId = report.Id,
            DeviceNumber = item.DeviceNumber.Trim(), Area = item.Area.Trim(), DeviceType = item.DeviceType,
            TargetPest = NullIfEmpty(item.TargetPest), CaughtCount = item.CaughtCount,
            HasActivity = item.HasActivity || item.CaughtCount > 0, PlateChanged = item.PlateChanged,
            DeviceStatus = item.DeviceStatus, Notes = NullIfEmpty(item.Notes)
        }).ToList();
        var products = request.Products.Select(item => new ServiceReportProduct
        {
            Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, ServiceReportId = report.Id,
            ProductName = item.ProductName.Trim(), LicenseNumber = NullIfEmpty(item.LicenseNumber),
            ApplicationMethod = NullIfEmpty(item.ApplicationMethod), DilutionRate = NullIfEmpty(item.DilutionRate),
            ActiveIngredient = NullIfEmpty(item.ActiveIngredient), Antidote = NullIfEmpty(item.Antidote),
            PackingQuantity = NullIfEmpty(item.PackingQuantity), AmountUsed = item.AmountUsed, Unit = item.Unit.Trim()
        }).ToList();
        dbContext.ServiceReportStations.AddRange(stations);
        dbContext.ServiceReportProducts.AddRange(products);

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
            if (!DeviceTypes.Contains(item.DeviceType) || !DeviceStatuses.Contains(item.DeviceStatus) || item.CaughtCount is < 0 or > 100000) errors[$"stations[{index}].status"] = [$"{index + 1}. istasyonun tür, durum veya yakalanan adet bilgisini kontrol edin."];
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
            report.Stations.OrderBy(item => item.DeviceNumber).Select(item => new ServiceReportStationResponse(item.Id, item.DeviceNumber, item.Area, item.DeviceType, item.TargetPest, item.CaughtCount, item.HasActivity, item.PlateChanged, item.DeviceStatus, item.Notes)).ToArray(),
            report.Products.Select(item => new ServiceReportProductResponse(item.Id, item.ProductName, item.LicenseNumber, item.ApplicationMethod, item.DilutionRate, item.ActiveIngredient, item.Antidote, item.PackingQuantity, item.AmountUsed, item.Unit)).ToArray(),
            report.WorkOrder.Photos.OrderBy(item => item.UploadedAt).Select(item => new ServiceReportPhotoResponse(item.Id, item.FileName, item.ContentType, item.UploadedAt, $"/api/work-orders/photos/{item.Id}")).ToArray());
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
