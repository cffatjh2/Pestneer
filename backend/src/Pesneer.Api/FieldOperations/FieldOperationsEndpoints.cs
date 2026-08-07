using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Inventory;

namespace Pesneer.Api.FieldOperations;

public static class FieldOperationsEndpoints
{
    public static IEndpointRouteBuilder MapFieldOperationsEndpoints(this IEndpointRouteBuilder app)
    {
        var employee = app.MapGroup("/api/employee/operations")
            .RequireAuthorization("EmployeePortal");

        employee.MapGet("/attendance/today", GetTodayAttendanceAsync);
        employee.MapPost("/attendance/start", StartShiftAsync);
        employee.MapPost("/attendance/break/start", StartBreakAsync);
        employee.MapPost("/attendance/break/end", EndBreakAsync);
        employee.MapPost("/attendance/finish", FinishShiftAsync);
        employee.MapGet("/vehicle-stock/catalog", GetVehicleStockCatalogAsync);
        employee.MapGet("/vehicle-stock/latest", GetLatestVehicleStockAsync);
        employee.MapPost("/vehicle-stock/checks", CreateVehicleStockCheckAsync);

        app.MapGet("/api/company/analytics/workforce", GetWorkforceAnalyticsAsync)
            .RequireAuthorization("OwnerPortal");

        return app;
    }

    private static async Task<IResult> GetTodayAttendanceAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId)) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var shift = await FindTodayShiftAsync(dbContext, employeeId, now, cancellationToken);
        return Results.Ok(ToAttendanceResponse(shift, now));
    }

    private static async Task<IResult> StartShiftAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId) || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var existing = await FindTodayShiftAsync(dbContext, employeeId, now, cancellationToken);
        if (existing is not null)
        {
            return Results.Conflict(new { message = "Bugünkü mesai kaydı zaten başlatılmış." });
        }

        var shift = new WorkShift
        {
            Id = Guid.NewGuid(),
            CompanyId = companyContext.CompanyId.Value,
            EmployeeAccountId = employeeId,
            WorkDate = WorkforceCalculations.Today(now),
            StartedAt = now,
            Status = WorkShiftStatus.Working
        };
        dbContext.WorkShifts.Add(shift);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToAttendanceResponse(shift, now));
    }

    private static async Task<IResult> StartBreakAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId) || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var shift = await FindTodayShiftAsync(dbContext, employeeId, now, cancellationToken);
        if (shift is null || shift.Status != WorkShiftStatus.Working)
        {
            return Results.Conflict(new { message = "Mola başlatmak için aktif bir mesai olmalıdır." });
        }

        shift.Status = WorkShiftStatus.OnBreak;
        var shiftBreak = new WorkShiftBreak
        {
            Id = Guid.NewGuid(),
            CompanyId = companyContext.CompanyId.Value,
            WorkShiftId = shift.Id,
            StartedAt = now
        };
        dbContext.WorkShiftBreaks.Add(shiftBreak);
        shift.Breaks.Add(shiftBreak);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToAttendanceResponse(shift, now));
    }

    private static async Task<IResult> EndBreakAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId)) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var shift = await FindTodayShiftAsync(dbContext, employeeId, now, cancellationToken);
        var activeBreak = shift?.Breaks.SingleOrDefault(item => !item.EndedAt.HasValue);
        if (shift is null || shift.Status != WorkShiftStatus.OnBreak || activeBreak is null)
        {
            return Results.Conflict(new { message = "Devam ettirilecek aktif bir mola bulunamadı." });
        }

        activeBreak.EndedAt = now;
        shift.Status = WorkShiftStatus.Working;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToAttendanceResponse(shift, now));
    }

    private static async Task<IResult> FinishShiftAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId)) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var shift = await FindTodayShiftAsync(dbContext, employeeId, now, cancellationToken);
        if (shift is null || shift.Status == WorkShiftStatus.Completed)
        {
            return Results.Conflict(new { message = "Bitirilecek aktif bir mesai bulunamadı." });
        }

        var activeBreak = shift.Breaks.SingleOrDefault(item => !item.EndedAt.HasValue);
        if (activeBreak is not null) activeBreak.EndedAt = now;
        shift.EndedAt = now;
        shift.Status = WorkShiftStatus.Completed;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToAttendanceResponse(shift, now));
    }

    private static async Task<IResult> GetVehicleStockCatalogAsync(
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var previousProducts = await dbContext.VehicleStockCheckItems.AsNoTracking()
            .Select(item => item.ProductName)
            .Distinct()
            .ToListAsync(cancellationToken);
        var inventoryProducts = await dbContext.InventoryItems.AsNoTracking()
            .Where(item => item.IsActive)
            .Select(item => item.Name)
            .Distinct()
            .ToListAsync(cancellationToken);
        var products = previousProducts
            .Concat(inventoryProducts)
            .Distinct(StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .OrderBy(name => name, StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), false))
            .Take(100)
            .ToList();
        return Results.Ok(products);
    }

    private static async Task<IResult> GetLatestVehicleStockAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId)) return Results.Forbid();
        var vehicle = await dbContext.Vehicles.AsNoTracking().Include(item => item.StockItems)
            .SingleOrDefaultAsync(item => item.AssignedEmployeeAccountId == employeeId && item.IsActive, cancellationToken);
        if (vehicle is null) return Results.NoContent();
        var checks = await dbContext.VehicleStockChecks.AsNoTracking()
            .Where(item => item.EmployeeAccountId == employeeId && item.VehicleId == vehicle.Id)
            .ToListAsync(cancellationToken);
        var lastCheck = checks.OrderByDescending(item => item.CheckedAt).FirstOrDefault();
        return Results.Ok(ToCurrentVehicleStockResponse(vehicle, lastCheck));
    }

    private static async Task<IResult> CreateVehicleStockCheckAsync(
        CreateVehicleStockCheckRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!TryGetEmployeeIdentity(companyContext, out var employeeId) || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var errors = ValidateStockItems(request.Items);
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        var vehicle = await dbContext.Vehicles.Include(item => item.StockItems)
            .SingleOrDefaultAsync(item => item.AssignedEmployeeAccountId == employeeId && item.IsActive, cancellationToken);
        if (vehicle is null) return Results.Conflict(new { message = "Araç stok kontrolü için önce firma sahibi tarafından personelinize araç atanmalıdır." });
        var now = DateTimeOffset.UtcNow;
        var snapshotItems = new List<VehicleStockCheckItem>();
        foreach (var input in request.Items)
        {
            VehicleStockItem? stockItem = null;
            if (input.VehicleStockItemId.HasValue)
            {
                stockItem = vehicle.StockItems.SingleOrDefault(item => item.Id == input.VehicleStockItemId.Value && item.IsActive);
                if (stockItem is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = ["Araçta bulunmayan bir stok kalemi seçildi."] });
                if (!InventoryUnitConverter.TryConvert(input.Quantity, input.Unit, stockItem.Unit, out var countedQuantity))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["unit"] = [$"{input.ProductName} için {input.Unit} ile {stockItem.Unit} birimleri uyumlu değil."] });
                var difference = countedQuantity - stockItem.Quantity;
                if (difference != 0)
                {
                    stockItem.Quantity = countedQuantity; stockItem.LastMovementAt = now;
                    dbContext.VehicleStockMovements.Add(new VehicleStockMovement
                    {
                        Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, VehicleStockItemId = stockItem.Id,
                        InventoryItemId = stockItem.InventoryItemId, PerformedByAccountId = employeeId, Type = "CountAdjustment",
                        Quantity = Math.Abs(difference), Unit = stockItem.Unit,
                        Note = difference > 0 ? "Personel araç sayımı: fazla" : "Personel araç sayımı: eksik", OccurredAt = now
                    });
                }
            }
            else
            {
                var normalizedUnit = InventoryUnitConverter.Normalize(input.Unit);
                stockItem = vehicle.StockItems.SingleOrDefault(item => !item.InventoryItemId.HasValue && item.NormalizedName == input.ProductName.Trim().ToUpperInvariant() && item.Unit == normalizedUnit);
                if (stockItem is null)
                {
                    stockItem = new VehicleStockItem
                    {
                        Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, VehicleId = vehicle.Id,
                        ProductName = input.ProductName.Trim(), NormalizedName = input.ProductName.Trim().ToUpperInvariant(),
                        Quantity = input.Quantity, Unit = normalizedUnit, LastMovementAt = now
                    };
                    dbContext.VehicleStockItems.Add(stockItem);
                    vehicle.StockItems.Add(stockItem);
                    dbContext.VehicleStockMovements.Add(new VehicleStockMovement
                    {
                        Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, VehicleStockItemId = stockItem.Id,
                        PerformedByAccountId = employeeId, Type = "ManualEntry", Quantity = input.Quantity,
                        Unit = stockItem.Unit, Note = "Personel tarafından manuel araç stoğu eklendi", OccurredAt = now
                    });
                }
                else
                {
                    var difference = input.Quantity - stockItem.Quantity;
                    if (difference != 0)
                    {
                        stockItem.Quantity = input.Quantity;
                        stockItem.LastMovementAt = now;
                        dbContext.VehicleStockMovements.Add(new VehicleStockMovement
                        {
                            Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, VehicleStockItemId = stockItem.Id,
                            PerformedByAccountId = employeeId, Type = "CountAdjustment", Quantity = Math.Abs(difference),
                            Unit = stockItem.Unit, Note = difference > 0 ? "Personel araç sayımı: fazla" : "Personel araç sayımı: eksik", OccurredAt = now
                        });
                    }
                }
            }

            snapshotItems.Add(new VehicleStockCheckItem
            {
                Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, VehicleStockItemId = stockItem.Id,
                ProductName = stockItem.ProductName, Quantity = stockItem.Quantity, Unit = stockItem.Unit, IsManual = !stockItem.InventoryItemId.HasValue
            });
        }

        var check = new VehicleStockCheck
        {
            Id = Guid.NewGuid(),
            CompanyId = companyContext.CompanyId.Value,
            EmployeeAccountId = employeeId,
            VehicleId = vehicle.Id,
            CheckedAt = now,
            Items = snapshotItems
        };
        dbContext.VehicleStockChecks.Add(check);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/employee/operations/vehicle-stock/checks/{check.Id}", ToCurrentVehicleStockResponse(vehicle, check));
    }

    private static async Task<IResult> GetWorkforceAnalyticsAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var today = WorkforceCalculations.Today(now);
        var weekStart = today.AddDays(-6);
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var rangeStart = weekStart < monthStart ? weekStart : monthStart;
        var companyId = companyContext.CompanyId.Value;

        var employees = await dbContext.CompanyMemberships.AsNoTracking()
            .Where(item => item.CompanyId == companyId && item.IsActive && item.Account.Portal == PortalType.Employee)
            .Select(item => new { item.AccountId, item.Account.DisplayName, item.Account.Email, item.Account.IsActive })
            .OrderBy(item => item.DisplayName)
            .ToListAsync(cancellationToken);
        var shifts = await dbContext.WorkShifts.AsNoTracking()
            .Include(item => item.Breaks)
            .Where(item => item.WorkDate >= rangeStart && item.WorkDate <= today)
            .ToListAsync(cancellationToken);
        var stockChecks = await dbContext.VehicleStockChecks.AsNoTracking()
            .Select(item => new { item.EmployeeAccountId, item.CheckedAt })
            .ToListAsync(cancellationToken);
        var latestChecks = stockChecks
            .GroupBy(item => item.EmployeeAccountId)
            .ToDictionary(group => group.Key, group => (DateTimeOffset?)group.Max(item => item.CheckedAt));

        var rows = employees.Select(employee =>
        {
            var employeeShifts = shifts.Where(item => item.EmployeeAccountId == employee.AccountId).ToList();
            var todayShift = employeeShifts.SingleOrDefault(item => item.WorkDate == today);
            return new WorkforceEmployeeResponse(
                employee.AccountId,
                employee.DisplayName,
                employee.Email,
                employee.IsActive ? WorkforceCalculations.Status(todayShift) : "inactive",
                todayShift?.StartedAt,
                todayShift?.EndedAt,
                todayShift is null ? 0 : WorkforceCalculations.WorkedMinutes(todayShift, now),
                todayShift is null ? 0 : WorkforceCalculations.BreakMinutes(todayShift, now),
                employeeShifts.Where(item => item.WorkDate >= weekStart).Sum(item => WorkforceCalculations.WorkedMinutes(item, now)),
                employeeShifts.Where(item => item.WorkDate >= monthStart).Sum(item => WorkforceCalculations.WorkedMinutes(item, now)),
                latestChecks.GetValueOrDefault(employee.AccountId));
        }).ToList();

        return Results.Ok(new WorkforceAnalyticsResponse(
            today,
            employees.Count(item => item.IsActive),
            rows.Count(item => item.Status == "working" || item.Status == "onBreak"),
            rows.Count(item => item.Status == "completed"),
            rows.Sum(item => item.TodayWorkedMinutes),
            rows.Sum(item => item.WeekWorkedMinutes),
            rows.Sum(item => item.MonthWorkedMinutes),
            rows));
    }

    private static async Task<WorkShift?> FindTodayShiftAsync(
        PesneerDbContext dbContext,
        Guid employeeId,
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        await dbContext.WorkShifts
            .Include(item => item.Breaks)
            .SingleOrDefaultAsync(item =>
                item.EmployeeAccountId == employeeId &&
                item.WorkDate == WorkforceCalculations.Today(now),
                cancellationToken);

    private static AttendanceResponse ToAttendanceResponse(WorkShift? shift, DateTimeOffset now) => new(
        shift?.Id,
        WorkforceCalculations.Status(shift),
        shift?.WorkDate ?? WorkforceCalculations.Today(now),
        shift?.StartedAt,
        shift?.EndedAt,
        shift is null ? 0 : WorkforceCalculations.WorkedMinutes(shift, now),
        shift is null ? 0 : WorkforceCalculations.BreakMinutes(shift, now),
        now);

    private static VehicleStockCheckResponse ToVehicleStockResponse(VehicleStockCheck check) => new(
        check.Id,
        check.CheckedAt,
        check.VehicleId,
        check.Vehicle?.Plate,
        check.Vehicle is null ? null : $"{check.Vehicle.Brand} {check.Vehicle.Model}",
        check.Items.Select(item => new VehicleStockItemResponse(
            item.Id,
            item.VehicleStockItemId,
            item.VehicleStockItem?.InventoryItemId,
            item.ProductName,
            item.Quantity,
            item.Unit,
            item.IsManual)).ToList());

    private static VehicleStockCheckResponse ToCurrentVehicleStockResponse(Vehicle vehicle, VehicleStockCheck? check) => new(
        check?.Id ?? Guid.Empty,
        check?.CheckedAt ?? vehicle.CreatedAt,
        vehicle.Id,
        vehicle.Plate,
        $"{vehicle.Brand} {vehicle.Model}",
        vehicle.StockItems.Where(item => item.IsActive).OrderBy(item => item.ProductName).Select(item => new VehicleStockItemResponse(
            item.Id, item.Id, item.InventoryItemId, item.ProductName, item.Quantity, item.Unit, !item.InventoryItemId.HasValue)).ToArray());

    private static Dictionary<string, string[]> ValidateStockItems(IReadOnlyList<VehicleStockItemRequest>? items)
    {
        var errors = new Dictionary<string, string[]>();
        if (items is null || items.Count == 0)
        {
            errors["items"] = ["Araç stok kontrolüne en az bir ürün ekleyin."];
            return errors;
        }

        if (items.Count > 100) errors["items"] = ["Tek kontrolde en fazla 100 ürün kaydedilebilir."];
        if (items.Any(item => string.IsNullOrWhiteSpace(item.ProductName) || item.ProductName.Trim().Length > 160))
            errors["productName"] = ["Ürün adlarını kontrol edin."];
        if (items.Any(item => item.Quantity < 0)) errors["quantity"] = ["Ürün miktarı negatif olamaz."];
        if (items.Any(item => string.IsNullOrWhiteSpace(item.Unit) || item.Unit.Trim().Length > 24))
            errors["unit"] = ["Geçerli bir birim seçin."];
        return errors;
    }

    private static bool TryGetEmployeeIdentity(ICompanyContext companyContext, out Guid employeeId)
    {
        employeeId = companyContext.AccountId ?? Guid.Empty;
        return employeeId != Guid.Empty && companyContext.CompanyId.HasValue && companyContext.Portal == PortalType.Employee;
    }
}
