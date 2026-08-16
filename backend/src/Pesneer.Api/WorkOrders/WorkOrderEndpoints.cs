using System.Globalization;
using System.Net.Mail;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;
using Pesneer.Api.FieldOperations;
using Pesneer.Api.WeatherRisk;

namespace Pesneer.Api.WorkOrders;

public static class WorkOrderEndpoints
{
    private static readonly HashSet<string> VisitTypes = ["Routine", "Extra", "EmergencyPaid", "EmergencyFree"];
    private static readonly HashSet<string> RecurrenceTypes = ["Once", "Weekly", "Monthly", "Manual"];
    private static readonly HashSet<string> EditableStatuses = ["Planned", "Cancelled"];
    private static readonly HashSet<string> AllowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    private static readonly CultureInfo TurkishCulture = new("tr-TR");

    public static IEndpointRouteBuilder MapWorkOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var customers = app.MapGroup("/api/company/customers").RequireAuthorization("OwnerPortal");
        customers.MapGet("/", GetCustomersAsync);
        customers.MapPost("/", CreateCustomerAsync);
        customers.MapPost("/{customerId:guid}/branches/bulk", CreateBranchesAsync);

        var companyWorkOrders = app.MapGroup("/api/company/work-orders").RequireAuthorization("OwnerPortal");
        companyWorkOrders.MapGet("/", GetCompanyWorkOrdersAsync);
        companyWorkOrders.MapPost("/batch", CreateCompanyWorkOrdersAsync);
        companyWorkOrders.MapPut("/{workOrderId:guid}", UpdateWorkOrderAsync);

        var employeeWorkOrders = app.MapGroup("/api/employee/work-orders").RequireAuthorization("EmployeePortal");
        employeeWorkOrders.MapGet("/", GetEmployeeWorkOrdersAsync);
        employeeWorkOrders.MapGet("/planning-options", GetEmployeePlanningOptionsAsync);
        employeeWorkOrders.MapPost("/self-schedule", CreateEmployeeWorkOrdersAsync);
        employeeWorkOrders.MapPost("/{workOrderId:guid}/start", StartWorkOrderAsync);
        employeeWorkOrders.MapPost("/{workOrderId:guid}/visit-state", ChangeVisitStateAsync);
        employeeWorkOrders.MapPost("/{workOrderId:guid}/complete", CompleteWorkOrderAsync).DisableAntiforgery();

        app.MapGet("/api/work-orders/photos/{photoId:guid}", GetWorkOrderPhotoAsync)
            .RequireAuthorization();

        return app;
    }

    private static async Task<IResult> GetCustomersAsync(PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var customers = await dbContext.Customers.AsNoTracking()
            .Include(customer => customer.Branches)
            .Where(customer => customer.IsActive)
            .ToListAsync(cancellationToken);

        return Results.Ok(customers.OrderBy(customer => customer.LegalName, StringComparer.Create(TurkishCulture, true)).Select(ToResponse));
    }

    private static async Task<IResult> CreateCustomerAsync(
        CreateCustomerRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IPasswordHasher<Account> passwordHasher,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        var name = request.LegalName.Trim();
        if (name.Length is < 2 or > 240)
        {
            return Validation("legalName", "Müşteri adı 2-240 karakter arasında olmalıdır.");
        }

        if (!string.IsNullOrWhiteSpace(request.Email) && !MailAddress.TryCreate(request.Email.Trim(), out _))
        {
            return Validation("email", "Geçerli bir e-posta adresi girin.");
        }

        if (!CoordinatesAreValid(request.Latitude, request.Longitude))
        {
            return Validation("location", "Enlem ve boylam birlikte ve geçerli aralıkta girilmelidir.");
        }

        if (!UrlIsValid(request.MapUrl))
        {
            return Validation("mapUrl", "Geçerli bir Google Haritalar bağlantısı girin.");
        }

        var portalError = ValidatePortalAccount(request.PortalEmail, request.PortalPassword, "portal");
        if (portalError is not null) return portalError;
        var normalizedPortalEmail = NormalizeEmail(request.PortalEmail);
        if (normalizedPortalEmail is not null && await dbContext.Accounts.AnyAsync(item => item.Portal == PortalType.Customer && item.NormalizedEmail == normalizedPortalEmail, cancellationToken))
        {
            return Results.Conflict(new { message = "Bu e-posta adresiyle daha önce müşteri hesabı oluşturulmuş." });
        }

        var requestedCode = string.IsNullOrWhiteSpace(request.Code) ? ToCode(name) : ToCode(request.Code);
        MapLocationResolver.TryParse(request.MapUrl, out var resolvedLocation);
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            LegalName = name,
            Code = await FindAvailableCustomerCodeAsync(requestedCode, dbContext, cancellationToken),
            ContactName = NullIfEmpty(request.ContactName),
            PhoneNumber = NullIfEmpty(request.PhoneNumber),
            Email = NullIfEmpty(request.Email),
            Address = NullIfEmpty(request.Address),
            City = NullIfEmpty(request.City),
            District = NullIfEmpty(request.District),
            Latitude = request.Latitude ?? resolvedLocation?.Latitude,
            Longitude = request.Longitude ?? resolvedLocation?.Longitude,
            MapUrl = NullIfEmpty(request.MapUrl)
        };

        dbContext.Customers.Add(customer);
        if (normalizedPortalEmail is not null)
        {
            var account = NewCustomerAccount(request.PortalEmail!, request.PortalContactName ?? request.ContactName ?? name, request.PhoneNumber, request.PortalPassword!, passwordHasher);
            dbContext.Accounts.Add(account);
            dbContext.CustomerMemberships.Add(new CustomerMembership
            {
                Id = Guid.NewGuid(), AccountId = account.Id, CompanyId = companyContext.CompanyId.Value,
                CustomerId = customer.Id, Role = CompanyRole.CustomerAdministrator
            });
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/customers/{customer.Id}", ToResponse(customer));
    }

    private static async Task<IResult> CreateBranchesAsync(
        Guid customerId,
        BulkCreateCustomerBranchesRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IPasswordHasher<Account> passwordHasher,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        if (request.Branches.Count is < 1 or > 250)
        {
            return Validation("branches", "Tek işlemde 1 ile 250 arasında şube ekleyebilirsiniz.");
        }

        var customer = await dbContext.Customers.Include(item => item.Branches)
            .SingleOrDefaultAsync(item => item.Id == customerId && item.IsActive, cancellationToken);
        if (customer is null) return Results.NotFound(new { message = "Müşteri bulunamadı." });

        var errors = ValidateBranches(request.Branches);
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        var portalEmails = request.Branches.Select(item => NormalizeEmail(item.PortalEmail)).Where(item => item is not null).Cast<string>().ToArray();
        if (portalEmails.Length != portalEmails.Distinct(StringComparer.Ordinal).Count())
        {
            return Validation("branches", "Aynı portal e-posta adresi birden fazla şubede kullanılamaz.");
        }
        if (portalEmails.Length > 0 && await dbContext.Accounts.AnyAsync(item => item.Portal == PortalType.Customer && portalEmails.Contains(item.NormalizedEmail), cancellationToken))
        {
            return Results.Conflict(new { message = "Şube listesindeki portal e-postalarından biri daha önce kullanılmış." });
        }

        var usedCodes = customer.Branches.Select(item => item.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var branches = request.Branches.Select(input =>
        {
            var baseCode = ToCode(string.IsNullOrWhiteSpace(input.Code) ? input.Name : input.Code);
            var code = FindAvailableCode(baseCode, usedCodes);
            usedCodes.Add(code);
            MapLocationResolver.TryParse(input.MapUrl, out var resolvedLocation);
            return new CustomerBranch
            {
                Id = Guid.NewGuid(),
                CustomerId = customer.Id,
                Name = input.Name.Trim(),
                Code = code,
                Address = input.Address.Trim(),
                City = NullIfEmpty(input.City),
                District = NullIfEmpty(input.District),
                ContactName = NullIfEmpty(input.ContactName),
                PhoneNumber = NullIfEmpty(input.PhoneNumber),
                Email = NullIfEmpty(input.Email),
                Latitude = input.Latitude ?? resolvedLocation?.Latitude,
                Longitude = input.Longitude ?? resolvedLocation?.Longitude,
                MapUrl = NullIfEmpty(input.MapUrl)
            };
        }).ToList();

        dbContext.CustomerBranches.AddRange(branches);
        for (var index = 0; index < branches.Count; index++)
        {
            var input = request.Branches[index];
            if (NormalizeEmail(input.PortalEmail) is null) continue;
            var branch = branches[index];
            var account = NewCustomerAccount(input.PortalEmail!, input.PortalContactName ?? input.ContactName ?? branch.Name, input.PhoneNumber, input.PortalPassword!, passwordHasher);
            dbContext.Accounts.Add(account);
            dbContext.CustomerMemberships.Add(new CustomerMembership
            {
                Id = Guid.NewGuid(), AccountId = account.Id, CompanyId = companyContext.CompanyId.Value,
                CustomerId = customer.Id, CustomerBranchId = branch.Id, Role = CompanyRole.CustomerViewer
            });
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(branches.Select(ToResponse));
    }

    private static async Task<IResult> GetCompanyWorkOrdersAsync(PesneerDbContext dbContext, CancellationToken cancellationToken) =>
        Results.Ok((await WorkOrderQuery(dbContext).ToListAsync(cancellationToken))
            .OrderByDescending(item => item.ScheduledAt)
            .Select(ToResponse));

    private static async Task<IResult> GetEmployeeWorkOrdersAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue) return Results.Forbid();
        var workOrders = await WorkOrderQuery(dbContext)
            .Where(item => item.AssignedEmployeeAccountId == companyContext.AccountId.Value || item.Assignments.Any(assignment => assignment.EmployeeAccountId == companyContext.AccountId.Value))
            .ToListAsync(cancellationToken);
        return Results.Ok(workOrders.OrderBy(item => item.ScheduledAt).Select(ToResponse));
    }

    private static async Task<IResult> GetEmployeePlanningOptionsAsync(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var canSelfSchedule = await dbContext.CompanyMemberships.AsNoTracking()
            .AnyAsync(item => item.CompanyId == companyContext.CompanyId.Value &&
                              item.AccountId == companyContext.AccountId.Value &&
                              item.IsActive && item.CanSelfSchedule, cancellationToken);
        if (!canSelfSchedule) return Results.Ok(new EmployeePlanningOptionsResponse(false, []));

        var customers = await dbContext.Customers.AsNoTracking()
            .Include(item => item.Branches)
            .Where(item => item.IsActive)
            .ToListAsync(cancellationToken);
        return Results.Ok(new EmployeePlanningOptionsResponse(true, customers.OrderBy(item => item.LegalName).Select(ToResponse).ToArray()));
    }

    private static Task<IResult> CreateCompanyWorkOrdersAsync(
        CreateWorkOrdersRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken) =>
        CreateWorkOrdersCoreAsync(request, dbContext, companyContext, null, cancellationToken);

    private static async Task<IResult> CreateEmployeeWorkOrdersAsync(
        CreateWorkOrdersRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var canSelfSchedule = await dbContext.CompanyMemberships.AsNoTracking()
            .AnyAsync(item => item.CompanyId == companyContext.CompanyId.Value &&
                              item.AccountId == companyContext.AccountId.Value &&
                              item.IsActive && item.CanSelfSchedule, cancellationToken);
        if (!canSelfSchedule) return Results.Forbid();
        return await CreateWorkOrdersCoreAsync(request, dbContext, companyContext, companyContext.AccountId.Value, cancellationToken);
    }

    private static async Task<IResult> CreateWorkOrdersCoreAsync(
        CreateWorkOrdersRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        Guid? forcedEmployeeAccountId,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue || !companyContext.AccountId.HasValue) return Results.Forbid();
        var serviceType = request.ServiceType.Trim();
        if (serviceType.Length is < 2 or > 120 || request.DurationMinutes is < 15 or > 720 ||
            !TimeOnly.TryParseExact(request.Time, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var scheduledTime))
        {
            return Validation("serviceType", "Hizmet türünü, saati ve 15-720 dakika arasındaki tahmini süreyi kontrol edin.");
        }
        if (!VisitTypes.Contains(request.VisitType)) return Validation("visitType", "Geçerli bir iş türü seçin.");
        if (!RecurrenceTypes.Contains(request.RecurrenceType)) return Validation("recurrenceType", "Geçerli bir tekrar düzeni seçin.");

        var assignments = BuildAssignments(request, forcedEmployeeAccountId);
        var branchIds = assignments.Select(item => item.BranchId).Distinct().ToArray();
        if (branchIds.Length is < 1 or > 250) return Validation("branchIds", "Bir işlemde 1 ile 250 arasında şube seçebilirsiniz.");
        var dates = BuildScheduleDates(request);
        if (dates is null) return Validation("recurrence", "Tekrar sayısını veya manuel tarihleri kontrol edin.");
        if ((long)dates.Count * branchIds.Length > 500) return Validation("recurrence", "Tek işlemde en fazla 500 iş emri oluşturabilirsiniz.");

        var customer = await dbContext.Customers.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == request.CustomerId && item.IsActive, cancellationToken);
        if (customer is null) return Results.NotFound(new { message = "Müşteri bulunamadı." });
        var branches = await dbContext.CustomerBranches.AsNoTracking()
            .Where(item => item.CustomerId == request.CustomerId && item.IsActive && branchIds.Contains(item.Id))
            .ToListAsync(cancellationToken);
        if (branches.Count != branchIds.Length) return Validation("branchIds", "Seçilen şubelerden biri müşteriye ait değil veya aktif değil.");

        var requestedTeamIds = forcedEmployeeAccountId.HasValue
            ? new[] { forcedEmployeeAccountId.Value }
            : (request.EmployeeAccountIds ?? []).Distinct().ToArray();
        var employeeIds = assignments.Where(item => item.EmployeeAccountId.HasValue).Select(item => item.EmployeeAccountId!.Value)
            .Concat(requestedTeamIds).Distinct().ToArray();
        var employees = employeeIds.Length == 0
            ? []
            : await dbContext.CompanyMemberships.AsNoTracking()
                .Where(item => item.CompanyId == companyContext.CompanyId.Value && employeeIds.Contains(item.AccountId) && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
                .Select(item => item.Account)
                .ToListAsync(cancellationToken);
        if (employees.Count != employeeIds.Length) return Validation("employeeAccountId", "Atanacak personellerden biri aktif değil veya bulunamadı.");

        var branchLookup = branches.ToDictionary(item => item.Id);
        var recurrenceGroupId = dates.Count > 1 ? Guid.NewGuid() : (Guid?)null;
        var workOrders = new List<WorkOrder>();
        foreach (var date in dates.Order())
        {
            var prefix = $"IE-{date:yyMMdd}-";
            var existingNumbers = await dbContext.WorkOrders.AsNoTracking().Where(item => item.Number.StartsWith(prefix)).Select(item => item.Number).ToListAsync(cancellationToken);
            var nextNumber = existingNumbers.Select(item => int.TryParse(item[prefix.Length..], out var value) ? value : 0).DefaultIfEmpty(0).Max() + 1;
            foreach (var assignment in assignments.OrderBy(item => branchLookup[item.BranchId].Name, StringComparer.Create(TurkishCulture, true)))
            {
                var workOrder = new WorkOrder
                {
                    Id = Guid.NewGuid(),
                    CompanyId = companyContext.CompanyId.Value,
                    CustomerId = customer.Id,
                    CustomerBranchId = assignment.BranchId,
                    AssignedEmployeeAccountId = assignment.EmployeeAccountId,
                    Number = $"{prefix}{nextNumber++:000}",
                    ServiceType = serviceType,
                    VisitType = request.VisitType,
                    RecurrenceType = request.RecurrenceType,
                    RecurrenceGroupId = recurrenceGroupId,
                    ScheduledAt = ToIstanbulDateTime(date, scheduledTime),
                    DurationMinutes = request.DurationMinutes,
                    Notes = NullIfEmpty(request.Notes),
                    Status = "Planned",
                    ContractCoverage = "OutOfContract"
                };
                workOrder.History.Add(NewHistory(companyContext.CompanyId.Value, workOrder.Id, companyContext.AccountId.Value, null, "Planned", "İş emri oluşturuldu."));
                var teamIds = requestedTeamIds.Concat(assignment.EmployeeAccountId.HasValue ? [assignment.EmployeeAccountId.Value] : []).Distinct();
                foreach (var employeeId in teamIds)
                {
                    workOrder.Assignments.Add(new WorkOrderAssignment
                    {
                        Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, WorkOrderId = workOrder.Id,
                        EmployeeAccountId = employeeId, IsLead = employeeId == assignment.EmployeeAccountId, AssignedAt = DateTimeOffset.UtcNow
                    });
                }
                workOrders.Add(workOrder);
            }
        }

        dbContext.WorkOrders.AddRange(workOrders);
        await dbContext.SaveChangesAsync(cancellationToken);
        var createdIds = workOrders.Select(item => item.Id).ToArray();
        dbContext.ChangeTracker.Clear();
        var createdOrders = await WorkOrderQuery(dbContext).Where(item => createdIds.Contains(item.Id)).ToListAsync(cancellationToken);
        return Results.Created("/api/company/work-orders", createdOrders.OrderBy(item => item.ScheduledAt).Select(ToResponse));
    }

    private static async Task<IResult> UpdateWorkOrderAsync(
        Guid workOrderId,
        UpdateWorkOrderRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var workOrder = await dbContext.WorkOrders.Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.Assignments)
            .SingleOrDefaultAsync(item => item.Id == workOrderId, cancellationToken);
        if (workOrder is null) return Results.NotFound(new { message = "İş emri bulunamadı." });
        if (workOrder.Status is "InProgress" or "Completed") return Results.Conflict(new { message = "Başlamış veya tamamlanmış iş emri yeniden planlanamaz." });
        if (!EditableStatuses.Contains(request.Status)) return Validation("status", "Geçerli bir iş emri durumu seçin.");
        if (!VisitTypes.Contains(request.VisitType)) return Validation("visitType", "Geçerli bir iş türü seçin.");
        if (request.ServiceType.Trim().Length is < 2 or > 120 || request.DurationMinutes is < 15 or > 720 ||
            !TimeOnly.TryParseExact(request.Time, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
        {
            return Validation("serviceType", "Hizmet türünü, saati ve süreyi kontrol edin.");
        }

        var requestedEmployeeIds = (request.EmployeeAccountIds ?? [])
            .Concat(request.EmployeeAccountId.HasValue ? [request.EmployeeAccountId.Value] : []).Distinct().ToArray();
        Account? employee = null;
        if (requestedEmployeeIds.Length > 0)
        {
            var activeEmployees = await dbContext.CompanyMemberships.AsNoTracking()
                .Where(item => item.CompanyId == companyContext.CompanyId.Value && requestedEmployeeIds.Contains(item.AccountId) && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
                .Select(item => item.Account).ToListAsync(cancellationToken);
            if (activeEmployees.Count != requestedEmployeeIds.Length) return Results.NotFound(new { message = "Atanacak aktif personellerden biri bulunamadı." });
            employee = activeEmployees.FirstOrDefault(item => item.Id == request.EmployeeAccountId) ?? activeEmployees[0];
        }

        var previousStatus = workOrder.Status;
        workOrder.AssignedEmployeeAccountId = request.EmployeeAccountId;
        dbContext.WorkOrderAssignments.RemoveRange(workOrder.Assignments);
        foreach (var employeeId in requestedEmployeeIds)
        {
            workOrder.Assignments.Add(new WorkOrderAssignment
            {
                Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, WorkOrderId = workOrder.Id,
                EmployeeAccountId = employeeId, IsLead = employeeId == request.EmployeeAccountId, AssignedAt = DateTimeOffset.UtcNow
            });
        }
        workOrder.ServiceType = request.ServiceType.Trim();
        workOrder.VisitType = request.VisitType;
        workOrder.ScheduledAt = ToIstanbulDateTime(request.Date, time);
        workOrder.DurationMinutes = request.DurationMinutes;
        workOrder.Notes = NullIfEmpty(request.Notes);
        workOrder.Status = request.Status;
        AddHistory(dbContext, workOrder, NewHistory(companyContext.CompanyId.Value, workOrder.Id, companyContext.AccountId.Value, previousStatus, request.Status, "Planlama ve atama bilgileri güncellendi."));
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        var updated = await WorkOrderQuery(dbContext).SingleAsync(item => item.Id == workOrderId, cancellationToken);
        return Results.Ok(ToResponse(updated));
    }

    private static async Task<IResult> StartWorkOrderAsync(
        Guid workOrderId,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();

        var now = DateTimeOffset.UtcNow;
        var today = WorkforceCalculations.Today(now);
        var shift = await dbContext.WorkShifts.AsNoTracking()
            .SingleOrDefaultAsync(item => item.EmployeeAccountId == companyContext.AccountId.Value && item.WorkDate == today, cancellationToken);
        if (shift is null || shift.Status != WorkShiftStatus.Working)
        {
            return Results.Conflict(new { message = "İşlemlere başlamak için önce mesainizi başlatmanız (İşe Başladım) gerekir." });
        }

        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId &&
            (item.AssignedEmployeeAccountId == companyContext.AccountId.Value || item.Assignments.Any(assignment => assignment.EmployeeAccountId == companyContext.AccountId.Value)), cancellationToken);
        if (workOrder is null) return Results.NotFound(new { message = "Atanmış iş emri bulunamadı." });
        if (workOrder.Status is "Completed" or "Cancelled" or "Skipped") return Results.Conflict(new { message = "Kapanmış ziyaret tekrar başlatılamaz." });

        if (!workOrder.VisitSessions.Any(item => item.EmployeeAccountId == companyContext.AccountId.Value && item.Status == "Active"))
        {
            var visitSession = new WorkOrderVisitSession
            {
                Id = Guid.NewGuid(), CompanyId = companyContext.CompanyId.Value, WorkOrderId = workOrder.Id,
                EmployeeAccountId = companyContext.AccountId.Value, Status = "Active", StartedAt = now
            };
            dbContext.WorkOrderVisitSessions.Add(visitSession);
        }
        var previousStatus = workOrder.Status;
        workOrder.Status = "InProgress";
        workOrder.StartedAt ??= now;
        AddHistory(dbContext, workOrder, NewHistory(companyContext.CompanyId.Value, workOrder.Id, companyContext.AccountId.Value, previousStatus, "InProgress", "Personel ziyaret oturumunu başlattı."));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(workOrder));
    }

    private static async Task<IResult> ChangeVisitStateAsync(
        Guid workOrderId,
        ChangeVisitStateRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.CompanyId.HasValue) return Results.Forbid();
        var action = request.Action.Trim();
        if (action is not ("Stop" or "Pause" or "FinishPart" or "Skip" or "Cancel")) return Validation("action", "Geçerli bir ziyaret işlemi seçin.");
        var reason = NullIfEmpty(request.Reason);
        if (action is "Skip" or "Cancel" && (reason is null || reason.Length < 3)) return Validation("reason", "Ziyaretin yoksayılma veya iptal nedenini yazın.");
        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId &&
            (item.AssignedEmployeeAccountId == companyContext.AccountId.Value || item.Assignments.Any(assignment => assignment.EmployeeAccountId == companyContext.AccountId.Value)), cancellationToken);
        if (workOrder is null) return Results.NotFound(new { message = "Atanmış iş emri bulunamadı." });
        if (workOrder.Status is "Completed" or "Cancelled" or "Skipped") return Results.Conflict(new { message = "Kapanmış ziyaret güncellenemez." });

        var now = DateTimeOffset.UtcNow;
        var sessionsToClose = action is "Stop" or "Pause" or "FinishPart"
            ? workOrder.VisitSessions.Where(item => item.EmployeeAccountId == companyContext.AccountId.Value && item.Status == "Active").ToArray()
            : workOrder.VisitSessions.Where(item => item.Status == "Active").ToArray();
        foreach (var session in sessionsToClose)
        {
            session.EndedAt = now;
            session.DurationMinutes = Math.Max(1, (int)Math.Round((now - session.StartedAt).TotalMinutes));
            session.Status = action switch
            {
                "Pause" => "Paused",
                "FinishPart" => "Completed",
                "Skip" => "Skipped",
                "Cancel" => "Cancelled",
                _ => "Stopped"
            };
            session.Reason = reason;
        }
        var previousStatus = workOrder.Status;
        var hasActiveTeamMember = workOrder.VisitSessions.Any(item => item.Status == "Active");
        workOrder.Status = action switch
        {
            "Pause" => "Paused",
            "FinishPart" => "InProgress",
            "Skip" => "Skipped",
            "Cancel" => "Cancelled",
            _ => hasActiveTeamMember ? "InProgress" : "Paused"
        };
        workOrder.TotalLaborMinutes = workOrder.VisitSessions.Where(item => item.EndedAt.HasValue).Sum(item => item.DurationMinutes);
        var historyNote = action == "FinishPart" ? "Personel kendi saha payını tamamladı; ekip raporu diğer katılımcıları bekliyor." : reason ?? action;
        AddHistory(dbContext, workOrder, NewHistory(companyContext.CompanyId.Value, workOrder.Id, companyContext.AccountId.Value, previousStatus, workOrder.Status, historyNote));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(workOrder));
    }

    private static async Task<IResult> CompleteWorkOrderAsync(
        Guid workOrderId,
        HttpRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue) return Results.Forbid();
        var workOrder = await WorkOrderQuery(dbContext).SingleOrDefaultAsync(item => item.Id == workOrderId &&
            (item.AssignedEmployeeAccountId == companyContext.AccountId.Value || item.Assignments.Any(assignment => assignment.EmployeeAccountId == companyContext.AccountId.Value)), cancellationToken);
        if (workOrder is null) return Results.NotFound(new { message = "Atanmış iş emri bulunamadı." });
        if (workOrder.Status != "InProgress") return Results.Conflict(new { message = "İş tamamlanmadan önce saha uygulamasını başlatın." });
        if (!request.HasFormContentType) return Validation("form", "Tamamlama bilgilerini form olarak gönderin.");

        var form = await request.ReadFormAsync(cancellationToken);
        var completionNote = form["completionNote"].ToString().Trim();
        var recommendation = NullIfEmpty(form["recommendation"].ToString());
        if (completionNote.Length is < 3 or > 2000) return Validation("completionNote", "İşlem açıklaması 3-2000 karakter arasında olmalıdır.");
        if (recommendation?.Length > 2000) return Validation("recommendation", "Öneri en fazla 2000 karakter olabilir.");
        if (form.Files.Count > 5) return Validation("photos", "En fazla 5 fotoğraf yükleyebilirsiniz.");
        foreach (var file in form.Files)
        {
            if (file.Length is <= 0 or > 5_242_880 || !AllowedImageTypes.Contains(file.ContentType))
            {
                return Validation("photos", "Fotoğraflar JPG, PNG veya WEBP biçiminde ve en fazla 5 MB olmalıdır.");
            }
        }

        foreach (var file in form.Files)
        {
            await using var stream = file.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);
            var photo = new WorkOrderPhoto
            {
                Id = Guid.NewGuid(),
                CompanyId = companyContext.CompanyId!.Value,
                WorkOrderId = workOrder.Id,
                FileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType,
                Data = memory.ToArray()
            };
            dbContext.WorkOrderPhotos.Add(photo);
        }

        workOrder.Status = "Completed";
        workOrder.CompletedAt = DateTimeOffset.UtcNow;
        CloseVisitSessions(workOrder, workOrder.CompletedAt.Value);
        workOrder.CompletionNote = completionNote;
        workOrder.Recommendation = recommendation;
        AddHistory(dbContext, workOrder, NewHistory(companyContext.CompanyId!.Value, workOrder.Id, companyContext.AccountId.Value, "InProgress", "Completed", "Saha uygulaması tamamlandı."));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(workOrder));
    }

    private static async Task<IResult> GetWorkOrderPhotoAsync(
        Guid photoId,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.AccountId.HasValue || !companyContext.Portal.HasValue) return Results.Forbid();
        var photo = await dbContext.WorkOrderPhotos.AsNoTracking().Include(item => item.WorkOrder)
            .SingleOrDefaultAsync(item => item.Id == photoId, cancellationToken);
        if (photo is null) return Results.NotFound();
        if (companyContext.Portal == PortalType.Employee && photo.WorkOrder.AssignedEmployeeAccountId != companyContext.AccountId.Value &&
            !await dbContext.WorkOrderAssignments.AnyAsync(item => item.WorkOrderId == photo.WorkOrderId && item.EmployeeAccountId == companyContext.AccountId.Value, cancellationToken)) return Results.Forbid();
        if (companyContext.Portal == PortalType.Customer &&
            (photo.WorkOrder.CustomerId != companyContext.CustomerId || companyContext.CustomerBranchId.HasValue && photo.WorkOrder.CustomerBranchId != companyContext.CustomerBranchId)) return Results.Forbid();
        return Results.File(photo.Data, photo.ContentType, photo.FileName);
    }

    private static IQueryable<WorkOrder> WorkOrderQuery(PesneerDbContext dbContext) => dbContext.WorkOrders
        .Include(item => item.Customer)
        .Include(item => item.CustomerBranch)
        .Include(item => item.AssignedEmployeeAccount)
        .Include(item => item.Assignments).ThenInclude(item => item.EmployeeAccount)
        .Include(item => item.VisitSessions).ThenInclude(item => item.EmployeeAccount)
        .Include(item => item.History).ThenInclude(item => item.ChangedByAccount)
        .Include(item => item.Photos)
        .AsSplitQuery();

    private static IReadOnlyList<BranchEmployeeAssignmentRequest> BuildAssignments(CreateWorkOrdersRequest request, Guid? forcedEmployeeAccountId)
    {
        var source = request.BranchAssignments is { Count: > 0 }
            ? request.BranchAssignments
            : request.BranchIds.Select(id => new BranchEmployeeAssignmentRequest(id, request.EmployeeAccountId)).ToArray();
        return source.GroupBy(item => item.BranchId).Select(group =>
        {
            var item = group.Last();
            return item with { EmployeeAccountId = forcedEmployeeAccountId ?? item.EmployeeAccountId };
        }).ToArray();
    }

    private static IReadOnlyList<DateOnly>? BuildScheduleDates(CreateWorkOrdersRequest request) => request.RecurrenceType switch
    {
        "Once" => [request.Date],
        "Weekly" when request.OccurrenceCount is >= 2 and <= 52 => Enumerable.Range(0, request.OccurrenceCount.Value).Select(index => request.Date.AddDays(index * 7)).ToArray(),
        "Monthly" when request.OccurrenceCount is >= 2 and <= 24 => Enumerable.Range(0, request.OccurrenceCount.Value).Select(index => request.Date.AddMonths(index)).ToArray(),
        "Manual" when request.ManualDates is { Count: >= 1 and <= 60 } => request.ManualDates.Append(request.Date).Distinct().ToArray(),
        _ => null
    };

    private static WorkOrderStatusHistory NewHistory(Guid companyId, Guid workOrderId, Guid accountId, string? fromStatus, string toStatus, string note) => new()
    {
        Id = Guid.NewGuid(),
        CompanyId = companyId,
        WorkOrderId = workOrderId,
        ChangedByAccountId = accountId,
        FromStatus = fromStatus,
        ToStatus = toStatus,
        Note = note
    };

    private static void AddHistory(PesneerDbContext dbContext, WorkOrder _, WorkOrderStatusHistory history)
    {
        dbContext.WorkOrderStatusHistories.Add(history);
    }

    private static Dictionary<string, string[]> ValidateBranches(IReadOnlyList<CreateCustomerBranchRequest> branches)
    {
        var errors = new Dictionary<string, string[]>();
        for (var index = 0; index < branches.Count; index++)
        {
            var branch = branches[index];
            if (branch.Name.Trim().Length is < 2 or > 160) errors[$"branches[{index}].name"] = [$"{index + 1}. satırdaki şube adı geçerli değil."];
            if (branch.Address.Trim().Length is < 3 or > 500) errors[$"branches[{index}].address"] = [$"{index + 1}. satırdaki adres geçerli değil."];
            if (!string.IsNullOrWhiteSpace(branch.Email) && !MailAddress.TryCreate(branch.Email.Trim(), out _)) errors[$"branches[{index}].email"] = [$"{index + 1}. satırdaki e-posta adresi geçerli değil."];
            if (!CoordinatesAreValid(branch.Latitude, branch.Longitude)) errors[$"branches[{index}].location"] = [$"{index + 1}. satırdaki harita koordinatları geçerli değil."];
            if (!UrlIsValid(branch.MapUrl)) errors[$"branches[{index}].mapUrl"] = [$"{index + 1}. satırdaki harita bağlantısı geçerli değil."];
            var portalError = ValidatePortalAccountValues(branch.PortalEmail, branch.PortalPassword);
            if (portalError is not null) errors[$"branches[{index}].portal"] = [$"{index + 1}. satır: {portalError}"];
        }
        return errors;
    }

    private static async Task<string> FindAvailableCustomerCodeAsync(string baseCode, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var existing = await dbContext.Customers.AsNoTracking().Where(item => item.Code.StartsWith(baseCode)).Select(item => item.Code).ToListAsync(cancellationToken);
        return FindAvailableCode(baseCode, existing.ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    private static string FindAvailableCode(string baseCode, ISet<string> usedCodes)
    {
        if (!usedCodes.Contains(baseCode)) return baseCode;
        for (var suffix = 2; suffix < 10000; suffix++)
        {
            var candidate = $"{baseCode}-{suffix}";
            if (!usedCodes.Contains(candidate)) return candidate;
        }
        return $"{baseCode}-{Guid.NewGuid():N}"[..64];
    }

    private static string ToCode(string value)
    {
        var normalized = value.Trim().Replace('ı', 'i').Replace('İ', 'I').Replace('ş', 's').Replace('Ş', 'S')
            .Replace('ğ', 'g').Replace('Ğ', 'G').Replace('ü', 'u').Replace('Ü', 'U')
            .Replace('ö', 'o').Replace('Ö', 'O').Replace('ç', 'c').Replace('Ç', 'C').Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder();
        var lastWasSeparator = false;
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(character)) { builder.Append(char.ToUpperInvariant(character)); lastWasSeparator = false; }
            else if (!lastWasSeparator && builder.Length > 0) { builder.Append('-'); lastWasSeparator = true; }
        }
        var code = builder.ToString().Trim('-');
        return string.IsNullOrEmpty(code) ? "MUSTERI" : code[..Math.Min(code.Length, 48)];
    }

    private static DateTimeOffset ToIstanbulDateTime(DateOnly date, TimeOnly time)
    {
        var localDateTime = DateTime.SpecifyKind(date.ToDateTime(time), DateTimeKind.Unspecified);
        TimeZoneInfo timeZone;
        try { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch (TimeZoneNotFoundException) { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
        return new DateTimeOffset(localDateTime, timeZone.GetUtcOffset(localDateTime)).ToUniversalTime();
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string? NormalizeEmail(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();
    private static IResult? ValidatePortalAccount(string? email, string? password, string key)
    {
        var message = ValidatePortalAccountValues(email, password);
        return message is null ? null : Validation(key, message);
    }
    private static string? ValidatePortalAccountValues(string? email, string? password)
    {
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password)) return null;
        if (string.IsNullOrWhiteSpace(email) || !MailAddress.TryCreate(email.Trim(), out _)) return "Portal hesabı için geçerli bir e-posta girin.";
        if (string.IsNullOrWhiteSpace(password) || password.Length is < 6 or > 100) return "Portal şifresi 6-100 karakter arasında olmalıdır.";
        return null;
    }
    private static Account NewCustomerAccount(string email, string displayName, string? phoneNumber, string password, IPasswordHasher<Account> passwordHasher)
    {
        var account = new Account
        {
            Id = Guid.NewGuid(), Email = email.Trim(), NormalizedEmail = email.Trim().ToUpperInvariant(),
            DisplayName = displayName.Trim(), PhoneNumber = NullIfEmpty(phoneNumber), PasswordHash = string.Empty,
            Portal = PortalType.Customer
        };
        account.PasswordHash = passwordHasher.HashPassword(account, password);
        return account;
    }
    private static bool CoordinatesAreValid(decimal? latitude, decimal? longitude) => (!latitude.HasValue && !longitude.HasValue) || (latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180);
    private static bool UrlIsValid(string? value) => string.IsNullOrWhiteSpace(value) || (Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https");
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    private static CustomerResponse ToResponse(Customer customer) => new(customer.Id, customer.LegalName, customer.Code, customer.ContactName, customer.PhoneNumber, customer.Email, customer.Address, customer.City, customer.District, customer.Latitude, customer.Longitude, customer.MapUrl, customer.IsActive, customer.Branches.Where(item => item.IsActive).OrderBy(item => item.Name).Select(ToResponse).ToArray());
    private static CustomerBranchResponse ToResponse(CustomerBranch branch) => new(branch.Id, branch.Name, branch.Code, branch.Address, branch.City, branch.District, branch.ContactName, branch.PhoneNumber, branch.Email, branch.Latitude, branch.Longitude, branch.MapUrl, branch.IsActive);

    private static WorkOrderResponse ToResponse(WorkOrder workOrder) => ToResponse(workOrder, workOrder.Customer, workOrder.CustomerBranch, workOrder.AssignedEmployeeAccount);

    private static WorkOrderResponse ToResponse(WorkOrder workOrder, Customer customer, CustomerBranch? branch, Account? employee) => new(
        workOrder.Id, workOrder.Number, workOrder.CustomerId, customer.LegalName, workOrder.CustomerBranchId,
        branch?.Name ?? "Merkez", branch?.Address ?? customer.Address ?? string.Empty, branch?.MapUrl ?? customer.MapUrl,
        branch?.Latitude ?? customer.Latitude, branch?.Longitude ?? customer.Longitude,
        workOrder.ServiceType, workOrder.VisitType, workOrder.RecurrenceType, workOrder.RecurrenceGroupId,
        workOrder.ScheduledAt, workOrder.DurationMinutes, workOrder.AssignedEmployeeAccountId, employee?.DisplayName ?? "Atama bekliyor",
        workOrder.Status, workOrder.Notes, workOrder.StartedAt, workOrder.CompletedAt, workOrder.CustomerDurationMinutes, workOrder.TotalLaborMinutes, workOrder.CompletionNote, workOrder.Recommendation,
        workOrder.Assignments.OrderByDescending(item => item.IsLead).ThenBy(item => item.EmployeeAccount.DisplayName)
            .Select(item => new WorkOrderAssignmentResponse(item.EmployeeAccountId, item.EmployeeAccount.DisplayName, item.IsLead)).ToArray(),
        workOrder.VisitSessions.OrderBy(item => item.StartedAt)
            .Select(item => new WorkOrderVisitSessionResponse(item.Id, item.EmployeeAccountId, item.EmployeeAccount.DisplayName, item.Status, item.StartedAt, item.EndedAt, item.DurationMinutes, item.Reason)).ToArray(),
        workOrder.History.OrderBy(item => item.OccurredAt).Select(item => new WorkOrderHistoryResponse(item.Id, item.FromStatus, item.ToStatus, item.Note, item.OccurredAt, item.ChangedByAccount?.DisplayName ?? "Sistem")).ToArray(),
        workOrder.Photos.OrderBy(item => item.UploadedAt).Select(item => new WorkOrderPhotoResponse(item.Id, item.FileName, item.ContentType, item.UploadedAt, $"/api/work-orders/photos/{item.Id}", item.Location, item.Status, item.Description)).ToArray());

    internal static void CloseVisitSessions(WorkOrder workOrder, DateTimeOffset completedAt)
    {
        foreach (var session in workOrder.VisitSessions.Where(item => item.Status == "Active"))
        {
            session.EndedAt = completedAt;
            session.DurationMinutes = Math.Max(1, (int)Math.Round((completedAt - session.StartedAt).TotalMinutes));
            session.Status = "Completed";
        }
        workOrder.CustomerDurationMinutes = workOrder.StartedAt.HasValue
            ? Math.Max(1, (int)Math.Round((completedAt - workOrder.StartedAt.Value).TotalMinutes))
            : null;
        workOrder.TotalLaborMinutes = workOrder.VisitSessions.Where(item => item.EndedAt.HasValue).Sum(item => item.DurationMinutes);
    }
}
