using System.Globalization;
using StackExchange.Redis;

namespace RdWeb.Api.Infrastructure.Kv;

public sealed class RedisKvStore(IConnectionMultiplexer connection, string prefix = "rdweb:") : IKvStore
{
    private readonly IDatabase _database = connection.GetDatabase();
    private const string TakeScript = "local v=redis.call('GET',KEYS[1]); redis.call('DEL',KEYS[1]); return v";
    private const string IncrementScript = """
        local v=redis.call('GET',KEYS[1])
        if v and not string.match(v,'^%d+$') then return redis.error_reply('Invalid counter') end
        redis.call('INCR',KEYS[1])
        if not v and tonumber(ARGV[1])>0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end
        return redis.call('GET',KEYS[1])
        """;
    private const string DecrementScript = """
        local v=redis.call('GET',KEYS[1])
        if not v then return '0' end
        if not string.match(v,'^%d+$') then return redis.error_reply('Invalid counter') end
        if v~='0' then redis.call('DECR',KEYS[1]) end
        return redis.call('GET',KEYS[1])
        """;

    // 讀取 Redis 自動過期的字串。
    public async Task<string?> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        MemoryKvStore.Validate(key, null, cancellationToken);
        var result = await _database.StringGetAsync(prefix + key).WaitAsync(cancellationToken);
        return result.IsNull ? null : result.ToString();
    }

    // 寫入時使用毫秒期限，避免小數秒 TTL 變成無期限。
    public async Task SetWithTtlAsync(string key, string value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        MemoryKvStore.Validate(key, ttl, cancellationToken);
        ArgumentNullException.ThrowIfNull(value);
        await _database.StringSetAsync(prefix + key, value, ttl).WaitAsync(cancellationToken);
    }

    // Redis 的 NX 與 expiry 在同一命令執行。
    public async Task<bool> SetIfAbsentWithTtlAsync(string key, string value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        MemoryKvStore.Validate(key, ttl, cancellationToken);
        ArgumentNullException.ThrowIfNull(value);
        return await _database.StringSetAsync(prefix + key, value, ttl, When.NotExists).WaitAsync(cancellationToken);
    }

    // Lua 將 GET 與 DEL 合併為不可分割操作。
    public async Task<string?> TakeOnceAsync(string key, CancellationToken cancellationToken = default)
    {
        MemoryKvStore.Validate(key, null, cancellationToken);
        var result = await _database.ScriptEvaluateAsync(TakeScript, [prefix + key]).WaitAsync(cancellationToken);
        return result.IsNull ? null : result.ToString();
    }

    // 只在首次遞增設定 expiry，以 Redis 整數操作避免浮點精度損失。
    public async Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        MemoryKvStore.Validate(key, ttl, cancellationToken);
        var result = await _database.ScriptEvaluateAsync(IncrementScript, [prefix + key], [(long)(ttl?.TotalMilliseconds ?? 0)]).WaitAsync(cancellationToken);
        return long.Parse(result.ToString(), CultureInfo.InvariantCulture);
    }

    // 不建立不存在的值，DECR 保留原本的 TTL。
    public async Task<long> DecrementAsync(string key, CancellationToken cancellationToken = default)
    {
        MemoryKvStore.Validate(key, null, cancellationToken);
        var result = await _database.ScriptEvaluateAsync(DecrementScript, [prefix + key]).WaitAsync(cancellationToken);
        return long.Parse(result.ToString(), CultureInfo.InvariantCulture);
    }

    // 單實例啟動時用 SCAN 清除本 namespace 的連線計數。
    public async Task ResetConnectionCountsAsync(CancellationToken cancellationToken = default)
    {
        foreach (var endpoint in connection.GetEndPoints())
        {
            var server = connection.GetServer(endpoint);
            if (server.IsReplica) continue;
            await foreach (var key in server.KeysAsync(_database.Database, prefix + "conn:*").WithCancellation(cancellationToken))
                await _database.KeyDeleteAsync(key).WaitAsync(cancellationToken);
        }
    }
}
