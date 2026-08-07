using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerPortalAndEmergencyRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomerMemberships_AccountId_CompanyId_CustomerId",
                table: "CustomerMemberships");

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerBranchId",
                table: "CustomerMemberships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EmergencyRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AssignedEmployeeAccountId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Number = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    ServiceType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Priority = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    ContactPhone = table.Column<string>(type: "TEXT", maxLength: 24, nullable: true),
                    RequestedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    AcknowledgedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmergencyRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmergencyRequests_Accounts_AssignedEmployeeAccountId",
                        column: x => x.AssignedEmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EmergencyRequests_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EmergencyRequests_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EmergencyRequests_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EmergencyRequestHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EmergencyRequestId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ChangedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmergencyRequestHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmergencyRequestHistories_Accounts_ChangedByAccountId",
                        column: x => x.ChangedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EmergencyRequestHistories_EmergencyRequests_EmergencyRequestId",
                        column: x => x.EmergencyRequestId,
                        principalTable: "EmergencyRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerMemberships_AccountId_CompanyId",
                table: "CustomerMemberships",
                columns: new[] { "AccountId", "CompanyId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerMemberships_CustomerBranchId",
                table: "CustomerMemberships",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequestHistories_ChangedByAccountId",
                table: "EmergencyRequestHistories",
                column: "ChangedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequestHistories_CompanyId_EmergencyRequestId_OccurredAt",
                table: "EmergencyRequestHistories",
                columns: new[] { "CompanyId", "EmergencyRequestId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequestHistories_EmergencyRequestId",
                table: "EmergencyRequestHistories",
                column: "EmergencyRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_AssignedEmployeeAccountId",
                table: "EmergencyRequests",
                column: "AssignedEmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_CompanyId_Number",
                table: "EmergencyRequests",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_CompanyId_Status_RequestedAt",
                table: "EmergencyRequests",
                columns: new[] { "CompanyId", "Status", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_CreatedByAccountId",
                table: "EmergencyRequests",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_CustomerBranchId",
                table: "EmergencyRequests",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_CustomerId",
                table: "EmergencyRequests",
                column: "CustomerId");

            migrationBuilder.AddForeignKey(
                name: "FK_CustomerMemberships_CustomerBranches_CustomerBranchId",
                table: "CustomerMemberships",
                column: "CustomerBranchId",
                principalTable: "CustomerBranches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerMemberships_CustomerBranches_CustomerBranchId",
                table: "CustomerMemberships");

            migrationBuilder.DropTable(
                name: "EmergencyRequestHistories");

            migrationBuilder.DropTable(
                name: "EmergencyRequests");

            migrationBuilder.DropIndex(
                name: "IX_CustomerMemberships_AccountId_CompanyId",
                table: "CustomerMemberships");

            migrationBuilder.DropIndex(
                name: "IX_CustomerMemberships_CustomerBranchId",
                table: "CustomerMemberships");

            migrationBuilder.DropColumn(
                name: "CustomerBranchId",
                table: "CustomerMemberships");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerMemberships_AccountId_CompanyId_CustomerId",
                table: "CustomerMemberships",
                columns: new[] { "AccountId", "CompanyId", "CustomerId" },
                unique: true);
        }
    }
}
