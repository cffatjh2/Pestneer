using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQualityInspections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QualityInspections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ServiceReportId = table.Column<Guid>(type: "TEXT", nullable: false),
                    InspectorAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EmployeeAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CorrectiveActionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    InspectionType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    SelectionReason = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    ScheduledAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    InspectedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    PhotoQualityScore = table.Column<int>(type: "INTEGER", nullable: false),
                    StationCompletionScore = table.Column<int>(type: "INTEGER", nullable: false),
                    ProductDoseScore = table.Column<int>(type: "INTEGER", nullable: false),
                    SignatureScore = table.Column<int>(type: "INTEGER", nullable: false),
                    TimelinessScore = table.Column<int>(type: "INTEGER", nullable: false),
                    ReportCompletenessScore = table.Column<int>(type: "INTEGER", nullable: false),
                    TotalScore = table.Column<int>(type: "INTEGER", nullable: false),
                    Grade = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    RequiresCorrectiveAction = table.Column<bool>(type: "INTEGER", nullable: false),
                    Findings = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityInspections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityInspections_Accounts_EmployeeAccountId",
                        column: x => x.EmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityInspections_Accounts_InspectorAccountId",
                        column: x => x.InspectorAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityInspections_CorrectiveActions_CorrectiveActionId",
                        column: x => x.CorrectiveActionId,
                        principalTable: "CorrectiveActions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QualityInspections_ServiceReports_ServiceReportId",
                        column: x => x.ServiceReportId,
                        principalTable: "ServiceReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_CompanyId_EmployeeAccountId_InspectedAt",
                table: "QualityInspections",
                columns: new[] { "CompanyId", "EmployeeAccountId", "InspectedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_CompanyId_Number",
                table: "QualityInspections",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_CompanyId_ServiceReportId",
                table: "QualityInspections",
                columns: new[] { "CompanyId", "ServiceReportId" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_CompanyId_Status_ScheduledAt",
                table: "QualityInspections",
                columns: new[] { "CompanyId", "Status", "ScheduledAt" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_CorrectiveActionId",
                table: "QualityInspections",
                column: "CorrectiveActionId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_EmployeeAccountId",
                table: "QualityInspections",
                column: "EmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_InspectorAccountId",
                table: "QualityInspections",
                column: "InspectorAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityInspections_ServiceReportId",
                table: "QualityInspections",
                column: "ServiceReportId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QualityInspections");
        }
    }
}
