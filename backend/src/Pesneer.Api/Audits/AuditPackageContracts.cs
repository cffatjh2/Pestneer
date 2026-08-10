using Pesneer.Api.Domain;

namespace Pesneer.Api.Audits;

public sealed record AuditPackageFilterRequest(
    Guid CustomerId,
    Guid? BranchId,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string AuditProfile,
    bool IncludeOptionalWaste);

public sealed record CreateAuditPackageRequest(
    Guid CustomerId,
    Guid? BranchId,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string AuditProfile,
    bool IncludeOptionalWaste,
    bool AcknowledgeWarnings);

public sealed record AuditPreflightIssueResponse(
    string Code,
    string Severity,
    string Title,
    string Detail,
    string? SuggestedAction);

public sealed record AuditSectionResponse(
    string Code,
    string Label,
    int ItemCount,
    string Status);

public sealed record AuditPreflightResponse(
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string AuditProfile,
    int ReadinessScore,
    bool Ready,
    int BlockingIssueCount,
    int WarningCount,
    int EvidenceCount,
    long EstimatedSizeBytes,
    IReadOnlyList<AuditPreflightIssueResponse> Issues,
    IReadOnlyList<AuditSectionResponse> Sections);

public sealed record AuditPackageItemResponse(
    Guid Id,
    string Section,
    string SourceType,
    Guid? SourceId,
    string DocumentNumber,
    string Title,
    string FileName,
    string ContentType,
    string? Revision,
    string? Scope,
    DateTimeOffset SourceDate,
    string Sha256,
    long SizeBytes,
    string DownloadUrl);

public sealed record AuditPackageResponse(
    Guid Id,
    string Number,
    string Title,
    string AuditProfile,
    string Status,
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    bool IncludeOptionalWaste,
    int ReadinessScore,
    int ItemCount,
    string CreatedBy,
    DateTimeOffset CreatedAt,
    string PdfSha256,
    string ZipSha256,
    string PdfDownloadUrl,
    string ZipDownloadUrl,
    IReadOnlyList<AuditPackageItemResponse> Items);

internal sealed record AuditEvidenceFile(
    string Section,
    string SectionLabel,
    string SourceType,
    Guid? SourceId,
    string DocumentNumber,
    string Title,
    string FileName,
    string ContentType,
    string? Revision,
    string? Scope,
    DateTimeOffset SourceDate,
    byte[] Data,
    string Sha256);

internal sealed record AuditBuildSnapshot(
    Company Company,
    Customer Customer,
    CustomerBranch? Branch,
    Account CreatedBy,
    AuditPackageFilterRequest Filter,
    AuditPreflightResponse Preflight,
    IReadOnlyList<AuditEvidenceFile> Evidence,
    IReadOnlyList<CustomerContract> Contracts,
    IReadOnlyList<ServiceReport> Reports,
    IReadOnlyList<SitePlan> SitePlans,
    IReadOnlyList<QualityAnalysis> Analyses,
    IReadOnlyList<CorrectiveAction> CorrectiveActions,
    IReadOnlyList<QualityInspection> Inspections,
    IReadOnlyList<WasteDisposalRecord> WasteRecords);

internal sealed record AuditManifestEntry(
    string Section,
    string SourceType,
    Guid? SourceId,
    string DocumentNumber,
    string Title,
    string FileName,
    string ContentType,
    string? Revision,
    string? Scope,
    DateTimeOffset SourceDate,
    long SizeBytes,
    string Sha256);

internal sealed record AuditManifest(
    string PackageNumber,
    string AuditProfile,
    Guid CompanyId,
    string CompanyName,
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    int ReadinessScore,
    DateTimeOffset CreatedAt,
    IReadOnlyList<AuditManifestEntry> Items);
