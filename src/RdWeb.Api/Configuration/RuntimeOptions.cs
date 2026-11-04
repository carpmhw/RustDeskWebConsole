namespace RdWeb.Api.Configuration;

public sealed record RuntimeOptions(int InstanceCount)
{
    // SQLite 僅支援單實例，即使設定 Redis 也不得放寬。
    public static RuntimeOptions FromConfiguration(IConfiguration configuration)
    {
        if (!int.TryParse(configuration["INSTANCE_COUNT"] ?? "1", out var count) || count != 1)
            throw new InvalidOperationException("SQLite 部署只支援 INSTANCE_COUNT=1。");
        return new(count);
    }
}
