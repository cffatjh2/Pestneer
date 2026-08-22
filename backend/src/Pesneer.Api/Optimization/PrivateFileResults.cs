using System.Security.Cryptography;
using Microsoft.Net.Http.Headers;

namespace Pesneer.Api.Optimization;

/// <summary>
/// Serves exact protected bytes with resumable ranges and private conditional revalidation.
/// It never transforms or recompresses the stored file.
/// </summary>
public static class PrivateFileResults
{
    public static IResult Exact(
        byte[] data,
        string contentType,
        string fileName,
        DateTimeOffset? lastModified = null,
        string? sha256 = null)
    {
        var hash = string.IsNullOrWhiteSpace(sha256)
            ? Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant()
            : sha256.Trim().ToLowerInvariant();
        var inner = Results.File(
            data,
            contentType,
            fileName,
            enableRangeProcessing: true,
            lastModified: lastModified,
            entityTag: new EntityTagHeaderValue($"\"{hash}\""));
        return new PrivateFileResult(inner);
    }

    private sealed class PrivateFileResult(IResult inner) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.Headers.CacheControl = "private,no-cache,must-revalidate";
            return inner.ExecuteAsync(httpContext);
        }
    }
}
