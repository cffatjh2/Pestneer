using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddPrivateStorageFoundationPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<byte[]>(
                name: "ZipData",
                table: "AuditPackages",
                type: "bytea",
                nullable: true,
                oldClrType: typeof(byte[]),
                oldType: "bytea");

            migrationBuilder.AlterColumn<byte[]>(
                name: "PdfData",
                table: "AuditPackages",
                type: "bytea",
                nullable: true,
                oldClrType: typeof(byte[]),
                oldType: "bytea");

            migrationBuilder.AlterColumn<byte[]>(
                name: "FileData",
                table: "AuditPackageItems",
                type: "bytea",
                nullable: true,
                oldClrType: typeof(byte[]),
                oldType: "bytea");

            migrationBuilder.AddColumn<string>(
                name: "VisionAnalysisJson",
                table: "ServiceReportStations",
                type: "character varying(200000)",
                maxLength: 200000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "WorkOrderPhotos",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "WasteDisposalEvidence",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "QualityDocuments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "CorrectiveActionEvidence",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LogoStoredObjectId",
                table: "Companies",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PdfStoredObjectId",
                table: "AuditPackages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ZipStoredObjectId",
                table: "AuditPackages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "SizeBytes",
                table: "AuditPackageItems",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "AuditPackageItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StoredObjects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sha256 = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    InitialFileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    VerifiedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoredObjects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoredObjects_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StoredObjectUploadSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    StoredObjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    IdempotencyKeyHash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoredObjectUploadSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoredObjectUploadSessions_StoredObjects_StoredObjectId",
                        column: x => x.StoredObjectId,
                        principalTable: "StoredObjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StoredObjects_CompanyId_Sha256",
                table: "StoredObjects",
                columns: new[] { "CompanyId", "Sha256" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoredObjects_State_CreatedAt",
                table: "StoredObjects",
                columns: new[] { "State", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StoredObjects_StorageKey",
                table: "StoredObjects",
                column: "StorageKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoredObjectUploadSessions_CompanyId_ExpiresAt",
                table: "StoredObjectUploadSessions",
                columns: new[] { "CompanyId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StoredObjectUploadSessions_CompanyId_IdempotencyKeyHash",
                table: "StoredObjectUploadSessions",
                columns: new[] { "CompanyId", "IdempotencyKeyHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoredObjectUploadSessions_StoredObjectId",
                table: "StoredObjectUploadSessions",
                column: "StoredObjectId");

            // NOT VALID avoids long validation scans and strong locks on existing operational tables.
            // PostgreSQL still enforces each constraint for all new/changed references.
            migrationBuilder.Sql("ALTER TABLE \"AuditPackageItems\" ADD CONSTRAINT \"FK_AuditPackageItems_StoredObjects_StoredObjectId\" FOREIGN KEY (\"StoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"AuditPackages\" ADD CONSTRAINT \"FK_AuditPackages_StoredObjects_PdfStoredObjectId\" FOREIGN KEY (\"PdfStoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"AuditPackages\" ADD CONSTRAINT \"FK_AuditPackages_StoredObjects_ZipStoredObjectId\" FOREIGN KEY (\"ZipStoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"Companies\" ADD CONSTRAINT \"FK_Companies_StoredObjects_LogoStoredObjectId\" FOREIGN KEY (\"LogoStoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"CorrectiveActionEvidence\" ADD CONSTRAINT \"FK_CorrectiveActionEvidence_StoredObjects_StoredObjectId\" FOREIGN KEY (\"StoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"QualityDocuments\" ADD CONSTRAINT \"FK_QualityDocuments_StoredObjects_StoredObjectId\" FOREIGN KEY (\"StoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"WasteDisposalEvidence\" ADD CONSTRAINT \"FK_WasteDisposalEvidence_StoredObjects_StoredObjectId\" FOREIGN KEY (\"StoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
            migrationBuilder.Sql("ALTER TABLE \"WorkOrderPhotos\" ADD CONSTRAINT \"FK_WorkOrderPhotos_StoredObjects_StoredObjectId\" FOREIGN KEY (\"StoredObjectId\") REFERENCES \"StoredObjects\" (\"Id\") ON DELETE SET NULL NOT VALID;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VisionAnalysisJson",
                table: "ServiceReportStations");

            migrationBuilder.DropForeignKey(
                name: "FK_AuditPackageItems_StoredObjects_StoredObjectId",
                table: "AuditPackageItems");

            migrationBuilder.DropForeignKey(
                name: "FK_AuditPackages_StoredObjects_PdfStoredObjectId",
                table: "AuditPackages");

            migrationBuilder.DropForeignKey(
                name: "FK_AuditPackages_StoredObjects_ZipStoredObjectId",
                table: "AuditPackages");

            migrationBuilder.DropForeignKey(
                name: "FK_Companies_StoredObjects_LogoStoredObjectId",
                table: "Companies");

            migrationBuilder.DropForeignKey(
                name: "FK_CorrectiveActionEvidence_StoredObjects_StoredObjectId",
                table: "CorrectiveActionEvidence");

            migrationBuilder.DropForeignKey(
                name: "FK_QualityDocuments_StoredObjects_StoredObjectId",
                table: "QualityDocuments");

            migrationBuilder.DropForeignKey(
                name: "FK_WasteDisposalEvidence_StoredObjects_StoredObjectId",
                table: "WasteDisposalEvidence");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkOrderPhotos_StoredObjects_StoredObjectId",
                table: "WorkOrderPhotos");

            migrationBuilder.DropTable(
                name: "StoredObjectUploadSessions");

            migrationBuilder.DropTable(
                name: "StoredObjects");

            migrationBuilder.DropColumn(
                name: "StoredObjectId",
                table: "WorkOrderPhotos");

            migrationBuilder.DropColumn(
                name: "StoredObjectId",
                table: "WasteDisposalEvidence");

            migrationBuilder.DropColumn(
                name: "StoredObjectId",
                table: "QualityDocuments");

            migrationBuilder.DropColumn(
                name: "StoredObjectId",
                table: "CorrectiveActionEvidence");

            migrationBuilder.DropColumn(
                name: "LogoStoredObjectId",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "PdfStoredObjectId",
                table: "AuditPackages");

            migrationBuilder.DropColumn(
                name: "ZipStoredObjectId",
                table: "AuditPackages");

            migrationBuilder.DropColumn(
                name: "SizeBytes",
                table: "AuditPackageItems");

            migrationBuilder.DropColumn(
                name: "StoredObjectId",
                table: "AuditPackageItems");

            migrationBuilder.AlterColumn<byte[]>(
                name: "ZipData",
                table: "AuditPackages",
                type: "bytea",
                nullable: false,
                oldClrType: typeof(byte[]),
                oldType: "bytea",
                oldNullable: true);

            migrationBuilder.AlterColumn<byte[]>(
                name: "PdfData",
                table: "AuditPackages",
                type: "bytea",
                nullable: false,
                oldClrType: typeof(byte[]),
                oldType: "bytea",
                oldNullable: true);

            migrationBuilder.AlterColumn<byte[]>(
                name: "FileData",
                table: "AuditPackageItems",
                type: "bytea",
                nullable: false,
                oldClrType: typeof(byte[]),
                oldType: "bytea",
                oldNullable: true);

        }
    }
}
