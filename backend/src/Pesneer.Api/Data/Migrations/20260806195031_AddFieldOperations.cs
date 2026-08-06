using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFieldOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VehicleStockChecks",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    EmployeeAccountId = table.Column<Guid>(nullable: false),
                    CheckedAt = table.Column<DateTimeOffset>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VehicleStockChecks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VehicleStockChecks_Accounts_EmployeeAccountId",
                        column: x => x.EmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WorkShifts",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    EmployeeAccountId = table.Column<Guid>(nullable: false),
                    WorkDate = table.Column<DateOnly>(nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(nullable: true),
                    Status = table.Column<string>(maxLength: 24, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkShifts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkShifts_Accounts_EmployeeAccountId",
                        column: x => x.EmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "VehicleStockCheckItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    VehicleStockCheckId = table.Column<Guid>(nullable: false),
                    ProductName = table.Column<string>(maxLength: 160, nullable: false),
                    Quantity = table.Column<decimal>(precision: 12, scale: 2, nullable: false),
                    Unit = table.Column<string>(maxLength: 24, nullable: false),
                    IsManual = table.Column<bool>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VehicleStockCheckItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VehicleStockCheckItems_VehicleStockChecks_VehicleStockCheckId",
                        column: x => x.VehicleStockCheckId,
                        principalTable: "VehicleStockChecks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkShiftBreaks",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    WorkShiftId = table.Column<Guid>(nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkShiftBreaks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkShiftBreaks_WorkShifts_WorkShiftId",
                        column: x => x.WorkShiftId,
                        principalTable: "WorkShifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockCheckItems_VehicleStockCheckId",
                table: "VehicleStockCheckItems",
                column: "VehicleStockCheckId");

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockChecks_CompanyId_EmployeeAccountId_CheckedAt",
                table: "VehicleStockChecks",
                columns: new[] { "CompanyId", "EmployeeAccountId", "CheckedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleStockChecks_EmployeeAccountId",
                table: "VehicleStockChecks",
                column: "EmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkShiftBreaks_CompanyId_WorkShiftId_StartedAt",
                table: "WorkShiftBreaks",
                columns: new[] { "CompanyId", "WorkShiftId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkShiftBreaks_WorkShiftId",
                table: "WorkShiftBreaks",
                column: "WorkShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkShifts_CompanyId_EmployeeAccountId_WorkDate",
                table: "WorkShifts",
                columns: new[] { "CompanyId", "EmployeeAccountId", "WorkDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkShifts_EmployeeAccountId",
                table: "WorkShifts",
                column: "EmployeeAccountId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VehicleStockCheckItems");

            migrationBuilder.DropTable(
                name: "WorkShiftBreaks");

            migrationBuilder.DropTable(
                name: "VehicleStockChecks");

            migrationBuilder.DropTable(
                name: "WorkShifts");
        }
    }
}
