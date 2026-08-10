using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddServiceReportPhotoMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "WorkOrderPhotos",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "WorkOrderPhotos",
                type: "TEXT",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "WorkOrderPhotos",
                type: "TEXT",
                maxLength: 80,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "WorkOrderPhotos");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "WorkOrderPhotos");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "WorkOrderPhotos");
        }
    }
}
