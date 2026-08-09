using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Customers;

public static class CustomerPortalEndpoints
{
    private static readonly HashSet<string> RequestTypes = ["EmergencyCall", "Complaint", "NewBranch", "AppointmentChange", "DocumentRequest", "StructuralCompletion"];
    private static readonly HashSet<string> ServiceTypes = ["EmergencyPaid", "EmergencyFree", "Standard"];
    private static readonly HashSet<string> Priorities = ["Low", "Normal", "Urgent", "Critical"];
    private static readonly HashSet<string> Statuses = ["New", "Acknowledged", "Planned", "InProgress", "AwaitingCustomerApproval", "Completed", "Cancelled"];

    public static IEndpointRouteBuilder MapCustomerPortalEndpoints(this IEndpointRouteBuilder app)
    {
        var customer = app.MapGroup("/api/customer/portal").RequireAuthorization("CustomerPortal");
        customer.MapGet("/summary", GetSummaryAsync);
        customer.MapPost("/emergency-requests", CreateRequestAsync);
        customer.MapPost("/requests", CreateRequestAsync);
        customer.MapPost("/requests/{requestId:guid}/messages", AddCustomerMessageAsync);
        customer.MapPost("/requests/{requestId:guid}/closure-approval", ApproveClosureAsync);

        var company = app.MapGroup("/api/company/requests").RequireAuthorization("OwnerPortal");
        company.MapGet("/", GetCompanyRequestsAsync);
        company.MapPut("/{requestId:guid}", UpdateRequestAsync);
        company.MapPost("/{requestId:guid}/messages", AddCompanyMessageAsync);

        var legacyCompany = app.MapGroup("/api/company/emergency-requests").RequireAuthorization("OwnerPortal");
        legacyCompany.MapGet("/", GetCompanyRequestsAsync);
        legacyCompany.MapPut("/{requestId:guid}", UpdateRequestAsync);

        var employee = app.MapGroup("/api/employee/requests").RequireAuthorization("EmployeePortal");
        employee.MapGet("/", GetEmployeeRequestsAsync);
        employee.MapPut("/{requestId:guid}/status", UpdateEmployeeRequestAsync);
        employee.MapPost("/{requestId:guid}/messages", AddEmployeeMessageAsync);

        var legacyEmployee = app.MapGroup("/api/employee/emergency-requests").RequireAuthorization("EmployeePortal");
        legacyEmployee.MapGet("/", GetEmployeeRequestsAsync);
        legacyEmployee.MapPut("/{requestId:guid}/status", UpdateEmployeeRequestAsync);
        return app;
    }

    private static async Task<IResult> GetSummaryAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Results.Forbid();
        var customer = await dbContext.Customers.AsNoTracking().Include(item => item.Branches)
            .SingleOrDefaultAsync(item => item.Id == context.CustomerId.Value && item.IsActive, cancellationToken);
        if (customer is null) return Results.NotFound(new { message = "Müşteri kaydı bulunamadı." });

        var orders = await WorkOrderQuery(dbContext, context).ToListAsync(cancellationToken);
        var requests = await RequestQuery(dbContext).Where(item => item.CustomerId == customer.Id)
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

    private static async Task<IResult> CreateRequestAsync(CreateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !context.CompanyId.HasValue || !context.CustomerId.HasValue) return Results.Forbid();
        var requestType = string.IsNullOrWhiteSpace(request.RequestType) ? "EmergencyCall" : request.RequestType.Trim();
        var serviceType = string.IsNullOrWhiteSpace(request.ServiceType) ? "Standard" : request.ServiceType.Trim();
        if (!RequestTypes.Contains(requestType)) return Validation("requestType", "Geçerli bir talep türü seçin.");
        if (!ServiceTypes.Contains(serviceType)) return Validation("serviceType", "Geçerli bir hizmet türü seçin.");
        if (!Priorities.Contains(request.Priority)) return Validation("priority", "Geçerli bir öncelik seçin.");
        var description = request.Description.Trim();
        var subject = string.IsNullOrWhiteSpace(request.Subject) ? TypeLabel(requestType) : request.Subject.Trim();
        if (subject.Length is < 3 or > 240) return Validation("subject", "Konu 3-240 karakter arasında olmalıdır.");
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
        var prefix = $"TLP-{DateTimeOffset.UtcNow:yyMMdd}-";
        var sequence = await NextSequenceAsync(dbContext, prefix, cancellationToken);
        var item = new EmergencyRequest
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = context.CustomerId.Value, CustomerBranchId = branchId,
            CreatedByAccountId = context.AccountId.Value, AssignedEmployeeAccountId = assignedEmployeeId, Number = $"{prefix}{sequence:000}",
            RequestType = requestType, Subject = subject, ServiceType = serviceType, Priority = request.Priority, Status = "New", Description = description,
            ContactPhone = NullIfEmpty(request.ContactPhone), DueAt = request.DueAt, RequestedAppointmentAt = request.RequestedAppointmentAt,
            ClosureApprovalStatus = "NotRequired"
        };
        item.History.Add(NewHistory(item, context.AccountId.Value, "New", $"Müşteri {TypeLabel(requestType).ToLowerInvariant()} kaydı oluşturdu."));
        dbContext.EmergencyRequests.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Created($"/api/customer/portal/requests/{item.Id}", ToResponse(await RequestQuery(dbContext).SingleAsync(value => value.Id == item.Id, cancellationToken)));
    }

    private static async Task<int> NextSequenceAsync(PesneerDbContext dbContext, string prefix, CancellationToken cancellationToken)
    {
        var existing = await dbContext.EmergencyRequests.AsNoTracking().Where(item => item.Number.StartsWith(prefix)).Select(item => item.Number).ToListAsync(cancellationToken);
        return existing.Select(item => int.TryParse(item[prefix.Length..], out var value) ? value : 0).DefaultIfEmpty().Max() + 1;
    }

    private static async Task<IResult> GetCompanyRequestsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken) =>
        Results.Ok((await RequestQuery(dbContext).ToListAsync(cancellationToken)).OrderByDescending(item => item.RequestedAt).Select(ToResponse));

    private static async Task<IResult> GetEmployeeRequestsAsync(PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var items = await RequestQuery(dbContext).Where(item => item.AssignedEmployeeAccountId == context.AccountId.Value).ToListAsync(cancellationToken);
        return Results.Ok(items.OrderByDescending(item => item.RequestedAt).Select(ToResponse));
    }

    private static Task<IResult> UpdateRequestAsync(Guid requestId, UpdateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        UpdateCoreAsync(requestId, request, dbContext, context, false, cancellationToken);

    private static Task<IResult> UpdateEmployeeRequestAsync(Guid requestId, UpdateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        UpdateCoreAsync(requestId, request with { EmployeeAccountId = context.AccountId }, dbContext, context, true, cancellationToken);

    private static async Task<IResult> UpdateCoreAsync(Guid requestId, UpdateEmergencyRequestRequest request, PesneerDbContext dbContext, ICompanyContext context, bool employeeOnly, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !Statuses.Contains(request.Status)) return Results.Forbid();
        if (employeeOnly && request.Status is not ("Acknowledged" or "InProgress" or "AwaitingCustomerApproval")) return Validation("status", "Personel talebi kabul edebilir, işleme alabilir veya müşteri onayına gönderebilir.");
        var item = await dbContext.EmergencyRequests.SingleOrDefaultAsync(value => value.Id == requestId, cancellationToken);
        if (item is null || employeeOnly && item.AssignedEmployeeAccountId != context.AccountId) return Results.NotFound(new { message = "Talep bulunamadı." });
        if (request.EmployeeAccountId.HasValue)
        {
            var employeeExists = await dbContext.CompanyMemberships.AsNoTracking().AnyAsync(value => value.AccountId == request.EmployeeAccountId && value.IsActive && value.Account.IsActive && value.Account.Portal == PortalType.Employee, cancellationToken);
            if (!employeeExists) return Validation("employeeAccountId", "Aktif bir personel seçin.");
            item.AssignedEmployeeAccountId = request.EmployeeAccountId;
        }
        item.Status = request.Status;
        item.DueAt = request.DueAt ?? item.DueAt;
        if (request.Status == "Acknowledged") item.AcknowledgedAt ??= DateTimeOffset.UtcNow;
        if (request.Status == "AwaitingCustomerApproval") item.ClosureApprovalStatus = "Pending";
        if (request.Status == "Completed") { item.CompletedAt = DateTimeOffset.UtcNow; item.ClosureApprovalStatus = "Approved"; }
        dbContext.EmergencyRequestHistories.Add(NewHistory(item, context.AccountId.Value, request.Status, NullIfEmpty(request.Note)));
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Ok(ToResponse(await RequestQuery(dbContext).SingleAsync(value => value.Id == requestId, cancellationToken)));
    }

    private static Task<IResult> AddCustomerMessageAsync(Guid requestId, RequestMessageRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        AddMessageAsync(requestId, request, dbContext, context, "customer", cancellationToken);
    private static Task<IResult> AddCompanyMessageAsync(Guid requestId, RequestMessageRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        AddMessageAsync(requestId, request, dbContext, context, "company", cancellationToken);
    private static Task<IResult> AddEmployeeMessageAsync(Guid requestId, RequestMessageRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken) =>
        AddMessageAsync(requestId, request, dbContext, context, "employee", cancellationToken);

    private static async Task<IResult> AddMessageAsync(Guid requestId, RequestMessageRequest request, PesneerDbContext dbContext, ICompanyContext context, string actor, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || string.IsNullOrWhiteSpace(request.Message)) return Validation("message", "Mesaj boş olamaz.");
        var item = await dbContext.EmergencyRequests.SingleOrDefaultAsync(value => value.Id == requestId, cancellationToken);
        if (item is null || actor == "customer" && item.CustomerId != context.CustomerId || actor == "employee" && item.AssignedEmployeeAccountId != context.AccountId) return Results.NotFound();
        dbContext.EmergencyRequestHistories.Add(NewHistory(item, context.AccountId.Value, item.Status, request.Message.Trim()));
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Ok(ToResponse(await RequestQuery(dbContext).SingleAsync(value => value.Id == requestId, cancellationToken)));
    }

    private static async Task<IResult> ApproveClosureAsync(Guid requestId, ClosureApprovalRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue || !context.CustomerId.HasValue) return Results.Forbid();
        var item = await dbContext.EmergencyRequests.SingleOrDefaultAsync(value => value.Id == requestId && value.CustomerId == context.CustomerId, cancellationToken);
        if (item is null) return Results.NotFound();
        item.ClosureApprovalStatus = request.Approved ? "Approved" : "Rejected";
        item.ClosureApprovedAt = request.Approved ? DateTimeOffset.UtcNow : null;
        item.ClosureApprovalNote = NullIfEmpty(request.Note);
        item.Status = request.Approved ? "Completed" : "InProgress";
        item.CompletedAt = request.Approved ? DateTimeOffset.UtcNow : null;
        dbContext.EmergencyRequestHistories.Add(NewHistory(item, context.AccountId.Value, item.Status, request.Approved ? "Müşteri kapanışı onayladı." : $"Müşteri kapanışı reddetti. {request.Note}"));
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Ok(ToResponse(await RequestQuery(dbContext).SingleAsync(value => value.Id == requestId, cancellationToken)));
    }

    private static IQueryable<WorkOrder> WorkOrderQuery(PesneerDbContext dbContext, ICompanyContext context) => dbContext.WorkOrders.AsNoTracking()
        .Include(item => item.CustomerBranch).Include(item => item.AssignedEmployeeAccount)
        .Where(item => item.CustomerId == context.CustomerId!.Value)
        .Where(item => !context.CustomerBranchId.HasValue || item.CustomerBranchId == context.CustomerBranchId.Value);

    private static IQueryable<EmergencyRequest> RequestQuery(PesneerDbContext dbContext) => dbContext.EmergencyRequests.AsNoTracking()
        .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.AssignedEmployeeAccount)
        .Include(item => item.History).ThenInclude(item => item.ChangedByAccount).AsSplitQuery();

    private static CustomerPortalWorkOrderResponse ToWorkOrderResponse(WorkOrder item) => new(item.Id, item.Number, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez", item.ServiceType, item.VisitType, item.ScheduledAt, item.DurationMinutes, item.Status, item.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", item.CompletionNote, item.Recommendation);
    private static EmergencyRequestResponse ToResponse(EmergencyRequest item) => new(item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez", item.RequestType, item.Subject, item.ServiceType, item.Priority, item.Status, item.Description, item.ContactPhone, item.AssignedEmployeeAccountId, item.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", item.RequestedAt, item.DueAt, item.RequestedAppointmentAt, item.ClosureApprovalStatus, item.ClosureApprovedAt, item.ClosureApprovalNote, item.AcknowledgedAt, item.CompletedAt, item.History.OrderBy(history => history.OccurredAt).Select(history => new EmergencyHistoryResponse(history.Status, history.Note, history.OccurredAt, history.ChangedByAccount.DisplayName)).ToArray());
    private static EmergencyRequestHistory NewHistory(EmergencyRequest item, Guid accountId, string status, string? note) => new() { Id = Guid.NewGuid(), CompanyId = item.CompanyId, EmergencyRequestId = item.Id, ChangedByAccountId = accountId, Status = status, Note = note };
    private static string TypeLabel(string type) => type switch { "Complaint" => "Şikâyet", "NewBranch" => "Yeni şube talebi", "AppointmentChange" => "Randevu değişikliği", "DocumentRequest" => "Belge talebi", "StructuralCompletion" => "Yapısal faaliyet tamamlandı", _ => "Acil çağrı" };
    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
