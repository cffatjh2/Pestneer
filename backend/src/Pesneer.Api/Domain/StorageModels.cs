namespace Pesneer.Api.Domain;

public enum StoredObjectState
{
    Pending = 1,
    Ready = 2,
    Deleting = 3
}

/// <summary>
/// Metadata for one immutable, company-scoped object in private object storage.
/// The object bytes intentionally remain outside PostgreSQL.
/// </summary>
public sealed class StoredObject : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public required string Sha256 { get; set; }
    public long SizeBytes { get; set; }
    public required string ContentType { get; set; }
    public required string StorageKey { get; set; }
    public required string InitialFileName { get; set; }
    public StoredObjectState State { get; set; } = StoredObjectState.Pending;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? VerifiedAt { get; set; }
    public ICollection<StoredObjectUploadSession> UploadSessions { get; set; } = [];
}

/// <summary>
/// A short-lived, idempotent authorization record for a direct private-storage upload.
/// The raw idempotency key is never persisted.
/// </summary>
public sealed class StoredObjectUploadSession : ICompanyScoped
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid StoredObjectId { get; set; }
    public required string FileName { get; set; }
    public required string IdempotencyKeyHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public StoredObject StoredObject { get; set; } = null!;
}
