using System;
using System.Runtime.InteropServices;
using System.Threading;

// 僅供雙opt-in校準child；正式observer不引用這個delayed owner。
public sealed class HostClipboardReadRaceWindows
{
    private const uint Control = 0x8001, RenderFormat = 0x0305;
    private readonly int callerThread;
    private readonly Thread thread;
    private readonly ManualResetEvent initialized = new ManualResetEvent(false), reply = new ManualResetEvent(false);
    private readonly WindowCallback callback;
    private volatile bool ready, poisoned, stopRequested;
    private bool stopped, stopResult, cleaned, answered, ownerReply;
    private int pendingCommand;
    private uint threadId;
    private IntPtr window;
    private HostClipboardReadRaceProducer producer;
    private HostReadRaceRegistration registrationReply;
    private HostReadRaceRenderEvidence evidenceReply;

    // 平台拒絕先於任何thread／Win32或配置。
    public static HostClipboardReadRaceWindows StartWindows()
    {
#if NETCOREAPP
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
#else
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
#endif
        return new HostClipboardReadRaceWindows();
    }
    // 初始化只建自有message-only window，內部500ms不增加外層5秒期限。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private HostClipboardReadRaceWindows()
    {
        callerThread = Thread.CurrentThread.ManagedThreadId; callback = OnMessage;
        thread = new Thread(Run); thread.IsBackground = true;
        try { thread.SetApartmentState(ApartmentState.STA); thread.Start(); }
        catch { initialized.Dispose(); reply.Dispose(); throw; }
        initialized.WaitOne(500);
    }
    // Ready只是初始化快照，不代表已註冊或scope持續有效。
    public bool Ready { get { return ready && !stopped && !poisoned; } }
    // 單一caller串行發固定command，逾時永久poison，不接晚回覆補票。
    private bool Send(int command)
    {
        if (Thread.CurrentThread.ManagedThreadId != callerThread || !Ready) return false;
        reply.Reset(); answered = false; ownerReply = false; registrationReply = new HostReadRaceRegistration(); evidenceReply = new HostReadRaceRenderEvidence();
        Interlocked.Exchange(ref pendingCommand, command);
        if (!PostMessageW(window, Control, new UIntPtr((uint)command), IntPtr.Zero) || !reply.WaitOne(500))
        {
            poisoned = true; Interlocked.Exchange(ref pendingCommand, 0); return false;
        }
        return answered && !poisoned;
    }
    // 註冊只在唯一sample中明確要求，producer自身另守once gate。
    public HostReadRaceRegistration Register() { return Send(1) ? registrationReply : new HostReadRaceRegistration(); }
    // 只取同一自有owner布林，不讀clipboard文字。
    public bool OwnsClipboard() { return Send(2) && ownerReply; }
    // 渲染證據只留child RAM，不能序列化。
    public HostReadRaceRenderEvidence RenderEvidence() { return Send(3) ? evidenceReply : new HostReadRaceRenderEvidence(); }
    // 停止只收自有thread，native API與signals各自需正常證據。
    public bool Stop()
    {
        if (Thread.CurrentThread.ManagedThreadId != callerThread) return false;
        if (stopped) return stopResult;
        stopped = true; stopRequested = true;
        bool signaled = !thread.IsAlive || (threadId != 0 && PostThreadMessageW(threadId, 0x0012, UIntPtr.Zero, IntPtr.Zero));
        bool joined = thread.Join(500);
        stopResult = signaled && joined && cleaned && !poisoned;
        if (joined)
        {
            try { initialized.Dispose(); } catch { stopResult = false; }
            try { reply.Dispose(); } catch { stopResult = false; }
        }
        return stopResult;
    }
    // window、producer及全部native所有權操作綁同一owner thread。
    private void Run()
    {
        bool loopHealthy = true; threadId = GetCurrentThreadId();
        try
        {
            WindowsPort port = new WindowsPort(callback); producer = new HostClipboardReadRaceProducer(port);
            bool prepared = producer.Prepare(); window = port.Window; ready = prepared; initialized.Set();
            if (!ready || stopRequested) return;
            Message message; int received;
            while ((received = GetMessageW(out message, IntPtr.Zero, 0, 0)) > 0) DispatchMessageW(ref message);
            if (received < 0) loopHealthy = false;
        }
        catch { loopHealthy = false; }
        finally
        {
            try { cleaned = producer != null && producer.Stop() && loopHealthy; } catch { cleaned = false; }
            ready = false; initialized.Set();
        }
    }
    // 渲染要求與固定自有命令分流；兩者都不接payload、不顯示或取焦點。
    private IntPtr OnMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        if (message == RenderFormat && wParam.ToUInt64() == 13 && lParam == IntPtr.Zero) { producer.Render(); return IntPtr.Zero; }
        ulong value = wParam.ToUInt64();
        if (message != Control || value < 1 || value > 3 || lParam != IntPtr.Zero) return DefWindowProcW(hwnd, message, wParam, lParam);
        int command = (int)value;
        if (Interlocked.CompareExchange(ref pendingCommand, 0, command) != command) return IntPtr.Zero;
        try
        {
            if (command == 1) registrationReply = producer.Register();
            else if (command == 2) ownerReply = producer.OwnsClipboard();
            else evidenceReply = producer.RenderEvidence();
            answered = true;
        }
        catch { poisoned = true; }
        finally { reply.Set(); }
        return IntPtr.Zero;
    }
    // 唯一真正Win32 port；不提供任意payload、格式或既有clipboard讀取。
    private sealed class WindowsPort : IHostReadRaceClipboardPort
    {
        private readonly WindowCallback callback;
        private string className;
        private IntPtr instance, allocation;
        private bool registered, locked, prepared, openAttempted, opened, emptyAttempted, emptied, setAttempted, transferred, closeAttempted, released, releaseResult, renderAttempted;
        public IntPtr Window;
        // delegate有強參照直到window正常移除。
        public WindowsPort(WindowCallback callback) { this.callback = callback; }
        // 只建自有message-only window，不註冊、不碰clipboard。
        public bool PrepareDelayedOwner()
        {
            if (prepared || registered || released) return false;
            className = "RdWebReadRace_" + Guid.NewGuid().ToString("N"); instance = GetModuleHandleW(null);
            WindowClass cls = new WindowClass { Procedure = Marshal.GetFunctionPointerForDelegate(callback), Instance = instance, Name = className };
            if (RegisterClassW(ref cls) == 0) return false;
            registered = true;
            Window = CreateWindowExW(0, className, "", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, instance, IntPtr.Zero);
            prepared = Window != IntPtr.Zero;
            return prepared;
        }
        // 一次非NULL自有window Open，不退回NULL或重試。
        public bool Open() { if (!prepared || openAttempted || released) return false; openAttempted = true; opened = OpenClipboard(Window); return opened; }
        // 清除全部格式是獨立、另授權副作用。
        public bool Empty() { if (!opened || emptyAttempted) return false; emptyAttempted = true; emptied = EmptyClipboard(); return emptied; }
        // delayed註冊只發出Set(13,NULL)；返回值不可靠，成功交由格式可用性後驗。
        public bool RegisterDelayed() { if (!opened || !emptied || setAttempted || released) return false; setAttempted = true; SetClipboardData(13, IntPtr.Zero); return true; }
        // 只驗自有已註冊的固定格式13。
        public bool FormatAvailable() { return setAttempted && IsClipboardFormatAvailable(13); }
        // 每個成功Open只Close一次；失敗由上層保留而非重試。
        public bool Close() { if (!opened || closeAttempted) return false; closeAttempted = true; bool result = CloseClipboard(); if (result) opened = false; return result; }
        // 只比自有window，raw handle留RAM。
        public bool OwnsClipboard() { return setAttempted && Window != IntPtr.Zero && GetClipboardOwner() == Window; }
        // 版本只比相等，不輪詢通知。
        public uint Sequence() { return GetClipboardSequenceNumber(); }
        // 渲染時配置固定32bytes、有界回驗後不經Open直接Set；成功即轉交所有權。
        public bool RenderFixedPayload()
        {
            if (!setAttempted || renderAttempted || released) return false;
            renderAttempted = true;
            if (locked || allocation != IntPtr.Zero) return false;
            allocation = GlobalAlloc(0x0042, new UIntPtr(32u));
            if (allocation == IntPtr.Zero) return false;
            ulong size = GlobalSize(allocation).ToUInt64();
            if (!HostReadRacePayload.AcceptsSize(size)) return FailRender();
            IntPtr pointer = GlobalLock(allocation); if (pointer == IntPtr.Zero) return FailRender();
            locked = true; byte[] fixedBytes = null, verifiedBytes = null; bool valid = false;
            try
            {
                fixedBytes = HostReadRacePayload.CreateFixedBytes();
                Marshal.Copy(fixedBytes, 0, pointer, fixedBytes.Length);
                verifiedBytes = new byte[(int)size]; Marshal.Copy(pointer, verifiedBytes, 0, verifiedBytes.Length);
                valid = HostReadRacePayload.VerifyFixedBytes(verifiedBytes);
            }
            finally
            {
                if (fixedBytes != null) Array.Clear(fixedBytes, 0, fixedBytes.Length);
                if (verifiedBytes != null) Array.Clear(verifiedBytes, 0, verifiedBytes.Length);
                SetLastErrorNative(0);
                bool unlocked = HostObserverNative.UnlockSuccessful(GlobalUnlock(allocation), Marshal.GetLastWin32Error());
                if (unlocked) locked = false;
            }
            if (!valid || locked) return FailRender();
            if (SetClipboardData(13, allocation) == IntPtr.Zero) return FailRender();
            transferred = true; allocation = IntPtr.Zero; return true;
        }
        // 失敗只清仍自有且已unlock的配置，絕不free已轉交。
        private bool FailRender()
        {
            if (!locked && allocation != IntPtr.Zero && GlobalFree(allocation) == IntPtr.Zero) allocation = IntPtr.Zero;
            return false;
        }
        // 只釋放仍自有且已unlock的配置及自有window／class，不清clipboard。
        public bool Release()
        {
            if (released) return releaseResult;
            released = true; bool ok = !opened && !locked;
            if (allocation != IntPtr.Zero && !transferred)
            {
                if (locked) ok = false;
                else if (GlobalFree(allocation) != IntPtr.Zero) ok = false;
                else allocation = IntPtr.Zero;
            }
            if (Window != IntPtr.Zero) { if (!DestroyWindow(Window)) ok = false; else Window = IntPtr.Zero; }
            if (registered && !UnregisterClassW(className, instance)) ok = false;
            releaseResult = ok; return ok;
        }
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WindowClass { public uint Style; public IntPtr Procedure; public int ClassExtra; public int WindowExtra; public IntPtr Instance; public IntPtr Icon; public IntPtr Cursor; public IntPtr Background; public string Menu; public string Name; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public int X; public int Y; public uint Private; }
    // callback只有固定自有命令與系統渲染要求，無文字／鍵鼠輸入。
    private delegate IntPtr WindowCallback(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 只註冊自有隨機class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WindowClass value);
    // Parent固定HWND_MESSAGE。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    // 只處理自有thread訊息。
    [DllImport("user32.dll")] private static extern int GetMessageW(out Message message, IntPtr window, uint min, uint max);
    // 不翻譯或注入鍵鼠。
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref Message message);
    // 其他訊息沿預設處理。
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 只送已有pending gate的command。
    [DllImport("user32.dll")] private static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    // 退出只送自有thread。
    [DllImport("user32.dll")] private static extern bool PostThreadMessageW(uint id, uint message, UIntPtr wParam, IntPtr lParam);
    // 只破壞自有window。
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    // 只移除自有class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClassW(string name, IntPtr instance);
    // module handle留child RAM。
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    // 自有thread identity不輸出。
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    // 只配置固定32bytes／零padding。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    // 配置大小先驗才可讀取自有記憶體。
    [DllImport("kernel32.dll")] private static extern UIntPtr GlobalSize(IntPtr handle);
    // 只鎖仍自有的配置。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr handle);
    // 快取同thread error區分正常zero／失敗。
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalUnlock(IntPtr handle);
    // 排除殘留error污染render unlock。
    [DllImport("kernel32.dll", EntryPoint = "SetLastError")] private static extern void SetLastErrorNative(uint error);
    // 不能free已轉交的HGLOBAL。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalFree(IntPtr handle);
    // 單次Open不重試。
    [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr window);
    // 清除是另授權副作用，不讀舊內容。
    [DllImport("user32.dll")] private static extern bool EmptyClipboard();
    // delayed註冊NULL及渲染交付固定格式13，不用其他格式。
    [DllImport("user32.dll")] private static extern IntPtr SetClipboardData(uint format, IntPtr handle);
    // 原生Close失敗不能重開補救。
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    // 只比自有owner。
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    // 版本只用於本次來源匹配與S2判定。
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    // 註冊後格式可用性後驗，替代不可靠的delayed Set返回值。
    [DllImport("user32.dll")] private static extern bool IsClipboardFormatAvailable(uint format);
}
