using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Inventory;

public static class InventoryEndpoints
{
    public static IEndpointRouteBuilder MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/company/inventory").RequireAuthorization("OwnerPortal");
        group.MapGet("/", GetInventoryAsync);
        group.MapGet("/summary", GetSummaryAsync);
        group.MapGet("/alerts", GetAlertsAsync);
        group.MapPost("/entries", CreateEntryAsync);
        group.MapPost("/exits", CreateExitAsync);
        group.MapGet("/vehicles", GetVehiclesAsync);
        group.MapPost("/vehicles", CreateVehicleAsync);
        group.MapPut("/vehicles/{vehicleId:guid}", UpdateVehicleAsync);
        group.MapPost("/transfers", TransferToVehicleAsync);
        return app;
    }

    private static async Task<IResult> GetInventoryAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsSqlite())
        {
            var itemRows = await dbContext.InventoryItems.AsNoTracking()
                .Where(item => item.IsActive)
                .OrderBy(item => item.Name)
                .Select(item => new InventoryItemBaseProjection(item.Id, item.Name, item.Category, item.Quantity, item.Unit,
                    item.MinimumQuantity, item.UnitCost, item.LotNumber, item.LicenseNumber, item.LastMovementAt))
                .ToListAsync(cancellationToken);
            var itemIds = itemRows.Select(item => item.Id).ToArray();
            var licenseRows = await dbContext.QualityDocuments.AsNoTracking()
                .Where(document => document.InventoryItemId.HasValue && itemIds.Contains(document.InventoryItemId.Value) && document.Category == "Licenses")
                .Select(document => new LicenseDocumentProjection(document.InventoryItemId!.Value, document.Id, document.CreatedAt))
                .ToListAsync(cancellationToken);
            var licenseByItem = licenseRows.GroupBy(document => document.InventoryItemId)
                .ToDictionary(group => group.Key, group => (Guid?)group.OrderByDescending(document => document.CreatedAt).First().Id);
            var vehicleRows = await dbContext.VehicleStockItems.AsNoTracking()
                .Where(stock => stock.IsActive && stock.InventoryItemId.HasValue && itemIds.Contains(stock.InventoryItemId.Value))
                .Select(stock => new { InventoryItemId = stock.InventoryItemId!.Value, stock.Quantity })
                .ToListAsync(cancellationToken);
            var vehicleByItem = vehicleRows.GroupBy(stock => stock.InventoryItemId)
                .ToDictionary(group => group.Key, group => group.Sum(stock => stock.Quantity));
            var sqliteItems = itemRows.Select(item => new InventoryItemProjection(
                item.Id, item.Name, item.Category, item.Quantity, item.Unit, item.MinimumQuantity, item.UnitCost,
                item.LotNumber, item.LicenseNumber, licenseByItem.GetValueOrDefault(item.Id), item.LastMovementAt,
                vehicleByItem.GetValueOrDefault(item.Id))).ToArray();
            return Results.Ok(sqliteItems.Select(ToResponse));
        }

        var items = await dbContext.InventoryItems.AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.Name)
            .Select(item => new InventoryItemProjection(
                item.Id,
                item.Name,
                item.Category,
                item.Quantity,
                item.Unit,
                item.MinimumQuantity,
                item.UnitCost,
                item.LotNumber,
                item.LicenseNumber,
                item.LicenseDocuments
                    .Where(document => document.Category == "Licenses")
                    .OrderByDescending(document => document.CreatedAt)
                    .Select(document => (Guid?)document.Id)
                    .FirstOrDefault(),
                item.LastMovementAt,
                dbContext.VehicleStockItems
                    .Where(stock => stock.IsActive && stock.InventoryItemId == item.Id)
                    .Sum(stock => (decimal?)stock.Quantity) ?? 0m))
            .ToListAsync(cancellationToken);
        return Results.Ok(items.Select(ToResponse));
    }

    private static async Task<IResult> GetSummaryAsync(
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var exitCount = dbContext.Database.IsSqlite()
            ? (await dbContext.InventoryMovements.AsNoTracking()
                .Where(item => item.Type == "Exit")
                .Select(item => item.OccurredAt)
                .ToListAsync(cancellationToken)).Count(occurredAt => occurredAt >= monthStart)
            : await dbContext.InventoryMovements.AsNoTracking()
                .CountAsync(item => item.Type == "Exit" && item.OccurredAt >= monthStart, cancellationToken);
        return Results.Ok(new InventorySummaryResponse(
            exitCount,
            await dbContext.Vehicles.AsNoTracking().CountAsync(item => item.IsActive, cancellationToken),
            await dbContext.VehicleStockItems.AsNoTracking().CountAsync(item => item.IsActive && item.Quantity > 0, cancellationToken)));
    }

    private static async Task<IResult> GetAlertsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var query = dbContext.InventoryItems.AsNoTracking()
            .Where(item => item.IsActive && item.Quantity <= item.MinimumQuantity);
        var criticalItems = dbContext.Database.IsSqlite()
            ? await query.ToListAsync(cancellationToken)
            : await query.OrderBy(item => item.Quantity == 0 ? 0 : 1)
                .ThenBy(item => item.Quantity)
                .ThenBy(item => item.Name)
                .ToListAsync(cancellationToken);

        return Results.Ok(criticalItems
            .OrderBy(item => item.Quantity == 0 ? 0 : 1)
            .ThenBy(item => item.Quantity)
            .ThenBy(item => item.Name)
            .Select(item => new InventoryAlertResponse(
                item.Id,
                item.Quantity == 0 ? "Stok tükendi" : "Kritik stok seviyesi",
                $"{item.Name}: {item.Quantity:0.###} {item.Unit} kaldı. Minimum eşik {item.MinimumQuantity:0.###} {item.Unit}.",
                item.Quantity == 0 ? "Critical" : "Warning",
                item.Quantity,
                item.MinimumQuantity,
                item.Unit,
                item.LastMovementAt)));
    }

    private static async Task<IResult> CreateEntryAsync(
        CreateInventoryEntryRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        var errors = Validate(request);
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        var normalizedName = request.Name.Trim().ToUpperInvariant();
        var lotNumber = string.IsNullOrWhiteSpace(request.LotNumber) ? null : request.LotNumber.Trim();
        var item = await dbContext.InventoryItems.SingleOrDefaultAsync(existing =>
            existing.NormalizedName == normalizedName &&
            existing.Unit == request.Unit.Trim() &&
            existing.LotNumber == lotNumber,
            cancellationToken);

        if (item is null)
        {
            item = new InventoryItem
            {
                Id = Guid.NewGuid(),
                CompanyId = companyContext.CompanyId.Value,
                Name = request.Name.Trim(),
                NormalizedName = normalizedName,
                Category = request.Category.Trim(),
                Quantity = request.Quantity,
                Unit = request.Unit.Trim(),
                MinimumQuantity = request.MinimumQuantity,
                UnitCost = request.UnitCost,
                LotNumber = lotNumber,
                LastMovementAt = DateTimeOffset.UtcNow
            };
            dbContext.InventoryItems.Add(item);
        }
        else
        {
            item.Quantity += request.Quantity;
            item.MinimumQuantity = request.MinimumQuantity;
            item.UnitCost = request.UnitCost;
            item.Category = request.Category.Trim();
            item.LastMovementAt = DateTimeOffset.UtcNow;
        }

        dbContext.InventoryMovements.Add(new InventoryMovement
        {
            Id = Guid.NewGuid(),
            CompanyId = companyContext.CompanyId.Value,
            InventoryItemId = item.Id,
            Type = "Entry",
            Quantity = request.Quantity,
            Unit = item.Unit,
            Note = lotNumber is null ? null : $"Lot / Parti: {lotNumber}",
            OccurredAt = item.LastMovementAt
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(await InventoryResponseAsync(dbContext, item, cancellationToken));
    }

    private static async Task<IResult> CreateExitAsync(
        CreateInventoryExitRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        if (request.Quantity <= 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["quantity"] = ["Çıkış miktarı sıfırdan büyük olmalıdır."]
            });
        }

        if (request.Note?.Trim().Length > 500)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["note"] = ["Açıklama en fazla 500 karakter olabilir."]
            });
        }

        var item = await dbContext.InventoryItems.SingleOrDefaultAsync(existing =>
            existing.Id == request.InventoryItemId && existing.IsActive,
            cancellationToken);
        if (item is null) return Results.NotFound(new { message = "Stok kalemi bulunamadı." });
        if (request.Quantity > item.Quantity)
        {
            return Results.Conflict(new { message = $"Çıkış miktarı mevcut {item.Quantity:0.##} {item.Unit} stoktan fazla olamaz." });
        }

        var occurredAt = DateTimeOffset.UtcNow;
        item.Quantity -= request.Quantity;
        item.LastMovementAt = occurredAt;
        dbContext.InventoryMovements.Add(new InventoryMovement
        {
            Id = Guid.NewGuid(),
            CompanyId = companyContext.CompanyId.Value,
            InventoryItemId = item.Id,
            Type = "Exit",
            Quantity = request.Quantity,
            Unit = item.Unit,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            OccurredAt = occurredAt
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(await InventoryResponseAsync(dbContext, item, cancellationToken));
    }

    private static async Task<IResult> GetVehiclesAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var vehicles = await dbContext.Vehicles.AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.Plate)
            .Select(item => new VehicleProjection(item.Id, item.Plate, item.Brand, item.Model, item.ModelYear,
                item.AssignedEmployeeAccountId, item.AssignedEmployeeAccount != null ? item.AssignedEmployeeAccount.DisplayName : "Atanmamış", item.IsActive))
            .ToListAsync(cancellationToken);
        var vehicleIds = vehicles.Select(item => item.Id).ToArray();
        var stockItems = await LoadVehicleStockAsync(dbContext, vehicleIds, cancellationToken);
        var stockByVehicle = stockItems.ToLookup(item => item.VehicleId);
        return Results.Ok(vehicles.Select(item => ToVehicleResponse(item, stockByVehicle[item.Id])));
    }

    private static async Task<IResult> CreateVehicleAsync(CreateVehicleRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue) return Results.Forbid();
        var validation = await ValidateVehicleAsync(request, null, dbContext, cancellationToken);
        if (validation is not null) return validation;
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, Plate = FormatPlate(request.Plate), NormalizedPlate = NormalizePlate(request.Plate),
            Brand = request.Brand.Trim(), Model = request.Model.Trim(), ModelYear = request.ModelYear, AssignedEmployeeAccountId = request.AssignedEmployeeAccountId
        };
        dbContext.Vehicles.Add(vehicle);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/inventory/vehicles/{vehicle.Id}", await VehicleResponseAsync(dbContext, vehicle.Id, cancellationToken));
    }

    private static async Task<IResult> UpdateVehicleAsync(Guid vehicleId, CreateVehicleRequest request, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var vehicle = await dbContext.Vehicles.SingleOrDefaultAsync(item => item.Id == vehicleId && item.IsActive, cancellationToken);
        if (vehicle is null) return Results.NotFound(new { message = "Araç bulunamadı." });
        var validation = await ValidateVehicleAsync(request, vehicleId, dbContext, cancellationToken);
        if (validation is not null) return validation;
        vehicle.Plate = FormatPlate(request.Plate); vehicle.NormalizedPlate = NormalizePlate(request.Plate); vehicle.Brand = request.Brand.Trim();
        vehicle.Model = request.Model.Trim(); vehicle.ModelYear = request.ModelYear; vehicle.AssignedEmployeeAccountId = request.AssignedEmployeeAccountId;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(await VehicleResponseAsync(dbContext, vehicle.Id, cancellationToken));
    }

    private static async Task<IResult> TransferToVehicleAsync(TransferInventoryToVehicleRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        if (request.Quantity <= 0) return ValidationResult("quantity", "Transfer miktarı sıfırdan büyük olmalıdır.");
        var inventory = await dbContext.InventoryItems.SingleOrDefaultAsync(item => item.Id == request.InventoryItemId && item.IsActive, cancellationToken);
        var vehicle = await dbContext.Vehicles.SingleOrDefaultAsync(item => item.Id == request.VehicleId && item.IsActive, cancellationToken);
        if (inventory is null || vehicle is null) return Results.NotFound(new { message = "Depo ürünü veya araç bulunamadı." });
        if (request.Quantity > inventory.Quantity) return Results.Conflict(new { message = $"Araç transferi mevcut {inventory.Quantity:0.###} {inventory.Unit} depo stokunu aşamaz." });

        var now = DateTimeOffset.UtcNow;
        var vehicleItem = await dbContext.VehicleStockItems.SingleOrDefaultAsync(item => item.VehicleId == vehicle.Id && item.InventoryItemId == inventory.Id && item.IsActive, cancellationToken);
        if (vehicleItem is null)
        {
            vehicleItem = new VehicleStockItem
            {
                Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, VehicleId = vehicle.Id, InventoryItemId = inventory.Id,
                ProductName = inventory.Name, NormalizedName = inventory.NormalizedName, Quantity = 0, Unit = InventoryUnitConverter.Normalize(inventory.Unit), LastMovementAt = now
            };
            dbContext.VehicleStockItems.Add(vehicleItem);
        }

        inventory.Quantity -= request.Quantity; inventory.LastMovementAt = now;
        vehicleItem.Quantity += request.Quantity; vehicleItem.LastMovementAt = now;
        var note = string.IsNullOrWhiteSpace(request.Note) ? $"{vehicle.Plate} aracına transfer" : request.Note.Trim();
        dbContext.InventoryMovements.Add(new InventoryMovement { Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, InventoryItemId = inventory.Id, Type = "TransferToVehicle", Quantity = request.Quantity, Unit = inventory.Unit, Note = note, OccurredAt = now });
        dbContext.VehicleStockMovements.Add(new VehicleStockMovement { Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, VehicleStockItemId = vehicleItem.Id, InventoryItemId = inventory.Id, PerformedByAccountId = context.AccountId, Type = "TransferIn", Quantity = request.Quantity, Unit = vehicleItem.Unit, Note = note, OccurredAt = now });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { inventory = await InventoryResponseAsync(dbContext, inventory, cancellationToken), vehicle = await VehicleResponseAsync(dbContext, vehicle.Id, cancellationToken) });
    }

    private static async Task<IResult?> ValidateVehicleAsync(CreateVehicleRequest request, Guid? vehicleId, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var plate = NormalizePlate(request.Plate);
        if (plate.Length is < 5 or > 16) return ValidationResult("plate", "Geçerli bir araç plakası girin.");
        if (string.IsNullOrWhiteSpace(request.Brand) || request.Brand.Trim().Length is < 2 or > 80 || string.IsNullOrWhiteSpace(request.Model) || request.Model.Trim().Length is < 1 or > 80) return ValidationResult("vehicle", "Araç marka ve modelini kontrol edin.");
        if (request.ModelYear.HasValue && request.ModelYear is < 1980 or > 2100) return ValidationResult("modelYear", "Araç model yılı geçerli değil.");
        if (await dbContext.Vehicles.AsNoTracking().AnyAsync(item => item.NormalizedPlate == plate && item.Id != vehicleId, cancellationToken)) return Results.Conflict(new { message = "Bu plaka daha önce kaydedilmiş." });
        if (request.AssignedEmployeeAccountId.HasValue)
        {
            var employee = await dbContext.CompanyMemberships.AsNoTracking().AnyAsync(item => item.AccountId == request.AssignedEmployeeAccountId && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee, cancellationToken);
            if (!employee) return ValidationResult("assignedEmployeeAccountId", "Aktif bir personel seçin.");
            if (await dbContext.Vehicles.AsNoTracking().AnyAsync(item => item.AssignedEmployeeAccountId == request.AssignedEmployeeAccountId && item.IsActive && item.Id != vehicleId, cancellationToken)) return Results.Conflict(new { message = "Seçilen personele zaten aktif bir araç atanmış." });
        }
        return null;
    }

    private static async Task<VehicleResponse> VehicleResponseAsync(PesneerDbContext dbContext, Guid vehicleId, CancellationToken cancellationToken)
    {
        var vehicle = await dbContext.Vehicles.AsNoTracking()
            .Where(item => item.Id == vehicleId)
            .Select(item => new VehicleProjection(item.Id, item.Plate, item.Brand, item.Model, item.ModelYear,
                item.AssignedEmployeeAccountId, item.AssignedEmployeeAccount != null ? item.AssignedEmployeeAccount.DisplayName : "Atanmamış", item.IsActive))
            .SingleAsync(cancellationToken);
        var stockItems = await LoadVehicleStockAsync(dbContext, [vehicleId], cancellationToken);
        return ToVehicleResponse(vehicle, stockItems);
    }

    private static IQueryable<VehicleStockProjection> VehicleStockQuery(PesneerDbContext dbContext) =>
        dbContext.VehicleStockItems.AsNoTracking()
            .Where(item => item.IsActive)
            .Select(item => new VehicleStockProjection(
                item.VehicleId,
                item.Id,
                item.InventoryItemId,
                item.ProductName,
                item.Quantity,
                item.Unit,
                item.InventoryItem != null ? item.InventoryItem.LicenseNumber : null,
                item.InventoryItem == null
                    ? null
                    : item.InventoryItem.LicenseDocuments
                        .Where(document => document.Category == "Licenses")
                        .OrderByDescending(document => document.CreatedAt)
                        .Select(document => (Guid?)document.Id)
                        .FirstOrDefault(),
                item.LastMovementAt,
                !item.InventoryItemId.HasValue));

    private static async Task<List<VehicleStockProjection>> LoadVehicleStockAsync(
        PesneerDbContext dbContext,
        Guid[] vehicleIds,
        CancellationToken cancellationToken)
    {
        if (vehicleIds.Length == 0) return [];
        if (!dbContext.Database.IsSqlite())
        {
            return await VehicleStockQuery(dbContext)
                .Where(item => vehicleIds.Contains(item.VehicleId))
                .OrderBy(item => item.ProductName)
                .ToListAsync(cancellationToken);
        }

        var rows = await dbContext.VehicleStockItems.AsNoTracking()
            .Where(item => item.IsActive && vehicleIds.Contains(item.VehicleId))
            .Select(item => new VehicleStockBaseProjection(item.VehicleId, item.Id, item.InventoryItemId,
                item.ProductName, item.Quantity, item.Unit,
                item.InventoryItem != null ? item.InventoryItem.LicenseNumber : null,
                item.LastMovementAt, !item.InventoryItemId.HasValue))
            .ToListAsync(cancellationToken);
        var inventoryIds = rows.Where(item => item.InventoryItemId.HasValue).Select(item => item.InventoryItemId!.Value).Distinct().ToArray();
        var licenseRows = await dbContext.QualityDocuments.AsNoTracking()
            .Where(document => document.InventoryItemId.HasValue && inventoryIds.Contains(document.InventoryItemId.Value) && document.Category == "Licenses")
            .Select(document => new LicenseDocumentProjection(document.InventoryItemId!.Value, document.Id, document.CreatedAt))
            .ToListAsync(cancellationToken);
        var licenseByItem = licenseRows.GroupBy(document => document.InventoryItemId)
            .ToDictionary(group => group.Key, group => (Guid?)group.OrderByDescending(document => document.CreatedAt).First().Id);
        return rows.Select(item => new VehicleStockProjection(item.VehicleId, item.Id, item.InventoryItemId,
            item.ProductName, item.Quantity, item.Unit, item.LicenseNumber,
            item.InventoryItemId.HasValue ? licenseByItem.GetValueOrDefault(item.InventoryItemId.Value) : null,
            item.LastMovementAt, item.IsManual)).ToList();
    }

    private static VehicleResponse ToVehicleResponse(VehicleProjection vehicle, IEnumerable<VehicleStockProjection> stockItems) => new(
        vehicle.Id, vehicle.Plate, vehicle.Brand, vehicle.Model, vehicle.ModelYear, vehicle.AssignedEmployeeAccountId,
        vehicle.AssignedEmployeeName, vehicle.IsActive,
        stockItems.OrderBy(item => item.ProductName).Select(item => new VehicleStockItemResponse(item.Id, item.InventoryItemId, item.ProductName, item.Quantity, item.Unit,
            item.LicenseNumber, item.LicenseDocumentId, item.LastMovementAt, item.IsManual)).ToArray());

    private static async Task<decimal> VehicleQuantityAsync(PesneerDbContext dbContext, Guid inventoryItemId, CancellationToken cancellationToken)
    {
        var query = dbContext.VehicleStockItems.AsNoTracking()
            .Where(item => item.InventoryItemId == inventoryItemId && item.IsActive);
        return dbContext.Database.IsSqlite()
            ? (await query.Select(item => item.Quantity).ToListAsync(cancellationToken)).Sum()
            : await query.SumAsync(item => (decimal?)item.Quantity, cancellationToken) ?? 0m;
    }

    private static async Task<InventoryItemResponse> InventoryResponseAsync(PesneerDbContext dbContext, InventoryItem item, CancellationToken cancellationToken)
    {
        var licenseQuery = dbContext.QualityDocuments.AsNoTracking()
            .Where(document => document.InventoryItemId == item.Id && document.Category == "Licenses");
        var licenseDocumentId = dbContext.Database.IsSqlite()
            ? (await licenseQuery.Select(document => new { document.Id, document.CreatedAt }).ToListAsync(cancellationToken))
                .OrderByDescending(document => document.CreatedAt).Select(document => (Guid?)document.Id).FirstOrDefault()
            : await licenseQuery.OrderByDescending(document => document.CreatedAt)
                .Select(document => (Guid?)document.Id)
                .FirstOrDefaultAsync(cancellationToken);
        return ToResponse(item, licenseDocumentId, await VehicleQuantityAsync(dbContext, item.Id, cancellationToken));
    }

    private static string NormalizePlate(string value) => new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
    private static string FormatPlate(string value) => value.Trim().ToUpperInvariant();

    private static Dictionary<string, string[]> Validate(CreateInventoryEntryRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name.Trim();
        if (name.Length < 2 || name.Length > 160) errors["name"] = ["Ürün adı 2-160 karakter arasında olmalıdır."];
        if (string.IsNullOrWhiteSpace(request.Category) || request.Category.Trim().Length > 80) errors["category"] = ["Geçerli bir kategori seçin."];
        if (request.Quantity <= 0) errors["quantity"] = ["Giriş miktarı sıfırdan büyük olmalıdır."];
        if (request.MinimumQuantity < 0) errors["minimumQuantity"] = ["Minimum miktar negatif olamaz."];
        if (request.UnitCost < 0) errors["unitCost"] = ["Birim maliyet negatif olamaz."];
        if (string.IsNullOrWhiteSpace(request.Unit) || request.Unit.Trim().Length > 24) errors["unit"] = ["Geçerli bir birim seçin."];
        if (request.LotNumber?.Trim().Length > 80) errors["lotNumber"] = ["Lot numarası en fazla 80 karakter olabilir."];
        return errors;
    }

    private static IResult ValidationResult(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    private static InventoryItemResponse ToResponse(InventoryItem item, Guid? licenseDocumentId, decimal vehicleQuantity = 0) => new(
        item.Id,
        item.Name,
        item.Category,
        item.Quantity,
        item.Unit,
        item.MinimumQuantity,
        item.UnitCost,
        item.LotNumber,
        item.LicenseNumber,
        licenseDocumentId,
        item.LastMovementAt,
        item.Quantity <= item.MinimumQuantity ? "Kritik" : item.Quantity <= item.MinimumQuantity * 1.5m ? "Düşük" : "Yeterli",
        vehicleQuantity,
        item.Quantity + vehicleQuantity);

    private static InventoryItemResponse ToResponse(InventoryItemProjection item) => new(
        item.Id, item.Name, item.Category, item.Quantity, item.Unit, item.MinimumQuantity, item.UnitCost, item.LotNumber,
        item.LicenseNumber, item.LicenseDocumentId, item.LastMovementAt,
        item.Quantity <= item.MinimumQuantity ? "Kritik" : item.Quantity <= item.MinimumQuantity * 1.5m ? "Düşük" : "Yeterli",
        item.VehicleQuantity, item.Quantity + item.VehicleQuantity);

    private sealed record InventoryItemProjection(Guid Id, string Name, string Category, decimal Quantity, string Unit,
        decimal MinimumQuantity, decimal UnitCost, string? LotNumber, string? LicenseNumber, Guid? LicenseDocumentId,
        DateTimeOffset LastMovementAt, decimal VehicleQuantity);

    private sealed record InventoryItemBaseProjection(Guid Id, string Name, string Category, decimal Quantity, string Unit,
        decimal MinimumQuantity, decimal UnitCost, string? LotNumber, string? LicenseNumber, DateTimeOffset LastMovementAt);

    private sealed record LicenseDocumentProjection(Guid InventoryItemId, Guid Id, DateTimeOffset CreatedAt);

    private sealed record VehicleProjection(Guid Id, string Plate, string Brand, string Model, int? ModelYear,
        Guid? AssignedEmployeeAccountId, string AssignedEmployeeName, bool IsActive);

    private sealed record VehicleStockProjection(Guid VehicleId, Guid Id, Guid? InventoryItemId, string ProductName,
        decimal Quantity, string Unit, string? LicenseNumber, Guid? LicenseDocumentId, DateTimeOffset LastMovementAt, bool IsManual);

    private sealed record VehicleStockBaseProjection(Guid VehicleId, Guid Id, Guid? InventoryItemId, string ProductName,
        decimal Quantity, string Unit, string? LicenseNumber, DateTimeOffset LastMovementAt, bool IsManual);
}
