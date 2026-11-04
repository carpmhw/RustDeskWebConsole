using Microsoft.EntityFrameworkCore;

namespace RdWeb.Api.Data;

public sealed class SpikeDbContext(DbContextOptions<SpikeDbContext> options) : DbContext(options)
{
    public DbSet<SpikeUser> Users => Set<SpikeUser>();
    public DbSet<SpikeAudit> Audits => Set<SpikeAudit>();

    // 僅供 M0 驗證型別、JSON、外鍵與並發，M1 另建正式資料模型。
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var users = modelBuilder.Entity<SpikeUser>();
        users.ToTable("spike_users");
        users.HasKey(user => user.Id);
        users.Property(user => user.Version).IsConcurrencyToken();
        users.Property(user => user.CreatedAt).HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        var audits = modelBuilder.Entity<SpikeAudit>();
        audits.ToTable("spike_audits");
        audits.HasKey(audit => audit.Id);
        audits.HasOne<SpikeUser>().WithMany().HasForeignKey(audit => audit.UserId);
        audits.HasIndex(audit => audit.Timestamp);
        audits.Property(audit => audit.Timestamp).HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
