using System;
using System.Reflection;
using System.Threading;

// 真fixture與managed worker；只有Win32 wait／目前thread觀察邊界以公開port替身替換。
internal static class HostWatchdogTests
{
    private sealed class WaitPort : IHostNativeWaitAccess,IDisposable
    {
        public readonly ManualResetEvent Entered=new ManualResetEvent(false),Release=new ManualResetEvent(false);
        public readonly ManualResetEvent IdEntered=new ManualResetEvent(false),IdGate=new ManualResetEvent(true);
        public int IdCalls,Sleeps,Milliseconds,IdThread,SleepThread;
        public bool Visible=true,ThrowObserve,ThrowWait;
        // 公開literal不是宿主或操作者的真thread id。
        public uint CurrentThreadId() {Interlocked.Increment(ref IdCalls);IdThread=Thread.CurrentThread.ManagedThreadId;IdEntered.Set();IdGate.WaitOne();return 41;}
        // 實際有managed blocking，保留production固定30000ms參數及唯一worker。
        public void Sleep(int milliseconds) {Milliseconds=milliseconds;SleepThread=Thread.CurrentThread.ManagedThreadId;Interlocked.Increment(ref Sleeps);Entered.Set();if (ThrowWait) throw new InvalidOperationException();Release.WaitOne();}
        // 只替代OS等待狀態，不生成production proof／分類結果。
        public bool IsExecutionDelay(uint id) {if (id!=41) throw new ArgumentException();if (ThrowObserve) throw new InvalidOperationException();return Visible && Entered.WaitOne(0) && !Release.WaitOne(0);}
        // 僅測試自有event，沒有native handle或Windows操作。
        public void Dispose() {Entered.Dispose();Release.Dispose();IdEntered.Dispose();IdGate.Dispose();}
    }
    // 僅固定測試階段，禁止輸出thread metadata或例外內容。
    private static int Main()
    {
        string stage="worker";
        try {
            TestWorker();stage="fault";TestFault();stage="platform";
            if (Environment.OSVersion.Platform!=PlatformID.Win32NT) {
                bool rejected=false;try {HostNativeWaitFixture.StartWindows();} catch (PlatformNotSupportedException) {rejected=true;}Assert(rejected);
            }
            Console.WriteLine("host_watchdog_fixture_observed,windowsNative=false");return 0;
        } catch {Console.WriteLine("host_watchdog_fixture_unavailable,windowsNative=false,stage="+stage);return 1;}
    }
    // 若省略真等待觀察、重試Sleep、讀錯thread或worker返回後仍報阻塞，這組必失敗。
    private static void TestWorker()
    {
        using (var port=new WaitPort()) {
            port.IdGate.Reset();
            var fixture=new HostNativeWaitFixture(port);
            try {
                Assert(port.IdEntered.WaitOne(1000));var before=fixture.Capture();
                Assert(!before.WorkerStarted && !before.NativeDelayObserved && !before.WorkerReturned);
                port.IdGate.Set();
                Assert(port.Entered.WaitOne(1000));var proof=fixture.Capture();
                Assert(proof.WorkerStarted && proof.NativeDelayObserved && !proof.WorkerReturned);
                Assert(port.IdCalls==1 && port.Sleeps==1 && port.Milliseconds==30000 && port.IdThread==port.SleepThread);
                string[] names={"WorkerStarted","NativeDelayObserved","WorkerReturned"};
                var fields=typeof(HostNativeWaitProof).GetFields(BindingFlags.Public|BindingFlags.Instance);Assert(fields.Length==names.Length);
                foreach (FieldInfo field in fields) Assert(Array.IndexOf(names,field.Name)>=0 && field.FieldType==typeof(bool));
                port.Visible=false;Assert(!fixture.Capture().NativeDelayObserved);
                port.Visible=true;port.ThrowObserve=true;Assert(!fixture.Capture().NativeDelayObserved);port.ThrowObserve=false;
                port.Release.Set();fixture.WaitForReturn();proof=fixture.Capture();Assert(proof.WorkerReturned && !proof.NativeDelayObserved);
                Assert(port.IdCalls==1 && port.Sleeps==1);
            } finally {port.IdGate.Set();port.Release.Set();fixture.WaitForReturn();}
        }
    }
    // 呼叫失敗不能因WorkerStarted旗標或port假等待就當作真正已阻塞。
    private static void TestFault()
    {
        using (var port=new WaitPort {ThrowWait=true}) {
            var fixture=new HostNativeWaitFixture(port);fixture.WaitForReturn();
            var proof=fixture.Capture();Assert(proof.WorkerReturned && !proof.NativeDelayObserved && port.Sleeps==1);
        }
        bool rejected=false;try {new HostNativeWaitFixture(null);} catch (ArgumentException) {rejected=true;}Assert(rejected);
    }
    // 固定assert不把測試port／原生欄位反射到輸出。
    private static void Assert(bool value) {if (!value) throw new Exception();}
}
