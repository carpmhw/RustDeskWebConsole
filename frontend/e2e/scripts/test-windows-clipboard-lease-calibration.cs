using System;
using System.Reflection;
using System.Threading;

// 正式fixture與lease分類真編譯；僅不可在Linux呼叫的Win32 Open／Close邊界替換。
internal static class ClipboardLeaseCalibrationTests
{
    private sealed class LockPort : IHostClipboardLockAccess
    {
        public int Opens,Closes,OpenThread,CloseThread;
        // 只記公開測試thread，不操作Windows或內容。
        public bool Open() { Interlocked.Increment(ref Opens);OpenThread=Thread.CurrentThread.ManagedThreadId;return true; }
        // 同thread Close回傳真API替身成功，正式lease等待不被替換。
        public bool Close() { CloseThread=Thread.CurrentThread.ManagedThreadId;Interlocked.Increment(ref Closes);return true; }
    }
    // 只固定測試階段，不輸出原生識別／文字／exception。
    private static int Main()
    {
        string stage="literal";
        try {
            TestLiteral();stage="negative";TestNegative();stage="managed_lease";TestManagedLease();
            Console.WriteLine("clipboard_lease_core_observed,windowsNative=false");return 0;
        } catch { Console.WriteLine("clipboard_lease_core_unavailable,windowsNative=false,stage="+stage);return 1; }
    }
    // 缺初始持鎖、stop前釋放或terminal任一條件的分類都不能被放寬成成功。
    private static void TestLiteral()
    {
        var result=HostClipboardLeaseCalibration.Classify(Initial(),Released(),Terminal(),true);
        Assert(result.InitialHeld && result.LeaseExpired && result.ReleasedBeforeStop && result.ReleaseSucceeded && result.HolderResourcesClosed && result.OpenAttempts==1 && result.CloseAttempts==1 && result.Code=="host_clipboard_lease_observed");
        string[] names={"InitialHeld","LeaseExpired","ReleasedBeforeStop","ReleaseSucceeded","HolderResourcesClosed","OpenAttempts","CloseAttempts","Code"};
        var fields=typeof(HostClipboardLeaseCalibrationResult).GetFields(BindingFlags.Instance|BindingFlags.Public);Assert(fields.Length==names.Length);
        foreach (FieldInfo field in fields) Assert(Array.IndexOf(names,field.Name)>=0);
        Assert(!HostClipboardLeaseCalibration.IsInitiallyHeld(null) && !HostClipboardLeaseCalibration.IsReleasedBeforeStop(null));
        Assert(HostClipboardLeaseCalibration.IsInitiallyHeld(Initial()) && !HostClipboardLeaseCalibration.IsInitiallyHeld(Released()));
        Assert(HostClipboardLeaseCalibration.IsReleasedBeforeStop(Released()) && !HostClipboardLeaseCalibration.IsReleasedBeforeStop(Terminal()));
    }
    // 到期或Stop成功不代表已在stop之前Close，任何狀態矛盾／非法count都不可成功。
    private static void TestNegative()
    {
        foreach (string name in new[] {"LockAcquired","LeaseActive","LeaseExpired","ReleaseSucceeded","ResourcesClosed"}) {
            var initial=Initial();Flip(initial,name);Assert(HostClipboardLeaseCalibration.Classify(initial,Released(),Terminal(),true).Code!="host_clipboard_lease_observed");
            var released=Released();Flip(released,name);Assert(HostClipboardLeaseCalibration.Classify(Initial(),released,Terminal(),true).Code!="host_clipboard_lease_observed");
            var terminal=Terminal();Flip(terminal,name);Assert(HostClipboardLeaseCalibration.Classify(Initial(),Released(),terminal,true).Code=="host_cleanup_unavailable");
        }
        foreach (string name in new[] {"OpenAttempts","CloseAttempts"}) {
            foreach (int bad in new[] {-1,2}) {
                var invalid=Initial();typeof(HostClipboardLockState).GetField(name).SetValue(invalid,bad);
                Reject(delegate {HostClipboardLeaseCalibration.Classify(invalid,Released(),Terminal(),true);});
                Reject(delegate {HostClipboardLeaseCalibration.Classify(Initial(),invalid,Terminal(),true);});
                Reject(delegate {HostClipboardLeaseCalibration.Classify(Initial(),Released(),invalid,true);});
            }
            var zero=Terminal();typeof(HostClipboardLockState).GetField(name).SetValue(zero,0);
            Assert(HostClipboardLeaseCalibration.Classify(Initial(),Released(),zero,true).Code=="host_cleanup_unavailable");
        }
        var timerOnly=Initial();timerOnly.LeaseActive=false;timerOnly.LeaseExpired=true;
        var row=HostClipboardLeaseCalibration.Classify(Initial(),timerOnly,Terminal(),true);
        Assert(row.LeaseExpired && !row.ReleasedBeforeStop && row.Code=="host_clipboard_lease_unavailable");
        Assert(HostClipboardLeaseCalibration.Classify(Initial(),null,Terminal(),true).Code=="host_clipboard_lease_unavailable");
        Assert(HostClipboardLeaseCalibration.Classify(null,Released(),Terminal(),true).Code=="host_clipboard_lease_unavailable");
        Assert(HostClipboardLeaseCalibration.Classify(Initial(),Released(),null,true).Code=="host_cleanup_unavailable");
        Assert(HostClipboardLeaseCalibration.Classify(Initial(),Released(),Terminal(),false).Code=="host_cleanup_unavailable");
    }
    // 真1000ms managed lease必先自行Close才允許Stop；計時等待不替代Close／thread證據。
    private static void TestManagedLease()
    {
        var port=new LockPort();var fixture=new HostClipboardLockFixture(port);
        try {
            var initial=fixture.State();Assert(HostClipboardLeaseCalibration.IsInitiallyHeld(initial));
            Assert(SpinWait.SpinUntil(delegate {return HostClipboardLeaseCalibration.IsReleasedBeforeStop(fixture.State());},3000));
            var released=fixture.State();Assert(port.Opens==1 && port.Closes==1 && port.OpenThread==port.CloseThread);
            bool stopped=fixture.Stop();var terminal=fixture.State();
            var result=HostClipboardLeaseCalibration.Classify(initial,released,terminal,stopped);
            Assert(result.Code=="host_clipboard_lease_observed" && result.HolderResourcesClosed);
            Assert(port.Opens==1 && port.Closes==1);
        } finally {fixture.Stop();}
    }
    // 完整literal state，不由production產生expected。
    private static HostClipboardLockState Initial() {return new HostClipboardLockState {LockAcquired=true,LeaseActive=true,OpenAttempts=1};}
    // Stop之前已有Close成功，但thread／events尚待正式Stop收尾。
    private static HostClipboardLockState Released() {return new HostClipboardLockState {LockAcquired=true,LeaseExpired=true,ReleaseSucceeded=true,OpenAttempts=1,CloseAttempts=1};}
    // Stop之後的正常terminal不能回填stop前釋放證據。
    private static HostClipboardLockState Terminal() {return new HostClipboardLockState {LockAcquired=true,LeaseExpired=true,ReleaseSucceeded=true,ResourcesClosed=true,OpenAttempts=1,CloseAttempts=1};}
    // 每次只翻一個state flag，抓出放寬任何一項guard的回歸。
    private static void Flip(HostClipboardLockState value,string name) {var field=typeof(HostClipboardLockState).GetField(name);field.SetValue(value,!(bool)field.GetValue(value));}
    // 固定assert不反射輸入內容或原生錯誤。
    private static void Assert(bool value) {if (!value) throw new Exception();}
    // 非法count必明確拒絕，不能以任意crash充數。
    private static void Reject(Action action) {bool rejected=false;try {action();} catch (ArgumentException) {rejected=true;}Assert(rejected);}
}
