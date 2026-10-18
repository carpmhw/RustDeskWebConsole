using System;
using System.Runtime.InteropServices;
using System.Threading;

// 只供明確opt-in的新校準child；正式observer不引用此writer。
public sealed class HostClipboardCapacityWindows
{
    private const uint Control = 0x8001;
    private readonly int callerThread;
    private readonly Thread thread;
    private readonly ManualResetEvent initialized = new ManualResetEvent(false);
    private readonly ManualResetEvent reply = new ManualResetEvent(false);
    private readonly WindowCallback callback;
    private volatile bool ready, poisoned, stopRequested;
    private bool stopped, stopResult, cleaned, answered, matchReply;
    private int pendingCommand;
    private uint threadId, versionReply;
    private IntPtr window;
    private HostClipboardCapacityProducer producer;
    private HostCapacityPublication publicationReply;

    // 平台guard在任何thread／Win32／配置之前；Linux測試僅執行此拒絕。
    public static HostClipboardCapacityWindows StartWindows()
    {
#if NETCOREAPP
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
#else
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
#endif
        return new HostClipboardCapacityWindows();
    }
    // 初始化只建自有window／固定buffer，不Open／Empty／Set；內部500ms更嚴且受外層5秒限制。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private HostClipboardCapacityWindows()
    {
        callerThread = Thread.CurrentThread.ManagedThreadId;
        callback = OnMessage;
        thread = new Thread(Run);
        thread.IsBackground = true;
        try { thread.SetApartmentState(ApartmentState.STA); thread.Start(); }
        catch { initialized.Dispose(); reply.Dispose(); throw; }
        initialized.WaitOne(500);
    }
    // 只報初始化快照，不當心跳或原生發布證據。
    public bool Ready { get { return ready && !stopped && !poisoned; } }
    // 同一child呼叫端串行派送固定命令，未知／超時後不可再試。
    private bool Send(int command)
    {
        if (Thread.CurrentThread.ManagedThreadId != callerThread || !Ready) return false;
        reply.Reset(); answered = false; matchReply = false; versionReply = 0;
        publicationReply = new HostCapacityPublication();
        Interlocked.Exchange(ref pendingCommand, command);
        if (!PostMessageW(window, Control, new UIntPtr((uint)command), IntPtr.Zero) || !reply.WaitOne(500))
        {
            poisoned = true; Interlocked.Exchange(ref pendingCommand, 0); return false;
        }
        return answered && !poisoned;
    }
    // 只在原sample階段由child明確呼叫一次，原生API在writer thread執行。
    public HostCapacityPublication Publish() { return Send(1) ? publicationReply : new HostCapacityPublication(); }
    // 不讀文字，只比較同一自有owner與版本。
    public bool MatchesPublished() { return Send(2) && matchReply; }
    // 版本只傳同child RAM，不能serialize到frame。
    public uint PublishedVersion() { return Send(3) ? versionReply : 0; }
    // Stop只送自有thread退出，release仍在該thread；失敗sticky、不重試發布。
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
    // 訊息迴圈與所有producer操作綁同一thread，finally一定嘗試自有資源收尾。
    private void Run()
    {
        bool loopHealthy = true;
        threadId = GetCurrentThreadId();
        try
        {
            WindowsPort port = new WindowsPort(callback);
            producer = new HostClipboardCapacityProducer(port);
            bool prepared = producer.Prepare(); window = port.Window; ready = prepared;
            initialized.Set();
            if (!ready || stopRequested) return;
            Message message;
            int received;
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
    // 只接受呼叫端已排隊的固定命令；外來訊息不能在sample前觸發發布。
    private IntPtr OnMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        ulong value = wParam.ToUInt64();
        if (message != Control || value < 1 || value > 3 || lParam != IntPtr.Zero)
            return DefWindowProcW(hwnd, message, wParam, lParam);
        int command = (int)value;
        if (Interlocked.CompareExchange(ref pendingCommand, 0, command) != command) return IntPtr.Zero;
        try
        {
            if (command == 1) publicationReply = producer.Publish();
            else if (command == 2) matchReply = producer.MatchesPublished();
            else versionReply = producer.PublishedVersion();
            answered = true;
        }
        catch { poisoned = true; }
        finally { reply.Set(); }
        return IntPtr.Zero;
    }

    // 固定原生配置的實際adapter；所有handle／大小／版本只留child RAM。
    private sealed class WindowsPort : IHostCapacityClipboardPort
    {
        private readonly WindowCallback callback;
        private string className;
        private IntPtr instance, allocation;
        private bool registered, locked, prepared, openAttempted, opened, emptyAttempted, emptied, setAttempted, transferred, closeAttempted, released, releaseResult;
        public IntPtr Window;
        // delegate由fixture強參照，不能在原生window仍活躍時被GC。
        public WindowsPort(WindowCallback callback) { this.callback = callback; }
        // 只配置65540及零padding，不讀或修改當前clipboard。
        public bool PrepareFixedContainer()
        {
            if (prepared || registered || allocation != IntPtr.Zero) return false;
            className = "RdWebCapacity_" + Guid.NewGuid().ToString("N");
            instance = GetModuleHandleW(null);
            WindowClass cls = new WindowClass { Procedure = Marshal.GetFunctionPointerForDelegate(callback), Instance = instance, Name = className };
            if (RegisterClassW(ref cls) == 0) return false;
            registered = true;
            Window = CreateWindowExW(0, className, "", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, instance, IntPtr.Zero);
            if (Window == IntPtr.Zero) return false;
            allocation = GlobalAlloc(0x0042, new UIntPtr(65540u));
            if (allocation == IntPtr.Zero || GlobalSize(allocation).ToUInt64() < 65540) return false;
            IntPtr pointer = GlobalLock(allocation);
            if (pointer == IntPtr.Zero) return false;
            locked = true;
            try
            {
                for (int i = 0; i < 32769; i++) Marshal.WriteInt16(pointer, i * 2, 65);
                Marshal.WriteInt16(pointer, 65538, 0);
            }
            finally
            {
                SetLastErrorNative(0);
                bool unlocked = HostObserverNative.UnlockSuccessful(GlobalUnlock(allocation), Marshal.GetLastWin32Error());
                if (unlocked) locked = false;
            }
            prepared = !locked;
            return prepared;
        }
        // 使用非NULL自有window，一次Open；不得退回NULL或busy重試。
        public bool Open()
        {
            if (!prepared || openAttempted || released) return false;
            openAttempted = true; opened = OpenClipboard(Window); return opened;
        }
        // 新副作用僅此獨立fixture，不能還原或讀取舊內容。
        public bool Empty()
        {
            if (!opened || emptyAttempted) return false;
            emptyAttempted = true; emptied = EmptyClipboard(); return emptied;
        }
        // Set成功立即交出所有權，不再存可free的allocation。
        public bool PublishFixedContainer()
        {
            if (!opened || !emptied || setAttempted || locked || allocation == IntPtr.Zero) return false;
            setAttempted = true;
            if (SetClipboardData(13, allocation) == IntPtr.Zero) return false;
            transferred = true; allocation = IntPtr.Zero; return true;
        }
        // 每個成功Open僅Close一次，失敗狀態留給Release與上層判定。
        public bool Close()
        {
            if (!opened || closeAttempted) return false;
            closeAttempted = true;
            bool result = CloseClipboard(); if (result) opened = false; return result;
        }
        // 所有權只比自有window，不輸出handle或PID。
        public bool OwnsClipboard() { return transferred && Window != IntPtr.Zero && GetClipboardOwner() == Window; }
        // 原生版本不作大小排序或通知輪詢。
        public uint Sequence() { return GetClipboardSequenceNumber(); }
        // 轉交成功的記憶體不碰；尚自有且已unlock才free，API未閉一律不可成功。
        public bool Release()
        {
            if (released) return releaseResult;
            released = true;
            bool ok = !opened && !locked;
            if (allocation != IntPtr.Zero && !transferred)
            {
                if (locked) ok = false;
                else if (GlobalFree(allocation) != IntPtr.Zero) ok = false;
                else allocation = IntPtr.Zero;
            }
            if (Window != IntPtr.Zero)
            {
                if (!DestroyWindow(Window)) ok = false;
                else Window = IntPtr.Zero;
            }
            if (registered && !UnregisterClassW(className, instance)) ok = false;
            releaseResult = ok; return ok;
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WindowClass { public uint Style; public IntPtr Procedure; public int ClassExtra; public int WindowExtra; public IntPtr Instance; public IntPtr Icon; public IntPtr Cursor; public IntPtr Background; public string Menu; public string Name; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public int X; public int Y; public uint Private; }
    // callback只執行固定自有command，不接任意payload。
    private delegate IntPtr WindowCallback(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 只註冊本次隨機命名的自有class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WindowClass value);
    // 固定HWND_MESSAGE，不顯示、不取焦點。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    // 只處理自有thread訊息迴圈。
    [DllImport("user32.dll")] private static extern int GetMessageW(out Message message, IntPtr window, uint min, uint max);
    // 不翻譯／注入keyboard訊息。
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref Message message);
    // 其他訊息沿Windows預設處理。
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 只派送已有pending gate的固定自有command。
    [DllImport("user32.dll")] private static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    // 退出只針對保存的自有writer thread。
    [DllImport("user32.dll")] private static extern bool PostThreadMessageW(uint id, uint message, UIntPtr wParam, IntPtr lParam);
    // 只破壞本次自有window。
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    // 只移除本次自有class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClassW(string name, IntPtr instance);
    // module handle只留child RAM。
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    // 自有thread識別只用停止，不列其他程序。
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    // 固定GMEM_MOVEABLE|GMEM_ZEROINIT，不配置任意長度。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    // 實際配置大小只留child RAM驗超額。
    [DllImport("kernel32.dll")] private static extern UIntPtr GlobalSize(IntPtr handle);
    // 只鎖自有尚未轉交的配置。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr handle);
    // 明確保留last error判定正常zero或真失敗。
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalUnlock(IntPtr handle);
    // 排除舊last error污染正常zero unlock。
    [DllImport("kernel32.dll", EntryPoint = "SetLastError")] private static extern void SetLastErrorNative(uint error);
    // 僅free尚未轉交系統的自有配置。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalFree(IntPtr handle);
    // writer固定只一次Open；不是正式reader的API實作。
    [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr window);
    // 清除舊格式是另授權的單次副作用，不備份／恢復。
    [DllImport("user32.dll")] private static extern bool EmptyClipboard();
    // 固定CF_UNICODETEXT且非NULL配置，不用delayed rendering。
    [DllImport("user32.dll")] private static extern IntPtr SetClipboardData(uint format, IntPtr handle);
    // 不因Close失敗重新Open或發布。
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    // 僅確認自有window，原值不serialize。
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    // 版本只做同一發布物的前後穩定性比較。
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
}
