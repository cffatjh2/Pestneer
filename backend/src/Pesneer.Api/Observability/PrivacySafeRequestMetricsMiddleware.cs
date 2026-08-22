using System.Diagnostics;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace Pesneer.Api.Observability;

/// <summary>
/// Records only aggregate HTTP transport facts. It deliberately never reads or logs bodies,
/// query strings, route values, headers, identities, file names, or tenant/account identifiers.
/// </summary>
public sealed class PrivacySafeRequestMetricsMiddleware(
    RequestDelegate next,
    ILogger<PrivacySafeRequestMetricsMiddleware> logger,
    IOptions<RequestMetricsOptions> optionsAccessor)
{
    public async Task InvokeAsync(HttpContext context, PrivacySafeDbRequestMetrics dbRequestMetrics)
    {
        if (!context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        var startedAt = Stopwatch.GetTimestamp();
        var originalRequestBody = context.Request.Body;
        var originalResponseBody = context.Response.Body;
        CountingReadStream? requestCounter = null;
        if (!context.Request.ContentLength.HasValue)
        {
            requestCounter = new CountingReadStream(originalRequestBody);
            context.Request.Body = requestCounter;
        }

        var responseCounter = new CountingWriteStream(originalResponseBody);
        context.Response.Body = responseCounter;
        try
        {
            await next(context);
        }
        finally
        {
            context.Request.Body = originalRequestBody;
            context.Response.Body = originalResponseBody;

            var routeTemplate = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "<unmatched-api-route>";
            var requestBytes = context.Request.ContentLength ?? requestCounter?.BytesRead ?? 0;
            var responseBytes = responseCounter.BytesWritten;
            var durationMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
            var database = dbRequestMetrics.Snapshot();
            var options = optionsAccessor.Value;
            var mustLog = context.Response.StatusCode >= StatusCodes.Status400BadRequest ||
                responseBytes >= options.AlwaysLogResponseBytes ||
                durationMs >= options.AlwaysLogDurationMilliseconds;
            var sampled = Random.Shared.NextDouble() < Math.Clamp(options.SampleRate, 0, 1);
            if (mustLog || sampled)
            {
                logger.LogInformation(
                    "HTTP metric RouteTemplate={RouteTemplate} Method={Method} StatusCode={StatusCode} RequestBytes={RequestBytes} ResponseBytes={ResponseBytes} DurationMs={DurationMs} DbQueryCount={DbQueryCount} DbDurationMs={DbDurationMs} Sampled={Sampled}",
                    routeTemplate,
                    context.Request.Method,
                    context.Response.StatusCode,
                    requestBytes,
                    responseBytes,
                    durationMs,
                    database.QueryCount,
                    database.DurationMilliseconds,
                    !mustLog);
            }
        }
    }
}

public sealed class RequestMetricsOptions
{
    public const string SectionName = "Observability:RequestMetrics";
    public double SampleRate { get; set; } = 0.05;
    public long AlwaysLogResponseBytes { get; set; } = 1024 * 1024;
    public double AlwaysLogDurationMilliseconds { get; set; } = 1000;
}

public static class PrivacySafeRequestMetricsExtensions
{
    public static IApplicationBuilder UsePrivacySafeRequestMetrics(this IApplicationBuilder app) =>
        app.UseMiddleware<PrivacySafeRequestMetricsMiddleware>();
}

internal sealed class CountingReadStream(Stream inner) : Stream
{
    private long _bytesRead;
    public long BytesRead => Interlocked.Read(ref _bytesRead);
    public override bool CanRead => inner.CanRead;
    public override bool CanSeek => inner.CanSeek;
    public override bool CanWrite => false;
    public override long Length => inner.Length;
    public override long Position { get => inner.Position; set => inner.Position = value; }
    public override void Flush() => inner.Flush();
    public override Task FlushAsync(CancellationToken cancellationToken) => inner.FlushAsync(cancellationToken);
    public override long Seek(long offset, SeekOrigin origin) => inner.Seek(offset, origin);
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override int Read(byte[] buffer, int offset, int count)
    {
        var read = inner.Read(buffer, offset, count);
        Interlocked.Add(ref _bytesRead, read);
        return read;
    }

    public override int Read(Span<byte> buffer)
    {
        var read = inner.Read(buffer);
        Interlocked.Add(ref _bytesRead, read);
        return read;
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        var read = await inner.ReadAsync(buffer, cancellationToken);
        Interlocked.Add(ref _bytesRead, read);
        return read;
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        var read = await inner.ReadAsync(buffer, offset, count, cancellationToken);
        Interlocked.Add(ref _bytesRead, read);
        return read;
    }
}

internal sealed class CountingWriteStream(Stream inner) : Stream
{
    private long _bytesWritten;
    public long BytesWritten => Interlocked.Read(ref _bytesWritten);
    public override bool CanRead => false;
    public override bool CanSeek => inner.CanSeek;
    public override bool CanWrite => inner.CanWrite;
    public override long Length => inner.Length;
    public override long Position { get => inner.Position; set => inner.Position = value; }
    public override void Flush() => inner.Flush();
    public override Task FlushAsync(CancellationToken cancellationToken) => inner.FlushAsync(cancellationToken);
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => inner.Seek(offset, origin);
    public override void SetLength(long value) => inner.SetLength(value);

    public override void Write(byte[] buffer, int offset, int count)
    {
        inner.Write(buffer, offset, count);
        Interlocked.Add(ref _bytesWritten, count);
    }

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        inner.Write(buffer);
        Interlocked.Add(ref _bytesWritten, buffer.Length);
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        await inner.WriteAsync(buffer, cancellationToken);
        Interlocked.Add(ref _bytesWritten, buffer.Length);
    }

    public override async Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        await inner.WriteAsync(buffer, offset, count, cancellationToken);
        Interlocked.Add(ref _bytesWritten, count);
    }
}
