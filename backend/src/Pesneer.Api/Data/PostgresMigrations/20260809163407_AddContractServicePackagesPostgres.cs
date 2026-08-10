using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddContractServicePackagesPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ChargeAmount",
                table: "WorkOrders",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ContractCoverage",
                table: "WorkOrders",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "ContractServicePlanId",
                table: "WorkOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerContractId",
                table: "WorkOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ChargeAmount",
                table: "EmergencyRequests",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ContractCoverage",
                table: "EmergencyRequests",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerContractId",
                table: "EmergencyRequests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SlaDueAt",
                table: "EmergencyRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AnnualPriceIncreaseRate",
                table: "CustomerContracts",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "AutoRenew",
                table: "CustomerContracts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "ExtraEmergencyCallPrice",
                table: "CustomerContracts",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "FreeEmergencyCallsPerYear",
                table: "CustomerContracts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastRenewedAt",
                table: "CustomerContracts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RenewalNoticeDays",
                table: "CustomerContracts",
                type: "integer",
                nullable: false,
                defaultValue: 60);

            migrationBuilder.AddColumn<int>(
                name: "ResponseTimeHours",
                table: "CustomerContracts",
                type: "integer",
                nullable: false,
                defaultValue: 24);

            migrationBuilder.CreateTable(
                name: "ContractServicePlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerContractId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssignedEmployeeAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    ServiceType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    RecurrenceType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    VisitsPerPeriod = table.Column<int>(type: "integer", nullable: false),
                    PreferredDay = table.Column<int>(type: "integer", nullable: false),
                    PreferredTime = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    BranchPrice = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    GeneratedThrough = table.Column<DateOnly>(type: "date", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
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
                name: "IX_ContractServicePlans_CompanyId_CustomerContractId_CustomerB~",
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
