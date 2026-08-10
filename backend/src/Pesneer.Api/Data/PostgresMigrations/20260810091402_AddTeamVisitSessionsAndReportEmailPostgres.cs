using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddTeamVisitSessionsAndReportEmailPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CustomerDurationMinutes",
                table: "WorkOrders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TotalLaborMinutes",
                table: "WorkOrders",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "AdditionalEmailRecipients",
                table: "ServiceReports",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReportNotificationEmail",
                table: "Companies",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ReportEmailDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    NormalizedRecipientEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    RecipientType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    LastAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SentAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportEmailDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReportEmailDeliveries_ServiceReports_ServiceReportId",
                        column: x => x.ServiceReportId,
                        principalTable: "ServiceReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkOrderAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsLead = table.Column<bool>(type: "boolean", nullable: false),
                    AssignedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkOrderAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkOrderAssignments_Accounts_EmployeeAccountId",
                        column: x => x.EmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WorkOrderAssignments_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkOrderVisitSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployeeAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkOrderVisitSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkOrderVisitSessions_Accounts_EmployeeAccountId",
                        column: x => x.EmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WorkOrderVisitSessions_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReportEmailDeliveries_ServiceReportId_NormalizedRecipientEm~",
                table: "ReportEmailDeliveries",
                columns: new[] { "ServiceReportId", "NormalizedRecipientEmail" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReportEmailDeliveries_Status_NextAttemptAt_CreatedAt",
                table: "ReportEmailDeliveries",
                columns: new[] { "Status", "NextAttemptAt", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderAssignments_CompanyId_EmployeeAccountId_AssignedAt",
                table: "WorkOrderAssignments",
                columns: new[] { "CompanyId", "EmployeeAccountId", "AssignedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderAssignments_EmployeeAccountId",
                table: "WorkOrderAssignments",
                column: "EmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderAssignments_WorkOrderId_EmployeeAccountId",
                table: "WorkOrderAssignments",
                columns: new[] { "WorkOrderId", "EmployeeAccountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderVisitSessions_CompanyId_WorkOrderId_EmployeeAccoun~",
                table: "WorkOrderVisitSessions",
                columns: new[] { "CompanyId", "WorkOrderId", "EmployeeAccountId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderVisitSessions_EmployeeAccountId",
                table: "WorkOrderVisitSessions",
                column: "EmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderVisitSessions_WorkOrderId_EmployeeAccountId_Status",
                table: "WorkOrderVisitSessions",
                columns: new[] { "WorkOrderId", "EmployeeAccountId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReportEmailDeliveries");

            migrationBuilder.DropTable(
                name: "WorkOrderAssignments");

            migrationBuilder.DropTable(
                name: "WorkOrderVisitSessions");

            migrationBuilder.DropColumn(
                name: "CustomerDurationMinutes",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "TotalLaborMinutes",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "AdditionalEmailRecipients",
                table: "ServiceReports");

            migrationBuilder.DropColumn(
                name: "ReportNotificationEmail",
                table: "Companies");
        }
    }
}
