using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RdWeb.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ServerVault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "encrypted_secrets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    object_type = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    object_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ciphertext = table.Column<byte[]>(type: "BLOB", nullable: false),
                    nonce = table.Column<byte[]>(type: "BLOB", nullable: false),
                    key_version = table.Column<int>(type: "INTEGER", nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_encrypted_secrets", x => x.id);
                    table.CheckConstraint("ck_secrets_envelope", "length(nonce)=12 AND length(ciphertext)>16 AND length(ciphertext)<=4112 AND key_version>0");
                    table.CheckConstraint("ck_secrets_type", "object_type='target'");
                });

            migrationBuilder.CreateTable(
                name: "rustdesk_servers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    name = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    id_server = table.Column<string>(type: "TEXT", maxLength: 320, nullable: false),
                    relay_server = table.Column<string>(type: "TEXT", maxLength: 320, nullable: false),
                    public_key = table.Column<string>(type: "TEXT", maxLength: 44, nullable: false),
                    transport = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    enabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    allow_private_network = table.Column<bool>(type: "INTEGER", nullable: false),
                    notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rustdesk_servers", x => x.id);
                    table.CheckConstraint("ck_servers_transport", "transport IN ('tcp','ws')");
                });

            migrationBuilder.CreateIndex(
                name: "IX_encrypted_secrets_object_type_object_id",
                table: "encrypted_secrets",
                columns: new[] { "object_type", "object_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "encrypted_secrets");

            migrationBuilder.DropTable(
                name: "rustdesk_servers");
        }
    }
}
