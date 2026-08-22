namespace Pesneer.Api.Optimization;

/// <summary>
/// Materializes an upload exactly once for legacy byte[] columns. The final array remains required by EF,
/// but the former MemoryStream growth buffer and ToArray copy are avoided.
/// </summary>
public static class UploadBuffers
{
    public static async Task<byte[]> ReadExactlyAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var data = GC.AllocateUninitializedArray<byte>(checked((int)file.Length));
        await using var input = file.OpenReadStream();
        await input.ReadExactlyAsync(data, cancellationToken);
        return data;
    }

    public static bool HasImageSignature(ReadOnlySpan<byte> data, string contentType)
    {
        if (contentType.Equals("image/png", StringComparison.OrdinalIgnoreCase))
            return data.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
        if (contentType.Equals("image/jpeg", StringComparison.OrdinalIgnoreCase))
            return data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF;
        if (contentType.Equals("image/webp", StringComparison.OrdinalIgnoreCase))
            return data.Length >= 12 && data[..4].SequenceEqual("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WEBP"u8);
        return false;
    }
}
