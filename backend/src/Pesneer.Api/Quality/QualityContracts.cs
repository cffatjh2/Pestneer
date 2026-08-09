using System.Text.Json;

namespace Pesneer.Api.Quality;

public sealed record QualityLocationResponse(
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    string Address);

public sealed record CreateTrendAnalysisRequest(
    Guid CustomerId,
    Guid? BranchId,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string? Title,
    string? Findings,
    string? Recommendations);

public sealed record RiskAnswerInput(
    string Code,
    string Category,
    string Question,
    int Score,
    string? Note,
    string? Recommendation);

public sealed record RiskMatrixInput(
    string Location,
    string PestCategory,
    int Severity,
    int Likelihood,
    string? Note);

public sealed record CreateRiskAnalysisRequest(
    Guid CustomerId,
    Guid? BranchId,
    DateOnly AssessmentDate,
    string? Title,
    string? Findings,
    string? CorrectiveActions,
    string? Recommendations,
    string? SectorType,
    string? CurrentFrequency,
    IReadOnlyList<RiskMatrixInput> RiskMatrix,
    IReadOnlyList<RiskAnswerInput> Answers);

public sealed record QualityAnalysisResponse(
    Guid Id,
    string Number,
    string AnalysisType,
    string TemplateCode,
    string Title,
    string Status,
    Guid CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    int? Score,
    string? Level,
    string? Summary,
    string? Findings,
    string? Recommendations,
    string CreatedBy,
    DateTimeOffset CreatedAt,
    JsonElement Payload,
    Guid? DocumentId);

public sealed record QualityDocumentResponse(
    Guid Id,
    string Category,
    string Title,
    string? Description,
    string FileName,
    string ContentType,
    long SizeBytes,
    Guid? CustomerId,
    string CustomerName,
    Guid? BranchId,
    string BranchName,
    string CreatedBy,
    DateTimeOffset CreatedAt,
    Guid? AnalysisId,
    string? AnalysisType,
    string DownloadUrl);
