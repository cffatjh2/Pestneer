using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddSitePlansPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SitePlanId",
                table: "QualityDocuments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SitePlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    AreaName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    FieldGuide = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    RevisionNote = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CanvasJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SitePlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SitePlans_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SitePlans_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SitePlans_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QualityDocuments_SitePlanId",
                table: "QualityDocuments",
                column: "SitePlanId");

            migrationBuilder.CreateIndex(
                name: "IX_SitePlans_CompanyId_CustomerId_CustomerBranchId_UpdatedAt",
                table: "SitePlans",
                columns: new[] { "CompanyId", "CustomerId", "CustomerBranchId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SitePlans_CompanyId_Number",
                table: "SitePlans",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SitePlans_CreatedByAccountId",
                table: "SitePlans",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_SitePlans_CustomerBranchId",
                table: "SitePlans",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SitePlans_CustomerId",
                table: "SitePlans",
                column: "CustomerId");

            migrationBuilder.AddForeignKey(
                name: "FK_QualityDocuments_SitePlans_SitePlanId",
                table: "QualityDocuments",
                column: "SitePlanId",
                principalTable: "SitePlans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_QualityDocuments_SitePlans_SitePlanId",
                table: "QualityDocuments");

            migrationBuilder.DropTable(
                name: "SitePlans");

            migrationBuilder.DropIndex(
                name: "IX_QualityDocuments_SitePlanId",
                table: "QualityDocuments");

            migrationBuilder.DropColumn(
                name: "SitePlanId",
                table: "QualityDocuments");
        }
    }
}
