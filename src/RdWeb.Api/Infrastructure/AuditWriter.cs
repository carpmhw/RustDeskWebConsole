using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;

namespace RdWeb.Api.Infrastructure;

public sealed class AuditWriter(IDbContextFactory<AppDbContext> factory, int capacity = 256) : BackgroundService
{
    private readonly Channel<AuditLog> _channel = Channel.CreateBounded<AuditLog>(new BoundedChannelOptions(capacity)
    {
        SingleReader = true,
        FullMode = BoundedChannelFullMode.Wait,
        AllowSynchronousContinuations = false
    });
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    // 僅接受分類事件及固定無敏感 detail，滿佇列時等待而不丟棄。
    public async Task WriteAsync(AuditEvent audit, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(audit);
        if (!Enum.IsDefined(audit.Action) || !Enum.IsDefined(audit.Result)
            || audit.Detail?.ReasonCode is { } reason && !Enum.IsDefined(reason)
            || audit.Detail?.DurationMilliseconds < 0 || audit.Detail?.BytesSent < 0 || audit.Detail?.BytesReceived < 0
            || audit.ObjectType is not (null or "user" or "target" or "server" or "setting" or "connection")
            || audit.SourceIp?.Length > 45 || audit.UserAgent?.Length > 512)
            throw new ArgumentException("稽核事件格式無效。", nameof(audit));
        await _channel.Writer.WriteAsync(new AuditLog
        {
            Action = audit.Action.ToString(),
            Result = audit.Result.ToString(),
            UserId = audit.UserId,
            ObjectType = audit.ObjectType,
            ObjectId = audit.ObjectId,
            SourceIp = audit.SourceIp,
            UserAgent = audit.UserAgent,
            Detail = JsonSerializer.Serialize(audit.Detail ?? new(), JsonOptions)
        }, cancellationToken);
    }

    // 單一消費者以小批次短交易寫入，失敗關閉佇列並交由主機觀察。
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (await _channel.Reader.WaitToReadAsync(stoppingToken))
            {
                var batch = new List<AuditLog>(32);
                while (batch.Count < 32 && _channel.Reader.TryRead(out var item)) batch.Add(item);
                await using var database = await factory.CreateDbContextAsync(stoppingToken);
                database.AuditLogs.AddRange(batch);
                await database.SaveChangesAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // 強制停止不當作儲存故障；StopAsync 本身仍回報未能排空的取消。
            _channel.Writer.TryComplete();
        }
        catch
        {
            // 不傳遞可能含 SQL 值的內部例外，只保留固定診斷。
            var failure = new InvalidOperationException("稽核儲存失敗。");
            _channel.Writer.TryComplete(failure);
            throw failure;
        }
    }

    // 先停止接受事件並排空，不使用 BackgroundService 的提前取消行為。
    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _channel.Writer.TryComplete();
        try
        {
            if (ExecuteTask != null) await ExecuteTask.WaitAsync(cancellationToken);
        }
        finally
        {
            // 逾時或儲存失敗時也取消消費者，避免主機釋放 DI 後仍繼續寫入。
            await base.StopAsync(cancellationToken);
        }
    }
}
