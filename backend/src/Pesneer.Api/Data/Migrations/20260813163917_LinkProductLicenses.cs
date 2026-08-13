using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkProductLicenses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "LicenseDocumentId",
                table: "ServiceReportProducts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InventoryItemId",
                table: "QualityDocuments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseNumber",
                table: "QualityDocuments",
                type: "TEXT",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseNumber",
                table: "InventoryItems",
                type: "TEXT",
                maxLength: 160,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportProducts_LicenseDocumentId",
                table: "ServiceReportProducts",
                column: "LicenseDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_InventoryItemId",
                table: "QualityDocuments",
                column: "InventoryItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_QualityDocuments_InventoryItems_InventoryItemId",
                table: "QualityDocuments",
                column: "InventoryItemId",
                principalTable: "InventoryItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ServiceReportProducts_QualityDocuments_LicenseDocumentId",
                table: "ServiceReportProducts",
                column: "LicenseDocumentId",
                principalTable: "QualityDocuments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_QualityDocuments_InventoryItems_InventoryItemId",
                table: "QualityDocuments");

            migrationBuilder.DropForeignKey(
                name: "FK_ServiceReportProducts_QualityDocuments_LicenseDocumentId",
                table: "ServiceReportProducts");

            migrationBuilder.DropIndex(
                name: "IX_ServiceReportProducts_LicenseDocumentId",
                table: "ServiceReportProducts");

            migrationBuilder.DropIndex(
                name: "IX_QualityDocuments_InventoryItemId",
                table: "QualityDocuments");

            migrationBuilder.DropColumn(
                name: "LicenseDocumentId",
                table: "ServiceReportProducts");

            migrationBuilder.DropColumn(
                name: "InventoryItemId",
                table: "QualityDocuments");

            migrationBuilder.DropColumn(
                name: "LicenseNumber",
                table: "QualityDocuments");

            migrationBuilder.DropColumn(
                name: "LicenseNumber",
                table: "InventoryItems");
        }
    }
}
