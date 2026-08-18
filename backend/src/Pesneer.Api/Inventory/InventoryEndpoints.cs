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
        var items = await dbContext.InventoryItems.AsNoTracking().Include(item => item.LicenseDocuments)
            .Where(item => item.IsActive)
            .OrderBy(item => item.Name)
            .ToListAsync(cancellationToken);
        var vehicleRows = await dbContext.VehicleStockItems.AsNoTracking().Where(item => item.IsActive && item.InventoryItemId.HasValue)
            .Select(item => new { InventoryItemId = item.InventoryItemId!.Value, item.Quantity }).ToListAsync(cancellationToken);
        var vehicleTotals = vehicleRows.GroupBy(item => item.InventoryItemId)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Quantity));
        return Results.Ok(items.Select(item => ToResponse(item, vehicleTotals.GetValueOrDefault(item.Id))));
    }

    private static async Task<IResult> GetSummaryAsync(
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var exitCount = await dbContext.InventoryMovements.AsNoTracking()
            .CountAsync(item => item.Type == "Exit" && item.OccurredAt >= monthStart, cancellationToken);
        return Results.Ok(new InventorySummaryResponse(
            exitCount,
            await dbContext.Vehicles.AsNoTracking().CountAsync(item => item.IsActive, cancellationToken),
            await dbContext.VehicleStockItems.AsNoTracking().CountAsync(item => item.IsActive && item.Quantity > 0, cancellationToken)));
    }

    private static async Task<IResult> GetAlertsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var criticalItems = await dbContext.InventoryItems.AsNoTracking()
            .Where(item => item.IsActive && item.Quantity <= item.MinimumQuantity)
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
        var item = await dbContext.InventoryItems.Include(existing => existing.LicenseDocuments).SingleOrDefaultAsync(existing =>
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
        return Results.Ok(ToResponse(item, await VehicleQuantityAsync(dbContext, item.Id, cancellationToken)));
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

        var item = await dbContext.InventoryItems.Include(existing => existing.LicenseDocuments).SingleOrDefaultAsync(existing =>
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
        return Results.Ok(ToResponse(item, await VehicleQuantityAsync(dbContext, item.Id, cancellationToken)));
    }

    private static async Task<IResult> GetVehiclesAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var vehicles = await dbContext.Vehicles.AsNoTracking().Include(item => item.AssignedEmployeeAccount).Include(item => item.StockItems).ThenInclude(item => item.InventoryItem).ThenInclude(item => item!.LicenseDocuments)
            .Where(item => item.IsActive).AsSplitQuery().OrderBy(item => item.Plate).ToListAsync(cancellationToken);
        return Results.Ok(vehicles.Select(ToVehicleResponse));
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
        var inventory = await dbContext.InventoryItems.Include(item => item.LicenseDocuments).SingleOrDefaultAsync(item => item.Id == request.InventoryItemId && item.IsActive, cancellationToken);
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
        return Results.Ok(new { inventory = ToResponse(inventory, await VehicleQuantityAsync(dbContext, inventory.Id, cancellationToken)), vehicle = await VehicleResponseAsync(dbContext, vehicle.Id, cancellationToken) });
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

    private static async Task<VehicleResponse> VehicleResponseAsync(PesneerDbContext dbContext, Guid vehicleId, CancellationToken cancellationToken) =>
        ToVehicleResponse(await dbContext.Vehicles.AsNoTracking().Include(item => item.AssignedEmployeeAccount).Include(item => item.StockItems).ThenInclude(item => item.InventoryItem).ThenInclude(item => item!.LicenseDocuments).SingleAsync(item => item.Id == vehicleId, cancellationToken));

    private static VehicleResponse ToVehicleResponse(Vehicle vehicle) => new(vehicle.Id, vehicle.Plate, vehicle.Brand, vehicle.Model, vehicle.ModelYear,
        vehicle.AssignedEmployeeAccountId, vehicle.AssignedEmployeeAccount?.DisplayName ?? "Atanmamış", vehicle.IsActive,
        vehicle.StockItems.Where(item => item.IsActive).OrderBy(item => item.ProductName).Select(item => new VehicleStockItemResponse(item.Id, item.InventoryItemId, item.ProductName, item.Quantity, item.Unit, item.InventoryItem?.LicenseNumber, LatestLicenseId(item.InventoryItem), item.LastMovementAt, !item.InventoryItemId.HasValue)).ToArray());

    private static async Task<decimal> VehicleQuantityAsync(PesneerDbContext dbContext, Guid inventoryItemId, CancellationToken cancellationToken) =>
        (await dbContext.VehicleStockItems.AsNoTracking().Where(item => item.InventoryItemId == inventoryItemId && item.IsActive)
            .Select(item => item.Quantity).ToListAsync(cancellationToken)).Sum();

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

    private static InventoryItemResponse ToResponse(InventoryItem item, decimal vehicleQuantity = 0) => new(
        item.Id,
        item.Name,
        item.Category,
        item.Quantity,
        item.Unit,
        item.MinimumQuantity,
        item.UnitCost,
        item.LotNumber,
        item.LicenseNumber,
        LatestLicenseId(item),
        item.LastMovementAt,
        item.Quantity <= item.MinimumQuantity ? "Kritik" : item.Quantity <= item.MinimumQuantity * 1.5m ? "Düşük" : "Yeterli",
        vehicleQuantity,
        item.Quantity + vehicleQuantity);

    private static Guid? LatestLicenseId(InventoryItem? item) => item?.LicenseDocuments
        .Where(document => document.Category == "Licenses")
        .OrderByDescending(document => document.CreatedAt)
        .Select(document => (Guid?)document.Id)
        .FirstOrDefault();
}
