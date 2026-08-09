using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddCustomerCommercialPortalPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CustomerDecisionAt",
                table: "CommercialProposals",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerDecisionByAccountId",
                table: "CommercialProposals",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomerDecisionNote",
                table: "CommercialProposals",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.Sql("UPDATE \"CommercialProposals\" SET \"Status\" = 'PendingApproval' WHERE \"Status\" = 'Draft'");
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
