using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace RdWeb.Api.Data;

public sealed class SqliteConnectionInterceptor : DbConnectionInterceptor
{
    // 每條同步連線都啟用外鍵、短暫鎖等待與 WAL 配套的同步模式。
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;";
        command.ExecuteNonQuery();
    }

    // 每條非同步連線使用相同 PRAGMA，避免只有初始化連線受到保護。
    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;";
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
