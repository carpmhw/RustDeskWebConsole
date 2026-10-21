using System;

// 只公開安全快照資訊，不持有Text／Version／PID／HWND或未知原值。
public sealed class HostClipboardCalibrationResult
{
    public bool ScopeVerified;
    public bool Readable;
    public bool Stable;
    public bool Exact;
    public bool? OwnerMatchesEditor;
    public int Notifications;
    public bool Overflow;
    public bool ReadResourcesClosed;
    public string Code = "host_capability_unavailable";
}

// 只分類正式adapter結果；不替代Win32 reader或提供clip寫入API。
public static class HostClipboardCalibration
{
    public const string Fixture = "Public 中文 RdWeb Clipboard calibration";

    // scope／收尾／版本／容量都成立才strict比較；unknown code不反射，owner不當copy因果。
    public static HostClipboardCalibrationResult Classify(HostClipboardValue value,bool scopeVerified,int notifications,bool overflow)
    {
        if (notifications<0 || notifications>64) throw new ArgumentException("host_capability_unavailable");
        HostClipboardCalibrationResult result=new HostClipboardCalibrationResult {ScopeVerified=scopeVerified,Notifications=notifications,Overflow=overflow,ReadResourcesClosed=value!=null && value.ResourcesClosed};
        if (value==null) return result;
        if (!value.ResourcesClosed) { result.Code="host_cleanup_unavailable";return result; }
        if (!scopeVerified) { result.Code="host_scope_changed";return result; }
        if (overflow) { result.Code="host_observation_overflow";return result; }
        string[] allowed={"host_observed","host_clipboard_busy","host_clipboard_format_unavailable","host_clipboard_unstable","host_text_too_large","host_text_invalid","host_text_unreadable","host_cleanup_unavailable","host_capability_unavailable"};
        if (Array.IndexOf(allowed,value.Code)<0) return result;
        result.Code=value.Code;
        if (value.Code!="host_observed") return result;
        if (!HostObserverNative.IsSafeText(value.Text,32768)) { result.Code="host_text_invalid";return result; }
        if (!value.Stable) { result.Code="host_clipboard_unstable";return result; }
        result.Readable=true;result.Stable=true;
        result.Exact=string.Equals(value.Text,Fixture,StringComparison.Ordinal);
        result.OwnerMatchesEditor=value.OwnerMatches;
        return result;
    }
}
