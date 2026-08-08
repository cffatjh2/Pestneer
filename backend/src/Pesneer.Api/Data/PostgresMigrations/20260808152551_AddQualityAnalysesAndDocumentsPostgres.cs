using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddQualityAnalysesAndDocumentsPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QualityAnalyses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    AnalysisType = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    TemplateCode = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodEnd = table.Column<DateOnly>(type: "date", nullable: false),
                    Score = table.Column<int>(type: "integer", nullable: true),
                    Level = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Summary = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    Findings = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: true),
                    Recommendations = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: true),
                    PayloadJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityAnalyses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityAnalyses_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityAnalyses_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityAnalyses_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "QualityDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CustomerBranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    QualityAnalysisId = table.Column<Guid>(type: "uuid", nullable: true),
                    Category = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    FileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    FileData = table.Column<byte[]>(type: "bytea", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityDocuments_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityDocuments_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityDocuments_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityDocuments_QualityAnalyses_QualityAnalysisId",
                        column: x => x.QualityAnalysisId,
                        principalTable: "QualityAnalyses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QualityAnalyses_CompanyId_AnalysisType_CustomerId_CustomerB~",
                table: "QualityAnalyses",
                columns: new[] { "CompanyId", "AnalysisType", "CustomerId", "CustomerBranchId", "PeriodEnd" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityAnalyses_CompanyId_Number",
                table: "QualityAnalyses",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QualityAnalyses_CreatedByAccountId",
                table: "QualityAnalyses",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityAnalyses_CustomerBranchId",
                table: "QualityAnalyses",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityAnalyses_CustomerId",
                table: "QualityAnalyses",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_CompanyId_Category_CreatedAt",
                table: "QualityDocuments",
                columns: new[] { "CompanyId", "Category", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_CreatedByAccountId",
                table: "QualityDocuments",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_CustomerBranchId",
                table: "QualityDocuments",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_CustomerId",
                table: "QualityDocuments",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_QualityAnalysisId",
                table: "QualityDocuments",
                column: "QualityAnalysisId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QualityDocuments");

            migrationBuilder.DropTable(
                name: "QualityAnalyses");
        }
    }
}
