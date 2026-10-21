using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// 原listener的薄adapter，不重建／重設原生狀態，也沒有內容API。
public sealed class HostClipboardOverflowNotices : IHostOverflowNoticePort
{
    private readonly HostObserverNative native;
    // 只保存child已建好的自有listener。
    public HostClipboardOverflowNotices(HostObserverNative native) { if (native == null) throw new ArgumentNullException("native"); this.native = native; }
    // Ready僅快照，不當存活心跳。
    public bool Ready { get { return native.Ready; } }
    // caller先Drain取得原notices lock的可見性，再讀sticky旗標。
    public bool Overflow { get { return native.Overflow; } }
    // 不改原lifetime count，不複製或轉換raw row到parent。
    public HostClipboardNotice[] Drain() { return native.Drain(); }
}

// 固定800ms只建立一次，不允許caller／環境延長期限。
public sealed class HostClipboardOverflowBudget : IHostOverflowBudget
{
    private readonly Stopwatch clock = Stopwatch.StartNew();
    // 整個burst共用剩餘時間，歸零後不會恢復。
    public int RemainingMilliseconds() { return (int)Math.Max(0L, Math.Min(800L, 800L - clock.ElapsedMilliseconds)); }
    // 等metadata時只合作讓出CPU，不sleep重試clipboard。
    public void Yield() { Thread.Yield(); }
}

// 僅新opt-in child引用；同一writer thread管理固定65份容器及window。
public sealed class HostClipboardOverflowWindows : IHostOverflowWriter
{
    private const uint Control = 0x8001;
    private readonly int caller;
    private readonly HostOverflowDiagnosticTrace trace;
    private readonly HostOpenFailureCollector openDiagnostic;
    private readonly Thread thread;
    private readonly WindowCallback callback;
    private readonly ManualResetEvent initialized = new ManualResetEvent(false), reply = new ManualResetEvent(false);
    private volatile bool ready, poisoned, stopRequested;
    private bool stopped, stopResult, cleaned, answered, matchReply;
    private int pending, publications;
    private uint threadId, versionReply;
    private IntPtr window;
    private HostClipboardOverflowProducer producer;
    private HostOverflowPublication publicationReply;

    // 非Windows先拒絕，之後才new物件／events／thread／Win32。
    public static HostClipboardOverflowWindows StartWindows() { return StartWindows(null, null); }
    // 可選trace仍必在任何events／thread建立前驗平台。
    public static HostClipboardOverflowWindows StartWindows(HostOverflowDiagnosticTrace trace) { return StartWindows(trace, null); }
    // Open診斷只接收child自有RAM collector，不新增命令或native factory路徑。
    public static HostClipboardOverflowWindows StartWindows(HostOverflowDiagnosticTrace trace, HostOpenFailureCollector openDiagnostic)
    {
#if NETCOREAPP
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
#else
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
#endif
        return new HostClipboardOverflowWindows(trace, openDiagnostic);
    }
    // 初始化只Prepare；500ms內未完成即poison，不自動發布。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private HostClipboardOverflowWindows(HostOverflowDiagnosticTrace trace, HostOpenFailureCollector openDiagnostic)
    {
        caller = Thread.CurrentThread.ManagedThreadId; this.trace = trace; this.openDiagnostic = openDiagnostic;
        callback = OnMessage; thread = new Thread(Run); thread.IsBackground = true;
        try { thread.SetApartmentState(ApartmentState.STA); thread.Start(); }
        catch { Failure("writer_initialize", "threw"); initialized.Dispose(); reply.Dispose(); throw; }
        if (!initialized.WaitOne(500)) { Failure("writer_initialize", "wait_timeout"); poisoned = true; stopRequested = true; }
    }
    // 只記既有結果，不呼native或等待新的reply。
    private void Failure(string stage, string reason) { if (trace != null) trace.RecordFailure(stage, reason); }
    // 只有原caller可以派送，耗盡65個slot仍可驗tail及收尾。
    public bool Ready { get { return Thread.CurrentThread.ManagedThreadId == caller && ready && !poisoned && !stopped; } }
    // 安全計數snapshot，不從caller可變DTO重讀。
    public int Publications { get { return Thread.CurrentThread.ManagedThreadId == caller ? publications : 0; } }
    // 有pending gate的固定message才可執行，timeout後永不可恢復。
    private bool Send(int command)
    {
        if (!Ready)
        {
            if (command == 2 && Thread.CurrentThread.ManagedThreadId == caller && trace != null) trace.RejectTail();
            return false;
        }
        reply.Reset(); answered = false; matchReply = false; versionReply = 0;
        publicationReply = new HostOverflowPublication { Publications = publications };
        Interlocked.Exchange(ref pending, command);
        bool posted = PostMessageW(window, Control, new UIntPtr((uint)command), IntPtr.Zero);
        bool received = posted && reply.WaitOne(500);
        if (!received)
        {
            Failure("writer_dispatch", posted ? "wait_timeout" : "returned_false");
            if (command == 2 && trace != null) trace.RejectTail();
            poisoned = true; Interlocked.Exchange(ref pending, 0); return false;
        }
        if (!answered || poisoned) { Failure("writer_dispatch", "returned_false"); if (command == 2 && trace != null) trace.RejectTail(); }
        return answered && !poisoned;
    }
    // 每個command只消耗producer的一個固定slot，不是任意payload通道。
    public HostOverflowPublication PublishNext() { return Send(1) ? publicationReply : new HostOverflowPublication { Publications = publications }; }
    // 真正原生owner／version比對仍在writer thread。
    public bool MatchesPublished() { return Send(2) && matchReply; }
    // 僅取保存的本輪版本，不作notification polling。
    public uint PublishedVersion() { return Send(3) ? versionReply : 0; }
    // 關閉只作用自有thread；API／join／events皆需正常證據。
    public bool Stop()
    {
        if (Thread.CurrentThread.ManagedThreadId != caller) return false;
        if (stopped) return stopResult;
        stopped = true; stopRequested = true;
        bool signaled = !thread.IsAlive || (threadId != 0 && PostThreadMessageW(threadId, 0x0012, UIntPtr.Zero, IntPtr.Zero));
        bool joined = thread.Join(500);
        stopResult = signaled && joined && cleaned && !poisoned;
        if (!stopResult) Failure("writer_stop", !joined ? "wait_timeout" : "returned_false");
        if (joined)
        {
            try { initialized.Dispose(); } catch { stopResult = false; Failure("writer_stop", "threw"); }
            try { reply.Dispose(); } catch { stopResult = false; Failure("writer_stop", "threw"); }
        }
        return stopResult;
    }
    // 所有native配置／發布／free／window操作都在同一自有thread。
    private void Run()
    {
        bool healthy = true;
        string stage = "writer_initialize";
        try
        {
            threadId = GetCurrentThreadId();
            WindowsPort port = new WindowsPort(callback, openDiagnostic);
            producer = new HostClipboardOverflowProducer(port, trace);
            bool prepared = producer.Prepare(); window = port.Window; ready = prepared;
            initialized.Set();
            if (!prepared || stopRequested) return;
            stage = "writer_dispatch";
            Message message; int received;
            while ((received = GetMessageW(out message, IntPtr.Zero, 0, 0)) > 0) DispatchMessageW(ref message);
            if (received < 0) { healthy = false; Failure("writer_dispatch", "returned_false"); }
        }
        catch { healthy = false; Failure(stage, "threw"); }
        finally
        {
            try { cleaned = producer != null && producer.Stop() && healthy; if (!cleaned) Failure("writer_stop", "returned_false"); } catch { cleaned = false; Failure("writer_stop", "threw"); }
            ready = false; initialized.Set();
        }
    }
    // 外來message沒有pending就不能觸發新發布，不傳任何原文或任意參數。
    private IntPtr OnMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        ulong value = wParam.ToUInt64();
        if (message != Control || value < 1 || value > 3 || lParam != IntPtr.Zero) return DefWindowProcW(hwnd, message, wParam, lParam);
        int command = (int)value;
        if (Interlocked.CompareExchange(ref pending, 0, command) != command) return IntPtr.Zero;
        try
        {
            if (command == 1) { publicationReply = producer.PublishNext(); publications = producer.Publications; }
            else if (command == 2) matchReply = producer.MatchesPublished();
            else versionReply = producer.PublishedVersion();
            answered = true;
        }
        catch { poisoned = true; Failure("writer_dispatch", "threw"); }
        finally { reply.Set(); }
        return IntPtr.Zero;
    }

    // 48bytes的小固定fixture；不引用或改動已驗capacity port。
    private sealed class WindowsPort : IHostOverflowClipboardPort, IHostOpenFailureNativePort
    {
        private readonly WindowCallback callback;
        private readonly HostOpenFailureCapture openCapture;
        private readonly IntPtr[] buffers = new IntPtr[65];
        private readonly bool[] locked = new bool[65];
        private IntPtr instance;
        private string className;
        private bool attempted, registered, prepared, failed, opened, emptyAttempted, emptied, setAttempted, closeAttempted, released, releaseResult;
        private int next;
        public IntPtr Window;
        // callback由fixture保持強參照直到window真正關閉。
        // WindowsPort只在writer thread建立，capture於同一thread綁定collector。
        public WindowsPort(WindowCallback callback, HostOpenFailureCollector openDiagnostic)
        {
            this.callback = callback;
            if (openDiagnostic != null) openCapture = new HostOpenFailureCapture(openDiagnostic);
        }
        // Prepare只建window與固定65配置，失敗由同thread Release處理部分資源。
        public bool PrepareFixedContainers()
        {
            if (attempted) return false;
            attempted = true; className = "RdWebOverflow_" + Guid.NewGuid().ToString("N"); instance = GetModuleHandleW(null);
            WindowClass cls = new WindowClass { Procedure = Marshal.GetFunctionPointerForDelegate(callback), Instance = instance, Name = className };
            if (RegisterClassW(ref cls) == 0) return false;
            registered = true;
            Window = CreateWindowExW(0, className, "", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, instance, IntPtr.Zero);
            if (Window == IntPtr.Zero) return false;
            for (int i = 0; i < 65; i++)
            {
                buffers[i] = GlobalAlloc(0x0042, new UIntPtr(48u));
                if (buffers[i] == IntPtr.Zero || GlobalSize(buffers[i]).ToUInt64() < 48) return false;
                IntPtr pointer = GlobalLock(buffers[i]); if (pointer == IntPtr.Zero) return false;
                locked[i] = true;
                try
                {
                    string text = i % 2 == 0 ? "RdWeb public overflow A" : "RdWeb public overflow B";
                    for (int c = 0; c < 23; c++) Marshal.WriteInt16(pointer, c * 2, (short)text[c]);
                    Marshal.WriteInt16(pointer, 46, 0);
                }
                finally
                {
                    SetLastErrorNative(0);
                    if (HostObserverNative.UnlockSuccessful(GlobalUnlock(buffers[i]), Marshal.GetLastWin32Error())) locked[i] = false;
                }
                if (locked[i]) return false;
            }
            prepared = true; return true;
        }
        // 每輪Open只一次，失敗永久拒絕；不退回NULL window。
        public bool Open()
        {
            if (!prepared || failed || released || opened || next >= 65) return false;
            emptyAttempted = emptied = setAttempted = closeAttempted = false;
            opened = HostOpenFailureCapture.Dispatch(this, Window, openCapture);
            if (!opened) failed = true; return opened;
        }
        // 關閉診斷時沿原OpenClipboard宣告，不讀LastError或查opener。
        bool IHostOpenFailureNativePort.OpenLegacy(IntPtr window) { return OpenClipboard(window); }
        // 新mode每個guard通過的slot只清目前自有writer thread error一次。
        void IHostOpenFailureNativePort.ClearError() { SetLastErrorNative(0); }
        // 新mode使用同一OpenClipboard entry，失敗時立即保存本次cached error local。
        bool IHostOpenFailureNativePort.OpenAndCapture(IntPtr window, bool trustError, out bool errorAvailable, out int errorBits)
        {
            errorAvailable = false; errorBits = 0;
            bool result = OpenClipboardWithError(window);
            if (!result && trustError)
            {
                try { errorBits = Marshal.GetLastWin32Error(); errorAvailable = true; }
                catch { errorBits = 0; errorAvailable = false; }
            }
            return result;
        }
        // Open失敗後只取一次當下opener關係，不取得程序識別。
        IntPtr IHostOpenFailureNativePort.QueryOpenWindow() { return GetOpenClipboardWindow(); }
        // 清除是明確opt-in的新副作用，沒有backup或rollback。
        public bool Empty()
        {
            if (!opened || emptyAttempted || failed) return false;
            emptyAttempted = true; emptied = EmptyClipboard(); if (!emptied) failed = true; return emptied;
        }
        // 非NULL固定slot只Set一次；成功後立即不再持有可free的handle。
        public bool PublishFixedContainer(int index)
        {
            if (!opened || !emptied || failed || setAttempted || index != next || next >= 65 || buffers[index] == IntPtr.Zero || locked[index]) return false;
            setAttempted = true;
            if (SetClipboardData(13, buffers[index]) == IntPtr.Zero) { failed = true; return false; }
            buffers[index] = IntPtr.Zero; next++; return true;
        }
        // 即使Empty／Set失敗，也必嘗試同輪Close，不重新Open或重試Close。
        public bool Close()
        {
            if (!opened || closeAttempted) return false;
            closeAttempted = true; bool ok = CloseClipboard();
            if (ok) opened = false; else failed = true; return ok;
        }
        // 只驗存活的自有window，不輸出handle。
        public bool OwnsClipboard() { return next > 0 && Window != IntPtr.Zero && GetClipboardOwner() == Window; }
        // 每輪保存／guard才查，不作通知來源。
        public uint Sequence() { return GetClipboardSequenceNumber(); }
        // 部分prepare及未移交配置逐項釋放；API未正常閉一律不可宣稱成功。
        public bool Release()
        {
            if (released) return releaseResult;
            released = true; bool ok = !opened;
            for (int i = 0; i < 65; i++)
            {
                if (buffers[i] == IntPtr.Zero) continue;
                if (locked[i]) { ok = false; continue; }
                if (GlobalFree(buffers[i]) != IntPtr.Zero) ok = false; else buffers[i] = IntPtr.Zero;
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
    // 私有callback只接固定命令，不接任意payload。
    private delegate IntPtr WindowCallback(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 只註冊本次自有class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WindowClass value);
    // 固定HWND_MESSAGE，不顯示／獲得焦點。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    // 只讀自有thread訊息迴圈。
    [DllImport("user32.dll")] private static extern int GetMessageW(out Message message, IntPtr window, uint min, uint max);
    // 不翻譯或注入鍵鼠訊息。
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref Message message);
    // 未使用訊息沿Windows預設處理。
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 只發固定自有command，不合成clipboard通知。
    [DllImport("user32.dll")] private static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    // WM_QUIT只送保存的自有thread。
    [DllImport("user32.dll")] private static extern bool PostThreadMessageW(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
    // 只破壞自有window。
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    // 只解除本次自有class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClassW(string name, IntPtr instance);
    // module handle只留child RAM。
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    // 不列其他thread，只保存自有writer識別。
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    // 固定MOVEABLE／ZEROINIT公開小容器。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    // 驗固定buffer至少48bytes，不輸出實際大小。
    [DllImport("kernel32.dll")] private static extern UIntPtr GlobalSize(IntPtr handle);
    // 只鎖尚未轉交的自有buffer。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr handle);
    // 保留last error區分正常zero及真失敗。
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalUnlock(IntPtr handle);
    // 排除上次錯誤污染正常unlock。
    [DllImport("kernel32.dll", EntryPoint = "SetLastError")] private static extern void SetLastErrorNative(uint error);
    // 只free未轉交的自有buffer。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalFree(IntPtr handle);
    // 每輪一次Open，busy不重試。
    [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr window);
    // 僅新opt-in宣告擷取原Open的cached error，EntryPoint與BOOL ABI保持相同。
    [DllImport("user32.dll", EntryPoint = "OpenClipboard", ExactSpelling = true, SetLastError = true)] private static extern bool OpenClipboardWithError(IntPtr window);
    // 只查與clip關聯的opener HWND，不列舉或識別程序。
    [DllImport("user32.dll")] private static extern IntPtr GetOpenClipboardWindow();
    // 新副作用需Windows單次授權，不備份／恢復。
    [DllImport("user32.dll")] private static extern bool EmptyClipboard();
    // 固定CF_UNICODETEXT及非NULL handle，不用delayed rendering。
    [DllImport("user32.dll")] private static extern IntPtr SetClipboardData(uint format, IntPtr handle);
    // Close失敗不重開或重發。
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    // 原生owner只用同一發布物guard。
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    // 只用保存版本／穩定性，不輪詢當通知。
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
}
