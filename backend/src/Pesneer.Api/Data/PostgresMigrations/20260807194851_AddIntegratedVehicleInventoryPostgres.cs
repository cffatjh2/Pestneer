using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddIntegratedVehicleInventoryPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "VehicleId",
                table: "VehicleStockChecks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VehicleStockItemId",
                table: "VehicleStockCheckItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VehicleStockItemId",
                table: "ServiceReportProducts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Vehicles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedEmployeeAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    Plate = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    NormalizedPlate = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Brand = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Model = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ModelYear = table.Column<int>(type: "integer", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vehicles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Vehicles_Accounts_AssignedEmployeeAccountId",
                        column: x => x.AssignedEmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "VehicleStockItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    VehicleId = table.Column<Guid>(type: "uuid", nullable: false),
                    InventoryItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProductName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    LastMovementAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VehicleStockItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VehicleStockItems_InventoryItems_InventoryItemId",
                        column: x => x.InventoryItemId,
                        principalTable: "InventoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VehicleStockItems_Vehicles_VehicleId",
                        column: x => x.VehicleId,
                        principalTable: "Vehicles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "VehicleStockMovements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    VehicleStockItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    InventoryItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ServiceReportId = table.Column<Guid>(type: "uuid", nullable: true),
                    PerformedByAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(14,3)", precision: 14, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VehicleStockMovements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VehicleStockMovements_Accounts_PerformedByAccountId",
                        column: x => x.PerformedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VehicleStockMovements_InventoryItems_InventoryItemId",
                        column: x => x.InventoryItemId,
                        principalTable: "InventoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VehicleStockMovements_ServiceReports_ServiceReportId",
                        column: x => x.ServiceReportId,
                        principalTable: "ServiceReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VehicleStockMovements_VehicleStockItems_VehicleStockItemId",
                        column: x => x.VehicleStockItemId,
                        principalTable: "VehicleStockItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockChecks_VehicleId",
                table: "VehicleStockChecks",
                column: "VehicleId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockCheckItems_VehicleStockItemId",
                table: "VehicleStockCheckItems",
                column: "VehicleStockItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportProducts_VehicleStockItemId",
                table: "ServiceReportProducts",
                column: "VehicleStockItemId");

            migrationBuilder.CreateIndex(
                name: "IX_Vehicles_AssignedEmployeeAccountId",
                table: "Vehicles",
                column: "AssignedEmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Vehicles_CompanyId_NormalizedPlate",
                table: "Vehicles",
                columns: new[] { "CompanyId", "NormalizedPlate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockItems_CompanyId_VehicleId_InventoryItemId",
                table: "VehicleStockItems",
                columns: new[] { "CompanyId", "VehicleId", "InventoryItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockItems_InventoryItemId",
                table: "VehicleStockItems",
                column: "InventoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockItems_VehicleId",
                table: "VehicleStockItems",
                column: "VehicleId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_CompanyId_ServiceReportId",
                table: "VehicleStockMovements",
                columns: new[] { "CompanyId", "ServiceReportId" });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_CompanyId_VehicleStockItemId_Occurred~",
                table: "VehicleStockMovements",
                columns: new[] { "CompanyId", "VehicleStockItemId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_InventoryItemId",
                table: "VehicleStockMovements",
                column: "InventoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_PerformedByAccountId",
                table: "VehicleStockMovements",
                column: "PerformedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_ServiceReportId",
                table: "VehicleStockMovements",
                column: "ServiceReportId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockMovements_VehicleStockItemId",
                table: "VehicleStockMovements",
                column: "VehicleStockItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_ServiceReportProducts_VehicleStockItems_VehicleStockItemId",
                table: "ServiceReportProducts",
                column: "VehicleStockItemId",
                principalTable: "VehicleStockItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_VehicleStockCheckItems_VehicleStockItems_VehicleStockItemId",
                table: "VehicleStockCheckItems",
                column: "VehicleStockItemId",
                principalTable: "VehicleStockItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_VehicleStockChecks_Vehicles_VehicleId",
                table: "VehicleStockChecks",
                column: "VehicleId",
                principalTable: "Vehicles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ServiceReportProducts_VehicleStockItems_VehicleStockItemId",
                table: "ServiceReportProducts");

            migrationBuilder.DropForeignKey(
                name: "FK_VehicleStockCheckItems_VehicleStockItems_VehicleStockItemId",
                table: "VehicleStockCheckItems");

            migrationBuilder.DropForeignKey(
                name: "FK_VehicleStockChecks_Vehicles_VehicleId",
                table: "VehicleStockChecks");

            migrationBuilder.DropTable(
                name: "VehicleStockMovements");

            migrationBuilder.DropTable(
                name: "VehicleStockItems");

            migrationBuilder.DropTable(
                name: "Vehicles");

            migrationBuilder.DropIndex(
                name: "IX_VehicleStockChecks_VehicleId",
                table: "VehicleStockChecks");

            migrationBuilder.DropIndex(
                name: "IX_VehicleStockCheckItems_VehicleStockItemId",
                table: "VehicleStockCheckItems");

            migrationBuilder.DropIndex(
                name: "IX_ServiceReportProducts_VehicleStockItemId",
                table: "ServiceReportProducts");

            migrationBuilder.DropColumn(
                name: "VehicleId",
                table: "VehicleStockChecks");

            migrationBuilder.DropColumn(
                name: "VehicleStockItemId",
                table: "VehicleStockCheckItems");

            migrationBuilder.DropColumn(
                name: "VehicleStockItemId",
                table: "ServiceReportProducts");
        }
    }
}
