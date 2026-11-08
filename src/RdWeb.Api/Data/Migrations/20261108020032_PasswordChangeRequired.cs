using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RdWeb.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PasswordChangeRequired : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "password_change_required",
                table: "users",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "password_change_required",
                table: "users");
        }
    }
}
