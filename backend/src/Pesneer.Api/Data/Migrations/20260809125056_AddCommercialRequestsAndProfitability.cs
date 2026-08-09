using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCommercialRequestsAndProfitability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "UnitCost",
                table: "InventoryItems",
                type: "TEXT",
                precision: 14,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ClosureApprovalNote",
                table: "EmergencyRequests",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClosureApprovalStatus",
                table: "EmergencyRequests",
                type: "TEXT",
                maxLength: 24,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ClosureApprovedAt",
                table: "EmergencyRequests",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DueAt",
                table: "EmergencyRequests",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestType",
                table: "EmergencyRequests",
                type: "TEXT",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RequestedAppointmentAt",
                table: "EmergencyRequests",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Subject",
                table: "EmergencyRequests",
                type: "TEXT",
                maxLength: 240,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("UPDATE EmergencyRequests SET RequestType = 'EmergencyCall', Subject = 'Acil çağrı', ClosureApprovalStatus = 'NotRequired' WHERE RequestType = '' OR Subject = '' OR ClosureApprovalStatus = '';");

            migrationBuilder.CreateTable(
                name: "CommercialProposals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    IssueDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    ValidUntil = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    VatRate = table.Column<decimal>(type: "TEXT", precision: 5, scale: 2, nullable: false),
                    Subtotal = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    VatAmount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 3000, nullable: true),
                    Terms = table.Column<string>(type: "TEXT", maxLength: 5000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommercialProposals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommercialProposals_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialProposals_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommercialProposals_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WorkOrderEconomics",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorkOrderId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Revenue = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    PersonnelHourlyCost = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    DistanceKm = table.Column<decimal>(type: "TEXT", precision: 12, scale: 2, nullable: false),
                    FuelCost = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    RepeatVisitCost = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    EmergencyCallCost = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    OtherCost = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkOrderEconomics", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkOrderEconomics_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CommercialProposalLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CommercialProposalId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Quantity = table.Column<decimal>(type: "TEXT", precision: 14, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommercialProposalLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommercialProposalLines_CommercialProposals_CommercialProposalId",
                        column: x => x.CommercialProposalId,
                        principalTable: "CommercialProposals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomerContracts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CommercialProposalId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    BillingFrequency = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    BillingDay = table.Column<int>(type: "INTEGER", nullable: false),
                    PaymentTermDays = table.Column<int>(type: "INTEGER", nullable: false),
                    PeriodAmount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    Scope = table.Column<string>(type: "TEXT", maxLength: 5000, nullable: true),
                    Terms = table.Column<string>(type: "TEXT", maxLength: 5000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerContracts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerContracts_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerContracts_CommercialProposals_CommercialProposalId",
                        column: x => x.CommercialProposalId,
                        principalTable: "CommercialProposals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CustomerContracts_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomerContracts_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReceivableEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CustomerContractId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    IssueDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    PaidAmount = table.Column<decimal>(type: "TEXT", precision: 14, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    PaidAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    PaymentNote = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceivableEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceivableEntries_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReceivableEntries_CustomerContracts_CustomerContractId",
                        column: x => x.CustomerContractId,
                        principalTable: "CustomerContracts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ReceivableEntries_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialProposalLines_CommercialProposalId",
                table: "CommercialProposalLines",
                column: "CommercialProposalId");

            migrationBuilder.CreateIndex(
                name: "IX_CommercialProposals_CompanyId_CustomerId_Status_CreatedAt",
                table: "CommercialProposals",
                columns: new[] { "CompanyId", "CustomerId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CommercialProposals_CompanyId_Number",
                table: "CommercialProposals",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommercialProposals_CreatedByAccountId",
                table: "CommercialProposals",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CommercialProposals_CustomerBranchId",
                table: "CommercialProposals",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_CommercialProposals_CustomerId",
                table: "CommercialProposals",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerContracts_CommercialProposalId",
                table: "CustomerContracts",
                column: "CommercialProposalId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerContracts_CompanyId_CustomerId_Status_EndDate",
                table: "CustomerContracts",
                columns: new[] { "CompanyId", "CustomerId", "Status", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerContracts_CompanyId_Number",
                table: "CustomerContracts",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerContracts_CreatedByAccountId",
                table: "CustomerContracts",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerContracts_CustomerBranchId",
                table: "CustomerContracts",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerContracts_CustomerId",
                table: "CustomerContracts",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceivableEntries_CompanyId_Number",
                table: "ReceivableEntries",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReceivableEntries_CompanyId_Status_DueDate",
                table: "ReceivableEntries",
                columns: new[] { "CompanyId", "Status", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ReceivableEntries_CustomerBranchId",
                table: "ReceivableEntries",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceivableEntries_CustomerContractId",
                table: "ReceivableEntries",
                column: "CustomerContractId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceivableEntries_CustomerId",
                table: "ReceivableEntries",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderEconomics_CompanyId_WorkOrderId",
                table: "WorkOrderEconomics",
                columns: new[] { "CompanyId", "WorkOrderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrderEconomics_WorkOrderId",
                table: "WorkOrderEconomics",
                column: "WorkOrderId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CommercialProposalLines");

            migrationBuilder.DropTable(
                name: "ReceivableEntries");

            migrationBuilder.DropTable(
                name: "WorkOrderEconomics");

            migrationBuilder.DropTable(
                name: "CustomerContracts");

            migrationBuilder.DropTable(
                name: "CommercialProposals");

            migrationBuilder.DropColumn(
                name: "UnitCost",
                table: "InventoryItems");

            migrationBuilder.DropColumn(
                name: "ClosureApprovalNote",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "ClosureApprovalStatus",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "ClosureApprovedAt",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "DueAt",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "RequestType",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "RequestedAppointmentAt",
                table: "EmergencyRequests");

            migrationBuilder.DropColumn(
                name: "Subject",
                table: "EmergencyRequests");
        }
    }
}
