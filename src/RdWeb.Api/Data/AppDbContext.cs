using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RecoveryCode> RecoveryCodes => Set<RecoveryCode>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<RustDeskServer> RustDeskServers => Set<RustDeskServer>();
    public DbSet<EncryptedSecret> EncryptedSecrets => Set<EncryptedSecret>();
    public DbSet<Target> Targets => Set<Target>();
    public DbSet<TargetPermission> TargetPermissions => Set<TargetPermission>();

    // 定義正式 schema 的約束、索引與 UTC 型別，與 M0 表格保持分離。
    protected override void OnModelCreating(ModelBuilder model)
    {
        var users = model.Entity<User>();
        users.ToTable("users", table => table.HasCheckConstraint("ck_users_role", "role IN ('admin','operator','viewer')"));
        users.HasIndex(user => user.NormalizedUsername).IsUnique();
        users.Property(user => user.Username).HasMaxLength(128);
        users.Property(user => user.NormalizedUsername).HasMaxLength(128);
        users.Property(user => user.Email).HasMaxLength(320);
        users.Property(user => user.PasswordHash).HasMaxLength(512);
        users.Property(user => user.Role).HasMaxLength(16);
        var codes = model.Entity<RecoveryCode>();
        codes.ToTable("recovery_codes");
        codes.HasOne<User>().WithMany().HasForeignKey(code => code.UserId).OnDelete(DeleteBehavior.Cascade);
        codes.Property(code => code.CodeHash).HasMaxLength(512);
        var tokens = model.Entity<RefreshToken>();
        tokens.ToTable("refresh_tokens");
        tokens.HasOne<User>().WithMany().HasForeignKey(token => token.UserId).OnDelete(DeleteBehavior.Cascade);
        tokens.HasIndex(token => token.ExpiresAt);
        tokens.HasIndex(token => token.FamilyId);
        tokens.Property(token => token.TokenHash).HasMaxLength(64);
        tokens.Property(token => token.UserAgent).HasMaxLength(512);
        tokens.Property(token => token.Ip).HasMaxLength(45);
        var settings = model.Entity<SystemSetting>();
        settings.ToTable("system_settings", table => table.HasCheckConstraint("ck_settings_json", "json_valid(value)"));
        settings.HasIndex(setting => setting.Key).IsUnique();
        settings.Property(setting => setting.Key).HasMaxLength(128);
        var audits = model.Entity<AuditLog>();
        audits.ToTable("audit_logs", table => table.HasCheckConstraint("ck_audit_json", "json_valid(detail)"));
        audits.HasOne<User>().WithMany().HasForeignKey(audit => audit.UserId).OnDelete(DeleteBehavior.SetNull);
        audits.HasIndex(audit => audit.Timestamp);
        audits.HasIndex(audit => new { audit.UserId, audit.Timestamp });
        audits.HasIndex(audit => new { audit.Action, audit.Timestamp });
        audits.Property(audit => audit.Timestamp).HasColumnName("ts");
        audits.Property(audit => audit.Action).HasMaxLength(64);
        audits.Property(audit => audit.ObjectType).HasMaxLength(32);
        audits.Property(audit => audit.SourceIp).HasMaxLength(45);
        audits.Property(audit => audit.UserAgent).HasMaxLength(512);
        audits.Property(audit => audit.Result).HasMaxLength(32);
        var servers = model.Entity<RustDeskServer>();
        servers.ToTable("rustdesk_servers", table => table.HasCheckConstraint("ck_servers_transport", "transport IN ('tcp','ws')"));
        servers.Property(server => server.Name).HasMaxLength(128);
        servers.Property(server => server.IdServer).HasMaxLength(320);
        servers.Property(server => server.RelayServer).HasMaxLength(320);
        servers.Property(server => server.PublicKey).HasMaxLength(44);
        servers.Property(server => server.Transport).HasMaxLength(3);
        servers.Property(server => server.Notes).HasMaxLength(2000);
        var secrets = model.Entity<EncryptedSecret>();
        secrets.ToTable("encrypted_secrets", table =>
        {
            table.HasCheckConstraint("ck_secrets_type", "object_type='target'");
            table.HasCheckConstraint("ck_secrets_envelope", "length(nonce)=12 AND length(ciphertext)>16 AND length(ciphertext)<=4112 AND key_version>0");
        });
        secrets.Property(secret => secret.ObjectType).HasMaxLength(16);
        secrets.HasIndex(secret => new { secret.ObjectType, secret.ObjectId }).IsUnique();
        var targets = model.Entity<Target>();
        targets.ToTable("targets", table => table.HasCheckConstraint("ck_targets_tags", "json_valid(tags) AND json_type(tags)='array'"));
        targets.Property(target => target.Name).HasMaxLength(128);
        targets.Property(target => target.RustDeskId).HasMaxLength(64);
        targets.Property(target => target.GroupName).HasMaxLength(64);
        targets.Property(target => target.Tags).HasMaxLength(4096);
        targets.Property(target => target.Notes).HasMaxLength(2000);
        targets.HasIndex(target => new { target.ServerId, target.RustDeskId }).IsUnique();
        targets.HasOne<RustDeskServer>().WithMany().HasForeignKey(target => target.ServerId).OnDelete(DeleteBehavior.Restrict);
        targets.HasOne<User>().WithMany().HasForeignKey(target => target.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        targets.HasOne<EncryptedSecret>().WithOne().HasForeignKey<Target>(target => target.PasswordSecretId).OnDelete(DeleteBehavior.Restrict);
        var permissions = model.Entity<TargetPermission>();
        permissions.ToTable("target_permissions", table =>
        {
            table.HasCheckConstraint("ck_target_permission_subject", "(user_id IS NOT NULL AND role IS NULL) OR (user_id IS NULL AND role IS NOT NULL AND role IN ('operator','viewer'))");
            table.HasCheckConstraint("ck_target_permission_viewer", "role IS NULL OR role <> 'viewer' OR (can_connect=0 AND can_view_password=0 AND can_edit=0)");
        });
        permissions.Property(permission => permission.Role).HasMaxLength(8);
        permissions.HasOne<Target>().WithMany().HasForeignKey(permission => permission.TargetId).OnDelete(DeleteBehavior.Cascade);
        permissions.HasOne<User>().WithMany().HasForeignKey(permission => permission.UserId).OnDelete(DeleteBehavior.Cascade);
        permissions.HasIndex(permission => new { permission.TargetId, permission.UserId }).IsUnique();
        permissions.HasIndex(permission => new { permission.TargetId, permission.Role }).IsUnique();
        var utc = new ValueConverter<DateTime, DateTime>(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        foreach (var entity in model.Model.GetEntityTypes())
        {
            model.Entity(entity.ClrType).HasKey(nameof(Entity.Id));
            model.Entity(entity.ClrType).Property(nameof(Entity.Version)).IsConcurrencyToken();
            foreach (var property in entity.GetProperties())
            {
                if (property.Name != nameof(AuditLog.Timestamp)) property.SetColumnName(ToSnakeCase(property.Name));
                if (property.ClrType == typeof(DateTime) || property.ClrType == typeof(DateTime?)) property.SetValueConverter(utc);
            }
        }
    }

    // 同步儲存也強制使用 UTC 與整數版本，不容許繞過一致性檢查。
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        PrepareChanges();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    // 非同步儲存使用相同驗證，並將取消傳遞給 SQLite。
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        PrepareChanges();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    // 更新版本由讀取時的原始值衍生，避免使用者修改 Version 規避衝突。
    private void PrepareChanges()
    {
        foreach (var entry in ChangeTracker.Entries<Entity>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified)) continue;
            foreach (var property in entry.Properties)
            {
                if (property.CurrentValue is DateTime value && value.Kind != DateTimeKind.Utc)
                    throw new InvalidOperationException("資料庫時間必須是 UTC。");
                if (property.CurrentValue is string text && property.Metadata.GetMaxLength() is int maximum && text.Length > maximum)
                    throw new InvalidOperationException("資料欄位超過長度限制。");
            }
            if (entry.State == EntityState.Added) entry.Entity.Version = 1;
            else
            {
                entry.Property(entity => entity.CreatedAt).IsModified = false;
                entry.Entity.UpdatedAt = DateTime.UtcNow;
                entry.Entity.Version = checked(entry.Property(entity => entity.Version).OriginalValue + 1);
            }
        }
    }

    // 產生可攜且一致的 snake_case 欄位名稱。
    private static string ToSnakeCase(string name) => string.Concat(name.Select((character, index) =>
        char.IsUpper(character) && index > 0 ? "_" + char.ToLowerInvariant(character) : char.ToLowerInvariant(character).ToString()));
}
