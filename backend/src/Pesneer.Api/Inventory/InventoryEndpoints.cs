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
        group.MapPost("/entries", CreateEntryAsync);
        return app;
    }

    private static async Task<IResult> GetInventoryAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var items = await dbContext.InventoryItems.AsNoTracking()
            .Where(item => item.IsActive)
            .OrderBy(item => item.Name)
            .ToListAsync(cancellationToken);
        return Results.Ok(items.Select(ToResponse));
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
                LotNumber = lotNumber,
                LastMovementAt = DateTimeOffset.UtcNow
            };
            dbContext.InventoryItems.Add(item);
        }
        else
        {
            item.Quantity += request.Quantity;
            item.MinimumQuantity = request.MinimumQuantity;
            item.Category = request.Category.Trim();
            item.LastMovementAt = DateTimeOffset.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(item));
    }

    private static Dictionary<string, string[]> Validate(CreateInventoryEntryRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name.Trim();
        if (name.Length < 2 || name.Length > 160) errors["name"] = ["Ürün adı 2-160 karakter arasında olmalıdır."];
        if (string.IsNullOrWhiteSpace(request.Category) || request.Category.Trim().Length > 80) errors["category"] = ["Geçerli bir kategori seçin."];
        if (request.Quantity <= 0) errors["quantity"] = ["Giriş miktarı sıfırdan büyük olmalıdır."];
        if (request.MinimumQuantity < 0) errors["minimumQuantity"] = ["Minimum miktar negatif olamaz."];
        if (string.IsNullOrWhiteSpace(request.Unit) || request.Unit.Trim().Length > 24) errors["unit"] = ["Geçerli bir birim seçin."];
        if (request.LotNumber?.Trim().Length > 80) errors["lotNumber"] = ["Lot numarası en fazla 80 karakter olabilir."];
        return errors;
    }

    private static InventoryItemResponse ToResponse(InventoryItem item) => new(
        item.Id,
        item.Name,
        item.Category,
        item.Quantity,
        item.Unit,
        item.MinimumQuantity,
        item.LotNumber,
        item.LastMovementAt,
        item.Quantity <= item.MinimumQuantity ? "Kritik" : item.Quantity <= item.MinimumQuantity * 1.5m ? "Düşük" : "Yeterli");
}
