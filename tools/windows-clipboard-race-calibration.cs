using System;

// 對外只安全metadata；兩個notice的native版本／ordinal／Us及text只留child RAM。
public sealed class HostClipboardRaceCalibrationResult
{
    public bool ScopeVerified,FirstNotificationObserved,FirstAfterArm,ReplacementObserved,DifferentVersions,OrderVerified,CurrentVersionMatched,StaleRejected,ReadAttempted,ReadResourcesClosed,Overflow;
    public bool? ContentWasRead;
    public int Notifications;
    public string Code="host_capability_unavailable";
}

// 重用已驗首通知state；只另存首次不同版本，不覆寫首筆或改挑最後一筆。
public sealed class HostClipboardRaceCalibration
{
    private readonly HostClipboardNotificationCalibration notices=new HostClipboardNotificationCalibration();
    private HostClipboardNotice replacement;
    // count只沿已驗有界state，不能在Drain後重起或忽略同版本通知。
    public int Notifications { get { return notices.Notifications; } }
    // overflow沿共享state保持sticky，不因後續空batch消失。
    public bool Overflow { get { return notices.Overflow; } }

    // 已驗ordinal／clock／64容量，保留同版本通知count而非跳過；zero版本也保留並拒絕。
    public void Capture(HostClipboardNotice[] batch,bool overflow)
    {
        notices.Capture(batch,overflow);HostClipboardNotice first=notices.First();
        if (first==null) return;
        foreach (HostClipboardNotice item in batch)
            if (replacement==null && item.Ordinal>first.Ordinal && item.Version!=first.Version) replacement=Copy(item);
    }
    // 只RAM副本供正式reader的notifiedVersion，不序列化native物件。
    public HostClipboardNotice First() { return notices.First(); }
    // 首次replacement不能被第三個版本或caller mutation替代。
    public HostClipboardNotice Replacement() { return replacement==null ? null : Copy(replacement); }
    // 第一筆非零且arm後、有序時才等待第二筆，不忽略pre-arm改用後來通知。
    public bool FirstEligible(long armUs,long startUs) { return notices.CanRead(armUs,startUs); }
    // 兩個不同非零版本到齊才可唯一probe，timestamp都同native origin。
    public bool CanProbe(long armUs,long startUs) { return FirstEligible(armUs,startUs) && replacement!=null && replacement.Version!=0 && replacement.Us<=startUs; }

    // 只完整early unstable value與兩端同replacement的metadata可當讀前拒絕；不接受讀途中race冒充。
    public HostClipboardRaceCalibrationResult Classify(HostClipboardValue value,bool scope,long armUs,long startUs,long endUs,uint beforeVersion,uint tailVersion)
    {
        CheckTime(armUs);CheckTime(startUs);CheckTime(endUs);HostClipboardNotice first=First();
        var result=new HostClipboardRaceCalibrationResult {
            ScopeVerified=scope,FirstNotificationObserved=first!=null,FirstAfterArm=first!=null && armUs<=first.Us,
            ReplacementObserved=replacement!=null,DifferentVersions=first!=null && replacement!=null && first.Version!=0 && replacement.Version!=0 && first.Version!=replacement.Version,
            Notifications=Notifications,Overflow=Overflow,ReadAttempted=value!=null,ReadResourcesClosed=value==null || value.ResourcesClosed,ContentWasRead=value==null ? (bool?)false : null
        };
        if (value!=null && value.Text!=null) result.ContentWasRead=true;
        result.OrderVerified=result.FirstAfterArm && replacement!=null && first.Us<=replacement.Us && replacement.Us<=startUs && startUs<=endUs;
        result.CurrentVersionMatched=result.DifferentVersions && beforeVersion==replacement.Version && tailVersion==replacement.Version;
        if (!result.ReadResourcesClosed) {result.Code="host_cleanup_unavailable";return result;}
        if (!scope) {result.Code="host_scope_changed";return result;}
        if (Overflow) {result.Code="host_observation_overflow";return result;}
        if (first==null) {result.Code="host_notification_unavailable";return result;}
        if (!FirstEligible(armUs,startUs)) {result.Code="host_clipboard_unstable";return result;}
        if (replacement==null) {result.Code="host_notification_unavailable";return result;}
        if (!CanProbe(armUs,startUs) || !result.OrderVerified || !result.CurrentVersionMatched) {result.Code="host_clipboard_unstable";return result;}
        if (value==null) return result;
        string[] allowed={"host_clipboard_unstable","host_observed","host_clipboard_busy","host_clipboard_format_unavailable","host_text_unreadable","host_text_too_large","host_text_invalid","host_capability_unavailable","host_cleanup_unavailable"};
        if (Array.IndexOf(allowed,value.Code)<0) return result;
        result.Code=value.Code;
        if (value.Code=="host_clipboard_unstable" && value.Text==null && !value.Stable && value.Version==0 && value.OwnerMatches==null)
        {result.StaleRejected=true;result.ContentWasRead=false;}
        return result;
    }
    // 只複製native metadata，不含任何clip內容。
    private static HostClipboardNotice Copy(HostClipboardNotice item) { return new HostClipboardNotice {Ordinal=item.Ordinal,Us=item.Us,Version=item.Version}; }
    // raw time只留同一child，超界不正規化為成功。
    private static void CheckTime(long value) { if (value<0 || value>120000000) throw new ArgumentException("host_capability_unavailable"); }
}
