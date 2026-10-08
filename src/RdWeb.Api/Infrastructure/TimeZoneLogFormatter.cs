using Serilog.Events;
using Serilog.Formatting;
using Serilog.Formatting.Json;

namespace RdWeb.Api.Infrastructure;

public sealed class TimeZoneLogFormatter(string timeZoneId) : ITextFormatter
{
    private readonly JsonFormatter formatter = new();
    private readonly TimeZoneInfo timeZone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);

    // 僅轉換輸出副本的時間，原始事件維持相同瞬間並保留 trace 與結構化欄位。
    public void Format(LogEvent logEvent, TextWriter output)
    {
        var properties = logEvent.Properties.Where(property => property.Key != "LogTimeZone")
            .Select(property => new LogEventProperty(property.Key, property.Value))
            .Append(new LogEventProperty("LogTimeZone", new ScalarValue(timeZone.Id)));
        var converted = new LogEvent(TimeZoneInfo.ConvertTime(logEvent.Timestamp, timeZone), logEvent.Level,
            logEvent.Exception, logEvent.MessageTemplate, properties, logEvent.TraceId ?? default, logEvent.SpanId ?? default);
        formatter.Format(converted, output);
    }
}
