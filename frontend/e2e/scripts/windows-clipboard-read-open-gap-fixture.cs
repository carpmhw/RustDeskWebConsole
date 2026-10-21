using System;
using System.Runtime.InteropServices;
using System.Threading;

// 與Win32 WNDCLASSW對應的自有window註冊資料。
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct HostReadOpenGapWindowClass
{
    public uint Style;
    public IntPtr Procedure;
    public int ClassExtra;
    public int WindowExtra;
    public IntPtr Instance;
    public IntPtr Icon;
    public IntPtr Cursor;
    public IntPtr Background;
    public string Menu;
    public string Name;
}

// 自有message-only window callback固定採Win32 window procedure簽章。
internal delegate IntPtr HostReadOpenGapWindowProc(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);

// 同assembly fake-native test seam，逐一映射Win32呼叫與Marshal.Copy邊界。
internal interface IHostReadOpenGapNativeCalls
{
    // 取得目前模組instance。
    IntPtr GetModuleHandle();
    // 註冊固定自有window class。
    ushort RegisterWindowClass(ref HostReadOpenGapWindowClass value);
    // 建立自有message-only window。
    IntPtr CreateWindow(uint ex, string className, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    // 以系統預設方式處理未使用的window message。
    IntPtr DefWindowProc(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 銷毀本fixture建立的單一window。
    bool DestroyWindow(IntPtr hwnd);
    // 解除本fixture註冊的class。
    bool UnregisterClass(string className, IntPtr instance);
    // 配置可移動、零初始化的HGLOBAL。
    IntPtr GlobalAlloc(uint flags, uint bytes);
    // 查詢自有或借用HGLOBAL的實際大小。
    ulong GlobalSize(IntPtr handle);
    // 鎖定HGLOBAL並回傳短命pointer。
    IntPtr GlobalLock(IntPtr handle);
    // 解鎖HGLOBAL並保留Win32 last-error結果。
    bool GlobalUnlock(IntPtr handle);
    // 取得前次GlobalUnlock錯誤碼。
    int GetLastErrorCode();
    // 設定本thread的Win32 last-error值。
    void SetLastErrorCode(uint error);
    // 釋放仍由fixture擁有的HGLOBAL。
    IntPtr GlobalFree(IntPtr handle);
    // 以指定自有window嘗試Open clipboard。
    bool OpenClipboard(IntPtr owner);
    // 清除目前clipboard全部格式。
    bool EmptyClipboard();
    // 只發布固定格式與自有配置。
    IntPtr SetClipboardData(uint format, IntPtr handle);
    // 關閉目前由本thread開啟的clipboard。
    bool CloseClipboard();
    // 取得目前clipboard owner HWND。
    IntPtr GetClipboardOwner();
    // 取得目前window station clipboard sequence。
    uint GetClipboardSequenceNumber();
    // 查詢固定CF_UNICODETEXT格式可用性。
    bool IsClipboardFormatAvailable(uint format);
    // 取得reader持鎖後的借用資料handle。
    IntPtr GetClipboardData(uint format);
    // 取得owner window process id供記事本布林比較。
    uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    // 將固定managed bytes複製到已驗證的自有HGLOBAL範圍。
    void CopyToNativeMemory(IntPtr destination, byte[] source);
    // 將已界限驗證的native範圍複製到owned managed buffer。
    void CopyFromNativeMemory(IntPtr source, byte[] destination);
}

// 同caller STA的固定I/O adapter；不建立writer thread或排程訊息。
internal sealed class HostReadOpenGapWindowsIo : IHostReadOpenGapIo
{
    private const uint ClipboardFormatUnicodeText = 13;
    private const uint MemoryMoveableZeroInitialize = 0x0042;
    private static readonly IntPtr MessageOnlyWindow = new IntPtr(-3);
    private readonly IHostReadOpenGapNativeCalls native;
    private readonly int ownerThread;
    private readonly HostReadOpenGapWindowProc callback;
    private string className;
    private IntPtr instance, writerWindow, readerWindow, allocation, borrowedHandle;
    private ulong allocationSize, borrowedSize;
    private bool invalid, prepareAttempted, prepared, registerAttempted, classRegistered, writerWindowCreateAttempted, readerWindowCreateAttempted, writerWindowCreated, readerWindowCreated;
    private bool classRegistrationUnknown, windowCreationUnknown, allocationUnknown;
    private bool preparationLocked, preparationUnlockFailed, preparationUnlockUnknown;
    private bool writerOpenAttempted, writerOpen, writerOpenUnknown, writerEmptyAttempted, writerEmptied;
    private bool setAttempted, transferred, transferUnknown, writerCloseAttempted, writerCloseFailed, writerCloseUnknown;
    private bool readerOpenAttempted, readerOpen, readerOpenUnknown, formatAttempted, formatAvailable;
    private bool allocationAttempted, dataRequested, readerLockAttempted, readerLocked, readerUnlockFailed, readerUnlockUnknown;
    private bool readerCloseAttempted, readerCloseFailed, readerCloseUnknown, released, releaseResult;

    // 建構只保存fake/native seam與owner thread，不呼叫任何Win32 API。
    internal HostReadOpenGapWindowsIo(IHostReadOpenGapNativeCalls native)
    {
        if (native == null) throw new ArgumentNullException("native");
        this.native = native;
        ownerThread = Thread.CurrentThread.ManagedThreadId;
        callback = WindowProcedure;
    }

    // 錯thread只設失效狀態，不觸碰原生資源。
    private bool OnOwner()
    {
        if (Thread.CurrentThread.ManagedThreadId == ownerThread) return true;
        invalid = true;
        return false;
    }

    // 初始化class、兩個自有window與固定HGLOBAL，不讀寫clipboard。
    public HostReadOpenGapStage Prepare()
    {
        if (!OnOwner() || invalid || prepareAttempted || released) return HostReadOpenGapStage.Failed;
        prepareAttempted = true;
        try
        {
            instance = native.GetModuleHandle();
            if (instance == IntPtr.Zero) return HostReadOpenGapStage.Failed;
            className = "RdWebOpenGap_" + Guid.NewGuid().ToString("N");
            HostReadOpenGapWindowClass windowClass = new HostReadOpenGapWindowClass
            {
                Procedure = Marshal.GetFunctionPointerForDelegate(callback),
                Instance = instance,
                Name = className
            };
            registerAttempted = true;
            ushort registered = native.RegisterWindowClass(ref windowClass);
            if (registered == 0) return HostReadOpenGapStage.Failed;
            classRegistered = true;
            writerWindowCreateAttempted = true;
            writerWindow = native.CreateWindow(0, className, "", 0, 0, 0, 0, 0, MessageOnlyWindow, IntPtr.Zero, instance, IntPtr.Zero);
            writerWindowCreated = writerWindow != IntPtr.Zero;
            if (!writerWindowCreated) return HostReadOpenGapStage.Failed;
            readerWindowCreateAttempted = true;
            readerWindow = native.CreateWindow(0, className, "", 0, 0, 0, 0, 0, MessageOnlyWindow, IntPtr.Zero, instance, IntPtr.Zero);
            readerWindowCreated = readerWindow != IntPtr.Zero;
            if (!readerWindowCreated) return HostReadOpenGapStage.Failed;

            allocationAttempted = true;
            allocation = native.GlobalAlloc(MemoryMoveableZeroInitialize, 32);
            if (allocation == IntPtr.Zero) return HostReadOpenGapStage.Failed;
            allocationSize = native.GlobalSize(allocation);
            if (!HostReadOpenGapPayload.AcceptsSize(allocationSize)) return HostReadOpenGapStage.Failed;
            IntPtr pointer;
            try { pointer = native.GlobalLock(allocation); }
            catch { preparationUnlockUnknown = true; throw; }
            if (pointer == IntPtr.Zero) return HostReadOpenGapStage.Failed;
            preparationLocked = true;

            byte[] fixedBytes = null;
            byte[] verifiedBytes = null;
            bool payloadVerified = false;
            HostReadOpenGapStage copyStatus = HostReadOpenGapStage.Unknown;
            try
            {
                fixedBytes = HostReadOpenGapPayload.CreateFixedBytes();
                verifiedBytes = new byte[(int)allocationSize];
                native.CopyToNativeMemory(pointer, fixedBytes);
                native.CopyFromNativeMemory(pointer, verifiedBytes);
                payloadVerified = HostReadOpenGapPayload.Matches(verifiedBytes);
                copyStatus = payloadVerified ? HostReadOpenGapStage.Succeeded : HostReadOpenGapStage.Failed;
            }
            catch { copyStatus = HostReadOpenGapStage.Unknown; }
            finally
            {
                if (fixedBytes != null) Array.Clear(fixedBytes, 0, fixedBytes.Length);
                if (verifiedBytes != null) Array.Clear(verifiedBytes, 0, verifiedBytes.Length);
                UnlockPreparation();
            }
            if (copyStatus != HostReadOpenGapStage.Succeeded || !payloadVerified) return copyStatus;
            if (preparationUnlockFailed) return HostReadOpenGapStage.Failed;
            if (preparationUnlockUnknown) return HostReadOpenGapStage.Unknown;
            prepared = true;
            return HostReadOpenGapStage.Succeeded;
        }
        catch
        {
            if (registerAttempted && !classRegistered) classRegistrationUnknown = true;
            if ((writerWindowCreateAttempted && !writerWindowCreated && writerWindow == IntPtr.Zero)
                || (readerWindowCreateAttempted && !readerWindowCreated && readerWindow == IntPtr.Zero)) windowCreationUnknown = true;
            if (allocationAttempted && allocation == IntPtr.Zero) allocationUnknown = true;
            return HostReadOpenGapStage.Unknown;
        }
    }

    // 解鎖準備用HGLOBAL一次，依last-error判斷正常false與真失敗。
    private void UnlockPreparation()
    {
        if (!preparationLocked) return;
        try
        {
            native.SetLastErrorCode(0);
            bool unlocked = HostObserverNative.UnlockSuccessful(native.GlobalUnlock(allocation), native.GetLastErrorCode());
            if (unlocked) preparationLocked = false;
            else preparationUnlockFailed = true;
        }
        catch { preparationUnlockUnknown = true; }
    }

    // 僅將未使用的window message交給DefWindowProc。
    private IntPtr WindowProcedure(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        if (!OnOwner()) return IntPtr.Zero;
        try { return native.DefWindowProc(hwnd, message, wParam, lParam); }
        catch { invalid = true; return IntPtr.Zero; }
    }

    // 以writer自有非NULL HWND一次Open。
    public bool OpenWriter()
    {
        if (!OnOwner() || invalid || !prepared || writerOpenAttempted || released) return false;
        writerOpenAttempted = true;
        try
        {
            writerOpen = native.OpenClipboard(writerWindow);
            return writerOpen;
        }
        catch { writerOpenUnknown = true; throw; }
    }

    // 在本輪writer clipboard鎖內清除全部格式。
    public bool Empty()
    {
        if (!OnOwner() || invalid || !writerOpen || writerEmptyAttempted || released) return false;
        writerEmptyAttempted = true;
        writerEmptied = native.EmptyClipboard();
        return writerEmptied;
    }

    // 將唯一固定配置交付系統，Set結果未知時隔離HGLOBAL不free。
    public HostReadOpenGapStage PublishFixed()
    {
        if (!OnOwner() || invalid || !writerOpen || !writerEmptied || setAttempted || released || preparationLocked || allocation == IntPtr.Zero)
            return HostReadOpenGapStage.NotAttempted;
        setAttempted = true;
        IntPtr result;
        try { result = native.SetClipboardData(ClipboardFormatUnicodeText, allocation); }
        catch { transferUnknown = true; return HostReadOpenGapStage.Unknown; }
        if (result == IntPtr.Zero) return HostReadOpenGapStage.Failed;
        transferred = true;
        allocation = IntPtr.Zero;
        return HostReadOpenGapStage.Succeeded;
    }

    // 每個成功writer Open都只呼叫一次Close，失敗時不重試。
    public HostReadOpenGapStage CloseWriter()
    {
        if (!OnOwner() || !writerOpen || writerCloseAttempted) return HostReadOpenGapStage.NotAttempted;
        writerCloseAttempted = true;
        try
        {
            if (!native.CloseClipboard())
            {
                writerCloseFailed = true;
                return HostReadOpenGapStage.Failed;
            }
            writerOpen = false;
            return HostReadOpenGapStage.Succeeded;
        }
        catch
        {
            writerCloseUnknown = true;
            return HostReadOpenGapStage.Unknown;
        }
    }

    // 只比較clipboard owner是否仍是本輪writer window。
    public bool OwnsPublication()
    {
        if (!OnOwner() || invalid || !transferred || writerWindow == IntPtr.Zero || writerOpen || released) return false;
        return native.GetClipboardOwner() == writerWindow;
    }

    // 取得一次真實序號，不作排序或輪詢。
    public uint Sequence()
    {
        if (!OnOwner() || invalid || released) throw new InvalidOperationException("host_capability_unavailable");
        return native.GetClipboardSequenceNumber();
    }

    // 以reader自有window一次Open已發布clipboard。
    public bool OpenReader()
    {
        if (!OnOwner() || invalid || !prepared || !transferred || !writerCloseAttempted || writerOpen || readerOpenAttempted || released)
            return false;
        readerOpenAttempted = true;
        try
        {
            readerOpen = native.OpenClipboard(readerWindow);
            return readerOpen;
        }
        catch { readerOpenUnknown = true; throw; }
    }

    // 只查詢已持鎖reader的CF_UNICODETEXT可用性。
    public bool HasUnicode()
    {
        if (!OnOwner() || invalid || !readerOpen || formatAttempted || released) return false;
        formatAttempted = true;
        formatAvailable = native.IsClipboardFormatAvailable(ClipboardFormatUnicodeText);
        return formatAvailable;
    }

    // 取得一次borrowed HGLOBAL大小，配置前由共享策略驗界限。
    public ulong ContainerSize()
    {
        if (!OnOwner() || invalid || !readerOpen || !formatAvailable || dataRequested || released)
            throw new InvalidOperationException("host_capability_unavailable");
        dataRequested = true;
        borrowedHandle = native.GetClipboardData(ClipboardFormatUnicodeText);
        if (borrowedHandle == IntPtr.Zero)
        {
            borrowedSize = 0;
            return 0;
        }
        borrowedSize = native.GlobalSize(borrowedHandle);
        return borrowedSize;
    }

    // 只複製reader先前取到的borrowed handle，並在finally解除GlobalLock。
    public HostReadOpenGapCopy ReadContainer(int count)
    {
        if (!OnOwner() || invalid || !readerOpen || !dataRequested || borrowedHandle == IntPtr.Zero || readerLockAttempted || released
            || count < 2 || count > 65538 || (ulong)count != borrowedSize)
            return new HostReadOpenGapCopy(HostReadOpenGapStage.Failed, null);
        readerLockAttempted = true;
        IntPtr pointer;
        try { pointer = native.GlobalLock(borrowedHandle); }
        catch
        {
            readerUnlockUnknown = true;
            return new HostReadOpenGapCopy(HostReadOpenGapStage.Unknown, null);
        }
        if (pointer == IntPtr.Zero) return new HostReadOpenGapCopy(HostReadOpenGapStage.Failed, null);
        readerLocked = true;
        byte[] bytes = new byte[count];
        bool copied = false;
        try
        {
            native.CopyFromNativeMemory(pointer, bytes);
            copied = true;
        }
        catch
        {
            Array.Clear(bytes, 0, bytes.Length);
            bytes = null;
        }
        finally { UnlockReader(); }
        if (!copied) return new HostReadOpenGapCopy(HostReadOpenGapStage.Unknown, null);
        if (readerUnlockFailed) return new HostReadOpenGapCopy(HostReadOpenGapStage.Failed, bytes);
        if (readerUnlockUnknown) return new HostReadOpenGapCopy(HostReadOpenGapStage.Unknown, bytes);
        return new HostReadOpenGapCopy(HostReadOpenGapStage.Succeeded, bytes);
    }

    // 解鎖borrowed reader handle恰一次，失敗狀態不以晚結果覆寫。
    private void UnlockReader()
    {
        if (!readerLocked) return;
        try
        {
            native.SetLastErrorCode(0);
            bool unlocked = HostObserverNative.UnlockSuccessful(native.GlobalUnlock(borrowedHandle), native.GetLastErrorCode());
            if (unlocked) readerLocked = false;
            else readerUnlockFailed = true;
        }
        catch { readerUnlockUnknown = true; }
    }

    // 只回報clipboard owner是否屬於記事本process，不輸出handle或PID。
    public bool? OwnerMatches(int editorPid)
    {
        if (!OnOwner() || invalid || !readerOpen || !dataRequested || borrowedHandle == IntPtr.Zero || released) return null;
        IntPtr owner = native.GetClipboardOwner();
        if (owner == IntPtr.Zero) return null;
        uint processId;
        if (native.GetWindowThreadProcessId(owner, out processId) == 0) return null;
        return processId == (uint)editorPid;
    }

    // 每個成功reader Open由共享策略finally關閉，Unlock亦納入狀態。
    public HostReadOpenGapStage CloseReader()
    {
        if (!OnOwner() || !readerOpen || readerCloseAttempted) return HostReadOpenGapStage.NotAttempted;
        readerCloseAttempted = true;
        bool closed;
        try { closed = native.CloseClipboard(); }
        catch
        {
            readerCloseUnknown = true;
            return readerUnlockFailed ? HostReadOpenGapStage.Failed : HostReadOpenGapStage.Unknown;
        }
        if (closed) readerOpen = false;
        else readerCloseFailed = true;
        if (!closed || readerUnlockFailed) return HostReadOpenGapStage.Failed;
        if (readerCloseUnknown || readerUnlockUnknown) return HostReadOpenGapStage.Unknown;
        return HostReadOpenGapStage.Succeeded;
    }

    // 只清理本fixture仍擁有且所有權明確的資源，不清剪貼簿或重試Close。
    public bool Release()
    {
        if (!OnOwner()) return false;
        if (released) return releaseResult;
        released = true;
        bool clean = !writerOpen && !readerOpen && !writerOpenUnknown && !readerOpenUnknown
            && !preparationLocked && !readerLocked && !preparationUnlockFailed && !preparationUnlockUnknown
            && !writerCloseFailed && !writerCloseUnknown && !readerCloseFailed && !readerCloseUnknown
            && !readerUnlockFailed && !readerUnlockUnknown && !transferUnknown && !windowCreationUnknown && !allocationUnknown;
        if (allocation != IntPtr.Zero && !transferred && !transferUnknown)
        {
            if (preparationLocked || preparationUnlockFailed || preparationUnlockUnknown) clean = false;
            else
            {
                try
                {
                    if (native.GlobalFree(allocation) != IntPtr.Zero) clean = false;
                    else allocation = IntPtr.Zero;
                }
                catch { clean = false; }
            }
        }
        else if (allocation != IntPtr.Zero) clean = false;

        if (readerWindow != IntPtr.Zero)
        {
            try
            {
                if (native.DestroyWindow(readerWindow)) readerWindow = IntPtr.Zero;
                else clean = false;
            }
            catch { clean = false; }
        }
        if (writerWindow != IntPtr.Zero)
        {
            try
            {
                if (native.DestroyWindow(writerWindow)) writerWindow = IntPtr.Zero;
                else clean = false;
            }
            catch { clean = false; }
        }
        if (classRegistered || classRegistrationUnknown)
        {
            try
            {
                if (native.UnregisterClass(className, instance)) classRegistered = false;
                else clean = false;
                if (classRegistrationUnknown) classRegistrationUnknown = false;
            }
            catch { clean = false; }
        }
        releaseResult = clean;
        return releaseResult;
    }
}

// 只在已驗證Windows與STA環境建立兩個自有window的facade。
public sealed class HostReadOpenGapWindows
{
    private readonly int callerThread;
    private readonly HostReadOpenGapSession session;
    private readonly bool ready;
    private bool stopped, stopResult;

    // 平台與Apartment guard先於native seam／window／配置建立。
    public static HostReadOpenGapWindows StartWindows()
    {
#if NETCOREAPP
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
#else
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
#endif
        if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA) throw new PlatformNotSupportedException();
        return new HostReadOpenGapWindows();
    }

    // 只在經過StartWindows guard後建立本機Win32 adapter並準備自有資源。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private HostReadOpenGapWindows()
    {
        callerThread = Thread.CurrentThread.ManagedThreadId;
        HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(new HostReadOpenGapNativeCalls());
        session = new HostReadOpenGapSession(io);
        ready = session.Prepare();
    }

    // 只回報初始化快照，不代表clipboard已發布。
    public bool Ready { get { return ready && !stopped; } }

    // 沿唯一owner thread呼叫共享reader策略一次。
    public HostClipboardValue Observe(int editorPid)
    {
        if (Thread.CurrentThread.ManagedThreadId != callerThread) return session.Observe(editorPid);
        if (stopped || !ready) return new HostClipboardValue { Code = "host_capability_unavailable", Stable = false, ResourcesClosed = true };
        return session.Observe(editorPid);
    }

    // 封存唯一sample的safe evidence與child RAM版本。
    public HostReadOpenGapCapture CaptureSample()
    {
        return session.CaptureSample();
    }

    // 只釋放本輪自有資源一次，不清除或還原clipboard。
    public bool Stop()
    {
        if (Thread.CurrentThread.ManagedThreadId != callerThread)
        {
            session.Stop();
            return false;
        }
        if (stopped) return stopResult;
        stopped = true;
        stopResult = session.Stop();
        return stopResult;
    }

    // 只讀取正常Stop後的封存結果，不新增native query。
    public HostReadOpenGapFinal GetFinalTrace()
    {
        return session.GetFinalTrace();
    }
}

// 唯一Win32 wrapper；正式parent／CI不呼叫此class。
#if NETCOREAPP
[System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
internal sealed class HostReadOpenGapNativeCalls : IHostReadOpenGapNativeCalls
{
    // 回傳目前module instance。
    public IntPtr GetModuleHandle() { return GetModuleHandleW(null); }
    // 註冊自有window class。
    public ushort RegisterWindowClass(ref HostReadOpenGapWindowClass value) { return RegisterClassW(ref value); }
    // 建立window並固定由caller提供HWND_MESSAGE parent。
    public IntPtr CreateWindow(uint ex, string className, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data)
    { return CreateWindowExW(ex, className, title, style, x, y, width, height, parent, menu, instance, data); }
    // 以系統預設程序處理不需校準的window message。
    public IntPtr DefWindowProc(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam) { return DefWindowProcW(hwnd, message, wParam, lParam); }
    // 銷毀一個本fixture window。
    public bool DestroyWindow(IntPtr hwnd) { return DestroyWindowNative(hwnd); }
    // 解除本fixture註冊的window class。
    public bool UnregisterClass(string className, IntPtr instance) { return UnregisterClassW(className, instance); }
    // 配置固定大小GMEM_MOVEABLE|GMEM_ZEROINIT容器。
    public IntPtr GlobalAlloc(uint flags, uint bytes) { return GlobalAllocNative(flags, new UIntPtr(bytes)); }
    // 查詢HGLOBAL實際配置大小。
    public ulong GlobalSize(IntPtr handle) { return GlobalSizeNative(handle).ToUInt64(); }
    // 取得HGLOBAL可用記憶體pointer。
    public IntPtr GlobalLock(IntPtr handle) { return GlobalLockNative(handle); }
    // 解鎖HGLOBAL並由caller隨即讀取last-error。
    public bool GlobalUnlock(IntPtr handle) { return GlobalUnlockNative(handle); }
    // 取得前一個P/Invoke的Win32 last-error snapshot。
    public int GetLastErrorCode() { return Marshal.GetLastWin32Error(); }
    // 初始化本thread last-error供GlobalUnlock判定正常false。
    public void SetLastErrorCode(uint error) { SetLastErrorNative(error); }
    // 釋放仍由fixture擁有的配置。
    public IntPtr GlobalFree(IntPtr handle) { return GlobalFreeNative(handle); }
    // 以自有window開啟clipboard。
    public bool OpenClipboard(IntPtr owner) { return OpenClipboardNative(owner); }
    // 清空clipboard全部舊格式。
    public bool EmptyClipboard() { return EmptyClipboardNative(); }
    // 只Set固定CF_UNICODETEXT配置。
    public IntPtr SetClipboardData(uint format, IntPtr handle) { return SetClipboardDataNative(format, handle); }
    // 關閉目前thread持有的clipboard lock。
    public bool CloseClipboard() { return CloseClipboardNative(); }
    // 取得clipboard目前owner HWND。
    public IntPtr GetClipboardOwner() { return GetClipboardOwnerNative(); }
    // 取得window station目前sequence number。
    public uint GetClipboardSequenceNumber() { return GetClipboardSequenceNumberNative(); }
    // 查詢固定clipboard format可用性。
    public bool IsClipboardFormatAvailable(uint format) { return IsClipboardFormatAvailableNative(format); }
    // 取得已開啟clipboard的借用資料handle。
    public IntPtr GetClipboardData(uint format) { return GetClipboardDataNative(format); }
    // 取得owner HWND所屬process id。
    public uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId) { return GetWindowThreadProcessIdNative(hwnd, out processId); }
    // 將managed固定bytes複製至已鎖定owned配置。
    public void CopyToNativeMemory(IntPtr destination, byte[] source) { Marshal.Copy(source, 0, destination, source.Length); }
    // 將已界限驗證的native範圍複製至managed owned buffer。
    public void CopyFromNativeMemory(IntPtr source, byte[] destination) { Marshal.Copy(source, destination, 0, destination.Length); }

    // 取得本module handle。
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string moduleName);
    // 註冊Unicode window class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref HostReadOpenGapWindowClass value);
    // 建立指定parent的Unicode視窗。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string className, string windowName, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
    // 預設處理本fixture不使用的window message。
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 銷毀指定自有視窗。
    [DllImport("user32.dll", EntryPoint = "DestroyWindow")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DestroyWindowNative(IntPtr hwnd);
    // 解除指定自有window class。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool UnregisterClassW(string className, IntPtr instance);
    // 配置指定固定大小的global memory。
    [DllImport("kernel32.dll", EntryPoint = "GlobalAlloc")] private static extern IntPtr GlobalAllocNative(uint flags, UIntPtr bytes);
    // 取得global memory實際大小。
    [DllImport("kernel32.dll", EntryPoint = "GlobalSize")] private static extern UIntPtr GlobalSizeNative(IntPtr handle);
    // 鎖定global memory取得短命pointer。
    [DllImport("kernel32.dll", EntryPoint = "GlobalLock")] private static extern IntPtr GlobalLockNative(IntPtr handle);
    // 解鎖global memory並保存last-error。
    [DllImport("kernel32.dll", EntryPoint = "GlobalUnlock", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GlobalUnlockNative(IntPtr handle);
    // 設定本thread last-error供GlobalUnlock分類。
    [DllImport("kernel32.dll", EntryPoint = "SetLastError")] private static extern void SetLastErrorNative(uint error);
    // 釋放尚由本fixture擁有的global memory。
    [DllImport("kernel32.dll", EntryPoint = "GlobalFree")] private static extern IntPtr GlobalFreeNative(IntPtr handle);
    // 以指定自有window開啟clipboard。
    [DllImport("user32.dll", EntryPoint = "OpenClipboard")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool OpenClipboardNative(IntPtr owner);
    // 清除目前clipboard全部格式。
    [DllImport("user32.dll", EntryPoint = "EmptyClipboard")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool EmptyClipboardNative();
    // 將固定HGLOBAL交付指定clipboard format。
    [DllImport("user32.dll", EntryPoint = "SetClipboardData")] private static extern IntPtr SetClipboardDataNative(uint format, IntPtr handle);
    // 關閉本thread已開啟的clipboard。
    [DllImport("user32.dll", EntryPoint = "CloseClipboard")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseClipboardNative();
    // 取得目前clipboard owner HWND。
    [DllImport("user32.dll", EntryPoint = "GetClipboardOwner")] private static extern IntPtr GetClipboardOwnerNative();
    // 取得window station真實clipboard sequence。
    [DllImport("user32.dll", EntryPoint = "GetClipboardSequenceNumber")] private static extern uint GetClipboardSequenceNumberNative();
    // 查詢固定clipboard format是否可用。
    [DllImport("user32.dll", EntryPoint = "IsClipboardFormatAvailable")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsClipboardFormatAvailableNative(uint format);
    // 取得reader持鎖後的borrowed data handle。
    [DllImport("user32.dll", EntryPoint = "GetClipboardData")] private static extern IntPtr GetClipboardDataNative(uint format);
    // 查詢指定owner window所屬process id。
    [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] private static extern uint GetWindowThreadProcessIdNative(IntPtr hwnd, out uint processId);
}
