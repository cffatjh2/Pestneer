namespace Pesneer.Api.Calendar;

public sealed record SaveCalendarEntryRequest(
    string Kind,
    string Title,
    string? Description,
    DateOnly Date,
    string? Time,
    bool IsAllDay,
    Guid? AssignedEmployeeAccountId,
    string Priority,
    string Status);

public sealed record CalendarEntryResponse(
    Guid Id,
    string Kind,
    string Title,
    string? Description,
    DateTimeOffset ScheduledAt,
    bool IsAllDay,
    Guid? AssignedEmployeeAccountId,
    string? AssignedEmployeeName,
    string Priority,
    string Status,
    DateTimeOffset CreatedAt);
