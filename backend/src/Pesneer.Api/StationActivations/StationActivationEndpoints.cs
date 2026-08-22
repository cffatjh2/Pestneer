using System.Text.Json;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.FieldOperations;
using Pesneer.Api.Inventory;
using Pesneer.Api.Reports;
using Pesneer.Api.Optimization;

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
        app.MapGet("/api/v2/station-activations", ListPageAsync).RequireAuthorization("CompanyStaff");
        app.MapGet("/api/v2/customer/station-activations", ListCustomerPageAsync).RequireAuthorization("CustomerPortal");
        app.MapGet("/api/v2/station-activations/{id:guid}", GetDetailAsync).RequireAuthorization();
        return app;
    }

    private static Task<IResult> ListPageAsync(
        int? limit, string? cursor, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var query = db.StationActivations.AsNoTracking().AsQueryable();
        if (context.Portal == PortalType.Employee)
        {
            if (!context.AccountId.HasValue) return Task.FromResult<IResult>(Results.Forbid());
            var accountId = context.AccountId.Value;
            query = query.Where(item => item.WorkOrder.AssignedEmployeeAccountId == accountId ||
                item.WorkOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == accountId));
        }
        return GetSummaryPageAsync(query, limit, cursor, db, cancellationToken);
    }

    private static Task<IResult> ListCustomerPageAsync(
        int? limit, string? cursor, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Task.FromResult<IResult>(Results.Forbid());
        var customerId = context.CustomerId.Value;
        var query = db.StationActivations.AsNoTracking()
            .Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == customerId);
        if (context.CustomerBranchId.HasValue)
        {
            var branchId = context.CustomerBranchId.Value;
            query = query.Where(item => item.WorkOrder.CustomerBranchId == branchId);
        }
        return GetSummaryPageAsync(query, limit, cursor, db, cancellationToken);
    }

    private static async Task<IResult> GetDetailAsync(
        Guid id, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var activation = await Query(db).SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        return activation is null || !CanView(activation, context)
            ? Results.NotFound(new { message = "İstasyon aktivasyonu bulunamadı." })
            : Results.Ok(ToResponse(activation));
    }

    private static async Task<IResult> GetSummaryPageAsync(
        IQueryable<StationActivation> query,
        int? requestedLimit,
        string? cursor,
        PesneerDbContext db,
        CancellationToken cancellationToken)
    {
        var limit = CursorPaging.NormalizeLimit(requestedLimit);
        var hasCursor = CursorPaging.TryRead(cursor, out var position);
        if (!string.IsNullOrWhiteSpace(cursor) && !hasCursor)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["cursor"] = ["Sayfalama anahtarı geçerli değil."] });
        var snapshot = hasCursor ? position.Snapshot : DateTimeOffset.UtcNow;

        var projected = query.Select(item => new StationActivationSummaryRow(
            item.Id, item.WorkOrderId, item.WorkOrder.Number, item.Number, item.Status,
            item.WorkOrder.CustomerId, item.WorkOrder.Customer.LegalName, item.WorkOrder.CustomerBranchId,
            item.WorkOrder.CustomerBranch != null ? item.WorkOrder.CustomerBranch.Name : "Merkez / Genel",
            item.WorkOrder.ScheduledAt, item.CreatedByAccount.DisplayName,
            item.TotalStations, item.ActiveStations, item.DamagedStations, item.InaccessibleStations,
            item.TotalCaught, item.CreatedAt, item.UpdatedAt, item.FinalizedAt));

        List<StationActivationSummaryRow> rows;
        if (db.Database.IsNpgsql())
        {
            projected = projected.Where(item => item.CreatedAt <= snapshot);
            if (hasCursor)
                projected = projected.Where(item => item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0));
            rows = await projected.OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
                .Take(limit + 1).ToListAsync(cancellationToken);
        }
        else
        {
            rows = (await projected.ToListAsync(cancellationToken))
                .Where(item => item.CreatedAt <= snapshot && (!hasCursor || item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0)))
                .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id).Take(limit + 1).ToList();
        }

        var hasMore = rows.Count > limit;
        if (hasMore) rows.RemoveAt(rows.Count - 1);
        var items = rows.Select(ToSummary).ToArray();
        var last = rows.LastOrDefault();
        var nextCursor = hasMore && last is not null ? CursorPaging.Write(snapshot, last.CreatedAt, last.Id) : null;
        return Results.Ok(new CursorPage<StationActivationSummaryResponse>(items, nextCursor, hasMore, snapshot.ToString("O")));
    }

    private static async Task<IResult> ListAsync(PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var query = Query(db);
        if (context.Portal == PortalType.Employee)
        {
            if (!context.AccountId.HasValue) return Results.Forbid();
            var accountId = context.AccountId.Value;
            query = query.Where(item => item.WorkOrder.AssignedEmployeeAccountId == accountId ||
                item.WorkOrder.Assignments.Any(assignment => assignment.EmployeeAccountId == accountId));
        }
        var activations = db.Database.IsNpgsql()
            ? await query.OrderByDescending(item => item.UpdatedAt).ToListAsync(cancellationToken)
            : (await query.ToListAsync(cancellationToken)).OrderByDescending(item => item.UpdatedAt).ToList();
        return Results.Ok(activations.Select(ToResponse));
    }

    private static async Task<IResult> ListCustomerAsync(PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Results.Forbid();
        var query = Query(db).Where(item => item.Status == "Finalized" && item.WorkOrder.CustomerId == context.CustomerId.Value);
        if (context.CustomerBranchId.HasValue) query = query.Where(item => item.WorkOrder.CustomerBranchId == context.CustomerBranchId.Value);
        var activations = db.Database.IsNpgsql()
            ? await query.OrderByDescending(item => item.FinalizedAt).ToListAsync(cancellationToken)
            : (await query.ToListAsync(cancellationToken)).OrderByDescending(item => item.FinalizedAt).ToList();
        return Results.Ok(activations.Select(ToResponse));
    }

    private static async Task<IResult> GetByWorkOrderAsync(Guid workOrderId, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var workOrder = await WorkOrderQuery(db).SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null || !CanAccess(workOrder, context)) return Results.NotFound(new { message = "İş emri bulunamadı." });
        var activation = await Query(db).SingleOrDefaultAsync(item => item.WorkOrderId == workOrderId, cancellationToken);
        if (activation is not null) return Results.Ok(ToResponse(activation));

        // If no activation exists for this work order, inherit defined stations from the latest customer activation
        var previousQuery = Query(db)
            .Where(item => item.WorkOrder.CustomerId == workOrder.CustomerId &&
                           (workOrder.CustomerBranchId == null || item.WorkOrder.CustomerBranchId == workOrder.CustomerBranchId));
        var previousActivation = db.Database.IsNpgsql()
            ? await previousQuery.OrderByDescending(item => item.UpdatedAt).FirstOrDefaultAsync(cancellationToken)
            : (await previousQuery.ToListAsync(cancellationToken)).OrderByDescending(item => item.UpdatedAt).FirstOrDefault();

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

        if (context.Portal == PortalType.Employee)
        {
            var nowTime = DateTimeOffset.UtcNow;
            var today = WorkforceCalculations.Today(nowTime);
            var shift = await db.WorkShifts.AsNoTracking()
                .SingleOrDefaultAsync(item => item.EmployeeAccountId == context.AccountId.Value && item.WorkDate == today, cancellationToken);
            if (shift is null || shift.Status != WorkShiftStatus.Working)
            {
                return Results.Conflict(new { message = "İstasyon aktivasyon kaydı için önce mesainizi başlatmanız gerekir." });
            }

            if (workOrder.Status == "Planned")
            {
                return Results.Conflict(new { message = "Müşteri ziyareti ve iş başlatılmadan önce istasyon monitörleri düzenlenemez." });
            }
        }

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

            // Deduct biocide and consumable usages directly from vehicle inventory
            await ApplyStationVehicleConsumptionAsync(request, workOrder, db, context, now, cancellationToken);

            await db.SaveChangesAsync(cancellationToken);
        }
        var response = await Query(db).SingleAsync(item => item.Id == activation.Id, cancellationToken);
        return Results.Ok(ToResponse(response));
    }

    private static async Task ApplyStationVehicleConsumptionAsync(
        UpsertStationActivationRequest request,
        WorkOrder workOrder,
        PesneerDbContext db,
        ICompanyContext context,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var itemsToDeduct = new List<(Guid? StockItemId, string ProductName, decimal Amount, string Unit)>();

        foreach (var station in request.Stations)
        {
            if (!string.IsNullOrWhiteSpace(station.AppliedProductName) && station.AppliedAmount is > 0)
            {
                itemsToDeduct.Add((
                    station.AppliedVehicleStockItemId,
                    station.AppliedProductName.Trim(),
                    station.AppliedAmount.Value,
                    station.AppliedUnit ?? "Gram"
                ));
            }

            if (!string.IsNullOrWhiteSpace(station.ReplacementProductName) && station.ReplacementQuantity is > 0)
            {
                itemsToDeduct.Add((
                    station.ReplacementVehicleStockItemId,
                    station.ReplacementProductName.Trim(),
                    station.ReplacementQuantity.Value,
                    station.ReplacementUnit ?? "Adet"
                ));
            }
        }

        if (itemsToDeduct.Count == 0) return;

        // Find technician's vehicle or company vehicle
        var employeeId = context.AccountId ?? workOrder.AssignedEmployeeAccountId;
        Vehicle? vehicle = null;
        if (employeeId.HasValue)
        {
            vehicle = await db.Vehicles
                .Include(v => v.StockItems)
                .FirstOrDefaultAsync(v => v.AssignedEmployeeAccountId == employeeId.Value && v.IsActive, cancellationToken);
        }
        vehicle ??= await db.Vehicles
            .Include(v => v.StockItems)
            .FirstOrDefaultAsync(v => v.IsActive, cancellationToken);

        var explicitIds = itemsToDeduct.Where(x => x.StockItemId.HasValue).Select(x => x.StockItemId!.Value).Distinct().ToArray();
        var stockItems = await db.VehicleStockItems
            .Include(item => item.Vehicle)
            .Where(item => explicitIds.Contains(item.Id) && item.IsActive)
            .ToDictionaryAsync(item => item.Id, cancellationToken);

        var deductions = new Dictionary<Guid, decimal>();

        foreach (var usage in itemsToDeduct)
        {
            VehicleStockItem? targetStock = null;
            if (usage.StockItemId.HasValue && stockItems.TryGetValue(usage.StockItemId.Value, out var foundStock))
            {
                targetStock = foundStock;
            }
            else if (vehicle is not null)
            {
                targetStock = vehicle.StockItems.FirstOrDefault(si =>
                    si.IsActive && string.Equals(si.ProductName, usage.ProductName, StringComparison.OrdinalIgnoreCase)
                );
            }

            if (targetStock is null) continue;

            if (InventoryUnitConverter.TryConvert(usage.Amount, usage.Unit, targetStock.Unit, out var convertedQty))
            {
                deductions[targetStock.Id] = deductions.GetValueOrDefault(targetStock.Id) + convertedQty;
                if (!stockItems.ContainsKey(targetStock.Id))
                {
                    stockItems[targetStock.Id] = targetStock;
                }
            }
        }

        foreach (var deduction in deductions)
        {
            var stockItem = stockItems[deduction.Key];
            stockItem.Quantity = Math.Max(0, stockItem.Quantity - deduction.Value);
            stockItem.LastMovementAt = now;
            db.VehicleStockMovements.Add(new VehicleStockMovement
            {
                Id = Guid.NewGuid(),
                CompanyId = context.CompanyId!.Value,
                VehicleStockItemId = stockItem.Id,
                InventoryItemId = stockItem.InventoryItemId,
                PerformedByAccountId = context.AccountId,
                Type = "ApplicationUse",
                Quantity = deduction.Value,
                Unit = stockItem.Unit,
                Note = $"{workOrder.Number} nolu iş emri istasyon uygulaması ({workOrder.Customer?.LegalName ?? workOrder.Number})",
                OccurredAt = now
            });
        }
    }

    private static async Task<IResult> DownloadPdfAsync(Guid id, PesneerDbContext db, ICompanyContext context, CancellationToken cancellationToken)
    {
        var activation = await Query(db).SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (activation is null || !CanAccess(activation.WorkOrder, context)) return Results.NotFound();
        var storedQuery = db.QualityDocuments.AsNoTracking()
            .Where(item => item.Category == "StationActivations" && item.Description == $"activation:{activation.Id}" && item.FileData != null)
            .Select(item => new StoredActivationPdf(item.FileData!, item.ContentType, item.FileName, item.CreatedAt));
        var stored = db.Database.IsNpgsql()
            ? await storedQuery.OrderByDescending(item => item.CreatedAt).FirstOrDefaultAsync(cancellationToken)
            : (await storedQuery.ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).FirstOrDefault();
        if (stored is not null)
        {
            var hash = Convert.ToHexString(SHA256.HashData(stored.FileData)).ToLowerInvariant();
            return PrivateFileResults.Exact(stored.FileData, stored.ContentType, stored.FileName, stored.CreatedAt, hash);
        }
        var company = await db.Companies.AsNoTracking().SingleAsync(item => item.Id == activation.CompanyId, cancellationToken);
        var pdf = StationActivationPdfRenderer.Render(activation, StationActivationData.Deserialize(activation.StationsJson), company);
        var fallbackHash = Convert.ToHexString(SHA256.HashData(pdf)).ToLowerInvariant();
        return PrivateFileResults.Exact(pdf, "application/pdf", $"{activation.Number}.pdf", activation.UpdatedAt, fallbackHash);
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

    private static bool CanView(StationActivation activation, ICompanyContext context) =>
        context.Portal == PortalType.Customer
            ? activation.Status == "Finalized" && context.CustomerId.HasValue && activation.WorkOrder.CustomerId == context.CustomerId.Value &&
              (!context.CustomerBranchId.HasValue || activation.WorkOrder.CustomerBranchId == context.CustomerBranchId.Value)
            : CanAccess(activation.WorkOrder, context);

    private static StationActivationResponse ToResponse(StationActivation item) => new(
        item.Id, item.WorkOrderId, item.WorkOrder.Number, item.Number, item.Status, item.WorkOrder.CustomerId, item.WorkOrder.Customer.LegalName,
        item.WorkOrder.CustomerBranchId, item.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel", item.WorkOrder.ScheduledAt,
        item.CreatedByAccount.DisplayName, item.Notes, item.TotalStations, item.ActiveStations, item.DamagedStations,
        item.InaccessibleStations, item.TotalCaught, item.UpdatedAt, item.FinalizedAt, StationActivationData.Deserialize(item.StationsJson));
    private static StationActivationSummaryResponse ToSummary(StationActivationSummaryRow item) => new(
        item.Id, item.WorkOrderId, item.WorkOrderNumber, item.Number, item.Status, item.CustomerId, item.CustomerName,
        item.BranchId, item.BranchName, item.ScheduledAt, item.OperatorName, item.TotalStations, item.ActiveStations,
        item.DamagedStations, item.InaccessibleStations, item.TotalCaught, item.UpdatedAt, item.FinalizedAt,
        $"/api/v2/station-activations/{item.Id}", $"/api/station-activations/{item.Id}/pdf");
    private static string? Clean(string? value, int length) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, length)];
    private sealed record StationActivationSummaryRow(
        Guid Id, Guid WorkOrderId, string WorkOrderNumber, string Number, string Status,
        Guid CustomerId, string CustomerName, Guid? BranchId, string BranchName, DateTimeOffset ScheduledAt,
        string OperatorName, int TotalStations, int ActiveStations, int DamagedStations, int InaccessibleStations,
        int TotalCaught, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? FinalizedAt);
    private sealed record StoredActivationPdf(byte[] FileData, string ContentType, string FileName, DateTimeOffset CreatedAt);
}
