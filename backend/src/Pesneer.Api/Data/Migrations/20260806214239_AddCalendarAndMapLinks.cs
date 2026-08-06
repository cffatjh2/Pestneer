using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCalendarAndMapLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MapUrl",
                table: "Customers",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MapUrl",
                table: "CustomerBranches",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CalendarEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    AssignedEmployeeAccountId = table.Column<Guid>(nullable: true),
                    Kind = table.Column<string>(maxLength: 16, nullable: false),
                    Title = table.Column<string>(maxLength: 180, nullable: false),
                    Description = table.Column<string>(maxLength: 2000, nullable: true),
                    ScheduledAt = table.Column<DateTimeOffset>(nullable: false),
                    IsAllDay = table.Column<bool>(nullable: false),
                    Priority = table.Column<string>(maxLength: 16, nullable: false),
                    Status = table.Column<string>(maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CalendarEntries_Accounts_AssignedEmployeeAccountId",
                        column: x => x.AssignedEmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CalendarEntries_AssignedEmployeeAccountId",
                table: "CalendarEntries",
                column: "AssignedEmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CalendarEntries_CompanyId_ScheduledAt",
                table: "CalendarEntries",
                columns: new[] { "CompanyId", "ScheduledAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CalendarEntries");

            migrationBuilder.DropColumn(
                name: "MapUrl",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "MapUrl",
                table: "CustomerBranches");
        }
    }
}
