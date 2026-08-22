using System.Buffers;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Storage;

public enum HybridFileResourceKind
{
    QualityDocument,
    WorkOrderPhoto,
    CorrectiveActionEvidence,
    WasteDisposalEvidence,
    AuditPackagePdf,
    AuditPackageZip,
    AuditPackageItem
}

public sealed record CanonicalStoredObject(
    Guid Id,
    string Sha256,
    long SizeBytes,
    string ContentType,
    DateTimeOffset VerifiedAt);

public interface IHybridFileStorage
{
    bool CanUseStorageOnly(Guid companyId);

    Task<CanonicalStoredObject?> StoreCanonicalAsync(
        Guid companyId,
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken = default);

    Task<byte[]?> TryReadBytesAsync(
        Guid companyId,
        Guid? storedObjectId,
        long maximumBytes,
        CancellationToken cancellationToken = default);

    Task TryDualWriteAsync(
        HybridFileResourceKind resourceKind,
        Guid companyId,
        Guid resourceId,
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken = default);

    Task<IResult?> TryReadAsync(
        Guid companyId,
        Guid? storedObjectId,
        HttpRequest request,
        string fileName,
        string contentType,
        DateTimeOffset lastModified,
        CancellationToken cancellationToken = default,
        bool storageRequired = false);
}

/// <summary>
/// Opt-in compatibility bridge for resource-authorized legacy endpoints. Inline bytes are always
/// committed first; Storage failures never change the legacy response or delete legacy content.
/// </summary>
public sealed class HybridFileStorageService(
    IServiceScopeFactory scopeFactory,
    IFileStore fileStore,
    IOptions<SupabaseStorageOptions> optionsAccessor,
    ILogger<HybridFileStorageService> logger) : IHybridFileStorage
{
    private readonly SupabaseStorageOptions _options = optionsAccessor.Value;
    private readonly HashSet<Guid> _hybridCompanyIds = optionsAccessor.Value.GetHybridCompanyIds().ToHashSet();

    public bool CanUseStorageOnly(Guid companyId) =>
        _options.StorageOnlyWritesEnabled && fileStore.IsConfigured && _hybridCompanyIds.Contains(companyId);

    public async Task<CanonicalStoredObject?> StoreCanonicalAsync(
        Guid companyId,
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken = default)
    {
        if (!CanUseStorageOnly(companyId) || data.Length == 0 || data.LongLength > _options.MaximumFileSizeBytes)
            return null;

        var normalizedFileName = NormalizeFileName(fileName, Guid.Empty);
        var normalizedContentType = NormalizeContentType(contentType);
        var sha256 = Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
            if (!dbContext.Database.IsNpgsql()) return null;
            var storedObject = await dbContext.StoredObjects.IgnoreQueryFilters()
                .SingleOrDefaultAsync(
                    item => item.CompanyId == companyId && item.Sha256 == sha256,
                    cancellationToken);

            if (storedObject is null)
            {
                storedObject = new StoredObject
                {
                    Id = Guid.NewGuid(),
                    CompanyId = companyId,
                    Sha256 = sha256,
                    SizeBytes = data.LongLength,
                    ContentType = normalizedContentType,
                    StorageKey = $"companies/{companyId:N}/{sha256[..2]}/{sha256}",
                    InitialFileName = normalizedFileName,
                    State = StoredObjectState.Pending,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                dbContext.StoredObjects.Add(storedObject);
                try
                {
                    await dbContext.SaveFileStorageMaintenanceChangesAsync(companyId, cancellationToken);
                }
                catch (DbUpdateException)
                {
                    dbContext.ChangeTracker.Clear();
                    storedObject = await dbContext.StoredObjects.IgnoreQueryFilters()
                        .SingleOrDefaultAsync(
                            item => item.CompanyId == companyId && item.Sha256 == sha256,
                            cancellationToken);
                    if (storedObject is null) return null;
                }
            }

            if (storedObject.State == StoredObjectState.Deleting ||
                storedObject.SizeBytes != data.LongLength ||
                !storedObject.ContentType.Equals(normalizedContentType, StringComparison.OrdinalIgnoreCase))
                return null;

            if (storedObject.State != StoredObjectState.Ready)
            {
                try
                {
                    await using var source = new MemoryStream(data, writable: false);
                    await fileStore.UploadAsync(
                        storedObject.StorageKey,
                        source,
                        storedObject.ContentType,
                        storedObject.SizeBytes,
                        cancellationToken);
                }
                catch (FileStoreRequestException exception) when (
                    exception.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict)
                {
                    // An immutable object or an interrupted direct upload may already own this key.
                    // Full byte verification below is the only success criterion.
                }
            }

            // Re-verify Ready objects too. Storage-only database rows are written only while the exact
            // remote object is currently readable and checksum-identical.
            if (!await VerifyRemoteAsync(storedObject, cancellationToken)) return null;
            if (storedObject.State != StoredObjectState.Ready)
            {
                storedObject.State = StoredObjectState.Ready;
                storedObject.VerifiedAt = DateTimeOffset.UtcNow;
                await dbContext.SaveFileStorageMaintenanceChangesAsync(companyId, cancellationToken);
            }

            return new CanonicalStoredObject(
                storedObject.Id,
                storedObject.Sha256,
                storedObject.SizeBytes,
                storedObject.ContentType,
                storedObject.VerifiedAt ?? storedObject.CreatedAt);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Private storage canonical write stopped with status Timeout");
            return null;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (FileStoreRequestException exception)
        {
            logger.LogWarning(
                "Private storage canonical write failed with status {StorageStatusCode}",
                (int)exception.StatusCode);
            return null;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                "Private storage canonical write failed with exception type {ExceptionType}",
                exception.GetType().Name);
            return null;
        }
    }

    public async Task<byte[]?> TryReadBytesAsync(
        Guid companyId,
        Guid? storedObjectId,
        long maximumBytes,
        CancellationToken cancellationToken = default)
    {
        if (!storedObjectId.HasValue) return null;
        if (!fileStore.IsConfigured || maximumBytes <= 0 || maximumBytes > int.MaxValue)
            throw new RequiredFileStorageUnavailableException();

        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
            var storedObject = await dbContext.StoredObjects.IgnoreQueryFilters().AsNoTracking()
                .SingleOrDefaultAsync(
                    item => item.Id == storedObjectId.Value && item.CompanyId == companyId,
                    cancellationToken);
            if (storedObject is null || storedObject.State != StoredObjectState.Ready ||
                storedObject.SizeBytes <= 0 || storedObject.SizeBytes > maximumBytes || storedObject.SizeBytes > int.MaxValue)
                throw new RequiredFileStorageUnavailableException();

            await using var handle = await fileStore.OpenReadAsync(storedObject.StorageKey, cancellationToken);
            if (handle.StatusCode != HttpStatusCode.OK ||
                handle.ContentLength.HasValue && handle.ContentLength.Value != storedObject.SizeBytes)
                throw new RequiredFileStorageUnavailableException();

            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            using var output = new MemoryStream((int)storedObject.SizeBytes);
            var buffer = ArrayPool<byte>.Shared.Rent(128 * 1024);
            long total = 0;
            try
            {
                while (true)
                {
                    var read = await handle.Content.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                    if (read == 0) break;
                    total += read;
                    if (total > storedObject.SizeBytes || total > maximumBytes)
                        throw new RequiredFileStorageUnavailableException();
                    hash.AppendData(buffer, 0, read);
                    await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }

            if (total != storedObject.SizeBytes || !CryptographicOperations.FixedTimeEquals(
                    hash.GetHashAndReset(),
                    Convert.FromHexString(storedObject.Sha256)))
                throw new RequiredFileStorageUnavailableException();
            return output.ToArray();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Private storage canonical byte read stopped with status Timeout");
            throw new RequiredFileStorageUnavailableException();
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (FileStoreRequestException exception)
        {
            logger.LogWarning(
                "Private storage canonical byte read failed with status {StorageStatusCode}",
                (int)exception.StatusCode);
            throw new RequiredFileStorageUnavailableException();
        }
        catch (RequiredFileStorageUnavailableException)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                "Private storage canonical byte read failed with exception type {ExceptionType}",
                exception.GetType().Name);
            throw new RequiredFileStorageUnavailableException();
        }
    }

    public async Task TryDualWriteAsync(
        HybridFileResourceKind resourceKind,
        Guid companyId,
        Guid resourceId,
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken = default)
    {
        if (!_options.HybridDualWriteEnabled || !fileStore.IsConfigured ||
            !_hybridCompanyIds.Contains(companyId) || data.Length == 0) return;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.EffectiveHybridWriteTimeoutSeconds));
        try
        {
            await DualWriteCoreAsync(
                resourceKind,
                companyId,
                resourceId,
                NormalizeFileName(fileName, resourceId),
                NormalizeContentType(contentType),
                data,
                timeout.Token);
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("Private storage hybrid dual-write stopped with status TimeoutOrCancellation");
        }
        catch (FileStoreRequestException exception)
        {
            logger.LogWarning(
                "Private storage hybrid dual-write failed with status {StorageStatusCode}",
                (int)exception.StatusCode);
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                "Private storage hybrid dual-write failed with exception type {ExceptionType}",
                exception.GetType().Name);
        }
    }

    public async Task<IResult?> TryReadAsync(
        Guid companyId,
        Guid? storedObjectId,
        HttpRequest request,
        string fileName,
        string contentType,
        DateTimeOffset lastModified,
        CancellationToken cancellationToken = default,
        bool storageRequired = false)
    {
        // A disabled read flag returns all hybrid records to their inline fallback. Records deliberately
        // created Storage-only have no such fallback and must remain readable after a flag rollback.
        if (!storedObjectId.HasValue) return null;
        if (!fileStore.IsConfigured)
            return storageRequired ? RequiredStorageUnavailable() : null;
        if (!storageRequired && (!_options.HybridReadEnabled || !_hybridCompanyIds.Contains(companyId)))
            return null;

        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
            var storedObject = await dbContext.StoredObjects.IgnoreQueryFilters().AsNoTracking()
                .SingleOrDefaultAsync(item => item.Id == storedObjectId.Value && item.CompanyId == companyId, cancellationToken);
            if (storedObject is null || storedObject.State != StoredObjectState.Ready)
                return storageRequired ? RequiredStorageUnavailable() : null;

            var etag = $"\"{storedObject.Sha256}\"";
            if (IsNotModified(request, etag, lastModified))
                return new StoredFileNotModifiedResult(etag, lastModified);

            var range = ParseSingleRange(request.Headers.Range, storedObject.SizeBytes);
            if (range.IsInvalid)
                return storageRequired ? Results.StatusCode(StatusCodes.Status416RangeNotSatisfiable) : null;
            if (range.Value is not null && !IfRangeAllowsRange(request.Headers.IfRange, etag, lastModified))
                range = ParsedRange.None;

            FileStoreReadHandle handle;
            if (range.Value is { } requestedRange)
            {
                handle = await fileStore.OpenReadRangeAsync(
                    storedObject.StorageKey,
                    requestedRange.From,
                    requestedRange.To,
                    cancellationToken);
                var expectedLength = requestedRange.To - requestedRange.From + 1;
                if (handle.StatusCode != HttpStatusCode.PartialContent ||
                    handle.ContentLength.HasValue && handle.ContentLength.Value != expectedLength ||
                    handle.ContentRange is not null &&
                    (handle.ContentRange.From != requestedRange.From ||
                     handle.ContentRange.To != requestedRange.To ||
                     handle.ContentRange.Length != storedObject.SizeBytes))
                {
                    await handle.DisposeAsync();
                    return storageRequired ? RequiredStorageUnavailable() : null;
                }
            }
            else
            {
                handle = await fileStore.OpenReadAsync(storedObject.StorageKey, cancellationToken);
                if (handle.StatusCode != HttpStatusCode.OK ||
                    handle.ContentLength.HasValue && handle.ContentLength.Value != storedObject.SizeBytes)
                {
                    await handle.DisposeAsync();
                    return storageRequired ? RequiredStorageUnavailable() : null;
                }
            }

            return new StoredFileRelayResult(
                handle,
                range.Value,
                storedObject.SizeBytes,
                NormalizeContentType(contentType),
                NormalizeFileName(fileName, storedObject.Id),
                etag,
                lastModified);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Private storage hybrid read failed with status Timeout");
            return storageRequired ? RequiredStorageUnavailable() : null;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (FileStoreRequestException exception)
        {
            logger.LogWarning(
                "Private storage hybrid read failed with status {StorageStatusCode}",
                (int)exception.StatusCode);
            return storageRequired ? RequiredStorageUnavailable() : null;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                "Private storage hybrid read failed with exception type {ExceptionType}",
                exception.GetType().Name);
            return storageRequired ? RequiredStorageUnavailable() : null;
        }
    }

    private static IResult RequiredStorageUnavailable() => Results.Problem(
        title: "Private dosya içeriği geçici olarak kullanılamıyor.",
        detail: "Dosya doğrulanmış depolama alanından okunamadı; istek daha sonra yeniden denenebilir.",
        statusCode: StatusCodes.Status503ServiceUnavailable);

    private async Task DualWriteCoreAsync(
        HybridFileResourceKind resourceKind,
        Guid companyId,
        Guid resourceId,
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken cancellationToken)
    {
        var sha256 = Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
        var storedObject = await dbContext.StoredObjects.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.CompanyId == companyId && item.Sha256 == sha256, cancellationToken);
        var created = false;

        if (storedObject is null)
        {
            storedObject = new StoredObject
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                Sha256 = sha256,
                SizeBytes = data.LongLength,
                ContentType = contentType,
                StorageKey = $"companies/{companyId:N}/{sha256[..2]}/{sha256}",
                InitialFileName = fileName,
                State = StoredObjectState.Pending,
                CreatedAt = DateTimeOffset.UtcNow
            };
            dbContext.StoredObjects.Add(storedObject);
            try
            {
                await dbContext.SaveFileStorageMaintenanceChangesAsync(companyId, cancellationToken);
                created = true;
            }
            catch (DbUpdateException)
            {
                dbContext.ChangeTracker.Clear();
                storedObject = await dbContext.StoredObjects.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.CompanyId == companyId && item.Sha256 == sha256, cancellationToken);
                if (storedObject is null) return;
            }
        }

        if (storedObject.SizeBytes != data.LongLength ||
            !storedObject.ContentType.Equals(contentType, StringComparison.OrdinalIgnoreCase) ||
            storedObject.State == StoredObjectState.Deleting)
            return;

        if (created)
        {
            try
            {
                await using var source = new MemoryStream(data, writable: false);
                await fileStore.UploadAsync(
                    storedObject.StorageKey,
                    source,
                    storedObject.ContentType,
                    storedObject.SizeBytes,
                    cancellationToken);
            }
            catch (FileStoreRequestException exception) when (exception.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict)
            {
                // An immutable object from an interrupted prior attempt may already exist.
            }
        }

        if (storedObject.State != StoredObjectState.Ready)
        {
            if (!await VerifyRemoteAsync(storedObject, cancellationToken)) return;
            storedObject.State = StoredObjectState.Ready;
            storedObject.VerifiedAt = DateTimeOffset.UtcNow;
        }

        if (!await LinkResourceAsync(dbContext, resourceKind, resourceId, companyId, storedObject.Id, cancellationToken))
        {
            if (dbContext.Entry(storedObject).State == EntityState.Modified)
                await dbContext.SaveFileStorageMaintenanceChangesAsync(companyId, cancellationToken);
            return;
        }

        await dbContext.SaveFileStorageBackfillChangesAsync(companyId, cancellationToken);
    }

    private async Task<bool> VerifyRemoteAsync(StoredObject storedObject, CancellationToken cancellationToken)
    {
        await using var handle = await fileStore.OpenReadAsync(storedObject.StorageKey, cancellationToken);
        if (handle.StatusCode != HttpStatusCode.OK ||
            handle.ContentLength.HasValue && handle.ContentLength.Value != storedObject.SizeBytes)
            return false;

        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = ArrayPool<byte>.Shared.Rent(128 * 1024);
        long total = 0;
        try
        {
            while (true)
            {
                var read = await handle.Content.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                if (read == 0) break;
                hash.AppendData(buffer, 0, read);
                total += read;
                if (total > storedObject.SizeBytes) return false;
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }

        return total == storedObject.SizeBytes && CryptographicOperations.FixedTimeEquals(
            hash.GetHashAndReset(),
            Convert.FromHexString(storedObject.Sha256));
    }

    private static async Task<bool> LinkResourceAsync(
        PesneerDbContext dbContext,
        HybridFileResourceKind resourceKind,
        Guid resourceId,
        Guid companyId,
        Guid storedObjectId,
        CancellationToken cancellationToken)
    {
        switch (resourceKind)
        {
            case HybridFileResourceKind.QualityDocument:
            {
                var document = await dbContext.QualityDocuments.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.Id == resourceId && item.CompanyId == companyId, cancellationToken);
                if (document is null || document.StoredObjectId.HasValue && document.StoredObjectId != storedObjectId) return false;
                document.StoredObjectId = storedObjectId;
                return true;
            }
            case HybridFileResourceKind.WorkOrderPhoto:
            {
                var photo = await dbContext.WorkOrderPhotos.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.Id == resourceId && item.CompanyId == companyId, cancellationToken);
                if (photo is null || photo.StoredObjectId.HasValue && photo.StoredObjectId != storedObjectId) return false;
                photo.StoredObjectId = storedObjectId;
                return true;
            }
            case HybridFileResourceKind.CorrectiveActionEvidence:
            {
                var evidence = await dbContext.CorrectiveActionEvidence.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.Id == resourceId && item.CompanyId == companyId, cancellationToken);
                if (evidence is null || evidence.StoredObjectId.HasValue && evidence.StoredObjectId != storedObjectId) return false;
                evidence.StoredObjectId = storedObjectId;
                return true;
            }
            case HybridFileResourceKind.WasteDisposalEvidence:
            {
                var evidence = await dbContext.WasteDisposalEvidence.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.Id == resourceId && item.CompanyId == companyId, cancellationToken);
                if (evidence is null || evidence.StoredObjectId.HasValue && evidence.StoredObjectId != storedObjectId) return false;
                evidence.StoredObjectId = storedObjectId;
                return true;
            }
            case HybridFileResourceKind.AuditPackagePdf:
            {
                var package = await dbContext.AuditPackages.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.Id == resourceId && item.CompanyId == companyId, cancellationToken);
                if (package is null || package.PdfStoredObjectId.HasValue && package.PdfStoredObjectId != storedObjectId) return false;
                package.PdfStoredObjectId = storedObjectId;
                return true;
            }
            case HybridFileResourceKind.AuditPackageZip:
            {
                var package = await dbContext.AuditPackages.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(item => item.Id == resourceId && item.CompanyId == companyId, cancellationToken);
                if (package is null || package.ZipStoredObjectId.HasValue && package.ZipStoredObjectId != storedObjectId) return false;
                package.ZipStoredObjectId = storedObjectId;
                return true;
            }
            case HybridFileResourceKind.AuditPackageItem:
            {
                var item = await dbContext.AuditPackageItems.IgnoreQueryFilters()
                    .SingleOrDefaultAsync(value => value.Id == resourceId && value.CompanyId == companyId, cancellationToken);
                if (item is null || item.StoredObjectId.HasValue && item.StoredObjectId != storedObjectId) return false;
                item.StoredObjectId = storedObjectId;
                return true;
            }
            default:
                return false;
        }
    }

    private static bool IsNotModified(HttpRequest request, string etag, DateTimeOffset lastModified)
    {
        var ifNoneMatch = request.Headers.IfNoneMatch.ToString();
        if (!string.IsNullOrWhiteSpace(ifNoneMatch))
            return ifNoneMatch.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Any(candidate => candidate == "*" || NormalizeWeakEtag(candidate).Equals(etag, StringComparison.Ordinal));

        if (!DateTimeOffset.TryParse(
                request.Headers.IfModifiedSince,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal,
                out var since))
            return false;
        return lastModified.ToUniversalTime().AddTicks(-(lastModified.Ticks % TimeSpan.TicksPerSecond)) <= since.ToUniversalTime();
    }

    private static bool IfRangeAllowsRange(string? ifRange, string etag, DateTimeOffset lastModified)
    {
        if (string.IsNullOrWhiteSpace(ifRange)) return true;
        var value = ifRange.Trim();
        if (value.StartsWith('"') || value.StartsWith("W/", StringComparison.OrdinalIgnoreCase))
            return NormalizeWeakEtag(value).Equals(etag, StringComparison.Ordinal);
        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) &&
            lastModified.ToUniversalTime().AddTicks(-(lastModified.Ticks % TimeSpan.TicksPerSecond)) <= date.ToUniversalTime();
    }

    private static string NormalizeWeakEtag(string value) =>
        value.StartsWith("W/", StringComparison.OrdinalIgnoreCase) ? value[2..].Trim() : value.Trim();

    private static ParsedRange ParseSingleRange(string? header, long sizeBytes)
    {
        if (string.IsNullOrWhiteSpace(header)) return ParsedRange.None;
        if (!header.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase) || header.Contains(',')) return ParsedRange.Invalid;
        var pair = header[6..].Trim().Split('-', 2);
        if (pair.Length != 2) return ParsedRange.Invalid;

        if (pair[0].Length == 0)
        {
            if (!long.TryParse(pair[1], NumberStyles.None, CultureInfo.InvariantCulture, out var suffix) || suffix <= 0)
                return ParsedRange.Invalid;
            suffix = Math.Min(suffix, sizeBytes);
            return new ParsedRange(new FileByteRange(sizeBytes - suffix, sizeBytes - 1), false);
        }

        if (!long.TryParse(pair[0], NumberStyles.None, CultureInfo.InvariantCulture, out var from) || from < 0 || from >= sizeBytes)
            return ParsedRange.Invalid;
        var to = sizeBytes - 1;
        if (pair[1].Length > 0 &&
            (!long.TryParse(pair[1], NumberStyles.None, CultureInfo.InvariantCulture, out to) || to < from))
            return ParsedRange.Invalid;
        to = Math.Min(to, sizeBytes - 1);
        return new ParsedRange(new FileByteRange(from, to), false);
    }

    private static string NormalizeContentType(string? value)
    {
        if (MediaTypeHeaderValue.TryParse(value, out var parsed) && !string.IsNullOrWhiteSpace(parsed.MediaType))
        {
            var normalized = parsed.MediaType.Trim().ToLowerInvariant();
            if (normalized.Length <= 80) return normalized;
        }
        return "application/octet-stream";
    }

    private static string NormalizeFileName(string? value, Guid id)
    {
        var normalized = Path.GetFileName(value?.Trim());
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > 240 || normalized.Any(char.IsControl))
            return $"file-{id:N}.bin";
        return normalized;
    }

    private sealed record FileByteRange(long From, long To);

    private readonly record struct ParsedRange(FileByteRange? Value, bool IsInvalid)
    {
        public static ParsedRange None => new(null, false);
        public static ParsedRange Invalid => new(null, true);
    }

    private sealed class StoredFileNotModifiedResult(string etag, DateTimeOffset lastModified) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.StatusCode = StatusCodes.Status304NotModified;
            httpContext.Response.Headers.CacheControl = "private,no-cache,must-revalidate";
            httpContext.Response.Headers.ETag = etag;
            httpContext.Response.Headers.LastModified = lastModified.ToUniversalTime().ToString("R", CultureInfo.InvariantCulture);
            return Task.CompletedTask;
        }
    }

    private sealed class StoredFileRelayResult(
        FileStoreReadHandle handle,
        FileByteRange? range,
        long totalSize,
        string contentType,
        string fileName,
        string etag,
        DateTimeOffset lastModified) : IResult
    {
        public async Task ExecuteAsync(HttpContext httpContext)
        {
            try
            {
                var response = httpContext.Response;
                response.StatusCode = range is not null ? StatusCodes.Status206PartialContent : StatusCodes.Status200OK;
                response.ContentType = contentType;
                response.ContentLength = range is not null ? range.To - range.From + 1 : totalSize;
                response.Headers.CacheControl = "private,no-cache,must-revalidate";
                response.Headers.AcceptRanges = "bytes";
                response.Headers.ETag = etag;
                response.Headers.LastModified = lastModified.ToUniversalTime().ToString("R", CultureInfo.InvariantCulture);
                if (range is not null)
                    response.Headers.ContentRange = $"bytes {range.From}-{range.To}/{totalSize}";

                var disposition = new ContentDispositionHeaderValue("attachment")
                {
                    FileName = $"\"{AsciiFileName(fileName)}\"",
                    FileNameStar = fileName
                };
                response.Headers.ContentDisposition = disposition.ToString();
                await handle.Content.CopyToAsync(response.Body, 128 * 1024, httpContext.RequestAborted);
            }
            finally
            {
                await handle.DisposeAsync();
            }
        }

        private static string AsciiFileName(string value)
        {
            var chars = value.Select(character => character is >= (char)32 and <= (char)126 && character is not '"' and not '\\'
                ? character
                : '_').ToArray();
            return new string(chars);
        }
    }
}
