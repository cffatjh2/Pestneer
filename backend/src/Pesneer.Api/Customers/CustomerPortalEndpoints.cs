using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Customers;

public static class CustomerPortalEndpoints
{
    private static readonly HashSet<string> ServiceTypes = ["EmergencyPaid", "EmergencyFree"];
    private static readonly HashSet<string> Priorities = ["Normal", "Urgent", "Critical"];
    private static readonly HashSet<string> Statuses = ["New", "Acknowledged", "Planned", "Completed", "Cancelled"];

    public static IEndpointRouteBuilder MapCustomerPortalEndpoints(this IEndpointRouteBuilder app)
    {
        var customer = app.MapGroup("/api/customer/portal").RequireAuthorization("CustomerPortal");
        customer.MapGet("/summary", GetSummaryAsync);
        customer.MapPost("/emergency-requests", CreateEmergencyRequestAsync);

        var company = app.MapGroup("/api/company/emergency-requests").RequireAuthorization("OwnerPortal");
        company.MapGet("/", GetCompanyRequestsAsync);
        company.MapPut("/{requestId:guid}", UpdateRequestAsync);

        var employee = app.MapGroup("/api/employee/emergency-requests").RequireAuthorization("EmployeePortal");
        employee.MapGet("/", GetEmployeeRequestsAsync);
        employee.MapPut("/{requestId:guid}/status", UpdateEmployeeRequestAsync);
        return app;
    }

    private static async Task<IResult> GetSummaryAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Results.Forbid();
        var customer = await dbContext.Customers.AsNoTracking().Include(item => item.Branches)
            .SingleOrDefaultAsync(item => item.Id == context.CustomerId.Value && item.IsActive, cancellationToken);
        if (customer is null) return Results.NotFound(new { message = "Müşteri kaydı bulunamadı." });

        var orders = await WorkOrderQuery(dbContext, context).ToListAsync(cancellationToken);
        var requests = await EmergencyQuery(dbContext).Where(item => item.CustomerId == customer.Id)
            .Where(item => !context.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId.Value)
            .ToListAsync(cancellationToken);
        var branches = customer.Branches.Where(item => item.IsActive && (!context.CustomerBranchId.HasValue || item.Id == context.CustomerBranchId.Value))
            .OrderBy(item => item.Name).Select(item => new CustomerPortalBranchResponse(item.Id, item.Name, item.Code, item.Address, item.City, item.District, item.PhoneNumber, item.Email, item.MapUrl)).ToArray();
        var now = DateTimeOffset.UtcNow;
        return Results.Ok(new CustomerPortalSummaryResponse(customer.Id, customer.LegalName, context.CustomerBranchId.HasValue ? "Branch" : "Customer", branches,
            orders.Where(item => (item.Status is "Planned" or "InProgress") && item.ScheduledAt >= now.AddDays(-1)).OrderBy(item => item.ScheduledAt).Select(ToWorkOrderResponse).ToArray(),
            orders.Where(item => item.Status == "Completed").OrderByDescending(item => item.CompletedAt ?? item.ScheduledAt).Take(50).Select(ToWorkOrderResponse).ToArray(),
            requests.OrderByDescending(item => item.RequestedAt).Select(ToResponse).ToArray()));
    }

    private static async Task<IResult> CreateEmergencyRequestAsync(CreateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !context.CompanyId.HasValue || !context.CustomerId.HasValue) return Results.Forbid();
        if (!ServiceTypes.Contains(request.ServiceType)) return Validation("serviceType", "Acil çağrının ücret türünü seçin.");
        if (!Priorities.Contains(request.Priority)) return Validation("priority", "Geçerli bir öncelik seçin.");
        var description = request.Description.Trim();
        if (description.Length is < 10 or > 2000) return Validation("description", "Talep açıklaması 10-2000 karakter arasında olmalıdır.");

        Guid? branchId = context.CustomerBranchId ?? request.BranchId;
        if (context.CustomerBranchId.HasValue && request.BranchId.HasValue && request.BranchId != context.CustomerBranchId) return Results.Forbid();
        if (branchId.HasValue && !await dbContext.CustomerBranches.AnyAsync(item => item.Id == branchId && item.CustomerId == context.CustomerId.Value && item.IsActive, cancellationToken))
            return Validation("branchId", "Yetkili olduğunuz bir şube seçin.");

        var recentAssignments = await dbContext.WorkOrders.AsNoTracking()
            .Where(item => item.CustomerId == context.CustomerId.Value && item.AssignedEmployeeAccountId.HasValue)
            .Where(item => !branchId.HasValue || item.CustomerBranchId == branchId)
            .Select(item => new { item.AssignedEmployeeAccountId, item.ScheduledAt }).ToListAsync(cancellationToken);
        var assignedEmployeeId = recentAssignments.OrderByDescending(item => item.ScheduledAt).Select(item => item.AssignedEmployeeAccountId).FirstOrDefault();
        var prefix = $"AC-{DateTimeOffset.UtcNow:yyMMdd}-";
        var existing = await dbContext.EmergencyRequests.AsNoTracking().Where(item => item.Number.StartsWith(prefix)).Select(item => item.Number).ToListAsync(cancellationToken);
        var next = existing.Select(item => int.TryParse(item[prefix.Length..], out var value) ? value : 0).DefaultIfEmpty().Max() + 1;
        var emergency = new EmergencyRequest
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = context.CustomerId.Value, CustomerBranchId = branchId,
            CreatedByAccountId = context.AccountId.Value, AssignedEmployeeAccountId = assignedEmployeeId, Number = $"{prefix}{next:000}",
            ServiceType = request.ServiceType, Priority = request.Priority, Status = "New", Description = description,
            ContactPhone = NullIfEmpty(request.ContactPhone)
        };
        emergency.History.Add(NewHistory(emergency, context.AccountId.Value, "New", "Müşteri acil çağrı talebi oluşturdu."));
        dbContext.EmergencyRequests.Add(emergency);
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Created($"/api/customer/portal/emergency-requests/{emergency.Id}", ToResponse(await EmergencyQuery(dbContext).SingleAsync(item => item.Id == emergency.Id, cancellationToken)));
    }

    private static async Task<IResult> GetCompanyRequestsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var items = await EmergencyQuery(dbContext).ToListAsync(cancellationToken);
        return Results.Ok(items.OrderByDescending(item => item.RequestedAt).Select(ToResponse));
    }

    private static async Task<IResult> GetEmployeeRequestsAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var items = await EmergencyQuery(dbContext).Where(item => item.AssignedEmployeeAccountId == context.AccountId.Value).ToListAsync(cancellationToken);
        return Results.Ok(items.OrderByDescending(item => item.RequestedAt).Select(ToResponse));
    }

    private static Task<IResult> UpdateRequestAsync(Guid requestId, UpdateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        UpdateCoreAsync(requestId, request, dbContext, context, false, cancellationToken);

    private static Task<IResult> UpdateEmployeeRequestAsync(Guid requestId, UpdateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        UpdateCoreAsync(requestId, request with { EmployeeAccountId = context.AccountId }, dbContext, context, true, cancellationToken);

    private static async Task<IResult> UpdateCoreAsync(Guid requestId, UpdateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, bool employeeOnly, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !Statuses.Contains(request.Status)) return Results.Forbid();
        if (employeeOnly && request.Status is not ("Acknowledged" or "Completed")) return Validation("status", "Personel yalnızca talebi kabul edebilir veya tamamlayabilir.");
        var emergency = await dbContext.EmergencyRequests.SingleOrDefaultAsync(item => item.Id == requestId, cancellationToken);
        if (emergency is null || employeeOnly && emergency.AssignedEmployeeAccountId != context.AccountId) return Results.NotFound(new { message = "Acil çağrı bulunamadı." });
        if (request.EmployeeAccountId.HasValue)
        {
            var employeeExists = await dbContext.CompanyMemberships.AsNoTracking().AnyAsync(item => item.AccountId == request.EmployeeAccountId && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee, cancellationToken);
            if (!employeeExists) return Validation("employeeAccountId", "Aktif bir personel seçin.");
            emergency.AssignedEmployeeAccountId = request.EmployeeAccountId;
        }
        emergency.Status = request.Status;
        if (request.Status == "Acknowledged") emergency.AcknowledgedAt ??= DateTimeOffset.UtcNow;
        if (request.Status == "Completed") emergency.CompletedAt = DateTimeOffset.UtcNow;
        dbContext.EmergencyRequestHistories.Add(NewHistory(emergency, context.AccountId.Value, request.Status, NullIfEmpty(request.Note)));
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Ok(ToResponse(await EmergencyQuery(dbContext).SingleAsync(item => item.Id == requestId, cancellationToken)));
    }

    private static IQueryable<WorkOrder> WorkOrderQuery(PesneerDbContext dbContext, ICompanyContext context) => dbContext.WorkOrders.AsNoTracking()
        .Include(item => item.CustomerBranch).Include(item => item.AssignedEmployeeAccount)
        .Where(item => item.CustomerId == context.CustomerId!.Value)
        .Where(item => !context.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId.Value);

    private static IQueryable<EmergencyRequest> EmergencyQuery(PesneerDbContext dbContext) => dbContext.EmergencyRequests.AsNoTracking()
        .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.AssignedEmployeeAccount)
        .Include(item => item.History).ThenInclude(item => item.ChangedByAccount).AsSplitQuery();

    private static CustomerPortalWorkOrderResponse ToWorkOrderResponse(WorkOrder item) => new(item.Id, item.Number, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez", item.ServiceType, item.VisitType, item.ScheduledAt, item.DurationMinutes, item.Status, item.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", item.CompletionNote, item.Recommendation);
    private static EmergencyRequestResponse ToResponse(EmergencyRequest item) => new(item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez", item.ServiceType, item.Priority, item.Status, item.Description, item.ContactPhone, item.AssignedEmployeeAccountId, item.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", item.RequestedAt, item.AcknowledgedAt, item.CompletedAt, item.History.OrderBy(history => history.OccurredAt).Select(history => new EmergencyHistoryResponse(history.Status, history.Note, history.OccurredAt, history.ChangedByAccount.DisplayName)).ToArray());
    private static EmergencyRequestHistory NewHistory(EmergencyRequest item, Guid accountId, string status, string? note) => new() { Id = Guid.NewGuid(), CompanyId = item.CompanyId, EmergencyRequestId = item.Id, ChangedByAccountId = accountId, Status = status, Note = note };
    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
