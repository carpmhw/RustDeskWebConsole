using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RdWeb.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class TargetPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "targets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    server_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    name = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    rust_desk_id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    password_secret_id = table.Column<Guid>(type: "TEXT", nullable: true),
                    group_name = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    tags = table.Column<string>(type: "TEXT", maxLength: 4096, nullable: false),
                    notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    created_by = table.Column<Guid>(type: "TEXT", nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_targets", x => x.id);
                    table.CheckConstraint("ck_targets_tags", "json_valid(tags) AND json_type(tags)='array'");
                    table.ForeignKey(
                        name: "FK_targets_encrypted_secrets_password_secret_id",
                        column: x => x.password_secret_id,
                        principalTable: "encrypted_secrets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_targets_rustdesk_servers_server_id",
                        column: x => x.server_id,
                        principalTable: "rustdesk_servers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_targets_users_created_by",
                        column: x => x.created_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "target_permissions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    target_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    user_id = table.Column<Guid>(type: "TEXT", nullable: true),
                    role = table.Column<string>(type: "TEXT", maxLength: 8, nullable: true),
                    can_connect = table.Column<bool>(type: "INTEGER", nullable: false),
                    can_view_password = table.Column<bool>(type: "INTEGER", nullable: false),
                    can_edit = table.Column<bool>(type: "INTEGER", nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_target_permissions", x => x.id);
                    table.CheckConstraint("ck_target_permission_subject", "(user_id IS NOT NULL AND role IS NULL) OR (user_id IS NULL AND role IS NOT NULL AND role IN ('operator','viewer'))");
                    table.CheckConstraint("ck_target_permission_viewer", "role IS NULL OR role <> 'viewer' OR (can_connect=0 AND can_view_password=0 AND can_edit=0)");
                    table.ForeignKey(
                        name: "FK_target_permissions_targets_target_id",
                        column: x => x.target_id,
                        principalTable: "targets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_target_permissions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_target_permissions_target_id_role",
                table: "target_permissions",
                columns: new[] { "target_id", "role" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_target_permissions_target_id_user_id",
                table: "target_permissions",
                columns: new[] { "target_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_target_permissions_user_id",
                table: "target_permissions",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_targets_created_by",
                table: "targets",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_targets_password_secret_id",
                table: "targets",
                column: "password_secret_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_targets_server_id_rust_desk_id",
                table: "targets",
                columns: new[] { "server_id", "rust_desk_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "target_permissions");

            migrationBuilder.DropTable(
                name: "targets");
        }
    }
}
