using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// 僅自有thread的OS邊界，沒有桌面／clipboard／網路或控制其他process的能力。
public interface IHostNativeWaitAccess
{
    // 只取得呼叫worker自己的OS thread id，僅留RAM。
    uint CurrentThreadId();
    // 正式fixture固定30000ms，不使用無限Sleep或改系統timer解析度。
    void Sleep(int milliseconds);
    // 僅目前process內的matching thread，Wait狀態後才可讀WaitReason。
    bool IsExecutionDelay(uint threadId);
}

// 對外只有當時安全快照；started不是進入原生等待的證據。
public sealed class HostNativeWaitProof
{
    public bool WorkerStarted,NativeDelayObserved,WorkerReturned;
}

public sealed class HostNativeWaitFixture
{
    private readonly IHostNativeWaitAccess port;
    private readonly object gate=new object();
    private readonly Thread worker;
    private uint nativeId;
    private bool started,returned,fault;

    // 新建唯一自有background worker，不能綁定或阻塞既有UI／他人thread。
    public HostNativeWaitFixture(IHostNativeWaitAccess access)
    {
        if (access==null) throw new ArgumentException("host_capability_unavailable");
        port=access;worker=new Thread(Run);worker.IsBackground=true;worker.Start();
    }
    // 原生入口只在Windows；新SDK使用可分析的平台guard，5.1不需額外runtime套件。
    public static HostNativeWaitFixture StartWindows()
    {
#if NET5_0_OR_GREATER
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
#else
        if (Environment.OSVersion.Platform!=PlatformID.Win32NT) throw new PlatformNotSupportedException();
#endif
        return new HostNativeWaitFixture(new WindowsWaitAccess());
    }
    // 自有worker只一次取ID及Sleep；fault／自然返回皆不能繼續稱已阻塞。
    private void Run()
    {
        try {
            uint id=port.CurrentThreadId();if (id==0) throw new InvalidOperationException();
            lock (gate) {nativeId=id;started=true;}
            port.Sleep(30000);
        } catch {lock (gate) fault=true;}
        finally {lock (gate) returned=true;}
    }
    // OS等待理由與未返回前後重驗；未知metadata或例外只回觀察不到，不反射native值。
    public HostNativeWaitProof Capture()
    {
        uint id;bool began,ended,failed;
        lock (gate) {id=nativeId;began=started;ended=returned;failed=fault;}
        bool delayed=false;
        if (began && !ended && !failed && id!=0) {
            try {delayed=port.IsExecutionDelay(id);} catch {delayed=false;}
        }
        lock (gate) return new HostNativeWaitProof {WorkerStarted=started,WorkerReturned=returned,NativeDelayObserved=delayed && started && !returned && !fault && id==nativeId};
    }
    // 僅在自有child等待worker；父supervisor須用原query watchdog終止此child，不讀下一個command。
    public void WaitForReturn() {worker.Join();}

#if NET5_0_OR_GREATER
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private sealed class WindowsWaitAccess : IHostNativeWaitAccess
    {
        // thread id只作RAM內matching，不輸出或操作他人thread。
        [DllImport("kernel32.dll",ExactSpelling=true)] private static extern uint GetCurrentThreadId();
        // 固定非alertable、有限原生等待；不呼timeBeginPeriod或建立視窗。
        [DllImport("kernel32.dll",EntryPoint="Sleep",ExactSpelling=true)] private static extern void SleepNative(uint milliseconds);
        // 只在本次worker呼叫，不讀ProcessId／ThreadId到pipe。
        public uint CurrentThreadId() {return GetCurrentThreadId();}
        // 生產fixture拒絕非核准間隔，不從參數／環境接收任意等待。
        public void Sleep(int milliseconds) {if (milliseconds!=30000) throw new ArgumentException();SleepNative((uint)milliseconds);}
        // 只枚舉目前自有process的有限thread metadata；未匹配或狀態不同即不可用。
        public bool IsExecutionDelay(uint threadId)
        {
            bool observed=false;
            using (Process process=Process.GetCurrentProcess()) {
                ProcessThreadCollection threads=process.Threads;
                try {
                    if (threads.Count>512) return false;
                    foreach (ProcessThread thread in threads)
                        if ((uint)thread.Id==threadId && thread.ThreadState==System.Diagnostics.ThreadState.Wait)
                            observed=thread.WaitReason==ThreadWaitReason.ExecutionDelay;
                } finally {foreach (ProcessThread thread in threads) thread.Dispose();}
            }
            return observed;
        }
    }
}
