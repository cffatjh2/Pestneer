using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPrivateStorageFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VisionAnalysisJson",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 200000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "WorkOrderPhotos",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "WasteDisposalEvidence",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "QualityDocuments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "CorrectiveActionEvidence",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LogoStoredObjectId",
                table: "Companies",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PdfStoredObjectId",
                table: "AuditPackages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ZipStoredObjectId",
                table: "AuditPackages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "SizeBytes",
                table: "AuditPackageItems",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StoredObjectId",
                table: "AuditPackageItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StoredObjects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Sha256 = table.Column<string>(type: "TEXT", fixedLength: true, maxLength: 64, nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    StorageKey = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    InitialFileName = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    State = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    VerifiedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
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
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoredObjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    IdempotencyKeyHash = table.Column<string>(type: "TEXT", fixedLength: true, maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
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
                name: "IX_WorkOrderPhotos_StoredObjectId",
                table: "WorkOrderPhotos",
                column: "StoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalEvidence_StoredObjectId",
                table: "WasteDisposalEvidence",
                column: "StoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_StoredObjectId",
                table: "QualityDocuments",
                column: "StoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionEvidence_StoredObjectId",
                table: "CorrectiveActionEvidence",
                column: "StoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Companies_LogoStoredObjectId",
                table: "Companies",
                column: "LogoStoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_PdfStoredObjectId",
                table: "AuditPackages",
                column: "PdfStoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_ZipStoredObjectId",
                table: "AuditPackages",
                column: "ZipStoredObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackageItems_StoredObjectId",
                table: "AuditPackageItems",
                column: "StoredObjectId");

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

            migrationBuilder.AddForeignKey(
                name: "FK_AuditPackageItems_StoredObjects_StoredObjectId",
                table: "AuditPackageItems",
                column: "StoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_AuditPackages_StoredObjects_PdfStoredObjectId",
                table: "AuditPackages",
                column: "PdfStoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_AuditPackages_StoredObjects_ZipStoredObjectId",
                table: "AuditPackages",
                column: "ZipStoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Companies_StoredObjects_LogoStoredObjectId",
                table: "Companies",
                column: "LogoStoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_CorrectiveActionEvidence_StoredObjects_StoredObjectId",
                table: "CorrectiveActionEvidence",
                column: "StoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_QualityDocuments_StoredObjects_StoredObjectId",
                table: "QualityDocuments",
                column: "StoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_WasteDisposalEvidence_StoredObjects_StoredObjectId",
                table: "WasteDisposalEvidence",
                column: "StoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkOrderPhotos_StoredObjects_StoredObjectId",
                table: "WorkOrderPhotos",
                column: "StoredObjectId",
                principalTable: "StoredObjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
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

            migrationBuilder.DropIndex(
                name: "IX_WorkOrderPhotos_StoredObjectId",
                table: "WorkOrderPhotos");

            migrationBuilder.DropIndex(
                name: "IX_WasteDisposalEvidence_StoredObjectId",
                table: "WasteDisposalEvidence");

            migrationBuilder.DropIndex(
                name: "IX_QualityDocuments_StoredObjectId",
                table: "QualityDocuments");

            migrationBuilder.DropIndex(
                name: "IX_CorrectiveActionEvidence_StoredObjectId",
                table: "CorrectiveActionEvidence");

            migrationBuilder.DropIndex(
                name: "IX_Companies_LogoStoredObjectId",
                table: "Companies");

            migrationBuilder.DropIndex(
                name: "IX_AuditPackages_PdfStoredObjectId",
                table: "AuditPackages");

            migrationBuilder.DropIndex(
                name: "IX_AuditPackages_ZipStoredObjectId",
                table: "AuditPackages");

            migrationBuilder.DropIndex(
                name: "IX_AuditPackageItems_StoredObjectId",
                table: "AuditPackageItems");

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

        }
    }
}
