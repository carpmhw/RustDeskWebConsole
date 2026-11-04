using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RdWeb.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialSpike : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "spike_users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_spike_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "spike_audits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Detail = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_spike_audits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_spike_audits_spike_users_UserId",
                        column: x => x.UserId,
                        principalTable: "spike_users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_spike_audits_Timestamp",
                table: "spike_audits",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_spike_audits_UserId",
                table: "spike_audits",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "spike_audits");

            migrationBuilder.DropTable(
                name: "spike_users");
        }
    }
}
