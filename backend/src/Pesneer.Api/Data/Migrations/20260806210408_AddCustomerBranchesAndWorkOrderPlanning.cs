using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerBranchesAndWorkOrderPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssignedEmployeeAccountId",
                table: "WorkOrders",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerBranchId",
                table: "WorkOrders",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DurationMinutes",
                table: "WorkOrders",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "WorkOrders",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "Customers",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Customers",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "Customers",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "District",
                table: "Customers",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "Customers",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Latitude",
                table: "Customers",
                precision: 9,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Longitude",
                table: "Customers",
                precision: 9,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhoneNumber",
                table: "Customers",
                maxLength: 24,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CustomerBranches",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    CustomerId = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(maxLength: 160, nullable: false),
                    Code = table.Column<string>(maxLength: 64, nullable: false),
                    Address = table.Column<string>(maxLength: 500, nullable: false),
                    City = table.Column<string>(maxLength: 80, nullable: true),
                    District = table.Column<string>(maxLength: 80, nullable: true),
                    ContactName = table.Column<string>(maxLength: 160, nullable: true),
                    PhoneNumber = table.Column<string>(maxLength: 24, nullable: true),
                    Email = table.Column<string>(maxLength: 320, nullable: true),
                    Latitude = table.Column<decimal>(precision: 9, scale: 6, nullable: true),
                    Longitude = table.Column<decimal>(precision: 9, scale: 6, nullable: true),
                    IsActive = table.Column<bool>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerBranches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerBranches_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_AssignedEmployeeAccountId",
                table: "WorkOrders",
                column: "AssignedEmployeeAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_CustomerBranchId",
                table: "WorkOrders",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerBranches_CompanyId_CustomerId_Code",
                table: "CustomerBranches",
                columns: new[] { "CompanyId", "CustomerId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerBranches_CustomerId",
                table: "CustomerBranches",
                column: "CustomerId");

            migrationBuilder.AddForeignKey(
                name: "FK_WorkOrders_Accounts_AssignedEmployeeAccountId",
                table: "WorkOrders",
                column: "AssignedEmployeeAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkOrders_CustomerBranches_CustomerBranchId",
                table: "WorkOrders",
                column: "CustomerBranchId",
                principalTable: "CustomerBranches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WorkOrders_Accounts_AssignedEmployeeAccountId",
                table: "WorkOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkOrders_CustomerBranches_CustomerBranchId",
                table: "WorkOrders");

            migrationBuilder.DropTable(
                name: "CustomerBranches");

            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_AssignedEmployeeAccountId",
                table: "WorkOrders");

            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_CustomerBranchId",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "AssignedEmployeeAccountId",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "CustomerBranchId",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "DurationMinutes",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "Address",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "District",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "PhoneNumber",
                table: "Customers");
        }
    }
}
