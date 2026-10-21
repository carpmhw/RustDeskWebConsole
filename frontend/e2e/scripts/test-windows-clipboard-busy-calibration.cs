using System;
using System.Diagnostics;
using System.Threading;
using System.Reflection;

// 真thread／lease／cleanup及正式ObserveClipboard策略；Win32 Open／Close邊界留公開fixture替換。
internal static class ClipboardBusyCalibrationTests
{
    private sealed class LockPort : IHostClipboardLockAccess
    {
        public bool Allow=true,CloseSuccess=true,ThrowOpen,ThrowClose,BlockOpen;
        public int Opens,Closes,OpenThread,CloseThread;
        public readonly ManualResetEvent OpenGate=new ManualResetEvent(false),CloseDone=new ManualResetEvent(false);
        // 只替換原生Open，真lease與thread仍由production管理；不提供文字或writer。
        public bool Open() { Interlocked.Increment(ref Opens);OpenThread=Thread.CurrentThread.ManagedThreadId;if (BlockOpen) OpenGate.WaitOne();if (ThrowOpen) throw new Exception();return Allow; }
        // 記真Close thread，失敗與exception不被fixture成功捷徑覆蓋。
        public bool Close() { Interlocked.Increment(ref Closes);CloseThread=Thread.CurrentThread.ManagedThreadId;CloseDone.Set();if (ThrowClose) throw new Exception();return CloseSuccess; }
        // 只在worker已退出後釋放本測試的兩個event。
        public void Dispose() { OpenGate.Dispose();CloseDone.Dispose(); }
    }
    private sealed class BusyPort : IHostClipboardAccess
    {
        public int Opens,Reads,Closes,Formats;
        // 非零穩定sequence使真正策略到Open而非fixture只驗early return。
        public uint Sequence() { return 7; }
        // 只有不可Linux呼的OS busy替換，production不得retry。
        public bool Open() { Opens++;return false; }
        // busy時不得查格式或讀內容。
        public bool HasUnicode() { Formats++;throw new Exception(); }
        // busy時不得取borrowed handle容量。
        public ulong ContainerSize() { throw new Exception(); }
        // 若錯誤分支讀內容，本測試一定失敗。
        public byte[] ReadContainer(int count) { Reads++;throw new Exception(); }
        // busy時沒有owner證據。
        public bool? OwnerMatches(int pid) { throw new Exception(); }
        // 未Open成功不可Close他人lock。
        public bool Close() { Closes++;return true; }
    }
    // 每個stage只固定marker，無未知原文／exception／native ID輸出。
    private static int Main()
    {
        string stage="release";
        try
        {
            TestRelease();stage="lease";TestLease();stage="faults";TestFaults();stage="blocked";TestBlocked();stage="reader";TestReader();
            Console.WriteLine("clipboard_busy_core_observed,windowsNative=false");return 0;
        }
        catch { Console.WriteLine("clipboard_busy_core_unavailable,windowsNative=false,stage="+stage);return 1; }
    }
    // 若fixture用不同thread Close或Open retry、Stop不清event，本case必失敗。
    private static void TestRelease()
    {
        var port=new LockPort();var fixture=new HostClipboardLockFixture(port);
        try {
            var state=fixture.State();Assert(state.LockAcquired && state.LeaseActive && !state.ReleaseSucceeded && !state.ResourcesClosed && state.OpenAttempts==1 && state.CloseAttempts==0);
            Assert(fixture.Stop() && fixture.Stop());state=fixture.State();
            Assert(state.ResourcesClosed && state.ReleaseSucceeded && !state.LeaseActive && !state.LeaseExpired && state.OpenAttempts==1 && state.CloseAttempts==1);
            Assert(port.Opens==1 && port.Closes==1 && port.OpenThread==port.CloseThread && port.OpenThread!=Thread.CurrentThread.ManagedThreadId);
        } finally { fixture.Stop();port.Dispose(); }
    }
    // 真managed lease到期，不手動signal或mock timer；尚未Stop join／dispose前不能假裝全cleanup。
    private static void TestLease()
    {
        var port=new LockPort();var fixture=new HostClipboardLockFixture(port);
        try {
            Assert(port.CloseDone.WaitOne(2500));Assert(fixture.Stop());
            var state=fixture.State();Assert(state.LeaseExpired && !state.LeaseActive && state.ReleaseSucceeded && state.ResourcesClosed && state.CloseAttempts==1 && port.Opens==1);
        } finally { fixture.Stop();port.Dispose(); }
    }
    // Open失敗不Close、不retry；throw與Close失敗不可宣稱resourcesClosed。
    private static void TestFaults()
    {
        foreach (int kind in new[] {0,1,2,3}) {
            var port=new LockPort {Allow=kind!=0,ThrowOpen=kind==1,CloseSuccess=kind!=2,ThrowClose=kind==3};var fixture=new HostClipboardLockFixture(port);
            try {
                bool closed=fixture.Stop();var state=fixture.State();
                Assert(port.Opens==1 && state.OpenAttempts==1 && !state.LeaseActive);
                if (kind==0) Assert(closed && !state.LockAcquired && state.CloseAttempts==0);
                else Assert(!closed && !state.ResourcesClosed);
            } finally { fixture.Stop();port.Dispose(); }
        }
    }
    // 原生Open卡住時Stop真正有界；晚到Open／Close不抹掉先前timeout成PASS。
    private static void TestBlocked()
    {
        var port=new LockPort {BlockOpen=true};var fixture=new HostClipboardLockFixture(port);
        try {
            var clock=Stopwatch.StartNew();Assert(!fixture.Stop() && clock.ElapsedMilliseconds<1200);
            port.OpenGate.Set();Assert(port.CloseDone.WaitOne(2000));
            Assert(!fixture.Stop() && !fixture.State().ResourcesClosed && port.Opens==1 && port.Closes==1);
        } finally { port.OpenGate.Set();fixture.Stop();port.Dispose(); }
    }
    // 真ObserveClipboard busy分支一次Open、零內容讀／Close，再由production分類安全DTO。
    private static void TestReader()
    {
        var port=new BusyPort();var native=HostObserverNative.ObserveClipboard(port,0,41);
        var row=HostClipboardBusyCalibration.Classify(native,true);
        Assert(row.ScopeVerified && row.BusyObserved && row.ContentWasRead==false && row.ReadResourcesClosed && row.Code=="host_clipboard_busy");
        Assert(port.Opens==1 && port.Reads==0 && port.Formats==0 && port.Closes==0);
        foreach (string code in new[] {"host_observed","host_clipboard_unstable","host_text_invalid","Unknown public code"}) {
            var value=new HostClipboardValue {Code=code};row=HostClipboardBusyCalibration.Classify(value,true);
            Assert(!row.BusyObserved && row.ContentWasRead==null && row.Code==(code=="Unknown public code" ? "host_capability_unavailable" : code));
        }
        foreach (int kind in new[] {0,1,2,3,4}) {
            var value=new HostClipboardValue {Code="host_clipboard_busy"};
            if (kind==0) value.Text="Public text";if (kind==1) value.Stable=true;if (kind==2) value.Version=7;if (kind==3) value.OwnerMatches=true;if (kind==4) value.ResourcesClosed=false;
            row=HostClipboardBusyCalibration.Classify(value,true);Assert(!row.BusyObserved);
            if (kind==0) Assert(row.ContentWasRead==true);
            if (kind==4) Assert(!row.ReadResourcesClosed && row.Code=="host_cleanup_unavailable");
        }
        Assert(!HostClipboardBusyCalibration.Classify(native,false).BusyObserved && HostClipboardBusyCalibration.Classify(native,false).Code=="host_scope_changed");
        Assert(!HostClipboardBusyCalibration.Classify(null,true).ReadResourcesClosed);
        CheckFields(typeof(HostClipboardBusyCalibrationResult),new[] {"ScopeVerified","BusyObserved","ContentWasRead","ReadResourcesClosed","Code"});
        CheckFields(typeof(HostClipboardLockState),new[] {"LockAcquired","LeaseActive","LeaseExpired","ReleaseSucceeded","ResourcesClosed","OpenAttempts","CloseAttempts"});
    }
    // 安全DTO不能偷偷新增Text／Version／ID／未知原值欄位。
    private static void CheckFields(Type type,string[] allowed) { var fields=type.GetFields(BindingFlags.Public|BindingFlags.Instance);Assert(fields.Length==allowed.Length);foreach (FieldInfo field in fields) Assert(Array.IndexOf(allowed,field.Name)>=0); }
    // 失敗只走固定stage，不印未知資料。
    private static void Assert(bool value) { if (!value) throw new Exception(); }
}
