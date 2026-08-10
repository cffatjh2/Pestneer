using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOptionalWasteDisposals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WasteDisposalRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    WorkOrderId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<string>(type: "TEXT", maxLength: 48, nullable: false),
                    WasteType = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Quantity = table.Column<decimal>(type: "TEXT", precision: 14, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    GeneratedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    TemporaryStorage = table.Column<string>(type: "TEXT", maxLength: 240, nullable: true),
                    RecipientName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    CarrierOrFacility = table.Column<string>(type: "TEXT", maxLength: 240, nullable: true),
                    DisposalMethod = table.Column<string>(type: "TEXT", maxLength: 240, nullable: true),
                    DocumentNumber = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WasteDisposalRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WasteDisposalRecords_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WasteDisposalRecords_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WasteDisposalRecords_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WasteDisposalRecords_WorkOrders_WorkOrderId",
                        column: x => x.WorkOrderId,
                        principalTable: "WorkOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "WasteDisposalEvidence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    WasteDisposalRecordId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UploadedByAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Data = table.Column<byte[]>(type: "BLOB", nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WasteDisposalEvidence", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WasteDisposalEvidence_Accounts_UploadedByAccountId",
                        column: x => x.UploadedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WasteDisposalEvidence_WasteDisposalRecords_WasteDisposalRecordId",
                        column: x => x.WasteDisposalRecordId,
                        principalTable: "WasteDisposalRecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalEvidence_CompanyId_WasteDisposalRecordId_CreatedAt",
                table: "WasteDisposalEvidence",
                columns: new[] { "CompanyId", "WasteDisposalRecordId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalEvidence_UploadedByAccountId",
                table: "WasteDisposalEvidence",
                column: "UploadedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalEvidence_WasteDisposalRecordId",
                table: "WasteDisposalEvidence",
                column: "WasteDisposalRecordId");

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalRecords_CompanyId_CustomerId_CustomerBranchId_GeneratedAt",
                table: "WasteDisposalRecords",
                columns: new[] { "CompanyId", "CustomerId", "CustomerBranchId", "GeneratedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalRecords_CompanyId_Number",
                table: "WasteDisposalRecords",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalRecords_CreatedByAccountId",
                table: "WasteDisposalRecords",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalRecords_CustomerBranchId",
                table: "WasteDisposalRecords",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalRecords_CustomerId",
                table: "WasteDisposalRecords",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_WasteDisposalRecords_WorkOrderId",
                table: "WasteDisposalRecords",
                column: "WorkOrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WasteDisposalEvidence");

            migrationBuilder.DropTable(
                name: "WasteDisposalRecords");
        }
    }
}
