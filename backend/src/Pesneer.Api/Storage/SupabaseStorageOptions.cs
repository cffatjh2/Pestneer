namespace Pesneer.Api.Storage;

public sealed class SupabaseStorageOptions
{
    public const string SectionName = "SupabaseStorage";
    public const long DefaultResumableThresholdBytes = 6L * 1024 * 1024;
    public const long DefaultTusChunkSizeBytes = 6L * 1024 * 1024;

    public bool Enabled { get; set; }
    public string Url { get; set; } = string.Empty;
    public string ServiceRoleKey { get; set; } = string.Empty;
    public string Bucket { get; set; } = "pesneer-private";
    public string? ResumableUploadUrl { get; set; }
    public long MaximumFileSizeBytes { get; set; } = 160L * 1024 * 1024;
    public long ResumableThresholdBytes { get; set; } = DefaultResumableThresholdBytes;
    public int DownloadTicketSeconds { get; set; } = 300;
    public int UploadSessionMinutes { get; set; } = 120;
    public int PendingRetentionMinutes { get; set; } = 180;
    public int CleanupIntervalMinutes { get; set; } = 15;
    public int CleanupBatchSize { get; set; } = 25;
    public bool BackfillEnabled { get; set; }
    public string[] BackfillCompanyIds { get; set; } = [];
    public bool HybridDualWriteEnabled { get; set; }
    public bool HybridReadEnabled { get; set; }
    public bool StorageOnlyWritesEnabled { get; set; }
    public string[] HybridCompanyIds { get; set; } = [];
    public int HybridWriteTimeoutSeconds { get; set; } = 30;
    public int MaximumActivePendingSessionsPerCompany { get; set; } = 20;
    public long MaximumActivePendingBytesPerCompany { get; set; } = 512L * 1024 * 1024;
    public int BackfillIntervalMinutes { get; set; } = 15;
    public int BackfillBatchSize { get; set; } = 25;
    public long BackfillBatchBytes { get; set; } = 64L * 1024 * 1024;

    public bool IsConfigured => Enabled
        && Uri.TryCreate(Url, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && !string.IsNullOrWhiteSpace(ServiceRoleKey)
        && !string.IsNullOrWhiteSpace(Bucket);

    public int EffectiveDownloadTicketSeconds => Math.Clamp(DownloadTicketSeconds, 30, 300);
    public int EffectiveUploadSessionMinutes => Math.Clamp(UploadSessionMinutes, 5, 120);
    public int EffectivePendingRetentionMinutes => Math.Max(PendingRetentionMinutes, EffectiveUploadSessionMinutes + 15);
    public int EffectiveCleanupIntervalMinutes => Math.Clamp(CleanupIntervalMinutes, 5, 60);
    public int EffectiveCleanupBatchSize => Math.Clamp(CleanupBatchSize, 1, 25);
    public int EffectiveBackfillIntervalMinutes => Math.Clamp(BackfillIntervalMinutes, 5, 60);
    public int EffectiveBackfillBatchSize => Math.Clamp(BackfillBatchSize, 1, 25);
    public long EffectiveBackfillBatchBytes => Math.Clamp(BackfillBatchBytes, 1L * 1024 * 1024, 64L * 1024 * 1024);
    public int EffectiveHybridWriteTimeoutSeconds => Math.Clamp(HybridWriteTimeoutSeconds, 5, 60);
    public int EffectiveMaximumActivePendingSessionsPerCompany => Math.Clamp(MaximumActivePendingSessionsPerCompany, 1, 100);
    public long EffectiveMaximumActivePendingBytesPerCompany => Math.Clamp(
        MaximumActivePendingBytesPerCompany,
        16L * 1024 * 1024,
        4L * 1024 * 1024 * 1024);

    public Guid[] GetBackfillCompanyIds() => ParseCompanyIds(BackfillCompanyIds);
    public Guid[] GetHybridCompanyIds() => ParseCompanyIds(HybridCompanyIds);
    public bool IsHybridCompanyAllowed(Guid companyId) => GetHybridCompanyIds().Contains(companyId);

    private static Guid[] ParseCompanyIds(IEnumerable<string>? values) => (values ?? [])
        .Select(value => Guid.TryParse(value?.Trim(), out var id) ? id : Guid.Empty)
        .Where(id => id != Guid.Empty)
        .Distinct()
        .ToArray();
}
