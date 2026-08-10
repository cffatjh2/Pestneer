using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Calendar;

public static class CalendarEndpoints
{
    private static readonly HashSet<string> Kinds = ["Task", "Note"];
    private static readonly HashSet<string> Priorities = ["Low", "Normal", "High"];
    private static readonly HashSet<string> Statuses = ["Planned", "Completed"];

    public static IEndpointRouteBuilder MapCalendarEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/calendar").RequireAuthorization("CompanyStaff");
        group.MapGet("/", GetEntriesAsync);
        group.MapPost("/", CreateEntryAsync).RequireAuthorization("OwnerPortal");
        group.MapPut("/{entryId:guid}", UpdateEntryAsync).RequireAuthorization("OwnerPortal");
        group.MapDelete("/{entryId:guid}", DeleteEntryAsync).RequireAuthorization("OwnerPortal");
        return app;
    }

    private static async Task<IResult> GetEntriesAsync(
        DateOnly from,
        DateOnly to,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (to < from || to.DayNumber - from.DayNumber > 370)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["range"] = ["Takvim aralığı en fazla 370 gün olabilir."] });
        }

        var fromDate = ToIstanbulDateTime(from, TimeOnly.MinValue);
        var toDate = ToIstanbulDateTime(to.AddDays(1), TimeOnly.MinValue);
        IQueryable<CalendarEntry> query = dbContext.CalendarEntries.AsNoTracking()
            .Include(item => item.AssignedEmployeeAccount);

        if (companyContext.Portal == PortalType.Employee)
        {
            if (!companyContext.AccountId.HasValue) return Results.Forbid();
            query = query.Where(item => item.AssignedEmployeeAccountId == companyContext.AccountId.Value);
        }

        var entries = await query.ToListAsync(cancellationToken);
        return Results.Ok(entries
            .Where(item => item.ScheduledAt >= fromDate && item.ScheduledAt < toDate)
            .OrderBy(item => item.ScheduledAt)
            .Select(ToResponse));
    }

    private static async Task<IResult> CreateEntryAsync(
        SaveCalendarEntryRequest request,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();
        var validation = await ValidateAsync(request, dbContext, cancellationToken);
        if (validation.Error is not null) return validation.Error;

        var entry = new CalendarEntry
        {
            Id = Guid.NewGuid(),
            CompanyId = companyContext.CompanyId.Value,
            AssignedEmployeeAccountId = validation.Employee?.Id,
            Kind = request.Kind,
            Title = request.Title.Trim(),
            Description = NullIfEmpty(request.Description),
            ScheduledAt = validation.ScheduledAt,
            IsAllDay = request.IsAllDay,
            Priority = request.Priority,
            Status = request.Status,
        };
        dbContext.CalendarEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        entry.AssignedEmployeeAccount = validation.Employee;
        return Results.Created($"/api/calendar/{entry.Id}", ToResponse(entry));
    }

    private static async Task<IResult> UpdateEntryAsync(
        Guid entryId,
        SaveCalendarEntryRequest request,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var entry = await dbContext.CalendarEntries.Include(item => item.AssignedEmployeeAccount)
            .SingleOrDefaultAsync(item => item.Id == entryId, cancellationToken);
        if (entry is null) return Results.NotFound(new { message = "Takvim kaydı bulunamadı." });

        var validation = await ValidateAsync(request, dbContext, cancellationToken);
        if (validation.Error is not null) return validation.Error;

        entry.AssignedEmployeeAccountId = validation.Employee?.Id;
        entry.AssignedEmployeeAccount = validation.Employee;
        entry.Kind = request.Kind;
        entry.Title = request.Title.Trim();
        entry.Description = NullIfEmpty(request.Description);
        entry.ScheduledAt = validation.ScheduledAt;
        entry.IsAllDay = request.IsAllDay;
        entry.Priority = request.Priority;
        entry.Status = request.Status;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(entry));
    }

    private static async Task<IResult> DeleteEntryAsync(
        Guid entryId,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var entry = await dbContext.CalendarEntries.SingleOrDefaultAsync(item => item.Id == entryId, cancellationToken);
        if (entry is null) return Results.NotFound(new { message = "Takvim kaydı bulunamadı." });
        dbContext.CalendarEntries.Remove(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<(IResult? Error, Account? Employee, DateTimeOffset ScheduledAt)> ValidateAsync(
        SaveCalendarEntryRequest request,
        PesneerDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!Kinds.Contains(request.Kind) || request.Title.Trim().Length is < 2 or > 180 ||
            !Priorities.Contains(request.Priority) || !Statuses.Contains(request.Status))
        {
            return (Results.ValidationProblem(new Dictionary<string, string[]> { ["entry"] = ["Görev türü, başlık, öncelik veya durum bilgisi geçerli değil."] }), null, default);
        }

        var time = TimeOnly.MinValue;
        if (!request.IsAllDay && !TimeOnly.TryParseExact(request.Time, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out time))
        {
            return (Results.ValidationProblem(new Dictionary<string, string[]> { ["time"] = ["Saat bilgisi geçerli değil."] }), null, default);
        }

        Account? employee = null;
        if (request.AssignedEmployeeAccountId.HasValue)
        {
            employee = await dbContext.CompanyMemberships
                .Where(item => item.AccountId == request.AssignedEmployeeAccountId.Value && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee)
                .Select(item => item.Account)
                .SingleOrDefaultAsync(cancellationToken);
            if (employee is null) return (Results.NotFound(new { message = "Atanacak aktif personel bulunamadı." }), null, default);
        }

        return (null, employee, ToIstanbulDateTime(request.Date, time));
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

    private static CalendarEntryResponse ToResponse(CalendarEntry entry) => new(
        entry.Id,
        entry.Kind,
        entry.Title,
        entry.Description,
        entry.ScheduledAt,
        entry.IsAllDay,
        entry.AssignedEmployeeAccountId,
        entry.AssignedEmployeeAccount?.DisplayName,
        entry.Priority,
        entry.Status,
        entry.CreatedAt);
}
