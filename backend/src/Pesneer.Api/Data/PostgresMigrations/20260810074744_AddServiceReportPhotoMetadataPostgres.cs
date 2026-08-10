using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddServiceReportPhotoMetadataPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "WorkOrderPhotos",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "WorkOrderPhotos",
                type: "character varying(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "WorkOrderPhotos",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "WorkType",
                table: "ServiceReports",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(120)",
                oldMaxLength: 120,
                oldNullable: true);
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

            migrationBuilder.AlterColumn<string>(
                name: "WorkType",
                table: "ServiceReports",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(500)",
                oldMaxLength: 500,
                oldNullable: true);
        }
    }
}
