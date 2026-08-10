using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditPackages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditPackages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    QualityDocumentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    AuditProfile = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    PeriodEnd = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    IncludeOptionalWaste = table.Column<bool>(type: "INTEGER", nullable: false),
                    ReadinessScore = table.Column<int>(type: "INTEGER", nullable: false),
                    PreflightJson = table.Column<string>(type: "TEXT", nullable: false),
                    ManifestJson = table.Column<string>(type: "TEXT", nullable: false),
                    PdfData = table.Column<byte[]>(type: "BLOB", nullable: false),
                    ZipData = table.Column<byte[]>(type: "BLOB", nullable: false),
                    PdfSha256 = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    ZipSha256 = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditPackages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuditPackages_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AuditPackages_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AuditPackages_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AuditPackages_QualityDocuments_QualityDocumentId",
                        column: x => x.QualityDocumentId,
                        principalTable: "QualityDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "AuditPackageItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AuditPackageId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Section = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    SourceType = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    SourceId = table.Column<Guid>(type: "TEXT", nullable: true),
                    DocumentNumber = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Revision = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    Scope = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    SourceDate = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    Sha256 = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    FileData = table.Column<byte[]>(type: "BLOB", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditPackageItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuditPackageItems_AuditPackages_AuditPackageId",
                        column: x => x.AuditPackageId,
                        principalTable: "AuditPackages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackageItems_AuditPackageId",
                table: "AuditPackageItems",
                column: "AuditPackageId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackageItems_CompanyId_AuditPackageId_Section",
                table: "AuditPackageItems",
                columns: new[] { "CompanyId", "AuditPackageId", "Section" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_CompanyId_CustomerId_CustomerBranchId_CreatedAt",
                table: "AuditPackages",
                columns: new[] { "CompanyId", "CustomerId", "CustomerBranchId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_CompanyId_Number",
                table: "AuditPackages",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_CreatedByAccountId",
                table: "AuditPackages",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_CustomerBranchId",
                table: "AuditPackages",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_CustomerId",
                table: "AuditPackages",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditPackages_QualityDocumentId",
                table: "AuditPackages",
                column: "QualityDocumentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditPackageItems");

            migrationBuilder.DropTable(
                name: "AuditPackages");
        }
    }
}
