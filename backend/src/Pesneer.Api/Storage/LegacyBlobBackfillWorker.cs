using System.Buffers;
using System.Net;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Storage;

/// <summary>
/// Disabled-by-default bridge that copies legacy PostgreSQL blobs to private Storage.
/// It only sets nullable StoredObject references and never clears or rewrites legacy bytes.
/// </summary>
public sealed class LegacyBlobBackfillWorker(
    IServiceScopeFactory scopeFactory,
    IFileStore fileStore,
    IOptions<SupabaseStorageOptions> optionsAccessor,
    ILogger<LegacyBlobBackfillWorker> logger) : BackgroundService
{
    private readonly SupabaseStorageOptions _options = optionsAccessor.Value;
    private readonly Guid[] _backfillCompanyIds = optionsAccessor.Value.GetBackfillCompanyIds();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // An explicit non-empty tenant allowlist is mandatory. A global switch alone can never
        // start a cross-tenant migration.
        if (!_options.BackfillEnabled || !fileStore.IsConfigured || _backfillCompanyIds.Length == 0) return;

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(_options.EffectiveBackfillIntervalMinutes));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await BackfillBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    "Private storage legacy backfill batch failed with exception type {ExceptionType}",
                    exception.GetType().Name);
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken)) return;
        }
    }

    private async Task BackfillBatchAsync(CancellationToken cancellationToken)
    {
        var candidates = await FindCandidatesAsync(cancellationToken);
        var selected = new List<LegacyBlobCandidate>();
        long selectedBytes = 0;
        var oversizedCount = 0;
        foreach (var candidate in candidates.OrderBy(item => item.CreatedAt))
        {
            if (candidate.SizeBytes <= 0) continue;
            if (candidate.SizeBytes > _options.EffectiveBackfillBatchBytes)
            {
                oversizedCount++;
                continue;
            }
            if (selected.Count >= _options.EffectiveBackfillBatchSize ||
                selectedBytes + candidate.SizeBytes > _options.EffectiveBackfillBatchBytes)
                continue;
            selected.Add(candidate);
            selectedBytes += candidate.SizeBytes;
        }

        var completed = 0;
        foreach (var candidate in selected)
        {
            if (await BackfillOneAsync(candidate, cancellationToken)) completed++;
        }

        if (completed > 0 || oversizedCount > 0)
        {
            logger.LogInformation(
                "Private storage legacy backfill completed {CompletedCount} objects and skipped {OversizedCount} oversized objects in the batch",
                completed,
                oversizedCount);
        }
    }

    private async Task<IReadOnlyList<LegacyBlobCandidate>> FindCandidatesAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
        var take = _options.EffectiveBackfillBatchSize;
        var result = new List<LegacyBlobCandidate>(take * 8);

        result.AddRange(await dbContext.Companies.AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.Id) && item.LogoStoredObjectId == null && item.LogoData != null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.CompanyLogo, item.Id, item.Id, (long)item.LogoData!.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.WorkOrderPhotos.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.StoredObjectId == null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.WorkOrderPhoto, item.Id, item.CompanyId, (long)item.Data.Length, item.UploadedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.QualityDocuments.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.StoredObjectId == null && item.FileData != null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.QualityDocument, item.Id, item.CompanyId, (long)item.FileData!.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.AuditPackages.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.PdfStoredObjectId == null && item.PdfData != null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.AuditPdf, item.Id, item.CompanyId, (long)item.PdfData!.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.AuditPackages.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.ZipStoredObjectId == null && item.ZipData != null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.AuditZip, item.Id, item.CompanyId, (long)item.ZipData!.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.AuditPackageItems.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.StoredObjectId == null && item.FileData != null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.AuditItem, item.Id, item.CompanyId, (long)item.FileData!.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.CorrectiveActionEvidence.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.StoredObjectId == null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.CorrectiveEvidence, item.Id, item.CompanyId, (long)item.Data.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        result.AddRange(await dbContext.WasteDisposalEvidence.IgnoreQueryFilters().AsNoTracking()
            .Where(item => _backfillCompanyIds.Contains(item.CompanyId) && item.StoredObjectId == null)
            .OrderBy(item => item.Id).Take(take)
            .Select(item => new LegacyBlobCandidate(LegacyBlobKind.WasteEvidence, item.Id, item.CompanyId, (long)item.Data.Length, item.CreatedAt))
            .ToArrayAsync(cancellationToken));
        return result;
    }

    private async Task<bool> BackfillOneAsync(LegacyBlobCandidate candidate, CancellationToken cancellationToken)
    {
        if (!_backfillCompanyIds.Contains(candidate.CompanyId)) return false;
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
        var payload = await LoadPayloadAsync(dbContext, candidate, cancellationToken);
        if (payload is null || payload.Data.LongLength != candidate.SizeBytes) return false;

        var sha256 = Convert.ToHexString(SHA256.HashData(payload.Data)).ToLowerInvariant();
        var contentType = NormalizeContentType(payload.ContentType);
        var storedObject = await dbContext.StoredObjects.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.CompanyId == candidate.CompanyId && item.Sha256 == sha256, cancellationToken);
        if (storedObject?.State is StoredObjectState.Pending or StoredObjectState.Deleting) return false;
        if (storedObject is not null &&
            (storedObject.SizeBytes != payload.Data.LongLength ||
             !storedObject.ContentType.Equals(contentType, StringComparison.OrdinalIgnoreCase)))
            return false;

        if (storedObject is null)
        {
            storedObject = new StoredObject
            {
                Id = Guid.NewGuid(),
                CompanyId = candidate.CompanyId,
                Sha256 = sha256,
                SizeBytes = payload.Data.LongLength,
                ContentType = contentType,
                StorageKey = $"companies/{candidate.CompanyId:N}/{sha256[..2]}/{sha256}",
                InitialFileName = NormalizeFileName(payload.FileName, candidate.Id),
                State = StoredObjectState.Pending,
                CreatedAt = DateTimeOffset.UtcNow
            };
            dbContext.StoredObjects.Add(storedObject);
            try
            {
                await dbContext.SaveFileStorageBackfillChangesAsync(candidate.CompanyId, cancellationToken);
            }
            catch (DbUpdateException)
            {
                return false;
            }

            try
            {
                await using var source = new MemoryStream(payload.Data, writable: false);
                await fileStore.UploadAsync(
                    storedObject.StorageKey,
                    source,
                    storedObject.ContentType,
                    storedObject.SizeBytes,
                    cancellationToken);
            }
            catch (FileStoreRequestException exception) when (exception.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict)
            {
                // A previous interrupted attempt may already have placed the immutable object. Exact verification below decides.
            }
            catch (FileStoreRequestException exception)
            {
                logger.LogWarning(
                    "Private storage legacy upload failed with status {StorageStatusCode}",
                    (int)exception.StatusCode);
                return false;
            }

            if (!await VerifyRemoteAsync(storedObject, cancellationToken)) return false;
            storedObject.State = StoredObjectState.Ready;
            storedObject.VerifiedAt = DateTimeOffset.UtcNow;
        }

        LinkPayload(payload, storedObject.Id);
        await dbContext.SaveFileStorageBackfillChangesAsync(candidate.CompanyId, cancellationToken);
        return true;
    }

    private async Task<bool> VerifyRemoteAsync(StoredObject storedObject, CancellationToken cancellationToken)
    {
        try
        {
            await using var handle = await fileStore.OpenReadAsync(storedObject.StorageKey, cancellationToken);
            if (handle.ContentLength.HasValue && handle.ContentLength.Value != storedObject.SizeBytes) return false;

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

            if (total != storedObject.SizeBytes) return false;
            var actual = hash.GetHashAndReset();
            var expected = Convert.FromHexString(storedObject.Sha256);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FileStoreRequestException exception)
        {
            logger.LogWarning(
                "Private storage legacy verification failed with status {StorageStatusCode}",
                (int)exception.StatusCode);
            return false;
        }
    }

    private static async Task<LegacyBlobPayload?> LoadPayloadAsync(
        PesneerDbContext dbContext,
        LegacyBlobCandidate candidate,
        CancellationToken cancellationToken) => candidate.Kind switch
    {
        LegacyBlobKind.CompanyLogo => await dbContext.Companies
            .Where(item => item.Id == candidate.Id && item.LogoStoredObjectId == null && item.LogoData != null)
            .Select(item => new LegacyBlobPayload(item, item.LogoData!, item.LogoContentType, item.LogoFileName))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.WorkOrderPhoto => await dbContext.WorkOrderPhotos.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.StoredObjectId == null)
            .Select(item => new LegacyBlobPayload(item, item.Data, item.ContentType, item.FileName))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.QualityDocument => await dbContext.QualityDocuments.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.StoredObjectId == null && item.FileData != null)
            .Select(item => new LegacyBlobPayload(item, item.FileData!, item.ContentType, item.FileName))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.AuditPdf => await dbContext.AuditPackages.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.PdfStoredObjectId == null && item.PdfData != null)
            .Select(item => new LegacyBlobPayload(item, item.PdfData!, "application/pdf", item.Number + ".pdf"))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.AuditZip => await dbContext.AuditPackages.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.ZipStoredObjectId == null && item.ZipData != null)
            .Select(item => new LegacyBlobPayload(item, item.ZipData!, "application/zip", item.Number + ".zip"))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.AuditItem => await dbContext.AuditPackageItems.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.StoredObjectId == null && item.FileData != null)
            .Select(item => new LegacyBlobPayload(item, item.FileData!, item.ContentType, item.FileName))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.CorrectiveEvidence => await dbContext.CorrectiveActionEvidence.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.StoredObjectId == null)
            .Select(item => new LegacyBlobPayload(item, item.Data, item.ContentType, item.FileName))
            .SingleOrDefaultAsync(cancellationToken),
        LegacyBlobKind.WasteEvidence => await dbContext.WasteDisposalEvidence.IgnoreQueryFilters()
            .Where(item => item.Id == candidate.Id && item.CompanyId == candidate.CompanyId && item.StoredObjectId == null)
            .Select(item => new LegacyBlobPayload(item, item.Data, item.ContentType, item.FileName))
            .SingleOrDefaultAsync(cancellationToken),
        _ => null
    };

    private static void LinkPayload(LegacyBlobPayload payload, Guid storedObjectId)
    {
        switch (payload.Owner)
        {
            case Company company:
                company.LogoStoredObjectId = storedObjectId;
                break;
            case WorkOrderPhoto photo:
                photo.StoredObjectId = storedObjectId;
                break;
            case QualityDocument document:
                document.StoredObjectId = storedObjectId;
                break;
            case AuditPackage package when payload.ContentType == "application/pdf":
                package.PdfStoredObjectId = storedObjectId;
                break;
            case AuditPackage package:
                package.ZipStoredObjectId = storedObjectId;
                break;
            case AuditPackageItem item:
                item.StoredObjectId = storedObjectId;
                item.SizeBytes = payload.Data.LongLength;
                break;
            case CorrectiveActionEvidence evidence:
                evidence.StoredObjectId = storedObjectId;
                break;
            case WasteDisposalEvidence evidence:
                evidence.StoredObjectId = storedObjectId;
                break;
        }
    }

    private static string NormalizeContentType(string? value)
    {
        var normalized = value?.Split(';', 2)[0].Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) || normalized.Length > 80 ? "application/octet-stream" : normalized;
    }

    private static string NormalizeFileName(string? value, Guid id)
    {
        var normalized = Path.GetFileName(value?.Trim());
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > 240 || normalized.Any(char.IsControl))
            return $"legacy-{id:N}.bin";
        return normalized;
    }

    private enum LegacyBlobKind
    {
        CompanyLogo,
        WorkOrderPhoto,
        QualityDocument,
        AuditPdf,
        AuditZip,
        AuditItem,
        CorrectiveEvidence,
        WasteEvidence
    }

    private sealed record LegacyBlobCandidate(
        LegacyBlobKind Kind,
        Guid Id,
        Guid CompanyId,
        long SizeBytes,
        DateTimeOffset CreatedAt);

    private sealed record LegacyBlobPayload(
        object Owner,
        byte[] Data,
        string? ContentType,
        string? FileName);
}
