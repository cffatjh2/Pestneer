using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIndependentStationActivations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StationActivations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    StationsJson = table.Column<string>(type: "TEXT", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 3000, nullable: true),
                    TotalStations = table.Column<int>(type: "INTEGER", nullable: false),
                    ActiveStations = table.Column<int>(type: "INTEGER", nullable: false),
                    DamagedStations = table.Column<int>(type: "INTEGER", nullable: false),
                    InaccessibleStations = table.Column<int>(type: "INTEGER", nullable: false),
                    TotalCaught = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    FinalizedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StationActivations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StationActivations_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StationActivations_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StationActivations_CompanyId_Number",
                table: "StationActivations",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StationActivations_CompanyId_WorkOrderId",
                table: "StationActivations",
                columns: new[] { "CompanyId", "WorkOrderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StationActivations_CreatedByAccountId",
                table: "StationActivations",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_StationActivations_WorkOrderId",
                table: "StationActivations",
                column: "WorkOrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StationActivations");
        }
    }
}
