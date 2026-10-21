using System;

// 對外只傳安全布林／有界count／固定code；通知序號／版本／時間與文本留child RAM。
public sealed class HostClipboardNotificationCalibrationResult
{
    public bool ScopeVerified;
    public bool Readable;
    public bool Stable;
    public bool Exact;
    public bool? OwnerMatchesEditor;
    public int Notifications;
    public bool Overflow;
    public bool ReadResourcesClosed;
    public string Code="host_capability_unavailable";
    public bool NotificationObserved;
    public bool NotificationAfterArm;
    public bool NotificationOrderVerified;
    public bool NotificationVersionMatched;
}

// 累計真正listener Drain的metadata；不poll sequence、不讀或寫clip，也不替換第一筆通知。
public sealed class HostClipboardNotificationCalibration
{
    private HostClipboardNotice first;
    private long lastUs;
    public int Notifications { get; private set; }
    public bool Overflow { get; private set; }

    // 整批先驗連續ordinal／clock／64上限；可變caller物件不能更改已綁首通知。
    public void Capture(HostClipboardNotice[] batch,bool overflow)
    {
        if (batch==null || batch.Length>64-Notifications) throw new ArgumentException("host_capability_unavailable");
        long previous=lastUs;
        for (int i=0;i<batch.Length;i++)
        {
            HostClipboardNotice item=batch[i];
            if (item==null || item.Ordinal!=Notifications+i+1 || item.Us<previous || item.Us>120000000) throw new ArgumentException("host_capability_unavailable");
            previous=item.Us;
        }
        if (first==null && batch.Length>0) first=Copy(batch[0]);
        Notifications+=batch.Length;lastUs=previous;Overflow|=overflow;
    }

    // native通知副本只供child取得ReadClipboard所需version，不屬公開結果DTO。
    public HostClipboardNotice First() { return first==null ? null : Copy(first); }

    // 沒有通知／pre-arm／零版本／overflow不可read，不改挑第二筆通知或重試。
    public bool CanRead(long armUs,long startUs)
    {
        CheckTime(armUs);CheckTime(startUs);
        return !Overflow && first!=null && first.Version!=0 && armUs<=first.Us && first.Us<=startUs;
    }

    // 通知相等須真同版本與有序讀取區間；沿既有public全文Ordinal oracle，owner不當因果。
    public HostClipboardNotificationCalibrationResult Classify(HostClipboardValue value,bool scope,long armUs,long startUs,long endUs,uint tailVersion)
    {
        CheckTime(armUs);CheckTime(startUs);CheckTime(endUs);
        HostClipboardNotificationCalibrationResult result=new HostClipboardNotificationCalibrationResult {
            ScopeVerified=scope,Notifications=Notifications,Overflow=Overflow,
            ReadResourcesClosed=value==null || value.ResourcesClosed,
            NotificationObserved=first!=null,NotificationAfterArm=first!=null && armUs<=first.Us,
            NotificationOrderVerified=first!=null && armUs<=first.Us && first.Us<=startUs && startUs<=endUs
        };
        if (!result.ReadResourcesClosed) {result.Code="host_cleanup_unavailable";return result;}
        if (!scope) {result.Code="host_scope_changed";return result;}
        if (Overflow) {result.Code="host_observation_overflow";return result;}
        if (first==null) {result.Code="host_notification_unavailable";return result;}
        if (!CanRead(armUs,startUs) || !result.NotificationOrderVerified) {result.Code="host_clipboard_unstable";return result;}
        if (value==null) return result;
        HostClipboardCalibrationResult classified=HostClipboardCalibration.Classify(value,scope,Notifications,Overflow);
        result.Code=classified.Code;
        if (!classified.Readable) return result;
        result.NotificationVersionMatched=classified.Stable && HostObserverNative.SameClipboardVersion(first.Version,value.Version,tailVersion);
        if (!result.NotificationVersionMatched) {result.Code="host_clipboard_unstable";return result;}
        result.Readable=classified.Readable;result.Stable=classified.Stable;result.Exact=classified.Exact;result.OwnerMatchesEditor=classified.OwnerMatchesEditor;
        return result;
    }

    // 比較／副本只RAM，避免caller篡改notice後把superseded內容貼到第一筆。
    private static HostClipboardNotice Copy(HostClipboardNotice value) { return new HostClipboardNotice {Ordinal=value.Ordinal,Us=value.Us,Version=value.Version}; }
    // 只接受本輪0..120秒內的Windows單調微秒，不作跨時鐘排序。
    private static void CheckTime(long value) { if (value<0 || value>120000000) throw new ArgumentException("host_capability_unavailable"); }
}
