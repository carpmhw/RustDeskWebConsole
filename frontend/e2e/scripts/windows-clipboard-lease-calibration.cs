using System;

// 單次expiry結果只安全flag／0..1計數／固定code，沒有內容／identity或clock。
public sealed class HostClipboardLeaseCalibrationResult
{
    public bool InitialHeld,LeaseExpired,ReleasedBeforeStop,ReleaseSucceeded,HolderResourcesClosed;
    public int OpenAttempts,CloseAttempts;
    public string Code="host_clipboard_lease_unavailable";
}

// 只分類既有fixture快照，不能取得lock、改lease或以Stop結果替代到期前證據。
public static class HostClipboardLeaseCalibration
{
    // 起點必真正active，不能把已到期、關閉或開啟失敗當持鎖觀察。
    public static bool IsInitiallyHeld(HostClipboardLockState value)
    {
        return value!=null && value.LockAcquired && value.LeaseActive && !value.LeaseExpired && !value.ReleaseSucceeded && !value.ResourcesClosed && value.OpenAttempts==1 && value.CloseAttempts==0;
    }
    // 到期／timer本身不算釋放，且此快照須在Stop dispose之前取得。
    public static bool IsReleasedBeforeStop(HostClipboardLockState value)
    {
        return value!=null && value.LockAcquired && !value.LeaseActive && value.LeaseExpired && value.ReleaseSucceeded && !value.ResourcesClosed && value.OpenAttempts==1 && value.CloseAttempts==1;
    }
    // 三份快照分開；normal Stop成功不能回填缺少的stop前release或初始持鎖證據。
    public static HostClipboardLeaseCalibrationResult Classify(HostClipboardLockState initial,HostClipboardLockState released,HostClipboardLockState terminal,bool stopSucceeded)
    {
        CheckCounts(initial);CheckCounts(released);CheckCounts(terminal);
        var result=new HostClipboardLeaseCalibrationResult {
            InitialHeld=IsInitiallyHeld(initial),LeaseExpired=released!=null && released.LeaseExpired,
            ReleasedBeforeStop=IsReleasedBeforeStop(released),ReleaseSucceeded=terminal!=null && terminal.ReleaseSucceeded,
            OpenAttempts=terminal==null ? 0 : terminal.OpenAttempts,CloseAttempts=terminal==null ? 0 : terminal.CloseAttempts,
            HolderResourcesClosed=stopSucceeded && terminal!=null && terminal.LockAcquired && !terminal.LeaseActive && terminal.LeaseExpired && terminal.ReleaseSucceeded && terminal.ResourcesClosed && terminal.OpenAttempts==1 && terminal.CloseAttempts==1
        };
        if (!result.HolderResourcesClosed) {result.Code="host_cleanup_unavailable";return result;}
        if (result.InitialHeld && result.ReleasedBeforeStop) result.Code="host_clipboard_lease_observed";
        return result;
    }
    // 異常count不截斷／normalize，避免輸出有界數字卻掩蓋重試或多次Close。
    private static void CheckCounts(HostClipboardLockState value)
    {
        if (value!=null && (value.OpenAttempts<0 || value.OpenAttempts>1 || value.CloseAttempts<0 || value.CloseAttempts>1)) throw new ArgumentException("host_capability_unavailable");
    }
}
