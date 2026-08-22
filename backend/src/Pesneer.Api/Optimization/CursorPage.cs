using System.Text;
using System.Text.Json;

namespace Pesneer.Api.Optimization;

public sealed record CursorPage<T>(
    IReadOnlyList<T> Items,
    string? NextCursor,
    bool HasMore,
    string SnapshotVersion);

internal readonly record struct CursorPosition(DateTimeOffset Snapshot, DateTimeOffset Sort, Guid Id);

internal static class CursorPaging
{
    private sealed record CursorPayload(int V, DateTimeOffset Snapshot, DateTimeOffset Sort, Guid Id);

    public static int NormalizeLimit(int? limit) => Math.Clamp(limit ?? 50, 1, 200);

    public static bool TryRead(string? cursor, out CursorPosition position)
    {
        position = default;
        if (string.IsNullOrWhiteSpace(cursor)) return false;
        try
        {
            var value = cursor.Replace('-', '+').Replace('_', '/');
            value = value.PadRight(value.Length + ((4 - value.Length % 4) % 4), '=');
            var payload = JsonSerializer.Deserialize<CursorPayload>(Convert.FromBase64String(value));
            if (payload is null || payload.V != 1 || payload.Id == Guid.Empty || payload.Sort > payload.Snapshot) return false;
            if (payload.Snapshot > DateTimeOffset.UtcNow.AddMinutes(5)) return false;
            position = new CursorPosition(payload.Snapshot, payload.Sort, payload.Id);
            return true;
        }
        catch (FormatException) { return false; }
        catch (JsonException) { return false; }
    }

    public static string Write(DateTimeOffset snapshot, DateTimeOffset sort, Guid id)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new CursorPayload(1, snapshot, sort, id));
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
