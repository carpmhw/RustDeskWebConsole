using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// 持鎖fixture只開／關，沒有任何讀取／寫入內容或變更owner能力。
public interface IHostClipboardLockAccess
{
    // 單次Open，失敗不retry。
    bool Open();
    // 僅關本次取得的lock。
    bool Close();
}
public sealed class HostClipboardLockState
{
    public bool LockAcquired,LeaseActive,LeaseExpired,ReleaseSucceeded,ResourcesClosed;
    public int OpenAttempts,CloseAttempts;
}

// 短期lease在同worker開關，timer不當Close證據；parent仍監督兩個自有child。
public sealed class HostClipboardLockFixture
{
    private readonly IHostClipboardLockAccess port;
    private readonly object gate=new object(),stopGate=new object();
    private readonly ManualResetEvent initialized=new ManualResetEvent(false),release=new ManualResetEvent(false);
    private readonly Thread thread;
    private Stopwatch lease;
    private bool acquired,closing,expired,closeSucceeded,fault,signalsDisposed;
    private int opens,closes;

    // fixture constructor只等500ms初始化；卡住Open仍由parent共用setup watchdog處理。
    public HostClipboardLockFixture(IHostClipboardLockAccess access)
    {
        if (access==null) throw new ArgumentException("host_capability_unavailable");
        port=access;thread=new Thread(Run);thread.IsBackground=true;thread.Start();initialized.WaitOne(500);
    }
    // Native factory僅Windows可用，P/Invoke API固定兩個，不改content或owner。
    public static HostClipboardLockFixture OpenWindows()
    {
        if (Environment.OSVersion.Platform!=PlatformID.Win32NT) throw new PlatformNotSupportedException();
        return new HostClipboardLockFixture(new WindowsLockAccess());
    }
    // 全程同worker Close；到期只自動嘗試釋放，不以時間經過當API成功。
    private void Run()
    {
        bool opened=false;
        try
        {
            lock (gate) opens++;
            opened=port.Open();
            lock (gate) { acquired=opened;if (opened) lease=Stopwatch.StartNew(); }
            initialized.Set();
            if (opened)
            {
                int left=Math.Max(0,1000-(int)lease.ElapsedMilliseconds);
                bool signaled=release.WaitOne(left);
                lock (gate) { expired=!signaled || lease.ElapsedMilliseconds>=1000;closing=true; }
            }
        }
        catch { lock (gate) fault=true; }
        finally
        {
            if (opened)
            {
                lock (gate) { closing=true;closes++; }
                bool success=false;
                try { success=port.Close(); } catch { lock (gate) fault=true; }
                lock (gate) closeSucceeded=success;
            }
            initialized.Set();
        }
    }
    // 只安全state；leaseActive要實際已取得、尚未Close且本地lease仍有效。
    public HostClipboardLockState State()
    {
        lock (gate) return new HostClipboardLockState {
            LockAcquired=acquired,LeaseActive=acquired && !closing && !fault && lease!=null && lease.ElapsedMilliseconds<1000,
            LeaseExpired=expired || (acquired && !closing && lease!=null && lease.ElapsedMilliseconds>=1000),
            ReleaseSucceeded=closeSucceeded,ResourcesClosed=signalsDisposed && !fault && (!acquired || closeSucceeded),OpenAttempts=opens,CloseAttempts=closes
        };
    }
    // Stop只join500ms，不interrupt原生call；timeout sticky，event僅worker真正退出後dispose。
    public bool Stop()
    {
        lock (stopGate)
        {
            if (!signalsDisposed) release.Set();
            if (!thread.Join(500)) { lock (gate) fault=true;return false; }
            if (!signalsDisposed) { initialized.Dispose();release.Dispose();lock (gate) signalsDisposed=true; }
            return State().ResourcesClosed;
        }
    }
    private sealed class WindowsLockAccess : IHostClipboardLockAccess
    {
        // NULL只與當前task關聯，不呼EmptyClipboard便不轉移owner。
        [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr window);
        // 同thread正常釋放，自有process退出仍須parent確認。
        [DllImport("user32.dll")] private static extern bool CloseClipboard();
        // 僅一次native Open，不Get／Empty／Set、也不自建可見視窗。
        public bool Open() { return OpenClipboard(IntPtr.Zero); }
        // 不忽略Close錯誤或例外。
        public bool Close() { return CloseClipboard(); }
    }
}

public sealed class HostClipboardBusyCalibrationResult
{
    public bool ScopeVerified,BusyObserved,ReadResourcesClosed;
    public bool? ContentWasRead;
    public string Code="host_capability_unavailable";
}
public static class HostClipboardBusyCalibration
{
    // 只有真正Open失敗的完整value可當busy；其他null Text不冒稱沒有讀過內容。
    public static HostClipboardBusyCalibrationResult Classify(HostClipboardValue value,bool scope)
    {
        var result=new HostClipboardBusyCalibrationResult {ScopeVerified=scope,ReadResourcesClosed=value!=null && value.ResourcesClosed};
        if (value==null) return result;
        if (value.Text!=null) result.ContentWasRead=true;
        if (!value.ResourcesClosed) {result.Code="host_cleanup_unavailable";return result;}
        if (!scope) {result.Code="host_scope_changed";return result;}
        string[] allowed={"host_clipboard_busy","host_observed","host_clipboard_unstable","host_clipboard_format_unavailable","host_text_unreadable","host_text_too_large","host_text_invalid","host_capability_unavailable","host_cleanup_unavailable"};
        if (Array.IndexOf(allowed,value.Code)<0) return result;
        result.Code=value.Code;
        if (value.Code=="host_clipboard_busy" && value.Text==null && !value.Stable && value.Version==0 && value.OwnerMatches==null)
        { result.BusyObserved=true;result.ContentWasRead=false; }
        return result;
    }
}
