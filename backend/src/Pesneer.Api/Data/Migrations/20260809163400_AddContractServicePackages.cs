using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddContractServicePackages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ChargeAmount",
                table: "WorkOrders",
                type: "TEXT",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ContractCoverage",
                table: "WorkOrders",
                type: "TEXT",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "ContractServicePlanId",
                table: "WorkOrders",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerContractId",
                table: "WorkOrders",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ChargeAmount",
                table: "EmergencyRequests",
                type: "TEXT",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ContractCoverage",
                table: "EmergencyRequests",
                type: "TEXT",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerContractId",
                table: "EmergencyRequests",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SlaDueAt",
                table: "EmergencyRequests",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AnnualPriceIncreaseRate",
                table: "CustomerContracts",
                type: "TEXT",
                precision: 6,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "AutoRenew",
                table: "CustomerContracts",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "ExtraEmergencyCallPrice",
                table: "CustomerContracts",
                type: "TEXT",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "FreeEmergencyCallsPerYear",
                table: "CustomerContracts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastRenewedAt",
                table: "CustomerContracts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RenewalNoticeDays",
                table: "CustomerContracts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 60);

            migrationBuilder.AddColumn<int>(
                name: "ResponseTimeHours",
                table: "CustomerContracts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 24);

            migrationBuilder.CreateTable(
                name: "ContractServicePlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerContractId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    AssignedEmployeeAccountId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ServiceType = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    RecurrenceType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    VisitsPerPeriod = table.Column<int>(type: "INTEGER", nullable: false),
                    PreferredDay = table.Column<int>(type: "INTEGER", nullable: false),
                    PreferredTime = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    DurationMinutes = table.Column<int>(type: "INTEGER", nullable: false),
                    BranchPrice = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    GeneratedThrough = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContractServicePlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContractServicePlans_Accounts_AssignedEmployeeAccountId",
                        column: x => x.AssignedEmployeeAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ContractServicePlans_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ContractServicePlans_CustomerContracts_CustomerContractId",
                        column: x => x.CustomerContractId,
                        principalTable: "CustomerContracts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ContractServicePlans_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_ContractServicePlanId",
                table: "WorkOrders",
                column: "ContractServicePlanId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_CustomerContractId",
                table: "WorkOrders",
                column: "CustomerContractId");

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyRequests_CustomerContractId",
                table: "EmergencyRequests",
                column: "CustomerContractId");

            migrationBuilder.CreateIndex(
                name: "IX_ContractServicePlans_AssignedEmployeeAccountId",
                table: "ContractServicePlans",
                column: "AssignedEmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ContractServicePlans_CompanyId_CustomerContractId_CustomerBranchId_ServiceType",
                table: "ContractServicePlans",
                columns: new[] { "CompanyId", "CustomerContractId", "CustomerBranchId", "ServiceType" });

            migrationBuilder.CreateIndex(
                name: "IX_ContractServicePlans_CustomerBranchId",
                table: "ContractServicePlans",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ContractServicePlans_CustomerContractId",
                table: "ContractServicePlans",
                column: "CustomerContractId");

            migrationBuilder.CreateIndex(
                name: "IX_ContractServicePlans_CustomerId",
                table: "ContractServicePlans",
                column: "CustomerId");

            migrationBuilder.AddForeignKey(
                name: "FK_EmergencyRequests_CustomerContracts_CustomerContractId",
                table: "EmergencyRequests",
                column: "CustomerContractId",
                principalTable: "CustomerContracts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkOrders_ContractServicePlans_ContractServicePlanId",
                table: "WorkOrders",
                column: "ContractServicePlanId",
                principalTable: "ContractServicePlans",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkOrders_CustomerContracts_CustomerContractId",
                table: "WorkOrders",
                column: "CustomerContractId",
                principalTable: "CustomerContracts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EmergencyRequests_CustomerContracts_CustomerContractId",
                table: "EmergencyRequests");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkOrders_ContractServicePlans_ContractServicePlanId",
                table: "WorkOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkOrders_CustomerContracts_CustomerContractId",
                table: "WorkOrders");

            migrationBuilder.DropTable(
                name: "ContractServicePlans");

            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_ContractServicePlanId",
                table: "WorkOrders");

            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_CustomerContractId",
                table: "WorkOrders");

            migrationBuilder.DropIndex(
                name: "IX_EmergencyRequests_CustomerContractId",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "ChargeAmount",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "ContractCoverage",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "ContractServicePlanId",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "CustomerContractId",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "ChargeAmount",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "ContractCoverage",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "CustomerContractId",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "SlaDueAt",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "AnnualPriceIncreaseRate",
                table: "CustomerContracts");

            migrationBuilder.DropColumn(
                name: "AutoRenew",
                table: "CustomerContracts");

            migrationBuilder.DropColumn(
                name: "ExtraEmergencyCallPrice",
                table: "CustomerContracts");

            migrationBuilder.DropColumn(
                name: "FreeEmergencyCallsPerYear",
                table: "CustomerContracts");

            migrationBuilder.DropColumn(
                name: "LastRenewedAt",
                table: "CustomerContracts");

            migrationBuilder.DropColumn(
                name: "RenewalNoticeDays",
                table: "CustomerContracts");

            migrationBuilder.DropColumn(
                name: "ResponseTimeHours",
                table: "CustomerContracts");
        }
    }
}
