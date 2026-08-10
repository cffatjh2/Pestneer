using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pesneer.Api.Data.PostgresMigrations
{
    /// <inheritdoc />
    public partial class AddCorrectiveActionsPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CorrectiveActions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerBranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    Number = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    SourceType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    Category = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Problem = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    RootCause = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    ProposedAction = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ResponsibleParty = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Priority = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    VerifiedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CustomerApprovalStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CustomerApprovalAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CustomerApprovalNote = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RecurrenceKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    RecurrenceCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CorrectiveActions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CorrectiveActions_Accounts_AssignedAccountId",
                        column: x => x.AssignedAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CorrectiveActions_Accounts_CreatedByAccountId",
                        column: x => x.CreatedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CorrectiveActions_CustomerBranches_CustomerBranchId",
                        column: x => x.CustomerBranchId,
                        principalTable: "CustomerBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CorrectiveActions_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CorrectiveActionEvidence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrectiveActionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UploadedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Stage = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    Note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CorrectiveActionEvidence", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CorrectiveActionEvidence_Accounts_UploadedByAccountId",
                        column: x => x.UploadedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CorrectiveActionEvidence_CorrectiveActions_CorrectiveAction~",
                        column: x => x.CorrectiveActionId,
                        principalTable: "CorrectiveActions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CorrectiveActionHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrectiveActionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedByAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Note = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CorrectiveActionHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CorrectiveActionHistories_Accounts_ChangedByAccountId",
                        column: x => x.ChangedByAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CorrectiveActionHistories_CorrectiveActions_CorrectiveActio~",
                        column: x => x.CorrectiveActionId,
                        principalTable: "CorrectiveActions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionEvidence_CompanyId_CorrectiveActionId_Creat~",
                table: "CorrectiveActionEvidence",
                columns: new[] { "CompanyId", "CorrectiveActionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionEvidence_CorrectiveActionId",
                table: "CorrectiveActionEvidence",
                column: "CorrectiveActionId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionEvidence_UploadedByAccountId",
                table: "CorrectiveActionEvidence",
                column: "UploadedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionHistories_ChangedByAccountId",
                table: "CorrectiveActionHistories",
                column: "ChangedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionHistories_CompanyId_CorrectiveActionId_Occu~",
                table: "CorrectiveActionHistories",
                columns: new[] { "CompanyId", "CorrectiveActionId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActionHistories_CorrectiveActionId",
                table: "CorrectiveActionHistories",
                column: "CorrectiveActionId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_AssignedAccountId",
                table: "CorrectiveActions",
                column: "AssignedAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_CompanyId_CustomerId_CustomerBranchId_Sta~",
                table: "CorrectiveActions",
                columns: new[] { "CompanyId", "CustomerId", "CustomerBranchId", "Status", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_CompanyId_Number",
                table: "CorrectiveActions",
                columns: new[] { "CompanyId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_CompanyId_SourceType_SourceId",
                table: "CorrectiveActions",
                columns: new[] { "CompanyId", "SourceType", "SourceId" });

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_CreatedByAccountId",
                table: "CorrectiveActions",
                column: "CreatedByAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_CustomerBranchId",
                table: "CorrectiveActions",
                column: "CustomerBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_CorrectiveActions_CustomerId",
                table: "CorrectiveActions",
                column: "CustomerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CorrectiveActionEvidence");

            migrationBuilder.DropTable(
                name: "CorrectiveActionHistories");

            migrationBuilder.DropTable(
                name: "CorrectiveActions");
        }
    }
}
