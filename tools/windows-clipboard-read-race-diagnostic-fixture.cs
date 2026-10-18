using System;
using System.Runtime.InteropServices;
using System.Threading;

// 獨立diagnostic owner；正式reader及原ReadRace fixture不引用本類型。
public sealed class HostReadRaceDiagnosticWindows
{
    private const uint Control = 0x8001, RenderFormat = 0x0305;
    private readonly int callerThread;
    private readonly Thread thread;
    private readonly ManualResetEvent initialized = new ManualResetEvent(false), reply = new ManualResetEvent(false);
    private readonly WindowCallback callback;
    private volatile bool ready, poisoned, stopRequested;
    private bool stopped, stopResult, cleaned, joined, answered, ownerReply, registrationRequested, registrationVerified, sampleRequested;
    private int pendingCommand;
    private uint threadId;
    private IntPtr window;
    private HostClipboardReadRaceProducer producer;
    private HostReadRaceDiagnosticTrace trace;
    private HostReadRaceRegistration registrationState, registrationReply;
    private HostReadRaceDiagnosticCapture captureReply;
    private HostReadRaceDiagnosticFinal final;
    // 平台拒絕必須在任何thread或PInvoke之前。
    public static HostReadRaceDiagnosticWindows StartWindows()
    {
#if NETCOREAPP
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
#else
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
#endif
        return new HostReadRaceDiagnosticWindows();
    }
    // 初始化只建自有窗口，500ms不增加parent期限。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private HostReadRaceDiagnosticWindows()
    {
        callerThread = Thread.CurrentThread.ManagedThreadId; callback = OnMessage;
        thread = new Thread(Run); thread.IsBackground = true;
        try { thread.SetApartmentState(ApartmentState.STA); thread.Start(); }
        catch { initialized.Dispose(); reply.Dispose(); throw; }
        initialized.WaitOne(500);
    }
    // Ready僅初始化快照，不是註冊或scope證明。
    public bool Ready { get { return ready && !poisoned && !stopped; } }
    // Caller身分不符只能失效，不能派送或污染owner欄位。
    private bool OnCaller() { if (Thread.CurrentThread.ManagedThreadId == callerThread) return true; if (trace != null) trace.Invalidate(); return false; }
    // 未知不捏造零筆raw證據。
    private static HostReadRaceDiagnosticCapture UnknownCapture()
    { return new HostReadRaceDiagnosticCapture(null, new HostReadRaceDiagnosticSnapshot("unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", false, false, "unknown")); }
    // Getter失敗不補票，不能假造正常final。
    private static HostReadRaceDiagnosticFinal UnknownFinal() { return new HostReadRaceDiagnosticFinal(false, false, "unknown", "unknown", false); }
    // 串行command與原500ms poison行為相同，從不接受晚回覆。
    private bool Send(int command)
    {
        if (!OnCaller() || !Ready) return false;
        reply.Reset(); answered = false; ownerReply = false; registrationReply = new HostReadRaceRegistration(); captureReply = UnknownCapture();
        Interlocked.Exchange(ref pendingCommand, command);
        if (!PostMessageW(window, Control, new UIntPtr((uint)command), IntPtr.Zero) || !reply.WaitOne(500))
        { poisoned = true; Interlocked.Exchange(ref pendingCommand, 0); return false; }
        return answered && !poisoned;
    }
    // Caller及producer各守once；baseline私有副本不被Send重設。
    public HostReadRaceRegistration Register()
    {
        if (!OnCaller() || !Ready || registrationRequested) { if (trace != null) trace.Invalidate(); return new HostReadRaceRegistration(); }
        registrationRequested = true;
        if (!trace.SetPhase(HostReadRaceDiagnosticPhase.Registration)) return new HostReadRaceRegistration();
        HostReadRaceRegistration value = Send(1) ? registrationReply : new HostReadRaceRegistration();
        registrationVerified = value.Registered && value.OpenClosed && value.RegistrationVersion != 0 && value.Code == "host_observed";
        trace.SetPhase(HostReadRaceDiagnosticPhase.BeforeReader); return value;
    }
    // 只比自有owner，不讀內容或額外Sequence。
    public bool OwnsClipboard() { return Send(2) && ownerReply; }
    // 呼叫前pure memory bracket不是持鎖證明。
    public bool BeginReader() { return OnCaller() && Ready && registrationVerified && trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket); }
    // finally離開bracket，也允許未呼reader的before→after。
    public bool EndReader() { return OnCaller() && Ready && trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader); }
    // 唯一證據查詢與一次sample封存，不重查。
    public HostReadRaceDiagnosticCapture CaptureSample()
    {
        if (!OnCaller() || !Ready || sampleRequested) { if (trace != null) trace.Invalidate(); return UnknownCapture(); }
        sampleRequested = true; return Send(3) ? captureReply : UnknownCapture();
    }
    // 自有thread正常Release／join與poison分開證明；Stop最多一次。
    public bool Stop()
    {
        if (!OnCaller()) return false;
        if (stopped) return stopResult;
        stopped = true; stopRequested = true;
        if (trace != null) trace.SetPhase(HostReadRaceDiagnosticPhase.Closing);
        bool signaled = !thread.IsAlive || (threadId != 0 && PostThreadMessageW(threadId, 0x0012, UIntPtr.Zero, IntPtr.Zero));
        joined = thread.Join(500);
        stopResult = signaled && joined && cleaned && !poisoned;
        if (joined)
        {
            try { initialized.Dispose(); } catch { stopResult = false; }
            try { reply.Dispose(); } catch { stopResult = false; }
        }
        return stopResult;
    }
    // 只讀已join的封存RAM，join失敗後即使thread晚退也不恢復。
    public HostReadRaceDiagnosticFinal GetFinalTrace() { return OnCaller() && stopped && joined && final != null ? final : UnknownFinal(); }
    // 原生所有權與recorder欄位全部綁同owner thread。
    private void Run()
    {
        bool healthy = true; threadId = GetCurrentThreadId();
        try
        {
            trace = new HostReadRaceDiagnosticTrace(callerThread);
            WindowsPort port = new WindowsPort(callback);
            producer = new HostClipboardReadRaceProducer(new HostReadRaceDiagnosticPort(port, trace));
            bool prepared = producer.Prepare(); window = port.Window; ready = prepared; initialized.Set();
            if (!ready || stopRequested) return;
            Message message; int received;
            while ((received = GetMessageW(out message, IntPtr.Zero, 0, 0)) > 0) DispatchMessageW(ref message);
            if (received < 0) healthy = false;
        }
        catch { healthy = false; }
        finally
        {
            try { cleaned = producer != null && producer.Stop() && healthy; } catch { cleaned = false; }
            if (trace != null) final = trace.SealFinal(cleaned);
            ready = false; initialized.Set();
        }
    }
    // 固定callback先記觀察到的phase，不猜requester；未知形狀不交付。
    private IntPtr OnMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        if (message == RenderFormat)
        {
            if (wParam.ToUInt64() == 13 && lParam == IntPtr.Zero) { trace.RecordRenderCallback(); producer.Render(); }
            else trace.Invalidate();
            return IntPtr.Zero;
        }
        ulong value = wParam.ToUInt64();
        if (message != Control || value < 1 || value > 3 || lParam != IntPtr.Zero) return DefWindowProcW(hwnd, message, wParam, lParam);
        int command = (int)value;
        if (Interlocked.CompareExchange(ref pendingCommand, 0, command) != command) return IntPtr.Zero;
        try
        {
            if (command == 1)
            {
                trace.BeginContext(HostReadRaceDiagnosticContext.Registration);
                try { registrationState = producer.Register(); }
                finally { trace.EndContext(); }
                registrationReply = new HostReadRaceRegistration { Registered = registrationState.Registered, OpenClosed = registrationState.OpenClosed, RegistrationVersion = registrationState.RegistrationVersion, Code = registrationState.Code };
            }
            else if (command == 2) ownerReply = producer.OwnsClipboard();
            else
            {
                trace.BeginContext(HostReadRaceDiagnosticContext.Evidence);
                try { HostReadRaceRenderEvidence evidence = producer.RenderEvidence(); captureReply = new HostReadRaceDiagnosticCapture(evidence, trace.SealSample(registrationState, evidence)); }
                finally { trace.EndContext(); }
            }
            answered = true;
        }
        catch { poisoned = true; }
        finally { reply.Set(); }
        return IntPtr.Zero;
    }
    // 自有庫原fixture的固定Win32 port；不接受外部payload或格式。
    private sealed class WindowsPort : IHostReadRaceClipboardPort
    {
        private readonly WindowCallback callback;
        private string className;
        private IntPtr instance, allocation;
        private bool registered, locked, prepared, openAttempted, opened, emptyAttempted, emptied, setAttempted, transferred, closeAttempted, released, releaseResult, renderAttempted;
        public IntPtr Window;
        // 強參照delegate直到window正常移除。
        public WindowsPort(WindowCallback callback) { this.callback = callback; }
        // 只建message-only window，不註冊clipboard。
        public bool PrepareDelayedOwner()
        {
            if (prepared || registered || released) return false;
            className = "RdWebReadRaceDiagnostic_" + Guid.NewGuid().ToString("N"); instance = GetModuleHandleW(null);
            WindowClass cls = new WindowClass { Procedure = Marshal.GetFunctionPointerForDelegate(callback), Instance = instance, Name = className };
            if (RegisterClassW(ref cls) == 0) return false;
            registered = true;
            Window = CreateWindowExW(0, className, "", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, instance, IntPtr.Zero);
            prepared = Window != IntPtr.Zero; return prepared;
        }
        // 一次非NULL Open，不重試。
        public bool Open() { if (!prepared || openAttempted || released) return false; openAttempted = true; opened = OpenClipboard(Window); return opened; }
        // Empty清除所有格式，需另授權。
        public bool Empty() { if (!opened || emptyAttempted) return false; emptyAttempted = true; emptied = EmptyClipboard(); return emptied; }
        // NULL handle的返回值不作為成功訊號。
        public bool RegisterDelayed() { if (!opened || !emptied || setAttempted || released) return false; setAttempted = true; SetClipboardData(13, IntPtr.Zero); return true; }
        // 固定格式存在性後驗。
        public bool FormatAvailable() { return setAttempted && IsClipboardFormatAvailable(13); }
        // 每次成功Open只Close一次。
        public bool Close() { if (!opened || closeAttempted) return false; closeAttempted = true; bool result = CloseClipboard(); if (result) opened = false; return result; }
        // 只比自有owner。
        public bool OwnsClipboard() { return setAttempted && Window != IntPtr.Zero && GetClipboardOwner() == Window; }
        // 版本只供原producer既有位置查詢。
        public uint Sequence() { return GetClipboardSequenceNumber(); }
        // 渲染配置固定公開32bytes，轉交後不再碰HGLOBAL。
        public bool RenderFixedPayload()
        {
            if (!setAttempted || renderAttempted || released) return false;
            renderAttempted = true;
            if (locked || allocation != IntPtr.Zero) return false;
            allocation = GlobalAlloc(0x0042, new UIntPtr(32u)); if (allocation == IntPtr.Zero) return false;
            ulong size = GlobalSize(allocation).ToUInt64(); if (!HostReadRacePayload.AcceptsSize(size)) return FailRender();
            IntPtr pointer = GlobalLock(allocation); if (pointer == IntPtr.Zero) return FailRender();
            locked = true; byte[] fixedBytes = null, verifiedBytes = null; bool valid = false;
            try
            {
                fixedBytes = HostReadRacePayload.CreateFixedBytes(); Marshal.Copy(fixedBytes, 0, pointer, fixedBytes.Length);
                verifiedBytes = new byte[(int)size]; Marshal.Copy(pointer, verifiedBytes, 0, verifiedBytes.Length);
                valid = HostReadRacePayload.VerifyFixedBytes(verifiedBytes);
            }
            finally
            {
                if (fixedBytes != null) Array.Clear(fixedBytes, 0, fixedBytes.Length);
                if (verifiedBytes != null) Array.Clear(verifiedBytes, 0, verifiedBytes.Length);
                SetLastErrorNative(0);
                if (HostObserverNative.UnlockSuccessful(GlobalUnlock(allocation), Marshal.GetLastWin32Error())) locked = false;
            }
            if (!valid || locked) return FailRender();
            if (SetClipboardData(13, allocation) == IntPtr.Zero) return FailRender();
            transferred = true; allocation = IntPtr.Zero; return true;
        }
        // 只free仍自有且已解鎖配置。
        private bool FailRender() { if (!locked && allocation != IntPtr.Zero && GlobalFree(allocation) == IntPtr.Zero) allocation = IntPtr.Zero; return false; }
        // 不清clipboard，不重播渲染，不free已轉交配置。
        public bool Release()
        {
            if (released) return releaseResult;
            released = true; bool ok = !opened && !locked;
            if (allocation != IntPtr.Zero && !transferred)
            { if (locked) ok = false; else if (GlobalFree(allocation) != IntPtr.Zero) ok = false; else allocation = IntPtr.Zero; }
            if (Window != IntPtr.Zero) { if (!DestroyWindow(Window)) ok = false; else Window = IntPtr.Zero; }
            if (registered && !UnregisterClassW(className, instance)) ok = false;
            releaseResult = ok; return ok;
        }
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WindowClass { public uint Style; public IntPtr Procedure; public int ClassExtra; public int WindowExtra; public IntPtr Instance; public IntPtr Icon; public IntPtr Cursor; public IntPtr Background; public string Menu; public string Name; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public int X; public int Y; public uint Private; }
    // 原生callback固定metadata，不處理輸入文字。
    private delegate IntPtr WindowCallback(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 自有class註冊。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WindowClass value);
    // Parent固定HWND_MESSAGE。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    // 僅自有thread訊息。
    [DllImport("user32.dll")] private static extern int GetMessageW(out Message message, IntPtr window, uint min, uint max);
    // 不翻譯鍵鼠。
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref Message message);
    // 其他訊息走系統預設。
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 固定自有command。
    [DllImport("user32.dll")] private static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    // 只停自有thread。
    [DllImport("user32.dll")] private static extern bool PostThreadMessageW(uint id, uint message, UIntPtr wParam, IntPtr lParam);
    // 只移除自有window。
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    // 只移除自有class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClassW(string name, IntPtr instance);
    // 模組handle僅RAM。
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    // thread識別僅RAM。
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    // 固定32bytes可移動零初始化配置。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    // 實際配置上界先驗。
    [DllImport("kernel32.dll")] private static extern UIntPtr GlobalSize(IntPtr handle);
    // 只鎖自有配置。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr handle);
    // 同thread error區分正常zero。
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalUnlock(IntPtr handle);
    // 排除殘留error。
    [DllImport("kernel32.dll", EntryPoint = "SetLastError")] private static extern void SetLastErrorNative(uint error);
    // 只free尚未轉交配置。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalFree(IntPtr handle);
    // 一次Open不重試。
    [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr window);
    // 清除全部格式需另授權。
    [DllImport("user32.dll")] private static extern bool EmptyClipboard();
    // 固定格式NULL註冊與渲染交付。
    [DllImport("user32.dll")] private static extern IntPtr SetClipboardData(uint format, IntPtr handle);
    // 每個成功Open恰一次。
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    // 只比自有owner。
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    // 不新增Sequence探測。
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    // 固定格式13後驗。
    [DllImport("user32.dll")] private static extern bool IsClipboardFormatAvailable(uint format);
}
