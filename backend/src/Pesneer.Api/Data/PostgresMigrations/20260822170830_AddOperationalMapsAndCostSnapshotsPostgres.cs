using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddOperationalMapsAndCostSnapshotsPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "UnitCostSnapshot",
                table: "VehicleStockMovements",
                type: "numeric(14,4)",
                precision: 14,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "WorkOrderId",
                table: "VehicleStockMovements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitCostSnapshot",
                table: "InventoryMovements",
                type: "numeric(14,4)",
                precision: 14,
                scale: 4,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_CompanyId_WorkOrderId",
                table: "VehicleStockMovements",
                columns: new[] { "CompanyId", "WorkOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_WorkOrderId",
                table: "VehicleStockMovements",
                column: "WorkOrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_VehicleStockMovements_WorkOrders_WorkOrderId",
                table: "VehicleStockMovements",
                column: "WorkOrderId",
                principalTable: "WorkOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_VehicleStockMovements_WorkOrders_WorkOrderId",
                table: "VehicleStockMovements");

            migrationBuilder.DropIndex(
                name: "IX_VehicleStockMovements_CompanyId_WorkOrderId",
                table: "VehicleStockMovements");

            migrationBuilder.DropIndex(
                name: "IX_VehicleStockMovements_WorkOrderId",
                table: "VehicleStockMovements");

            migrationBuilder.DropColumn(
                name: "UnitCostSnapshot",
                table: "VehicleStockMovements");

            migrationBuilder.DropColumn(
                name: "WorkOrderId",
                table: "VehicleStockMovements");

            migrationBuilder.DropColumn(
                name: "UnitCostSnapshot",
                table: "InventoryMovements");
        }
    }
}
