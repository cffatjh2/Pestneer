using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStationInspectionWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActivityType",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AppliedAmount",
                table: "ServiceReportStations",
                type: "TEXT",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AppliedProductName",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AppliedUnit",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AppliedVehicleStockItemId",
                table: "ServiceReportStations",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InaccessibilityReason",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReplacementProductName",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ReplacementQuantity",
                table: "ServiceReportStations",
                type: "TEXT",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReplacementUnit",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReplacementVehicleStockItemId",
                table: "ServiceReportStations",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SitePlanElementId",
                table: "ServiceReportStations",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SitePlanId",
                table: "ServiceReportStations",
                type: "TEXT",
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
