using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Pesneer.Api.Storage;

/// <summary>
/// Minimal server-only client for a private Supabase Storage bucket.
/// Service credentials are applied only to server-to-server calls; signed grants are scoped to one object.
/// </summary>
public sealed class SupabaseFileStore(
    IHttpClientFactory httpClientFactory,
    IOptions<SupabaseStorageOptions> optionsAccessor) : IFileStore
{
    private readonly SupabaseStorageOptions _options = optionsAccessor.Value;

    public bool IsConfigured => _options.IsConfigured;
    public string BucketName => _options.Bucket;

    public Uri ResumableUploadUrl
    {
        get
        {
            EnsureConfigured();
            if (Uri.TryCreate(_options.ResumableUploadUrl, UriKind.Absolute, out var configured) && configured.Scheme == Uri.UriSchemeHttps)
                return configured;

            var root = new Uri(_options.Url.TrimEnd('/') + "/", UriKind.Absolute);
            if (root.Host.EndsWith(".supabase.co", StringComparison.OrdinalIgnoreCase))
            {
                var projectReference = root.Host[..^".supabase.co".Length];
                if (!string.IsNullOrWhiteSpace(projectReference) && !projectReference.Contains('.'))
                    return new Uri($"https://{projectReference}.storage.supabase.co/storage/v1/upload/resumable");
            }

            return new Uri(root, "storage/v1/upload/resumable");
        }
    }

    public async Task<SignedUploadGrant> CreateSignedUploadAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var request = CreateServerRequest(
            HttpMethod.Post,
            BuildStorageApiUri("object", "upload", "sign", _options.Bucket, storageKey));
        request.Content = JsonContent.Create(new { });

        using var response = await SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        using var payload = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var urlText = GetString(payload.RootElement, "url", "signedUrl", "signedURL")
            ?? throw new FileStoreRequestException(response.StatusCode);
        var signedUrl = ResolveStorageApiUri(urlText);
        var token = GetQueryValue(signedUrl, "token")
            ?? GetString(payload.RootElement, "token")
            ?? throw new FileStoreRequestException(response.StatusCode);
        return new SignedUploadGrant(signedUrl, token);
    }

    public async Task<SignedDownloadGrant> CreateSignedDownloadAsync(
        string storageKey,
        string downloadFileName,
        TimeSpan lifetime,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        var seconds = Math.Clamp((int)Math.Ceiling(lifetime.TotalSeconds), 30, 300);
        using var request = CreateServerRequest(
            HttpMethod.Post,
            BuildStorageApiUri("object", "sign", _options.Bucket, storageKey));
        request.Content = JsonContent.Create(new { expiresIn = seconds });

        using var response = await SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        using var payload = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var urlText = GetString(payload.RootElement, "signedURL", "signedUrl", "url")
            ?? throw new FileStoreRequestException(response.StatusCode);
        var signedUrl = ResolveStorageApiUri(urlText);
        var builder = new UriBuilder(signedUrl);
        var downloadParameter = "download=" + Uri.EscapeDataString(downloadFileName);
        builder.Query = string.IsNullOrWhiteSpace(builder.Query)
            ? downloadParameter
            : builder.Query.TrimStart('?') + "&" + downloadParameter;
        return new SignedDownloadGrant(builder.Uri);
    }

    public async Task<FileStoreReadHandle> OpenReadAsync(
        string storageKey,
        CancellationToken cancellationToken = default) =>
        await OpenReadCoreAsync(storageKey, null, cancellationToken);

    public async Task<FileStoreReadHandle> OpenReadRangeAsync(
        string storageKey,
        long from,
        long to,
        CancellationToken cancellationToken = default)
    {
        if (from < 0 || to < from) throw new ArgumentOutOfRangeException(nameof(from));
        return await OpenReadCoreAsync(storageKey, new RangeHeaderValue(from, to), cancellationToken);
    }

    private async Task<FileStoreReadHandle> OpenReadCoreAsync(
        string storageKey,
        RangeHeaderValue? range,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();
        using var request = CreateServerRequest(
            HttpMethod.Get,
            BuildStorageApiUri("object", _options.Bucket, storageKey));
        request.Headers.Range = range;
        var response = await SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        try
        {
            await EnsureSuccessAsync(response, cancellationToken);
            var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return new FileStoreReadHandle(
                response,
                stream,
                response.Content.Headers.ContentType?.MediaType,
                response.Content.Headers.ContentLength,
                response.StatusCode,
                response.Content.Headers.ContentRange);
        }
        catch
        {
            response.Dispose();
            throw;
        }
    }

    public async Task UploadAsync(
        string storageKey,
        Stream content,
        string contentType,
        long sizeBytes,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var request = CreateServerRequest(
            HttpMethod.Post,
            BuildStorageApiUri("object", _options.Bucket, storageKey));
        request.Headers.TryAddWithoutValidation("x-upsert", "false");
        request.Headers.TryAddWithoutValidation("cache-control", "max-age=300");
        request.Content = new StreamContent(content);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        request.Content.Headers.ContentLength = sizeBytes;
        using var response = await SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    public async Task DeleteAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var request = CreateServerRequest(
            HttpMethod.Delete,
            BuildStorageApiUri("object", _options.Bucket));
        request.Content = JsonContent.Create(new { prefixes = new[] { storageKey } });
        using var response = await SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    private HttpRequestMessage CreateServerRequest(HttpMethod method, Uri uri)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ServiceRoleKey);
        request.Headers.TryAddWithoutValidation("apikey", _options.ServiceRoleKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        HttpCompletionOption completionOption,
        CancellationToken cancellationToken)
    {
        try
        {
            return await httpClientFactory.CreateClient("SupabaseStorage")
                .SendAsync(request, completionOption, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new FileStoreRequestException(System.Net.HttpStatusCode.GatewayTimeout);
        }
        catch (HttpRequestException)
        {
            // Do not preserve the HTTP exception: it can contain the object URI or remote details.
            throw new FileStoreRequestException(System.Net.HttpStatusCode.ServiceUnavailable);
        }
    }

    private Uri BuildStorageApiUri(params string[] pathParts)
    {
        var root = _options.Url.TrimEnd('/') + "/storage/v1/";
        var encodedPath = string.Join('/', pathParts.SelectMany(part => part.Split('/', StringSplitOptions.RemoveEmptyEntries))
            .Select(Uri.EscapeDataString));
        return new Uri(root + encodedPath, UriKind.Absolute);
    }

    private Uri ResolveStorageApiUri(string value)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var absolute)) return absolute;

        var root = new Uri(_options.Url.TrimEnd('/') + "/storage/v1/", UriKind.Absolute);
        var relative = value.Trim();
        if (relative.StartsWith("/storage/v1/", StringComparison.OrdinalIgnoreCase))
            return new Uri(new Uri(_options.Url.TrimEnd('/') + "/", UriKind.Absolute), relative.TrimStart('/'));
        return new Uri(root, relative.TrimStart('/'));
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;

        // Drain a small remote error response so the pooled connection can be reused, but never expose it to logs or callers.
        if (response.Content.Headers.ContentLength is null or <= 16 * 1024)
            _ = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        throw new FileStoreRequestException(response.StatusCode);
    }

    private static string? GetString(JsonElement element, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            if (element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String)
                return value.GetString();
        }
        return null;
    }

    private static string? GetQueryValue(Uri uri, string key)
    {
        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (!parts[0].Equals(key, StringComparison.OrdinalIgnoreCase)) continue;
            return parts.Length == 2 ? Uri.UnescapeDataString(parts[1].Replace('+', ' ')) : string.Empty;
        }
        return null;
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured) throw new FileStoreUnavailableException();
    }
}
