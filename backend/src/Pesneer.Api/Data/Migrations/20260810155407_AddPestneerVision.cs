using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPestneerVision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "VisionEnabled",
                table: "Companies",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "VisionPreferredModel",
                table: "Companies",
                type: "TEXT",
                maxLength: 16,
                nullable: false,
                defaultValue: "Auto");

            migrationBuilder.AddColumn<bool>(
                name: "VisionReviewRequired",
                table: "Companies",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "ServiceReportPestObservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ServiceReportStationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PestKey = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    PestName = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    DetectedCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ApprovedCount = table.Column<int>(type: "INTEGER", nullable: false),
                    MeanConfidence = table.Column<decimal>(type: "TEXT", precision: 5, scale: 4, nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    ModelName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    ModelVersion = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    ReviewStatus = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    VisionResultJson = table.Column<string>(type: "TEXT", maxLength: 200000, nullable: true),
                    AnalyzedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    ReviewedByAccountId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceReportPestObservations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceReportPestObservations_Accounts_ReviewedByAccountId",
                        column: x => x.ReviewedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ServiceReportPestObservations_ServiceReportStations_ServiceReportStationId",
                        column: x => x.ServiceReportStationId,
                        principalTable: "ServiceReportStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportPestObservations_CompanyId_ServiceReportStationId_PestKey",
                table: "ServiceReportPestObservations",
                columns: new[] { "CompanyId", "ServiceReportStationId", "PestKey" });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportPestObservations_ReviewedByAccountId",
                table: "ServiceReportPestObservations",
                column: "ReviewedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportPestObservations_ServiceReportStationId",
                table: "ServiceReportPestObservations",
                column: "ServiceReportStationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ServiceReportPestObservations");

            migrationBuilder.DropColumn(
                name: "VisionEnabled",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "VisionPreferredModel",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "VisionReviewRequired",
                table: "Companies");
        }
    }
}
