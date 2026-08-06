using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InventoryItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CompanyId = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(maxLength: 160, nullable: false),
                    NormalizedName = table.Column<string>(maxLength: 160, nullable: false),
                    Category = table.Column<string>(maxLength: 80, nullable: false),
                    Quantity = table.Column<decimal>(precision: 12, scale: 2, nullable: false),
                    Unit = table.Column<string>(maxLength: 24, nullable: false),
                    MinimumQuantity = table.Column<decimal>(precision: 12, scale: 2, nullable: false),
                    LotNumber = table.Column<string>(maxLength: 80, nullable: true),
                    LastMovementAt = table.Column<DateTimeOffset>(nullable: false),
                    IsActive = table.Column<bool>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryItems", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryItems_CompanyId_NormalizedName_LotNumber",
                table: "InventoryItems",
                columns: new[] { "CompanyId", "NormalizedName", "LotNumber" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InventoryItems");
        }
    }
}
