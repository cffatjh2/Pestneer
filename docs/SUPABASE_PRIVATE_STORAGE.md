# Supabase Private Storage foundation

This foundation is additive. When `SupabaseStorage__Enabled` is false or the server-only settings are incomplete, all existing inline PostgreSQL file flows continue unchanged and the new V2 endpoints return `503`.

## Secure Render configuration

Create a **private** Supabase Storage bucket named `pesneer-private`, then configure these values as Render secrets:

```text
SupabaseStorage__Enabled=true
SupabaseStorage__Url=https://YOUR_PROJECT_REF.supabase.co
SupabaseStorage__ServiceRoleKey=YOUR_SERVER_ONLY_SERVICE_ROLE_SECRET
SupabaseStorage__Bucket=pesneer-private
SupabaseStorage__HybridDualWriteEnabled=false
SupabaseStorage__HybridReadEnabled=false
SupabaseStorage__StorageOnlyWritesEnabled=false
SupabaseStorage__BackfillEnabled=false
```

Never add the service-role secret to Vercel, frontend variables, source control, browser requests, or logs. The backend uses it only to mint object-scoped upload/download grants. The bucket must allow the deployed Vercel origins through its Storage CORS configuration.

## V2 upload protocol

The generic V2 file routes require the existing `OwnerPortal` authorization policy. They are not exposed to employees or customers because a generic object ID does not prove ownership of an operational resource. Future employee/customer uploads and downloads must be issued only by resource-specific endpoints that first verify the underlying record relationship.

1. Call `GET /api/v2/files/capabilities`. Hash/upload work starts only when `directUploadEnabled` is true. The capability requires configured Storage, PostgreSQL, `HybridReadEnabled`, `StorageOnlyWritesEnabled`, and membership in `HybridCompanyIds`.
2. Compute the exact file SHA-256 in the browser.
3. Call `POST /api/v2/files/upload-sessions` with an 8–128 character `Idempotency-Key` header and `{ fileName, contentType, sizeBytes, sha256 }`. The server repeats the same capability check before issuing a URL.
4. For `uploadMethod: "PUT"`, upload the bytes to `uploadUrl` with every `requiredHeaders` entry. If an idempotent replay receives an immutable-object `400/409`, proceed to completion; completion is the exact verification authority.
5. For `uploadMethod: "TUS"`, use `uploadUrl`, a fixed 6 MiB chunk size, the returned bucket/path as TUS metadata, and the returned `x-signature` header. TUS is selected above 6 MiB.
6. Call `POST /api/v2/files/upload-sessions/{uploadId}/complete`. Render streams the private object once and verifies byte count, SHA-256, declared content type, and supported file signature before marking it ready.
7. Create a Quality document with `POST /api/v2/quality/documents/from-stored-object` and `{ uploadId, storedObjectId, category, title, description, customerId, branchId, inventoryItemId, licenseNumber }`. The completed upload session supplies the resource filename, so tenant-local hash deduplication cannot reuse another upload's filename.
8. Request a five-minute private URL from `GET /api/v2/files/{storedObjectId}/download-ticket` only for owner diagnostics. Product downloads continue through resource-authorized URLs.

The same idempotency key can safely replay the same request. Reusing it for different metadata returns `409`. Content deduplication is limited to `(CompanyId, SHA-256)`; different companies never share object records.

Each tenant is limited by default to 20 active Pending sessions and 512 MiB of distinct active Pending canonical bytes. Ready canonical dedup does not consume Pending byte quota. Exceeding either limit returns `429` before another upload grant is issued. The values are configurable with `MaximumActivePendingSessionsPerCompany` and `MaximumActivePendingBytesPerCompany`.

## Hybrid migration behavior

- Existing binary columns are retained.
- Nullable `StoredObjectId` references are available for company logos, work-order photos, quality documents, corrective/waste evidence, audit package PDF/ZIP, and audit items.
- `HybridDualWriteEnabled=true` copies new Quality documents, work-order photos, corrective/waste evidence, and audit PDF/ZIP/items only for companies in the non-empty `HybridCompanyIds` allowlist. Inline bytes are committed first and remain the exact fallback.
- `HybridReadEnabled=true` makes those resource-authorized endpoints try Storage first only for allowlisted companies. A Storage-only row always remains readable after rollout flags or the allowlist are removed; tenant ownership is still checked against the `StoredObject.CompanyId`. If the required private store is unavailable, the API returns `503` instead of a misleading `404`.
- `StorageOnlyWritesEnabled=true` permits PostgreSQL-only, allowlisted canary writes. The direct Quality route stores `FileData = NULL`. New audit generation uses one canonical PDF for both `QualityDocument` and `AuditPackage`, canonical ZIP and item objects, and writes all audit inline bytes as NULL only when every object was uploaded and checksum-verified. Any failed canonical write keeps the exact legacy bytes. SQLite always retains its historical NOT NULL audit columns and never uses this path.
- New audit ZIPs are normalized once before persistence; historical ZIPs keep their byte-preserving legacy normalization path. No existing package is rewritten.
- Expired unverified objects are changed to `Deleting`, removed from Storage, and then removed from PostgreSQL by a bounded background worker.
- Legacy backfill is disabled by default and additionally requires a non-empty, valid `BackfillCompanyIds` allowlist. After canary validation, `SupabaseStorage__BackfillEnabled=true` copies only those companies, at most 25 objects and 64 MiB per run, verifies the remote SHA-256, and sets only nullable references. It never deletes legacy bytes. Individual objects above 64 MiB are reported only as an aggregate count and require a separately supervised resumable migration.
- Customer-facing downloads continue through their existing resource-aware authorization endpoints. The generic V2 object ticket is deliberately not exposed to customer portal accounts.

Example single-company canary values (replace the placeholder only in Render, never commit a real tenant ID):

```text
SupabaseStorage__HybridCompanyIds__0=DEMO_COMPANY_GUID
SupabaseStorage__BackfillCompanyIds__0=DEMO_COMPANY_GUID
```

Empty arrays, invalid values, and the all-zero placeholder authorize no company. The Pending cleaner never deletes Ready objects. Unattached Ready objects from a completed-but-unbound upload are retained in this release; automatic Ready deletion is deliberately off until a resource-reference audit, retention decision, restore drill, and canary prove that no user file can be removed.

## Privacy-safe transport metrics

API transport metrics are sampled at five percent by default. Errors, responses of at least 1 MiB, and requests lasting at least one second are always measured. Each entry contains only the route template, HTTP method/status, request/response byte counts, and duration. Paths, route values, query strings, bodies, headers, tokens, tenant/account IDs, file names, email addresses, and phone numbers are never logged. The Supabase HTTP client category is disabled so signed URLs and object paths cannot appear in framework request logs.

Supabase signed upload URLs are valid for two hours. Download tickets are capped at five minutes. Never persist signed URLs in application data or telemetry.

## Post-deploy reference indexes

The foundation migration stays fully transactional so an interrupted Render startup cannot leave a half-recorded schema migration. After that migration is recorded successfully, create the nullable operational-reference indexes as a separate Supabase/PostgreSQL operation. Run each statement outside an explicit transaction, one at a time:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_WorkOrderPhotos_StoredObjectId" ON "WorkOrderPhotos" ("StoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_WasteDisposalEvidence_StoredObjectId" ON "WasteDisposalEvidence" ("StoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_QualityDocuments_StoredObjectId" ON "QualityDocuments" ("StoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_CorrectiveActionEvidence_StoredObjectId" ON "CorrectiveActionEvidence" ("StoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Companies_LogoStoredObjectId" ON "Companies" ("LogoStoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_AuditPackages_PdfStoredObjectId" ON "AuditPackages" ("PdfStoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_AuditPackages_ZipStoredObjectId" ON "AuditPackages" ("ZipStoredObjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_AuditPackageItems_StoredObjectId" ON "AuditPackageItems" ("StoredObjectId");
```

PostgreSQL creates the new reference constraints as `NOT VALID`, while still enforcing them for every new or changed reference. Validate them one at a time after the canary/backfill checks, using `ALTER TABLE ... VALIDATE CONSTRAINT ...`; this validation mode does not block normal row updates.

```sql
ALTER TABLE "AuditPackageItems" VALIDATE CONSTRAINT "FK_AuditPackageItems_StoredObjects_StoredObjectId";
ALTER TABLE "AuditPackages" VALIDATE CONSTRAINT "FK_AuditPackages_StoredObjects_PdfStoredObjectId";
ALTER TABLE "AuditPackages" VALIDATE CONSTRAINT "FK_AuditPackages_StoredObjects_ZipStoredObjectId";
ALTER TABLE "Companies" VALIDATE CONSTRAINT "FK_Companies_StoredObjects_LogoStoredObjectId";
ALTER TABLE "CorrectiveActionEvidence" VALIDATE CONSTRAINT "FK_CorrectiveActionEvidence_StoredObjects_StoredObjectId";
ALTER TABLE "QualityDocuments" VALIDATE CONSTRAINT "FK_QualityDocuments_StoredObjects_StoredObjectId";
ALTER TABLE "WasteDisposalEvidence" VALIDATE CONSTRAINT "FK_WasteDisposalEvidence_StoredObjects_StoredObjectId";
ALTER TABLE "WorkOrderPhotos" VALIDATE CONSTRAINT "FK_WorkOrderPhotos_StoredObjects_StoredObjectId";
```
