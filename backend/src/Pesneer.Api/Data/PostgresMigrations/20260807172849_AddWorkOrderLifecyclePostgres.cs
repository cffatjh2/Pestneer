using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddWorkOrderLifecyclePostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CompletedAt",
                table: "WorkOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompletionNote",
                table: "WorkOrders",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Recommendation",
                table: "WorkOrders",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RecurrenceGroupId",
                table: "WorkOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecurrenceType",
                table: "WorkOrders",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Once");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartedAt",
                table: "WorkOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VisitType",
                table: "WorkOrders",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Routine");

            migrationBuilder.AddColumn<bool>(
                name: "CanSelfSchedule",
                table: "CompanyMemberships",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "WorkOrderPhotos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkOrderPhotos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkOrderPhotos_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkOrderStatusHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkOrderStatusHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkOrderStatusHistories_Accounts_ChangedByAccountId",
                        column: x => x.ChangedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WorkOrderStatusHistories_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderPhotos_CompanyId_WorkOrderId_UploadedAt",
                table: "WorkOrderPhotos",
                columns: new[] { "CompanyId", "WorkOrderId", "UploadedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderPhotos_WorkOrderId",
                table: "WorkOrderPhotos",
                column: "WorkOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderStatusHistories_ChangedByAccountId",
                table: "WorkOrderStatusHistories",
                column: "ChangedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderStatusHistories_CompanyId_WorkOrderId_OccurredAt",
                table: "WorkOrderStatusHistories",
                columns: new[] { "CompanyId", "WorkOrderId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderStatusHistories_WorkOrderId",
                table: "WorkOrderStatusHistories",
                column: "WorkOrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorkOrderPhotos");

            migrationBuilder.DropTable(
                name: "WorkOrderStatusHistories");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "CompletionNote",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "Recommendation",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "RecurrenceGroupId",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "RecurrenceType",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "StartedAt",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "VisitType",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "CanSelfSchedule",
                table: "CompanyMemberships");
        }
    }
}
