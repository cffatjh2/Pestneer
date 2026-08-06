using System.Globalization;
using System.Net.Mail;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.WorkOrders;

public static class WorkOrderEndpoints
{
    public static IEndpointRouteBuilder MapWorkOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var customers = app.MapGroup("/api/company/customers").RequireAuthorization("OwnerPortal");
        customers.MapGet("/", GetCustomersAsync);
        customers.MapPost("/", CreateCustomerAsync);
        customers.MapPost("/{customerId:guid}/branches/bulk", CreateBranchesAsync);

        var workOrders = app.MapGroup("/api/company/work-orders").RequireAuthorization("OwnerPortal");
        workOrders.MapGet("/", GetWorkOrdersAsync);
        workOrders.MapPost("/batch", CreateWorkOrdersAsync);

        return app;
    }

    private static async Task<IResult> GetCustomersAsync(
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var customers = await dbContext.Customers.AsNoTracking()
            .Include(customer => customer.Branches)
            .Where(customer => customer.IsActive)
            .ToListAsync(cancellationToken);

        return Results.Ok(customers
            .OrderBy(customer => customer.LegalName, StringComparer.Create(new CultureInfo("tr-TR"), true))
            .Select(ToResponse));
    }

    private static async Task<IResult> CreateCustomerAsync(
        CreateCustomerRequest request,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var name = request.LegalName.Trim();
        if (name.Length is < 2 or > 240)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["legalName"] = ["Müşteri adı 2-240 karakter arasında olmalıdır."]
            });
        }

        if (!string.IsNullOrWhiteSpace(request.Email) && !MailAddress.TryCreate(request.Email.Trim(), out _))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["email"] = ["Geçerli bir e-posta adresi girin."]
            });
        }

        if (!CoordinatesAreValid(request.Latitude, request.Longitude))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["location"] = ["Enlem ve boylam birlikte ve geçerli aralıkta girilmelidir."]
            });
        }

        if (!UrlIsValid(request.MapUrl))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["mapUrl"] = ["Geçerli bir Google Haritalar bağlantısı girin."]
            });
        }

        var requestedCode = string.IsNullOrWhiteSpace(request.Code) ? ToCode(name) : ToCode(request.Code);
        var code = await FindAvailableCustomerCodeAsync(requestedCode, dbContext, cancellationToken);
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            LegalName = name,
            Code = code,
            ContactName = NullIfEmpty(request.ContactName),
            PhoneNumber = NullIfEmpty(request.PhoneNumber),
            Email = NullIfEmpty(request.Email),
            Address = NullIfEmpty(request.Address),
            City = NullIfEmpty(request.City),
            District = NullIfEmpty(request.District),
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            MapUrl = NullIfEmpty(request.MapUrl)
        };

        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/customers/{customer.Id}", ToResponse(customer));
    }

    private static async Task<IResult> CreateBranchesAsync(
        Guid customerId,
        BulkCreateCustomerBranchesRequest request,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (request.Branches.Count is < 1 or > 250)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["branches"] = ["Tek işlemde 1 ile 250 arasında şube ekleyebilirsiniz."]
            });
        }

        var customer = await dbContext.Customers
            .Include(item => item.Branches)
            .SingleOrDefaultAsync(item => item.Id == customerId && item.IsActive, cancellationToken);
        if (customer is null) return Results.NotFound(new { message = "Müşteri bulunamadı." });

        var errors = ValidateBranches(request.Branches);
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        var usedCodes = customer.Branches.Select(item => item.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var branches = request.Branches.Select(input =>
        {
            var baseCode = ToCode(string.IsNullOrWhiteSpace(input.Code) ? input.Name : input.Code);
            var code = FindAvailableCode(baseCode, usedCodes);
            usedCodes.Add(code);
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
                Latitude = input.Latitude,
                Longitude = input.Longitude,
                MapUrl = NullIfEmpty(input.MapUrl)
            };
        }).ToList();

        dbContext.CustomerBranches.AddRange(branches);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(branches.Select(ToResponse));
    }

    private static async Task<IResult> GetWorkOrdersAsync(
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var workOrders = await dbContext.WorkOrders.AsNoTracking()
            .Include(item => item.Customer)
            .Include(item => item.CustomerBranch)
            .Include(item => item.AssignedEmployeeAccount)
            .ToListAsync(cancellationToken);

        return Results.Ok(workOrders
            .OrderByDescending(item => item.ScheduledAt)
            .Select(ToResponse));
    }

    private static async Task<IResult> CreateWorkOrdersAsync(
        CreateWorkOrdersRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        var distinctBranchIds = request.BranchIds.Distinct().ToArray();
        if (distinctBranchIds.Length is < 1 or > 250)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["branchIds"] = ["Bir işlemde 1 ile 250 arasında şube seçebilirsiniz."]
            });
        }

        var serviceType = request.ServiceType.Trim();
        if (serviceType.Length is < 2 or > 120 || request.DurationMinutes is < 15 or > 720 ||
            !TimeOnly.TryParseExact(request.Time, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var scheduledTime))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["serviceType"] = ["Hizmet türünü, saati ve 15-720 dakika arasındaki tahmini süreyi kontrol edin."]
            });
        }

        var customer = await dbContext.Customers.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == request.CustomerId && item.IsActive, cancellationToken);
        if (customer is null) return Results.NotFound(new { message = "Müşteri bulunamadı." });

        var branches = await dbContext.CustomerBranches
            .Where(item => item.CustomerId == request.CustomerId && item.IsActive && distinctBranchIds.Contains(item.Id))
            .ToListAsync(cancellationToken);
        if (branches.Count != distinctBranchIds.Length)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["branchIds"] = ["Seçilen şubelerden biri müşteriye ait değil veya aktif değil."]
            });
        }

        Account? employee = null;
        if (request.EmployeeAccountId.HasValue)
        {
            employee = await dbContext.CompanyMemberships.AsNoTracking()
                .Where(item => item.CompanyId == companyContext.CompanyId.Value && item.AccountId == request.EmployeeAccountId.Value && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
                .Select(item => item.Account)
                .SingleOrDefaultAsync(cancellationToken);
            if (employee is null) return Results.NotFound(new { message = "Atanacak aktif personel bulunamadı." });
        }

        var scheduledAt = ToIstanbulDateTime(request.Date, scheduledTime);
        var prefix = $"IE-{request.Date:yyMMdd}-";
        var existingNumbers = await dbContext.WorkOrders.AsNoTracking()
            .Where(item => item.Number.StartsWith(prefix))
            .Select(item => item.Number)
            .ToListAsync(cancellationToken);
        var nextNumber = existingNumbers
            .Select(item => int.TryParse(item[prefix.Length..], out var value) ? value : 0)
            .DefaultIfEmpty(0)
            .Max() + 1;

        var workOrders = branches
            .OrderBy(item => item.Name, StringComparer.Create(new CultureInfo("tr-TR"), true))
            .Select((branch, index) => new WorkOrder
            {
                Id = Guid.NewGuid(),
                CustomerId = customer.Id,
                CustomerBranchId = branch.Id,
                AssignedEmployeeAccountId = employee?.Id,
                Number = $"{prefix}{nextNumber + index:000}",
                ServiceType = serviceType,
                ScheduledAt = scheduledAt,
                DurationMinutes = request.DurationMinutes,
                Notes = NullIfEmpty(request.Notes),
                Status = "Planned"
            })
            .ToList();

        dbContext.WorkOrders.AddRange(workOrders);
        await dbContext.SaveChangesAsync(cancellationToken);
        var branchLookup = branches.ToDictionary(item => item.Id);
        return Results.Created("/api/company/work-orders", workOrders.Select(workOrder =>
        {
            var branch = branchLookup[workOrder.CustomerBranchId!.Value];
            return new WorkOrderResponse(
                workOrder.Id,
                workOrder.Number,
                workOrder.CustomerId,
                customer.LegalName,
                branch.Id,
                branch.Name,
                branch.Address,
                branch.MapUrl,
                workOrder.ServiceType,
                workOrder.ScheduledAt,
                workOrder.DurationMinutes,
                employee?.Id,
                employee?.DisplayName ?? "Atama bekliyor",
                workOrder.Status,
                workOrder.Notes);
        }));
    }

    private static Dictionary<string, string[]> ValidateBranches(IReadOnlyList<CreateCustomerBranchRequest> branches)
    {
        var errors = new Dictionary<string, string[]>();
        for (var index = 0; index < branches.Count; index++)
        {
            var branch = branches[index];
            if (branch.Name.Trim().Length is < 2 or > 160)
            {
                errors[$"branches[{index}].name"] = [$"{index + 1}. satırdaki şube adı geçerli değil."];
            }
            if (branch.Address.Trim().Length is < 3 or > 500)
            {
                errors[$"branches[{index}].address"] = [$"{index + 1}. satırdaki adres geçerli değil."];
            }
            if (!string.IsNullOrWhiteSpace(branch.Email) && !MailAddress.TryCreate(branch.Email.Trim(), out _))
            {
                errors[$"branches[{index}].email"] = [$"{index + 1}. satırdaki e-posta adresi geçerli değil."];
            }
            if (!CoordinatesAreValid(branch.Latitude, branch.Longitude))
            {
                errors[$"branches[{index}].location"] = [$"{index + 1}. satırdaki harita koordinatları geçerli değil."];
            }
            if (!UrlIsValid(branch.MapUrl))
            {
                errors[$"branches[{index}].mapUrl"] = [$"{index + 1}. satırdaki harita bağlantısı geçerli değil."];
            }
        }
        return errors;
    }

    private static async Task<string> FindAvailableCustomerCodeAsync(
        string baseCode,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.Customers.AsNoTracking()
            .Where(item => item.Code.StartsWith(baseCode))
            .Select(item => item.Code)
            .ToListAsync(cancellationToken);
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
        var normalized = value.Trim()
            .Replace('ı', 'i').Replace('İ', 'I').Replace('ş', 's').Replace('Ş', 'S')
            .Replace('ğ', 'g').Replace('Ğ', 'G').Replace('ü', 'u').Replace('Ü', 'U')
            .Replace('ö', 'o').Replace('Ö', 'O').Replace('ç', 'c').Replace('Ç', 'C')
            .Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder();
        var lastWasSeparator = false;
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToUpperInvariant(character));
                lastWasSeparator = false;
            }
            else if (!lastWasSeparator && builder.Length > 0)
            {
                builder.Append('-');
                lastWasSeparator = true;
            }
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
        return new DateTimeOffset(localDateTime, timeZone.GetUtcOffset(localDateTime));
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool CoordinatesAreValid(decimal? latitude, decimal? longitude) =>
        (!latitude.HasValue && !longitude.HasValue) ||
        (latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180);

    private static bool UrlIsValid(string? value) =>
        string.IsNullOrWhiteSpace(value) ||
        (Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https");

    private static CustomerResponse ToResponse(Customer customer) => new(
        customer.Id,
        customer.LegalName,
        customer.Code,
        customer.ContactName,
        customer.PhoneNumber,
        customer.Email,
        customer.Address,
        customer.City,
        customer.District,
        customer.Latitude,
        customer.Longitude,
        customer.MapUrl,
        customer.IsActive,
        customer.Branches.Where(item => item.IsActive).OrderBy(item => item.Name).Select(ToResponse).ToArray());

    private static CustomerBranchResponse ToResponse(CustomerBranch branch) => new(
        branch.Id,
        branch.Name,
        branch.Code,
        branch.Address,
        branch.City,
        branch.District,
        branch.ContactName,
        branch.PhoneNumber,
        branch.Email,
        branch.Latitude,
        branch.Longitude,
        branch.MapUrl,
        branch.IsActive);

    private static WorkOrderResponse ToResponse(WorkOrder workOrder) => new(
        workOrder.Id,
        workOrder.Number,
        workOrder.CustomerId,
        workOrder.Customer.LegalName,
        workOrder.CustomerBranchId,
        workOrder.CustomerBranch?.Name ?? "Merkez",
        workOrder.CustomerBranch?.Address ?? string.Empty,
        workOrder.CustomerBranch?.MapUrl ?? workOrder.Customer.MapUrl,
        workOrder.ServiceType,
        workOrder.ScheduledAt,
        workOrder.DurationMinutes,
        workOrder.AssignedEmployeeAccountId,
        workOrder.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor",
        workOrder.Status,
        workOrder.Notes);
}
