using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Reports;

namespace Pesneer.Api.StationActivations;

public static class StationActivationEndpoints
{
    private static readonly HashSet<string> Statuses = ["NoActivity", "Activity", "Damaged", "Inaccessible", "Missing", "Replaced", "Passive", "Active"];

    public static IEndpointRouteBuilder MapStationActivationEndpoints(this IEndpointRouteBuilder app)
    {
        var staff = app.MapGroup("/api/station-activations").RequireAuthorization("CompanyStaff");
        staff.MapGet("/", ListAsync);
        staff.MapGet("/work-orders/{workOrderId:guid}", GetByWorkOrderAsync);
        staff.MapPut("/work-orders/{workOrderId:guid}", UpsertAsync);
        staff.MapGet("/{id:guid}/pdf", DownloadPdfAsync);
        app.MapGet("/api/customer/station-activations", ListCustomerAsync).RequireAuthorization("CustomerPortal");
        return app;
    }

    private static async Task<IResult> ListAsync(PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var query = Query(db);
        if (context.Portal == PortalType.Employee && context.AccountId.HasValue)
            query = query.Where(item => item.WorkOrder.AssignedEmployeeAccountId == context.AccountId || item.WorkOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == context.AccountId));
        var activations = await query.ToListAsync(cancellationToken);
        return Results.Ok(activations.OrderByDescending(item => item.UpdatedAt).Select(ToResponse));
    }

    private static async Task<IResult> ListCustomerAsync(PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Results.Forbid();
        var query = Query(db).Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == context.CustomerId.Value);
        if (context.CustomerBranchId.HasValue) query = query.Where(item => item.WorkOrder.CustomerBranchId == context.CustomerBranchId.Value);
        var activations = await query.ToListAsync(cancellationToken);
        return Results.Ok(activations.OrderByDescending(item => item.FinalizedAt).Select(ToResponse));
    }

    private static async Task<IResult> GetByWorkOrderAsync(Guid workOrderId, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var workOrder = await WorkOrderQuery(db).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, context)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var activation = await Query(db).SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (activation is not null) return Results.Ok(ToResponse(activation));

        // If no activation exists for this work order, inherit defined stations from the latest customer activation
        var previousActivation = await Query(db)
            .Where(item => item.WorkOrder.CustomerId == workOrder.CustomerId &&
                           (workOrder.CustomerBranchId == null || item.WorkOrder.CustomerBranchId == workOrder.CustomerBranchId))
            .OrderByDescending(item => item.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (previousActivation is not null)
        {
            var previousStations = StationActivationData.Deserialize(previousActivation.StationsJson);
            if (previousStations.Count > 0)
            {
                var templateStations = previousStations.Select(s => s with
                {
                    DeviceStatus = "Unchecked",
                    HasActivity = false,
                    CaughtCount = 0,
                    TargetPest = null,
                    ActivityType = null,
                    InaccessibilityReason = null,
                    Notes = null,
                    PestObservations = null,
                    BaitGelCompleted = false,
                    StickyPlateChanged = false,
                    StationCleaned = false,
                    StationRelocated = false,
                    StationReplaced = false,
                    LockCheckDone = false,
                    LabelRenewed = false,
                    AppliedProductName = null,
                    AppliedAmount = null,
                    AppliedUnit = null,
                    ReplacementProductName = null,
                    ReplacementQuantity = null,
                    ReplacementUnit = null
                }).ToList();

                var templateResponse = new StationActivationResponse(
                    Guid.Empty,
                    workOrder.Id,
                    workOrder.Number,
                    "",
                    "Draft",
                    workOrder.CustomerId,
                    workOrder.Customer.LegalName,
                    workOrder.CustomerBranchId,
                    workOrder.CustomerBranch?.Name ?? "Merkez / Genel",
                    workOrder.ScheduledAt,
                    workOrder.AssignedEmployeeAccount?.DisplayName ?? "Atanmış Personel",
                    null,
                    templateStations.Count,
                    0,
                    0,
                    0,
                    0,
                    DateTimeOffset.UtcNow,
                    null,
                    templateStations
                );
                return Results.Ok(templateResponse);
            }
        }

        return Results.Ok(null);
    }

    private static async Task<IResult> UpsertAsync(Guid workOrderId, UpsertStationActivationRequest request, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        var workOrder = await WorkOrderQuery(db).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, context)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var validation = Validate(request);
        if (validation is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["stations"] = [validation] });

        var activation = await db.StationActivations.SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        if (activation is null)
        {
            activation = new StationActivation
            {
                Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, WorkOrderId = workOrderId, CreatedByAccountId = context.AccountId.Value,
                Number = $"AKT-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}", Status = "Draft", StationsJson = "[]", CreatedAt = now
            };
            db.StationActivations.Add(activation);
        }

        activation.StationsJson = StationActivationData.Serialize(request.Stations);
        activation.Notes = Clean(request.Notes, 3000);
        activation.TotalStations = request.Stations.Count;
        activation.ActiveStations = request.Stations.Count(item => item.HasActivity || item.DeviceStatus == "Activity");
        activation.DamagedStations = request.Stations.Count(item => item.DeviceStatus is "Damaged" or "Missing");
        activation.InaccessibleStations = request.Stations.Count(item => item.DeviceStatus == "Inaccessible");
        activation.TotalCaught = request.Stations.Sum(item => item.CaughtCount);
        activation.Status = request.Finalize ? "Finalized" : "Draft";
        activation.UpdatedAt = now;
        activation.FinalizedAt = request.Finalize ? now : null;
        await db.SaveChangesAsync(cancellationToken);

        if (request.Finalize)
        {
            var loaded = await Query(db).SingleAsync(item => item.Id == activation.Id, cancellationToken);
            var company = await db.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId.Value, cancellationToken);
            var pdf = StationActivationPdfRenderer.Render(loaded, request.Stations, company);
            var existingDocument = await db.QualityDocuments.SingleOrDefaultAsync(item => item.Category == "StationActivations" && item.Description == $"activation:{activation.Id}", cancellationToken);
            if (existingDocument is null)
            {
                db.QualityDocuments.Add(new QualityDocument
                {
                    Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = workOrder.CustomerId, CustomerBranchId = workOrder.CustomerBranchId,
                    CreatedByAccountId = context.AccountId.Value, Category = "StationActivations", Title = $"{workOrder.Number} İstasyon Aktivasyon Listesi",
                    Description = $"activation:{activation.Id}", FileName = $"{activation.Number}.pdf", ContentType = "application/pdf", SizeBytes = pdf.Length, FileData = pdf, CreatedAt = now
                });
            }
            else { existingDocument.FileData = pdf; existingDocument.SizeBytes = pdf.Length; existingDocument.CreatedAt = now; }
            await db.SaveChangesAsync(cancellationToken);
        }
        var response = await Query(db).SingleAsync(item => item.Id == activation.Id, cancellationToken);
        return Results.Ok(ToResponse(response));
    }

    private static async Task<IResult> DownloadPdfAsync(Guid id, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var activation = await Query(db).SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (activation is null || !CanAccess(activation.WorkOrder, context)) return Results.NotFound();
        var company = await db.Companies.AsNoTracking().SingleAsync(item => item.Id == activation.CompanyId, cancellationToken);
        return Results.File(StationActivationPdfRenderer.Render(activation, StationActivationData.Deserialize(activation.StationsJson), company), "application/pdf", $"{activation.Number}.pdf");
    }

    private static string? Validate(UpsertStationActivationRequest request)
    {
        if (request.Stations.Count == 0) return "Aktivasyon listesine en az bir istasyon ekleyin.";
        foreach (var station in request.Stations)
        {
            if (string.IsNullOrWhiteSpace(station.DeviceNumber) || string.IsNullOrWhiteSpace(station.Area)) return "Her istasyon için numara ve konum girin.";
            if (request.Finalize && !Statuses.Contains(station.DeviceStatus)) return $"{station.DeviceNumber} için kontrol sonucunu seçin.";
            if (station.DeviceStatus == "Inaccessible" && string.IsNullOrWhiteSpace(station.InaccessibilityReason)) return $"{station.DeviceNumber} için ulaşılamama nedenini yazın.";
            if (station.DeviceStatus == "Activity" && station.CaughtCount < 1) return $"{station.DeviceNumber} için aktivite adedini seçin.";
            if (station.DeviceStatus == "Activity" && string.IsNullOrWhiteSpace(station.TargetPest)) return $"{station.DeviceNumber} için zararlı türünü seçin.";
            if (!string.IsNullOrWhiteSpace(station.ActivityType) && !ServiceReportCatalog.ActivityTypes.Contains(station.ActivityType, StringComparer.OrdinalIgnoreCase)) return $"{station.DeviceNumber} için aktivite türünü listeden seçin.";
            if (!ServiceReportCatalog.IsKnownOrOther(station.TargetPest, ServiceReportCatalog.PestTypes)) return $"{station.DeviceNumber} için zararlı türünü listeden seçin; listede yoksa Diğer seçeneğini kullanın.";
            if (!ServiceReportCatalog.IsKnownOrOther(station.InaccessibilityReason, ServiceReportCatalog.InaccessibilityReasons)) return $"{station.DeviceNumber} için erişim nedenini listeden seçin; listede yoksa Diğer seçeneğini kullanın.";
        }
        return null;
    }

    private static IQueryable<StationActivation> Query(PesneerDbContext db) => db.StationActivations.AsNoTracking()
        .Include(item => item.WorkOrder).ThenInclude(item => item.Customer)
        .Include(item => item.WorkOrder).ThenInclude(item => item.CustomerBranch)
        .Include(item => item.WorkOrder).ThenInclude(item => item.AssignedEmployeeAccount)
        .Include(item => item.WorkOrder).ThenInclude(item => item.Assignments)
        .Include(item => item.CreatedByAccount);

    private static IQueryable<WorkOrder> WorkOrderQuery(PesneerDbContext db) => db.WorkOrders
        .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.Assignments);

    private static bool CanAccess(WorkOrder order, ICompanyContext context) => context.Portal == PortalType.Owner ||
        context.Portal == PortalType.Employee && context.AccountId.HasValue && (order.AssignedEmployeeAccountId == context.AccountId || order.Assignments.Any(item => item.EmployeeAccountId == context.AccountId));

    private static StationActivationResponse ToResponse(StationActivation item) => new(
        item.Id, item.WorkOrderId, item.WorkOrder.Number, item.Number, item.Status, item.WorkOrder.CustomerId, item.WorkOrder.Customer.LegalName,
        item.WorkOrder.CustomerBranchId, item.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel", item.WorkOrder.ScheduledAt,
        item.CreatedByAccount.DisplayName, item.Notes, item.TotalStations, item.ActiveStations, item.DamagedStations,
        item.InaccessibleStations, item.TotalCaught, item.UpdatedAt, item.FinalizedAt, StationActivationData.Deserialize(item.StationsJson));
    private static string? Clean(string? value, int length) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, length)];
}
