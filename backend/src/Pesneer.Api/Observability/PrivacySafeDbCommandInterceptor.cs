using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Pesneer.Api.Observability;

/// <summary>
/// Accumulates only aggregate command count and elapsed time for the current dependency-injection
/// scope. SQL text, parameters, entity values and connection details are never inspected or stored.
/// </summary>
public sealed class PrivacySafeDbRequestMetrics
{
    private long _queryCount;
    private long _durationTicks;

    internal void Record(TimeSpan duration)
    {
        Interlocked.Increment(ref _queryCount);
        Interlocked.Add(ref _durationTicks, Math.Max(0, duration.Ticks));
    }

    public PrivacySafeDbRequestMetricsSnapshot Snapshot() => new(
        Interlocked.Read(ref _queryCount),
        TimeSpan.FromTicks(Interlocked.Read(ref _durationTicks)).TotalMilliseconds);
}

public readonly record struct PrivacySafeDbRequestMetricsSnapshot(
    long QueryCount,
    double DurationMilliseconds);

/// <summary>
/// Records one aggregate observation for each completed, failed or canceled EF Core command.
/// </summary>
public sealed class PrivacySafeDbCommandInterceptor(PrivacySafeDbRequestMetrics metrics) : DbCommandInterceptor
{
    public override DbDataReader ReaderExecuted(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result)
    {
        metrics.Record(eventData.Duration);
        return result;
    }

    public override ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        metrics.Record(eventData.Duration);
        return ValueTask.FromResult(result);
    }

    public override object? ScalarExecuted(
        DbCommand command,
        CommandExecutedEventData eventData,
        object? result)
    {
        metrics.Record(eventData.Duration);
        return result;
    }

    public override ValueTask<object?> ScalarExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        object? result,
        CancellationToken cancellationToken = default)
    {
        metrics.Record(eventData.Duration);
        return ValueTask.FromResult(result);
    }

    public override int NonQueryExecuted(
        DbCommand command,
        CommandExecutedEventData eventData,
        int result)
    {
        metrics.Record(eventData.Duration);
        return result;
    }

    public override ValueTask<int> NonQueryExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        metrics.Record(eventData.Duration);
        return ValueTask.FromResult(result);
    }

    public override void CommandFailed(DbCommand command, CommandErrorEventData eventData) =>
        metrics.Record(eventData.Duration);

    public override Task CommandFailedAsync(
        DbCommand command,
        CommandErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        metrics.Record(eventData.Duration);
        return Task.CompletedTask;
    }

    public override void CommandCanceled(DbCommand command, CommandEndEventData eventData) =>
        metrics.Record(eventData.Duration);

    public override Task CommandCanceledAsync(
        DbCommand command,
        CommandEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        metrics.Record(eventData.Duration);
        return Task.CompletedTask;
    }
}
