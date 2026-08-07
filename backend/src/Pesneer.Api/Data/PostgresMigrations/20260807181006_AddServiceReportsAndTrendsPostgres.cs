using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddServiceReportsAndTrendsPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ServiceReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportNumber = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FirmName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    FirmAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    FirmPhone = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    FirmWeb = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    ResponsibleManager = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    PermissionNumber = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    TeamManager = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    TargetPests = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ResidenceType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    AreaSquareMeters = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    WorkType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    Consumables = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SafetyMeasures = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ApplicationSummary = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    Findings = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    CorrectiveActions = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    Recommendations = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    CustomerRepresentativeName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    ManagerSignatureData = table.Column<string>(type: "character varying(500000)", maxLength: 500000, nullable: true),
                    CustomerSignatureData = table.Column<string>(type: "character varying(500000)", maxLength: 500000, nullable: true),
                    VerificationCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    FinalizedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceReports_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ServiceReports_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ServiceReportProducts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    LicenseNumber = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    ApplicationMethod = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    DilutionRate = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    ActiveIngredient = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    Antidote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PackingQuantity = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    AmountUsed = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceReportProducts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceReportProducts_ServiceReports_ServiceReportId",
                        column: x => x.ServiceReportId,
                        principalTable: "ServiceReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ServiceReportStations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceNumber = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Area = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    DeviceType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TargetPest = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    CaughtCount = table.Column<int>(type: "integer", nullable: false),
                    HasActivity = table.Column<bool>(type: "boolean", nullable: false),
                    PlateChanged = table.Column<bool>(type: "boolean", nullable: false),
                    DeviceStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceReportStations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceReportStations_ServiceReports_ServiceReportId",
                        column: x => x.ServiceReportId,
                        principalTable: "ServiceReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportProducts_CompanyId_ServiceReportId_ProductName",
                table: "ServiceReportProducts",
                columns: new[] { "CompanyId", "ServiceReportId", "ProductName" });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportProducts_ServiceReportId",
                table: "ServiceReportProducts",
                column: "ServiceReportId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReports_CompanyId_ReportNumber",
                table: "ServiceReports",
                columns: new[] { "CompanyId", "ReportNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReports_CompanyId_WorkOrderId",
                table: "ServiceReports",
                columns: new[] { "CompanyId", "WorkOrderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReports_CreatedByAccountId",
                table: "ServiceReports",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReports_WorkOrderId",
                table: "ServiceReports",
                column: "WorkOrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportStations_CompanyId_ServiceReportId_DeviceNumber",
                table: "ServiceReportStations",
                columns: new[] { "CompanyId", "ServiceReportId", "DeviceNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceReportStations_ServiceReportId",
                table: "ServiceReportStations",
                column: "ServiceReportId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ServiceReportProducts");

            migrationBuilder.DropTable(
                name: "ServiceReportStations");

            migrationBuilder.DropTable(
                name: "ServiceReports");
        }
    }
}
