using System.Buffers;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Storage;

public static class FileStorageEndpoints
{
    private const long TusChunkSizeBytes = SupabaseStorageOptions.DefaultTusChunkSizeBytes;
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/octet-stream",
        "application/pdf",
        "application/json",
        "application/xml",
        "application/zip",
        "application/x-zip-compressed",
        "application/msword",
        "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-word.document.macroenabled.12",
        "application/vnd.ms-excel.sheet.macroenabled.12",
        "application/vnd.ms-powerpoint.presentation.macroenabled.12",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/csv",
        "text/plain",
        "text/xml"
    };

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".bin", ".csv", ".doc", ".docm", ".docx", ".json", ".jpeg", ".jpg", ".ods", ".odt",
        ".odp", ".onnx", ".pdf", ".png", ".ppt", ".pptm", ".pptx", ".txt", ".webp", ".xls",
        ".xlsm", ".xlsx", ".xml", ".zip"
    };

    public static IEndpointRouteBuilder MapFileStorageEndpoints(this IEndpointRouteBuilder app)
    {
        // Generic object operations are owner-only because they are not yet bound to an operational
        // resource. Employee/customer flows must use a resource-specific endpoint that verifies ownership.
        var files = app.MapGroup("/api/v2/files").RequireAuthorization("OwnerPortal");
        files.MapGet("/capabilities", GetCapabilities);
        files.MapPost("/upload-sessions", CreateUploadSessionAsync);
        files.MapPost("/upload-sessions/{uploadId:guid}/complete", CompleteUploadSessionAsync);
        files.MapGet("/{storedObjectId:guid}/download-ticket", CreateDownloadTicketAsync);
        return app;
    }

    private static async Task<IResult> CreateUploadSessionAsync(
        CreateFileUploadSessionRequest request,
        HttpRequest httpRequest,
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IFileStore fileStore,
        IOptions<SupabaseStorageOptions> optionsAccessor,
        CancellationToken cancellationToken)
    {
        if (!companyContext.CompanyId.HasValue) return Results.Forbid();

        var options = optionsAccessor.Value;
        if (!IsDirectUploadEnabled(
                dbContext,
                companyContext.CompanyId.Value,
                fileStore,
                options))
            return StorageUnavailable();
        var validation = ValidateUploadRequest(request, httpRequest, options);
        if (validation.Errors.Count > 0) return Results.ValidationProblem(validation.Errors);

        var companyId = companyContext.CompanyId.Value;
        var now = DateTimeOffset.UtcNow;
        var idempotencyHash = HashIdempotencyKey(validation.IdempotencyKey!);
        var existingSession = await dbContext.StoredObjectUploadSessions
            .Include(item => item.StoredObject)
            .SingleOrDefaultAsync(item => item.IdempotencyKeyHash == idempotencyHash, cancellationToken);

        if (existingSession is not null)
        {
            if (!MatchesRequest(existingSession, validation))
                return Conflict("Aynı Idempotency-Key farklı bir dosya isteği için kullanılamaz.");

            if (existingSession.StoredObject.State == StoredObjectState.Pending && existingSession.ExpiresAt <= now)
            {
                existingSession.ExpiresAt = now.AddMinutes(options.EffectiveUploadSessionMinutes);
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return await CreateSessionResultAsync(existingSession, fileStore, options, false, cancellationToken);
        }

        var storedObject = await dbContext.StoredObjects
            .SingleOrDefaultAsync(item => item.Sha256 == validation.Sha256, cancellationToken);
        if (storedObject?.State == StoredObjectState.Deleting)
            return Conflict("Aynı içerik için depolama temizliği sürüyor; istek daha sonra tekrar denenmelidir.");
        if (storedObject is not null &&
            (storedObject.SizeBytes != validation.SizeBytes ||
             !storedObject.ContentType.Equals(validation.ContentType, StringComparison.OrdinalIgnoreCase)))
            return Conflict("Aynı SHA-256 değeri farklı dosya metadatasıyla kullanılamaz.");

        if (storedObject?.State != StoredObjectState.Ready)
        {
            var pendingUsage = await GetPendingUsageAsync(dbContext, now, cancellationToken);
            var additionalBytes = storedObject is null ? validation.SizeBytes : 0;
            if (pendingUsage.ActiveSessionCount >= options.EffectiveMaximumActivePendingSessionsPerCompany ||
                pendingUsage.DistinctPendingBytes + additionalBytes > options.EffectiveMaximumActivePendingBytesPerCompany)
                return PendingQuotaExceeded();
        }

        storedObject ??= new StoredObject
        {
            Id = Guid.NewGuid(),
            CompanyId = companyId,
            Sha256 = validation.Sha256!,
            SizeBytes = validation.SizeBytes,
            ContentType = validation.ContentType!,
            StorageKey = BuildStorageKey(companyId, validation.Sha256!),
            InitialFileName = validation.FileName!,
            State = StoredObjectState.Pending,
            CreatedAt = now
        };

        var session = new StoredObjectUploadSession
        {
            Id = Guid.NewGuid(),
            CompanyId = companyId,
            StoredObjectId = storedObject.Id,
            StoredObject = storedObject,
            FileName = validation.FileName!,
            IdempotencyKeyHash = idempotencyHash,
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(options.EffectiveUploadSessionMinutes),
            CompletedAt = storedObject.State == StoredObjectState.Ready ? now : null
        };

        if (dbContext.Entry(storedObject).State == EntityState.Detached)
            dbContext.StoredObjects.Add(storedObject);
        dbContext.StoredObjectUploadSessions.Add(session);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A concurrent request may have won either tenant-local SHA or idempotency uniqueness.
            // Returning a retryable conflict avoids guessing which uncommitted object should be used.
            dbContext.ChangeTracker.Clear();
            return Results.Problem(
                title: "Eşzamanlı dosya isteği algılandı.",
                detail: "Aynı Idempotency-Key ile istek güvenli biçimde tekrar gönderilebilir.",
                statusCode: StatusCodes.Status409Conflict);
        }

        return await CreateSessionResultAsync(session, fileStore, options, true, cancellationToken);
    }

    private static IResult GetCapabilities(
        PesneerDbContext dbContext,
        ICompanyContext companyContext,
        IFileStore fileStore,
        IOptions<SupabaseStorageOptions> optionsAccessor)
    {
        var options = optionsAccessor.Value;
        var enabled = companyContext.CompanyId.HasValue && IsDirectUploadEnabled(
            dbContext,
            companyContext.CompanyId.Value,
            fileStore,
            options);
        return Results.Ok(new
        {
            directUploadEnabled = enabled,
            resumableThresholdBytes = Math.Max(1, options.ResumableThresholdBytes),
            chunkSizeBytes = TusChunkSizeBytes,
            maximumFileSizeBytes = Math.Clamp(options.MaximumFileSizeBytes, 1, 512L * 1024 * 1024)
        });
    }

    private static bool IsDirectUploadEnabled(
        PesneerDbContext dbContext,
        Guid companyId,
        IFileStore fileStore,
        SupabaseStorageOptions options) =>
        dbContext.Database.IsNpgsql() &&
        fileStore.IsConfigured &&
        options.StorageOnlyWritesEnabled &&
        options.HybridReadEnabled &&
        options.IsHybridCompanyAllowed(companyId);

    private static async Task<IResult> CreateSessionResultAsync(
        StoredObjectUploadSession session,
        IFileStore fileStore,
        SupabaseStorageOptions options,
        bool created,
        CancellationToken cancellationToken)
    {
        if (session.StoredObject.State == StoredObjectState.Ready)
        {
            var available = new FileUploadSessionResponse(
                session.Id,
                null,
                "none",
                null,
                null,
                null,
                null,
                session.ExpiresAt,
                true,
                ToDescriptor(session.StoredObject, session.FileName));
            return created
                ? Results.Created($"/api/v2/files/upload-sessions/{session.Id}/complete", available)
                : Results.Ok(available);
        }

        try
        {
            var grant = await fileStore.CreateSignedUploadAsync(session.StoredObject.StorageKey, cancellationToken);
            var resumable = session.StoredObject.SizeBytes > Math.Max(1, options.ResumableThresholdBytes);
            var requiredHeaders = resumable
                ? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["x-signature"] = grant.Token
                }
                : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["content-type"] = session.StoredObject.ContentType,
                    ["cache-control"] = "max-age=300"
                };
            var response = new FileUploadSessionResponse(
                session.Id,
                resumable ? fileStore.ResumableUploadUrl.ToString() : grant.Url.ToString(),
                resumable ? "TUS" : "PUT",
                resumable ? grant.Token : null,
                resumable ? session.StoredObject.StorageKey : null,
                resumable ? fileStore.BucketName : null,
                resumable ? TusChunkSizeBytes : null,
                session.ExpiresAt,
                false,
                null,
                requiredHeaders);
            return created
                ? Results.Created($"/api/v2/files/upload-sessions/{session.Id}/complete", response)
                : Results.Ok(response);
        }
        catch (FileStoreUnavailableException)
        {
            return StorageUnavailable();
        }
        catch (FileStoreRequestException)
        {
            return StorageGatewayFailure();
        }
    }

    private static async Task<IResult> CompleteUploadSessionAsync(
        Guid uploadId,
        PesneerDbContext dbContext,
        IFileStore fileStore,
        CancellationToken cancellationToken)
    {
        if (!fileStore.IsConfigured) return StorageUnavailable();
        var session = await dbContext.StoredObjectUploadSessions
            .Include(item => item.StoredObject)
            .SingleOrDefaultAsync(item => item.Id == uploadId, cancellationToken);
        if (session is null) return Results.NotFound(new { message = "Yükleme oturumu bulunamadı." });

        if (session.StoredObject.State == StoredObjectState.Ready)
        {
            if (!session.CompletedAt.HasValue)
            {
                session.CompletedAt = session.StoredObject.VerifiedAt ?? DateTimeOffset.UtcNow;
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            return Results.Ok(new CompleteFileUploadResponse(ToDescriptor(session.StoredObject, session.FileName)));
        }
        if (session.StoredObject.State == StoredObjectState.Deleting)
            return Conflict("Dosya yükleme oturumu temizleniyor.");
        if (session.ExpiresAt <= DateTimeOffset.UtcNow)
            return Results.Problem(title: "Yükleme oturumunun süresi doldu.", statusCode: StatusCodes.Status410Gone);

        FileVerificationResult verification;
        try
        {
            await using var handle = await fileStore.OpenReadAsync(session.StoredObject.StorageKey, cancellationToken);
            verification = await VerifyAsync(session.StoredObject, handle, cancellationToken);
        }
        catch (FileStoreRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return Conflict("Storage yüklemesi henüz tamamlanmamış.");
        }
        catch (FileStoreUnavailableException)
        {
            return StorageUnavailable();
        }
        catch (FileStoreRequestException)
        {
            return StorageGatewayFailure();
        }

        if (!verification.IsValid)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [verification.Error!] });

        var verifiedAt = DateTimeOffset.UtcNow;
        session.StoredObject.State = StoredObjectState.Ready;
        session.StoredObject.VerifiedAt = verifiedAt;
        session.CompletedAt = verifiedAt;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(new CompleteFileUploadResponse(ToDescriptor(session.StoredObject, session.FileName)));
    }

    private static async Task<IResult> CreateDownloadTicketAsync(
        Guid storedObjectId,
        PesneerDbContext dbContext,
        IFileStore fileStore,
        IOptions<SupabaseStorageOptions> optionsAccessor,
        CancellationToken cancellationToken)
    {
        if (!fileStore.IsConfigured) return StorageUnavailable();
        var storedObject = await dbContext.StoredObjects.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == storedObjectId, cancellationToken);
        if (storedObject is null || storedObject.State != StoredObjectState.Ready)
            return Results.NotFound(new { message = "Dosya bulunamadı." });

        var lifetimeSeconds = optionsAccessor.Value.EffectiveDownloadTicketSeconds;
        try
        {
            var grant = await fileStore.CreateSignedDownloadAsync(
                storedObject.StorageKey,
                storedObject.InitialFileName,
                TimeSpan.FromSeconds(lifetimeSeconds),
                cancellationToken);
            return Results.Ok(new FileDownloadTicketResponse(
                grant.Url.ToString(),
                DateTimeOffset.UtcNow.AddSeconds(lifetimeSeconds),
                ToDescriptor(storedObject, storedObject.InitialFileName)));
        }
        catch (FileStoreUnavailableException)
        {
            return StorageUnavailable();
        }
        catch (FileStoreRequestException)
        {
            return StorageGatewayFailure();
        }
    }

    private static UploadValidationResult ValidateUploadRequest(
        CreateFileUploadSessionRequest request,
        HttpRequest httpRequest,
        SupabaseStorageOptions options)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        var fileName = CleanFileName(request.FileName);
        if (fileName is null) errors["fileName"] = ["Geçerli ve yalnız dosya adını içeren bir ad gönderilmelidir."];

        var contentType = NormalizeContentType(request.ContentType);
        if (contentType is null || !AllowedContentTypes.Contains(contentType))
            errors["contentType"] = ["Bu dosya içerik türüne izin verilmiyor."];
        if (fileName is not null && contentType is not null && !IsExtensionCompatible(fileName, contentType))
            errors["fileName"] = ["Dosya uzantısı ile içerik türü uyuşmuyor."];

        var maximumFileSize = Math.Clamp(options.MaximumFileSizeBytes, 1, 512L * 1024 * 1024);
        if (request.SizeBytes <= 0 || request.SizeBytes > maximumFileSize)
            errors["sizeBytes"] = [$"Dosya boyutu 1 ile {maximumFileSize} bayt arasında olmalıdır."];

        var sha256 = request.Sha256?.Trim().ToLowerInvariant();
        if (sha256 is null || sha256.Length != 64 || sha256.Any(character => !Uri.IsHexDigit(character)))
            errors["sha256"] = ["SHA-256 değeri 64 karakterlik hexadecimal biçimde olmalıdır."];

        var idempotencyKey = httpRequest.Headers["Idempotency-Key"].ToString().Trim();
        if (idempotencyKey.Length is < 8 or > 128 || idempotencyKey.Any(char.IsControl))
            errors["Idempotency-Key"] = ["8-128 karakterlik bir Idempotency-Key başlığı gönderilmelidir."];

        return new UploadValidationResult(errors, fileName, contentType, request.SizeBytes, sha256, idempotencyKey);
    }

    private static async Task<FileVerificationResult> VerifyAsync(
        StoredObject storedObject,
        FileStoreReadHandle handle,
        CancellationToken cancellationToken)
    {
        if (handle.ContentLength.HasValue && handle.ContentLength.Value != storedObject.SizeBytes)
            return FileVerificationResult.Invalid("Storage nesnesinin boyutu beklenen değerle uyuşmuyor.");

        var responseContentType = NormalizeContentType(handle.ContentType);
        if (responseContentType is not null &&
            !responseContentType.Equals("application/octet-stream", StringComparison.OrdinalIgnoreCase) &&
            !responseContentType.Equals(storedObject.ContentType, StringComparison.OrdinalIgnoreCase))
            return FileVerificationResult.Invalid("Storage nesnesinin içerik türü beklenen değerle uyuşmuyor.");

        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = ArrayPool<byte>.Shared.Rent(128 * 1024);
        var signature = new byte[32];
        var signatureLength = 0;
        long total = 0;
        try
        {
            while (true)
            {
                var read = await handle.Content.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                if (read == 0) break;
                if (signatureLength < signature.Length)
                {
                    var copyLength = Math.Min(read, signature.Length - signatureLength);
                    buffer.AsSpan(0, copyLength).CopyTo(signature.AsSpan(signatureLength));
                    signatureLength += copyLength;
                }
                hash.AppendData(buffer, 0, read);
                total += read;
                if (total > storedObject.SizeBytes)
                    return FileVerificationResult.Invalid("Storage nesnesinin boyutu beklenen değeri aşıyor.");
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }

        if (total != storedObject.SizeBytes)
            return FileVerificationResult.Invalid("Storage nesnesinin boyutu beklenen değerle uyuşmuyor.");
        var actualHash = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(actualHash),
                Encoding.ASCII.GetBytes(storedObject.Sha256)))
            return FileVerificationResult.Invalid("Storage nesnesinin SHA-256 özeti beklenen değerle uyuşmuyor.");
        if (!HasCompatibleSignature(storedObject.ContentType, signature.AsSpan(0, signatureLength)))
            return FileVerificationResult.Invalid("Dosya imzası bildirilen içerik türüyle uyuşmuyor.");

        return FileVerificationResult.Valid();
    }

    private static bool HasCompatibleSignature(string contentType, ReadOnlySpan<byte> signature)
    {
        if (contentType.Equals("application/octet-stream", StringComparison.OrdinalIgnoreCase)) return true;
        if (contentType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase)) return signature.StartsWith("%PDF-"u8);
        if (contentType.Equals("image/png", StringComparison.OrdinalIgnoreCase))
            return signature.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
        if (contentType.Equals("image/jpeg", StringComparison.OrdinalIgnoreCase))
            return signature.Length >= 3 && signature[0] == 0xFF && signature[1] == 0xD8 && signature[2] == 0xFF;
        if (contentType.Equals("image/webp", StringComparison.OrdinalIgnoreCase))
            return signature.Length >= 12 && signature[..4].SequenceEqual("RIFF"u8) && signature.Slice(8, 4).SequenceEqual("WEBP"u8);
        if (contentType is "application/msword" or "application/vnd.ms-excel" or "application/vnd.ms-powerpoint")
            return signature.StartsWith(new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 });
        if (IsZipBasedContentType(contentType))
            return signature.Length >= 4 && signature[0] == 0x50 && signature[1] == 0x4B &&
                ((signature[2] == 0x03 && signature[3] == 0x04) ||
                 (signature[2] == 0x05 && signature[3] == 0x06) ||
                 (signature[2] == 0x07 && signature[3] == 0x08));
        if (contentType.StartsWith("text/", StringComparison.OrdinalIgnoreCase) ||
            contentType is "application/json" or "application/xml")
            return !signature.Contains((byte)0);
        return false;
    }

    private static bool IsExtensionCompatible(string fileName, string contentType)
    {
        var extension = Path.GetExtension(fileName);
        if (!AllowedExtensions.Contains(extension)) return false;
        return contentType.ToLowerInvariant() switch
        {
            "application/pdf" => extension.Equals(".pdf", StringComparison.OrdinalIgnoreCase),
            "image/png" => extension.Equals(".png", StringComparison.OrdinalIgnoreCase),
            "image/jpeg" => extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase) || extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase),
            "image/webp" => extension.Equals(".webp", StringComparison.OrdinalIgnoreCase),
            "text/csv" => extension.Equals(".csv", StringComparison.OrdinalIgnoreCase),
            "text/plain" => extension.Equals(".txt", StringComparison.OrdinalIgnoreCase),
            "text/xml" or "application/xml" => extension.Equals(".xml", StringComparison.OrdinalIgnoreCase),
            "application/json" => extension.Equals(".json", StringComparison.OrdinalIgnoreCase),
            "application/zip" or "application/x-zip-compressed" => extension.Equals(".zip", StringComparison.OrdinalIgnoreCase),
            "application/msword" => extension.Equals(".doc", StringComparison.OrdinalIgnoreCase),
            "application/vnd.ms-excel" => extension.Equals(".xls", StringComparison.OrdinalIgnoreCase),
            "application/vnd.ms-powerpoint" => extension.Equals(".ppt", StringComparison.OrdinalIgnoreCase),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => extension.Equals(".docx", StringComparison.OrdinalIgnoreCase),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => extension.Equals(".xlsx", StringComparison.OrdinalIgnoreCase),
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" => extension.Equals(".pptx", StringComparison.OrdinalIgnoreCase),
            "application/vnd.ms-word.document.macroenabled.12" => extension.Equals(".docm", StringComparison.OrdinalIgnoreCase),
            "application/vnd.ms-excel.sheet.macroenabled.12" => extension.Equals(".xlsm", StringComparison.OrdinalIgnoreCase),
            "application/vnd.ms-powerpoint.presentation.macroenabled.12" => extension.Equals(".pptm", StringComparison.OrdinalIgnoreCase),
            "application/vnd.oasis.opendocument.text" => extension.Equals(".odt", StringComparison.OrdinalIgnoreCase),
            "application/vnd.oasis.opendocument.spreadsheet" => extension.Equals(".ods", StringComparison.OrdinalIgnoreCase),
            "application/vnd.oasis.opendocument.presentation" => extension.Equals(".odp", StringComparison.OrdinalIgnoreCase),
            "application/octet-stream" => true,
            _ => false
        };
    }

    private static bool IsZipBasedContentType(string contentType) => contentType is
        "application/zip" or
        "application/x-zip-compressed" or
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" or
        "application/vnd.ms-word.document.macroenabled.12" or
        "application/vnd.ms-excel.sheet.macroenabled.12" or
        "application/vnd.ms-powerpoint.presentation.macroenabled.12" or
        "application/vnd.oasis.opendocument.text" or
        "application/vnd.oasis.opendocument.spreadsheet" or
        "application/vnd.oasis.opendocument.presentation";

    private static bool MatchesRequest(StoredObjectUploadSession session, UploadValidationResult request) =>
        session.FileName.Equals(request.FileName, StringComparison.Ordinal) &&
        session.StoredObject.Sha256.Equals(request.Sha256, StringComparison.Ordinal) &&
        session.StoredObject.SizeBytes == request.SizeBytes &&
        session.StoredObject.ContentType.Equals(request.ContentType, StringComparison.OrdinalIgnoreCase);

    private static FileDescriptor ToDescriptor(StoredObject storedObject, string fileName) => new(
        storedObject.Id,
        fileName,
        storedObject.ContentType,
        storedObject.SizeBytes,
        storedObject.Sha256,
        storedObject.VerifiedAt ?? storedObject.CreatedAt);

    private static string BuildStorageKey(Guid companyId, string sha256) =>
        $"companies/{companyId:N}/{sha256[..2]}/{sha256}";

    private static string HashIdempotencyKey(string key) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();

    private static string? CleanFileName(string? value)
    {
        var fileName = value?.Trim();
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Length > 240) return null;
        if (!Path.GetFileName(fileName).Equals(fileName, StringComparison.Ordinal)) return null;
        if (fileName.Any(character => char.IsControl(character) || Path.GetInvalidFileNameChars().Contains(character))) return null;
        return fileName;
    }

    private static string? NormalizeContentType(string? value)
    {
        if (!MediaTypeHeaderValue.TryParse(value, out var parsed) || string.IsNullOrWhiteSpace(parsed.MediaType)) return null;
        var normalized = parsed.MediaType.Trim().ToLowerInvariant();
        return normalized.Length <= 80 ? normalized : null;
    }

    private static IResult Conflict(string detail) => Results.Problem(
        title: "Dosya isteği tamamlanamadı.",
        detail: detail,
        statusCode: StatusCodes.Status409Conflict);

    private static IResult StorageUnavailable() => Results.Problem(
        title: "Private dosya depolama etkin değil.",
        detail: "Mevcut legacy dosya akışları kullanılmaya devam eder.",
        statusCode: StatusCodes.Status503ServiceUnavailable);

    private static IResult StorageGatewayFailure() => Results.Problem(
        title: "Private dosya depolama servisine ulaşılamadı.",
        detail: "İstek aynı Idempotency-Key ile güvenli biçimde tekrar gönderilebilir.",
        statusCode: StatusCodes.Status502BadGateway);

    private static IResult PendingQuotaExceeded() => Results.Problem(
        title: "Aktif yükleme kotası dolu.",
        detail: "Devam eden yüklemeleri tamamlayın veya sürelerinin dolmasını bekleyip yeniden deneyin.",
        statusCode: StatusCodes.Status429TooManyRequests);

    private static async Task<PendingUploadUsage> GetPendingUsageAsync(
        PesneerDbContext dbContext,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsSqlite())
        {
            var rows = await dbContext.StoredObjectUploadSessions.AsNoTracking()
                .Where(session => session.StoredObject.State == StoredObjectState.Pending)
                .Select(session => new
                {
                    session.ExpiresAt,
                    session.StoredObjectId,
                    session.StoredObject.SizeBytes
                })
                .ToArrayAsync(cancellationToken);
            var active = rows.Where(session => session.ExpiresAt > now).ToArray();
            return new PendingUploadUsage(
                active.Length,
                active.GroupBy(session => session.StoredObjectId).Sum(group => group.First().SizeBytes));
        }

        var activeSessionCount = await dbContext.StoredObjectUploadSessions.AsNoTracking()
            .CountAsync(session => session.StoredObject.State == StoredObjectState.Pending && session.ExpiresAt > now, cancellationToken);
        var distinctPendingBytes = await dbContext.StoredObjects.AsNoTracking()
            .Where(item => item.State == StoredObjectState.Pending &&
                item.UploadSessions.Any(session => session.ExpiresAt > now))
            .SumAsync(item => (long?)item.SizeBytes, cancellationToken) ?? 0;
        return new PendingUploadUsage(activeSessionCount, distinctPendingBytes);
    }

    private sealed record UploadValidationResult(
        Dictionary<string, string[]> Errors,
        string? FileName,
        string? ContentType,
        long SizeBytes,
        string? Sha256,
        string? IdempotencyKey);

    private sealed record PendingUploadUsage(int ActiveSessionCount, long DistinctPendingBytes);

    private sealed record FileVerificationResult(bool IsValid, string? Error)
    {
        public static FileVerificationResult Valid() => new(true, null);
        public static FileVerificationResult Invalid(string error) => new(false, error);
    }
}

public sealed record CreateFileUploadSessionRequest(
    string? FileName,
    string? ContentType,
    long SizeBytes,
    string? Sha256);

public sealed record FileDescriptor(
    Guid Id,
    string FileName,
    string ContentType,
    long SizeBytes,
    string Sha256,
    DateTimeOffset UpdatedAt,
    Guid? ThumbnailId = null);

public sealed record FileUploadSessionResponse(
    Guid UploadId,
    string? UploadUrl,
    string UploadMethod,
    string? UploadToken,
    string? StoragePath,
    string? Bucket,
    long? ChunkSizeBytes,
    DateTimeOffset ExpiresAt,
    bool AlreadyAvailable,
    FileDescriptor? File,
    IReadOnlyDictionary<string, string>? RequiredHeaders = null);

public sealed record CompleteFileUploadResponse(FileDescriptor File);

public sealed record FileDownloadTicketResponse(
    string Url,
    DateTimeOffset ExpiresAt,
    FileDescriptor File);
