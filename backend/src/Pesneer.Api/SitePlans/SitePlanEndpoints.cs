using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.Optimization;

namespace Pesneer.Api.SitePlans;

public static partial class SitePlanEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> ElementTypes = new(StringComparer.OrdinalIgnoreCase) { "rect", "line", "door", "text", "station", "image" };
    private static readonly HashSet<string> EquipmentShapes = new(StringComparer.OrdinalIgnoreCase) { "square", "circle", "diamond", "star", "hexagon" };

    public static IEndpointRouteBuilder MapSitePlanEndpoints(this IEndpointRouteBuilder app)
    {
        var shared = app.MapGroup("/api/site-plans").RequireAuthorization();
        shared.MapGet("/", GetPlansAsync);
        shared.MapGet("/{planId:guid}", GetPlanAsync);

        var staff = app.MapGroup("/api/site-plans").RequireAuthorization("CompanyStaff");
        staff.MapPost("/", CreatePlanAsync);
        staff.MapPut("/{planId:guid}", UpdatePlanAsync);
        app.MapGet("/api/v2/site-plans", GetPlanSummariesAsync).RequireAuthorization();
        app.MapGet("/api/v2/site-plans/{planId:guid}", GetPlanAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetPlanSummariesAsync(
        int? limit,
        string? cursor,
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        if (HasMissingEmployeeIdentity(context)) return Results.Forbid();

        var pageSize = CursorPaging.NormalizeLimit(limit);
        var hasCursor = CursorPaging.TryRead(cursor, out var position);
        if (!string.IsNullOrWhiteSpace(cursor) && !hasCursor)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["cursor"] = ["Sayfalama anahtarı geçerli değil."] });

        var snapshot = hasCursor ? position.Snapshot : DateTimeOffset.UtcNow;
        var query = AccessiblePlans(dbContext, context).AsNoTracking();
        List<SitePlanSummaryProjection> rows;

        if (dbContext.Database.IsNpgsql())
        {
            query = query.Where(item => item.CreatedAt <= snapshot);
            if (hasCursor)
                query = query.Where(item => item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0));
            rows = await query.OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
                .Take(pageSize + 1)
                .Select(item => new SitePlanSummaryProjection(
                    item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status, item.Revision,
                    item.RevisionNote, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId,
                    item.CustomerBranch != null ? item.CustomerBranch.Name : "Genel / Merkez",
                    item.CreatedByAccount.DisplayName, item.CreatedAt, item.UpdatedAt,
                    item.Documents.OrderByDescending(document => document.CreatedAt).Select(document => (Guid?)document.Id).FirstOrDefault(),
                    item.Documents.OrderByDescending(document => document.CreatedAt).Select(document => document.FileName).FirstOrDefault(),
                    item.Documents.OrderByDescending(document => document.CreatedAt).Select(document => document.ContentType).FirstOrDefault()))
                .ToListAsync(cancellationToken);
        }
        else
        {
            var candidates = await query.Select(item => new SitePlanSummaryBaseProjection(
                    item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status, item.Revision,
                    item.RevisionNote, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId,
                    item.CustomerBranch != null ? item.CustomerBranch.Name : "Genel / Merkez",
                    item.CreatedByAccount.DisplayName, item.CreatedAt, item.UpdatedAt))
                .ToListAsync(cancellationToken);
            var selected = candidates
                .Where(item => item.CreatedAt <= snapshot && (!hasCursor || item.CreatedAt < position.Sort ||
                    (item.CreatedAt == position.Sort && item.Id.CompareTo(position.Id) < 0)))
                .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
                .Take(pageSize + 1).ToList();
            var planIds = selected.Select(item => item.Id).ToArray();
            List<SitePlanDocumentProjection> documents = planIds.Length == 0
                ? []
                : await dbContext.QualityDocuments.AsNoTracking()
                    .Where(document => document.SitePlanId.HasValue && planIds.Contains(document.SitePlanId.Value))
                    .Select(document => new SitePlanDocumentProjection(document.SitePlanId!.Value, document.Id,
                        document.FileName, document.ContentType, document.CreatedAt))
                    .ToListAsync(cancellationToken);
            var documentByPlan = documents.GroupBy(document => document.SitePlanId)
                .ToDictionary(group => group.Key, group => group.OrderByDescending(document => document.CreatedAt).First());
            rows = selected.Select(item =>
            {
                var document = documentByPlan.GetValueOrDefault(item.Id);
                return new SitePlanSummaryProjection(item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide,
                    item.Status, item.Revision, item.RevisionNote, item.CustomerId, item.CustomerName, item.BranchId,
                    item.BranchName, item.CreatedBy, item.CreatedAt, item.UpdatedAt, document?.Id, document?.FileName,
                    document?.ContentType);
            }).ToList();
        }

        var hasMore = rows.Count > pageSize;
        if (hasMore) rows.RemoveAt(rows.Count - 1);
        var items = rows.Select(ToSummaryResponse).ToArray();
        var last = rows.LastOrDefault();
        var nextCursor = hasMore && last is not null ? CursorPaging.Write(snapshot, last.CreatedAt, last.Id) : null;
        return Results.Ok(new CursorPage<SitePlanSummaryResponse>(items, nextCursor, hasMore, snapshot.ToString("O")));
    }

    private static async Task<IResult> GetPlansAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (HasMissingEmployeeIdentity(context)) return Results.Forbid();

        var query = AccessiblePlans(dbContext, context).AsNoTracking();
        var items = dbContext.Database.IsSqlite()
            ? (await LoadSitePlanProjectionsAsync(query, dbContext, cancellationToken)).OrderByDescending(item => item.UpdatedAt).ToList()
            : await query.OrderByDescending(item => item.UpdatedAt).Select(SitePlanProjectionExpression()).ToListAsync(cancellationToken);
        return Results.Ok(items.Select(ToResponse).ToArray());
    }

    private static async Task<IResult> GetPlanAsync(Guid planId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (HasMissingEmployeeIdentity(context)) return Results.Forbid();

        var query = AccessiblePlans(dbContext, context).AsNoTracking().Where(plan => plan.Id == planId);
        var item = dbContext.Database.IsSqlite()
            ? (await LoadSitePlanProjectionsAsync(query, dbContext, cancellationToken)).SingleOrDefault()
            : await query.Select(SitePlanProjectionExpression()).SingleOrDefaultAsync(cancellationToken);
        return item is null ? Results.NotFound(new { message = "Yerleşim planı bulunamadı." }) : Results.Ok(ToResponse(item));
    }

    private static async Task<IResult> CreatePlanAsync(
        SaveSitePlanRequest request,
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        var validation = Validate(request);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var customer = await dbContext.Customers.SingleAsync(item => item.Id == request.CustomerId, cancellationToken);
        var branch = request.BranchId.HasValue
            ? await dbContext.CustomerBranches.SingleAsync(item => item.Id == request.BranchId.Value, cancellationToken)
            : null;
        var account = await dbContext.Accounts.SingleAsync(item => item.Id == context.AccountId, cancellationToken);
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var plan = new SitePlan
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId!.Value, CustomerId = customer.Id, CustomerBranchId = branch?.Id,
            CreatedByAccountId = account.Id, Number = $"PLN-{now:yyyyMMdd}-{Guid.NewGuid():N}"[..19].ToUpperInvariant(),
            Title = request.Title.Trim(), AreaName = request.AreaName.Trim(), FieldGuide = Clean(request.FieldGuide, 240) ?? "İç ve Dış Alan",
            Status = "Published", Revision = 1, RevisionNote = Clean(request.RevisionNote, 1000),
            CanvasJson = JsonSerializer.Serialize(request.Canvas, JsonOptions), CreatedAt = now, UpdatedAt = now,
            Customer = customer, CustomerBranch = branch, CreatedByAccount = account
        };
        var document = NewDocument(plan);
        document.FileData = SitePlanPdfRenderer.Render(plan, request.Canvas, company.LegalName, company.LogoData);
        document.SizeBytes = document.FileData.LongLength;
        plan.Documents.Add(document);
        dbContext.SitePlans.Add(plan);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/site-plans/{plan.Id}", ToResponse(plan));
    }

    private static async Task<IResult> UpdatePlanAsync(
        Guid planId,
        SaveSitePlanRequest request,
        PesneerDbContext dbContext,
        ICompanyContext context,
        CancellationToken cancellationToken)
    {
        var validation = Validate(request);
        if (validation is not null) return validation;
        if (!await CanUseLocationAsync(request.CustomerId, request.BranchId, dbContext, context, cancellationToken)) return Results.Forbid();

        var plan = await AccessiblePlans(dbContext, context)
            .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CreatedByAccount)
            .Include(item => item.Documents).SingleOrDefaultAsync(item => item.Id == planId, cancellationToken);
        if (plan is null) return Results.NotFound(new { message = "Yerleşim planı bulunamadı." });

        var customer = await dbContext.Customers.SingleAsync(item => item.Id == request.CustomerId, cancellationToken);
        var branch = request.BranchId.HasValue
            ? await dbContext.CustomerBranches.SingleAsync(item => item.Id == request.BranchId.Value, cancellationToken)
            : null;
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(item => item.Id == context.CompanyId, cancellationToken);
        plan.CustomerId = customer.Id;
        plan.CustomerBranchId = branch?.Id;
        plan.Customer = customer;
        plan.CustomerBranch = branch;
        plan.Title = request.Title.Trim();
        plan.AreaName = request.AreaName.Trim();
        plan.FieldGuide = Clean(request.FieldGuide, 240) ?? "İç ve Dış Alan";
        plan.Revision++;
        plan.RevisionNote = Clean(request.RevisionNote, 1000);
        plan.CanvasJson = JsonSerializer.Serialize(request.Canvas, JsonOptions);
        plan.UpdatedAt = DateTimeOffset.UtcNow;

        var document = plan.Documents.SingleOrDefault();
        if (document is null)
        {
            document = NewDocument(plan);
            plan.Documents.Add(document);
        }
        document.CustomerId = plan.CustomerId;
        document.CustomerBranchId = plan.CustomerBranchId;
        document.Title = plan.Title;
        document.Description = Description(plan);
        document.FileName = FileName(plan);
        document.CreatedAt = plan.UpdatedAt;
        document.FileData = SitePlanPdfRenderer.Render(plan, request.Canvas, company.LegalName, company.LogoData);
        document.SizeBytes = document.FileData.LongLength;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(plan));
    }

    private static IQueryable<SitePlan> AccessiblePlans(PesneerDbContext dbContext, ICompanyContext context)
    {
        var query = dbContext.SitePlans.AsQueryable();
        if (context.Portal == PortalType.Customer)
        {
            query = query.Where(item => item.CustomerId == context.CustomerId
                && (!context.CustomerBranchId.HasValue || !item.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId));
        }
        else if (context.Portal == PortalType.Employee)
        {
            if (!context.AccountId.HasValue) return query.Where(_ => false);
            var accountId = context.AccountId.Value;
            query = query.Where(item => item.CreatedByAccountId == accountId
                || dbContext.WorkOrders.Any(workOrder => workOrder.AssignedEmployeeAccountId == accountId
                    && workOrder.CustomerId == item.CustomerId
                    && (!item.CustomerBranchId.HasValue || workOrder.CustomerBranchId == item.CustomerBranchId)));
        }
        return query;
    }

    private static async Task<bool> CanUseLocationAsync(Guid customerId, Guid? branchId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var exists = await dbContext.Customers.AnyAsync(item => item.Id == customerId && item.IsActive, cancellationToken)
            && (!branchId.HasValue || await dbContext.CustomerBranches.AnyAsync(item => item.Id == branchId && item.CustomerId == customerId && item.IsActive, cancellationToken));
        if (!exists) return false;
        if (context.Portal == PortalType.Owner) return true;
        return context.Portal == PortalType.Employee && context.AccountId.HasValue &&
            await dbContext.WorkOrders.AnyAsync(item => item.AssignedEmployeeAccountId == context.AccountId.Value
            && item.CustomerId == customerId && (!branchId.HasValue || item.CustomerBranchId == branchId), cancellationToken);
    }

    private static bool HasMissingEmployeeIdentity(ICompanyContext context) =>
        context.Portal == PortalType.Employee && !context.AccountId.HasValue;

    private static IResult? Validate(SaveSitePlanRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length is < 3 or > 240) return Validation("title", "Plan başlığı 3-240 karakter arasında olmalıdır.");
        if (string.IsNullOrWhiteSpace(request.AreaName) || request.AreaName.Trim().Length is < 2 or > 240) return Validation("areaName", "Alan adı 2-240 karakter arasında olmalıdır.");
        if (request.Canvas.Width != 1200 || request.Canvas.Height != 720) return Validation("canvas", "Kroki çalışma alanı A4 yatay oranında 1200x720 olmalıdır.");
        if (request.Canvas.EquipmentTypes.Count is < 1 or > 30) return Validation("equipmentTypes", "1-30 arasında ekipman türü tanımlayın.");
        if (request.Canvas.Elements.Count > 800) return Validation("elements", "Bir krokide en fazla 800 şekil kullanılabilir.");

        var typeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var type in request.Canvas.EquipmentTypes)
        {
            if (string.IsNullOrWhiteSpace(type.Id) || !typeIds.Add(type.Id)) return Validation("equipmentTypes", "Ekipman türü kimlikleri benzersiz olmalıdır.");
            if (!EquipmentCodeRegex().IsMatch(type.Code.Trim())) return Validation("equipmentTypes", "Ekipman kodu 1-4 harf veya rakamdan oluşmalıdır.");
            if (string.IsNullOrWhiteSpace(type.Name) || type.Name.Trim().Length > 80) return Validation("equipmentTypes", "Ekipman adı 1-80 karakter arasında olmalıdır.");
            if (!ColorRegex().IsMatch(type.Color) || !EquipmentShapes.Contains(type.Shape)) return Validation("equipmentTypes", "Ekipman rengi veya sembolü geçersiz.");
        }

        var elementIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var qrCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var element in request.Canvas.Elements)
        {
            if (string.IsNullOrWhiteSpace(element.Id) || !elementIds.Add(element.Id)) return Validation("elements", "Şekil kimlikleri benzersiz olmalıdır.");
            if (!ElementTypes.Contains(element.Type)) return Validation("elements", "Desteklenmeyen bir kroki şekli bulundu.");
            if (element.X is < -200 or > 1400 || element.Y is < -200 or > 920 || element.Width is < -1200 or > 1200 || element.Height is < -720 or > 720) return Validation("elements", "Kroki şekli çalışma alanı sınırlarının dışında.");
            if (element.StrokeWidth is < 0.5m or > 12) return Validation("elements", "Çizgi kalınlığı 0,5-12 arasında olmalıdır.");
            if (element.Type == "station" && (string.IsNullOrWhiteSpace(element.EquipmentTypeId) || !typeIds.Contains(element.EquipmentTypeId))) return Validation("elements", "İstasyon için geçerli bir ekipman türü seçin.");
            if (!string.IsNullOrWhiteSpace(element.QrCode))
            {
                var qrCode = element.QrCode.Trim();
                if (element.Type != "station") return Validation("elements", "QR kimliği yalnızca istasyonlara atanabilir.");
                if (qrCode.Length is < 3 or > 160 || qrCode.Any(char.IsControl)) return Validation("elements", "QR kimliği 3-160 karakter arasında olmalı ve kontrol karakteri içermemelidir.");
                if (!qrCodes.Add(qrCode)) return Validation("elements", "Aynı QR kimliği birden fazla istasyona atanamaz.");
            }
        }
        return null;
    }

    private static QualityDocument NewDocument(SitePlan plan) => new()
    {
        Id = Guid.NewGuid(), CompanyId = plan.CompanyId, CustomerId = plan.CustomerId, CustomerBranchId = plan.CustomerBranchId,
        CreatedByAccountId = plan.CreatedByAccountId, SitePlanId = plan.Id, Category = "SitePlans", Title = plan.Title,
        Description = Description(plan), FileName = FileName(plan), ContentType = "application/pdf", CreatedAt = plan.UpdatedAt
    };

    private static SitePlanResponse ToResponse(SitePlan item)
    {
        var document = item.Documents.OrderByDescending(document => document.CreatedAt).First();
        var canvas = JsonSerializer.Deserialize<SitePlanCanvasInput>(item.CanvasJson, JsonOptions)
            ?? throw new InvalidOperationException("Kroki verisi okunamadı.");
        return new SitePlanResponse(item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status, item.Revision,
            item.RevisionNote, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Genel / Merkez",
            item.CreatedByAccount.DisplayName, item.CreatedAt, item.UpdatedAt, canvas,
            new SitePlanDocumentResponse(document.Id, document.FileName, document.ContentType, $"/api/quality/documents/{document.Id}/download"));
    }

    private static System.Linq.Expressions.Expression<Func<SitePlan, SitePlanProjection>> SitePlanProjectionExpression() => item =>
        new SitePlanProjection(
            item.Id,
            item.Number,
            item.Title,
            item.AreaName,
            item.FieldGuide,
            item.Status,
            item.Revision,
            item.RevisionNote,
            item.CustomerId,
            item.Customer.LegalName,
            item.CustomerBranchId,
            item.CustomerBranch != null ? item.CustomerBranch.Name : "Genel / Merkez",
            item.CreatedByAccount.DisplayName,
            item.CreatedAt,
            item.UpdatedAt,
            item.CanvasJson,
            item.Documents.OrderByDescending(document => document.CreatedAt).Select(document => (Guid?)document.Id).FirstOrDefault(),
            item.Documents.OrderByDescending(document => document.CreatedAt).Select(document => document.FileName).FirstOrDefault(),
            item.Documents.OrderByDescending(document => document.CreatedAt).Select(document => document.ContentType).FirstOrDefault());

    private static async Task<List<SitePlanProjection>> LoadSitePlanProjectionsAsync(
        IQueryable<SitePlan> query,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var items = await query.Select(item => new SitePlanBaseProjection(
                item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status, item.Revision,
                item.RevisionNote, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId,
                item.CustomerBranch != null ? item.CustomerBranch.Name : "Genel / Merkez",
                item.CreatedByAccount.DisplayName, item.CreatedAt, item.UpdatedAt, item.CanvasJson))
            .ToListAsync(cancellationToken);
        if (items.Count == 0) return [];
        var planIds = items.Select(item => item.Id).ToArray();
        var documents = await dbContext.QualityDocuments.AsNoTracking()
            .Where(document => document.SitePlanId.HasValue && planIds.Contains(document.SitePlanId.Value))
            .Select(document => new SitePlanDocumentProjection(document.SitePlanId!.Value, document.Id,
                document.FileName, document.ContentType, document.CreatedAt))
            .ToListAsync(cancellationToken);
        var documentByPlan = documents.GroupBy(document => document.SitePlanId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(document => document.CreatedAt).First());
        return items.Select(item =>
        {
            var document = documentByPlan.GetValueOrDefault(item.Id);
            return new SitePlanProjection(item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status,
                item.Revision, item.RevisionNote, item.CustomerId, item.CustomerName, item.BranchId, item.BranchName,
                item.CreatedBy, item.CreatedAt, item.UpdatedAt, item.CanvasJson, document?.Id, document?.FileName,
                document?.ContentType);
        }).ToList();
    }

    private static SitePlanResponse ToResponse(SitePlanProjection item)
    {
        if (!item.DocumentId.HasValue || item.DocumentFileName is null || item.DocumentContentType is null)
            throw new InvalidOperationException("Yerleşim planı belgesi bulunamadı.");
        var canvas = JsonSerializer.Deserialize<SitePlanCanvasInput>(item.CanvasJson, JsonOptions)
            ?? throw new InvalidOperationException("Kroki verisi okunamadı.");
        return new SitePlanResponse(item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status, item.Revision,
            item.RevisionNote, item.CustomerId, item.CustomerName, item.BranchId, item.BranchName, item.CreatedBy,
            item.CreatedAt, item.UpdatedAt, canvas,
            new SitePlanDocumentResponse(item.DocumentId.Value, item.DocumentFileName, item.DocumentContentType,
                $"/api/quality/documents/{item.DocumentId.Value}/download"));
    }

    private static SitePlanSummaryResponse ToSummaryResponse(SitePlanSummaryProjection item)
    {
        if (!item.DocumentId.HasValue || item.DocumentFileName is null || item.DocumentContentType is null)
            throw new InvalidOperationException("Yerleşim planı belgesi bulunamadı.");
        return new SitePlanSummaryResponse(item.Id, item.Number, item.Title, item.AreaName, item.FieldGuide, item.Status,
            item.Revision, item.RevisionNote, item.CustomerId, item.CustomerName, item.BranchId, item.BranchName,
            item.CreatedBy, item.CreatedAt, item.UpdatedAt,
            new SitePlanDocumentResponse(item.DocumentId.Value, item.DocumentFileName, item.DocumentContentType,
                $"/api/quality/documents/{item.DocumentId.Value}/download"),
            $"/api/v2/site-plans/{item.Id}");
    }

    private sealed record SitePlanProjection(Guid Id, string Number, string Title, string AreaName, string FieldGuide,
        string Status, int Revision, string? RevisionNote, Guid CustomerId, string CustomerName, Guid? BranchId,
        string BranchName, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string CanvasJson,
        Guid? DocumentId, string? DocumentFileName, string? DocumentContentType);

    private sealed record SitePlanBaseProjection(Guid Id, string Number, string Title, string AreaName, string FieldGuide,
        string Status, int Revision, string? RevisionNote, Guid CustomerId, string CustomerName, Guid? BranchId,
        string BranchName, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string CanvasJson);

    private sealed record SitePlanDocumentProjection(Guid SitePlanId, Guid Id, string FileName, string ContentType,
        DateTimeOffset CreatedAt);

    private sealed record SitePlanSummaryBaseProjection(Guid Id, string Number, string Title, string AreaName,
        string FieldGuide, string Status, int Revision, string? RevisionNote, Guid CustomerId, string CustomerName,
        Guid? BranchId, string BranchName, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

    private sealed record SitePlanSummaryProjection(Guid Id, string Number, string Title, string AreaName,
        string FieldGuide, string Status, int Revision, string? RevisionNote, Guid CustomerId, string CustomerName,
        Guid? BranchId, string BranchName, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
        Guid? DocumentId, string? DocumentFileName, string? DocumentContentType);

    private static string FileName(SitePlan plan) => $"{plan.Number}-R{plan.Revision:00}.pdf";
    private static string Description(SitePlan plan) => $"{plan.AreaName} ekipman yerleşim planı · Revizyon R{plan.Revision:00}";
    private static string? Clean(string? value, int maximum) { value = value?.Trim(); return string.IsNullOrWhiteSpace(value) ? null : value[..Math.Min(value.Length, maximum)]; }
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    [GeneratedRegex("^[A-Za-z0-9]{1,4}$")]
    private static partial Regex EquipmentCodeRegex();
    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex ColorRegex();
}
