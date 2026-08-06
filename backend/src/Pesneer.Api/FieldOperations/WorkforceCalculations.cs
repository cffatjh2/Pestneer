using Pesneer.Api.Domain;

namespace Pesneer.Api.FieldOperations;

internal static class WorkforceCalculations
{
    private static readonly TimeZoneInfo BusinessTimeZone = ResolveBusinessTimeZone();

    public static DateOnly Today(DateTimeOffset now) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, BusinessTimeZone).DateTime);

    public static int BreakMinutes(WorkShift shift, DateTimeOffset now) =>
        (int)Math.Max(0, Math.Floor(shift.Breaks.Sum(item =>
            ((item.EndedAt ?? now) - item.StartedAt).TotalMinutes)));

    public static int WorkedMinutes(WorkShift shift, DateTimeOffset now)
    {
        var elapsedMinutes = ((shift.EndedAt ?? now) - shift.StartedAt).TotalMinutes;
        return (int)Math.Max(0, Math.Floor(elapsedMinutes - BreakMinutes(shift, now)));
    }

    public static string Status(WorkShift? shift) => shift?.Status switch
    {
        WorkShiftStatus.Working => "working",
        WorkShiftStatus.OnBreak => "onBreak",
        WorkShiftStatus.Completed => "completed",
        _ => "notStarted"
    };

    private static TimeZoneInfo ResolveBusinessTimeZone()
    {
        foreach (var id in new[] { "Europe/Istanbul", "Turkey Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
        }

        return TimeZoneInfo.Utc;
    }
}
