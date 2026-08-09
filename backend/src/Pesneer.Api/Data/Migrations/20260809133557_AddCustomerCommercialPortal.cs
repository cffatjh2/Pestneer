using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerCommercialPortal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CustomerDecisionAt",
                table: "CommercialProposals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerDecisionByAccountId",
                table: "CommercialProposals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomerDecisionNote",
                table: "CommercialProposals",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.Sql("UPDATE CommercialProposals SET Status = 'PendingApproval' WHERE Status = 'Draft'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CustomerDecisionAt",
                table: "CommercialProposals");

            migrationBuilder.DropColumn(
                name: "CustomerDecisionByAccountId",
                table: "CommercialProposals");

            migrationBuilder.DropColumn(
                name: "CustomerDecisionNote",
                table: "CommercialProposals");
        }
    }
}
