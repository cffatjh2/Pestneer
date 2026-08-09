using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddStationInspectionWorkflowPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActivityType",
                table: "ServiceReportStations",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AppliedAmount",
                table: "ServiceReportStations",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AppliedProductName",
                table: "ServiceReportStations",
                type: "character varying(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AppliedUnit",
                table: "ServiceReportStations",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AppliedVehicleStockItemId",
                table: "ServiceReportStations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InaccessibilityReason",
                table: "ServiceReportStations",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReplacementProductName",
                table: "ServiceReportStations",
                type: "character varying(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ReplacementQuantity",
                table: "ServiceReportStations",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReplacementUnit",
                table: "ServiceReportStations",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReplacementVehicleStockItemId",
                table: "ServiceReportStations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SitePlanElementId",
                table: "ServiceReportStations",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SitePlanId",
                table: "ServiceReportStations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportStations_CompanyId_SitePlanId_SitePlanElementId",
                table: "ServiceReportStations",
                columns: new[] { "CompanyId", "SitePlanId", "SitePlanElementId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ServiceReportStations_CompanyId_SitePlanId_SitePlanElementId",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "ActivityType",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "AppliedAmount",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "AppliedProductName",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "AppliedUnit",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "AppliedVehicleStockItemId",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "InaccessibilityReason",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "ReplacementProductName",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "ReplacementQuantity",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "ReplacementUnit",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "ReplacementVehicleStockItemId",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "SitePlanElementId",
                table: "ServiceReportStations");

            migrationBuilder.DropColumn(
                name: "SitePlanId",
                table: "ServiceReportStations");
        }
    }
}
