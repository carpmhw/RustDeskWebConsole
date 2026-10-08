using System.Globalization;
using System.Text.Json;
using RdWeb.Api.Infrastructure;
using Serilog.Events;
using Serilog.Parsing;

namespace RdWeb.Tests;

public sealed class TimeZoneLogFormatterTests
{
    // 固定事件時間不受宿主或 Docker 本地時區影響，並驗證夏令時間。
    [Theory]
    [InlineData("UTC", "2026-10-07T16:00:00Z", "2026-10-07T16:00:00.0000000+00:00")]
    [InlineData("Asia/Taipei", "2026-10-07T16:00:00Z", "2026-10-08T00:00:00.0000000+08:00")]
    [InlineData("America/New_York", "2026-01-01T12:00:00Z", "2026-01-01T07:00:00.0000000-05:00")]
    [InlineData("America/New_York", "2026-07-01T12:00:00Z", "2026-07-01T08:00:00.0000000-04:00")]
    public void TimestampUsesConfiguredZone(string zone, string utc, string expected)
    {
        var logEvent = new LogEvent(DateTimeOffset.Parse(utc, CultureInfo.InvariantCulture), LogEventLevel.Information, null, new MessageTemplateParser().Parse("時區驗證"), []);
        using var writer = new StringWriter(CultureInfo.InvariantCulture);
        new TimeZoneLogFormatter(zone).Format(logEvent, writer);
        using var json = JsonDocument.Parse(writer.ToString());
        Assert.Equal(expected, json.RootElement.GetProperty("Timestamp").GetString());
        Assert.Equal(zone, json.RootElement.GetProperty("Properties").GetProperty("LogTimeZone").GetString());
        Assert.Equal(TimeSpan.Zero, logEvent.Timestamp.Offset);
    }

    // 無效時區必須在啟動設定時就被拒絕，不能默默使用容器本地時區。
    [Fact]
    public void InvalidZoneIsRejected()
    {
        Assert.Throws<TimeZoneNotFoundException>(() => new TimeZoneLogFormatter("Not/AZone"));
    }
}
