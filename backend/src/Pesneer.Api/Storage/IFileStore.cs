using System.Net;

namespace Pesneer.Api.Storage;

public interface IFileStore
{
    bool IsConfigured { get; }
    string BucketName { get; }
    Uri ResumableUploadUrl { get; }

    Task<SignedUploadGrant> CreateSignedUploadAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    Task<SignedDownloadGrant> CreateSignedDownloadAsync(
        string storageKey,
        string downloadFileName,
        TimeSpan lifetime,
        CancellationToken cancellationToken = default);

    Task<FileStoreReadHandle> OpenReadAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    Task<FileStoreReadHandle> OpenReadRangeAsync(
        string storageKey,
        long from,
        long to,
        CancellationToken cancellationToken = default);

    Task UploadAsync(
        string storageKey,
        Stream content,
        string contentType,
        long sizeBytes,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        string storageKey,
        CancellationToken cancellationToken = default);
}

public sealed record SignedUploadGrant(Uri Url, string Token);

public sealed record SignedDownloadGrant(Uri Url);

public sealed class FileStoreReadHandle(
    HttpResponseMessage response,
    Stream content,
    string? contentType,
    long? contentLength,
    HttpStatusCode statusCode,
    System.Net.Http.Headers.ContentRangeHeaderValue? contentRange) : IAsyncDisposable
{
    public Stream Content { get; } = content;
    public string? ContentType { get; } = contentType;
    public long? ContentLength { get; } = contentLength;
    public HttpStatusCode StatusCode { get; } = statusCode;
    public System.Net.Http.Headers.ContentRangeHeaderValue? ContentRange { get; } = contentRange;

    public async ValueTask DisposeAsync()
    {
        await Content.DisposeAsync();
        response.Dispose();
    }
}

public sealed class FileStoreUnavailableException()
    : InvalidOperationException("Private file storage is not configured.");

public sealed class FileStoreRequestException(HttpStatusCode statusCode)
    : InvalidOperationException("The private file storage request failed.")
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}

/// <summary>
/// Sanitized signal used only when an operational row has no inline fallback. It intentionally
/// carries no object key, URL, tenant identifier, filename, or remote response details.
/// </summary>
public sealed class RequiredFileStorageUnavailableException()
    : InvalidOperationException("A required private storage object is temporarily unavailable.");
