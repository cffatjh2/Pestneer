using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Storage;

public sealed class PendingFileCleanupWorker(
    IServiceScopeFactory scopeFactory,
    IFileStore fileStore,
    IOptions<SupabaseStorageOptions> optionsAccessor,
    ILogger<PendingFileCleanupWorker> logger) : BackgroundService
{
    private readonly SupabaseStorageOptions _options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!fileStore.IsConfigured) return;

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(_options.EffectiveCleanupIntervalMinutes));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    "Private storage pending-object cleanup batch failed with exception type {ExceptionType}",
                    exception.GetType().Name);
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken)) return;
        }
    }

    private async Task CleanupBatchAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now.AddMinutes(-_options.EffectivePendingRetentionMinutes);
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
        var cleanupBatchSize = _options.EffectiveCleanupBatchSize;
        var candidateQuery = dbContext.StoredObjects.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.State == StoredObjectState.Deleting || item.State == StoredObjectState.Pending);
        var candidates = dbContext.Database.IsSqlite()
            ? (await candidateQuery.OrderBy(item => item.Id)
                .Select(item => new { item.Id, item.CompanyId, item.State, item.CreatedAt })
                .ToArrayAsync(cancellationToken))
                .Where(item => item.State == StoredObjectState.Deleting || item.CreatedAt < cutoff)
                .Take(cleanupBatchSize)
                .Select(item => new CleanupCandidate(item.Id, item.CompanyId))
                .ToArray()
            : await candidateQuery
                .Where(item => item.State == StoredObjectState.Deleting ||
                    (item.CreatedAt < cutoff &&
                     !dbContext.StoredObjectUploadSessions.IgnoreQueryFilters()
                         .Any(session => session.StoredObjectId == item.Id && session.ExpiresAt > now)))
                .OrderBy(item => item.CreatedAt)
                .Take(cleanupBatchSize)
                .Select(item => new CleanupCandidate(item.Id, item.CompanyId))
                .ToArrayAsync(cancellationToken);

        var deletedCount = 0;
        foreach (var candidate in candidates)
        {
            if (await CleanupOneAsync(candidate.Id, candidate.CompanyId, cutoff, cancellationToken))
                deletedCount++;
        }

        if (deletedCount > 0)
            logger.LogInformation("Private storage cleanup removed {ObjectCount} expired pending objects", deletedCount);
    }

    private async Task<bool> CleanupOneAsync(
        Guid storedObjectId,
        Guid companyId,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PesneerDbContext>();
        var storedObject = await dbContext.StoredObjects.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.Id == storedObjectId && item.CompanyId == companyId, cancellationToken);
        if (storedObject is null || storedObject.State == StoredObjectState.Ready) return false;
        if (storedObject.State == StoredObjectState.Pending && storedObject.CreatedAt >= cutoff) return false;
        if (storedObject.State == StoredObjectState.Pending)
        {
            var expirations = await dbContext.StoredObjectUploadSessions.IgnoreQueryFilters().AsNoTracking()
                .Where(session => session.StoredObjectId == storedObject.Id)
                .Select(session => session.ExpiresAt)
                .ToArrayAsync(cancellationToken);
            if (expirations.Any(expiration => expiration > DateTimeOffset.UtcNow)) return false;
        }

        if (storedObject.State != StoredObjectState.Deleting)
        {
            storedObject.State = StoredObjectState.Deleting;
            await dbContext.SaveFileStorageMaintenanceChangesAsync(companyId, cancellationToken);
        }

        try
        {
            await fileStore.DeleteAsync(storedObject.StorageKey, cancellationToken);
        }
        catch (FileStoreRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            // The database state is the remaining orphan; deletion is already complete remotely.
        }
        catch (FileStoreRequestException exception)
        {
            logger.LogWarning(
                "Private storage pending-object deletion failed with status {StorageStatusCode}",
                (int)exception.StatusCode);
            return false;
        }

        dbContext.StoredObjects.Remove(storedObject);
        await dbContext.SaveFileStorageMaintenanceChangesAsync(companyId, cancellationToken);
        return true;
    }

    private sealed record CleanupCandidate(Guid Id, Guid CompanyId);
}
