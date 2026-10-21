using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;

// 原生資料只留自有child RAM；PowerShell只能輸出另建的布林row，不serialize此物件。
public sealed class HostClipboardValue
{
    public string Text;
    public string Code = "host_clipboard_format_unavailable";
    public bool Stable;
    public bool? OwnerMatches;
    public uint Version;
    public bool ResourcesClosed = true;
}
public sealed class HostClipboardNotice
{
    public int Ordinal;
    public long Us;
    public uint Version;
}
// 相等分類不攜帶任何文字；兩個exact=false不能取代真正pair比較。
public sealed class HostTextComparison
{
    public bool EditorStable;
    public bool EditorExact;
    public bool ClipboardExact;
    public bool? ClipboardMatchesEditor;
}
// 僅隔離不可在Linux執行的Win32讀取邊界；不提供clipboard寫入操作。
public interface IHostClipboardAccess
{
    // 序號只用於通知版本／query穩定性，不輪詢通知。
    uint Sequence();
    // 一次開啟，busy不重試。
    bool Open();
    // 只接受CF_UNICODETEXT。
    bool HasUnicode();
    // 在配置byte[]前取得容器大小。
    ulong ContainerSize();
    // 有界複製，回傳buffer由caller清除。
    byte[] ReadContainer(int count);
    // 只回同editor owner布林，不傳PID或HWND。
    bool? OwnerMatches(int editorPid);
    // 每次成功Open必有Close，失敗不可宣稱收尾正常。
    bool Close();
}
// 公開工具本體使用.NET內建API，沒有socket／鍵盤hook或clipboard寫入API。
public sealed class HostObserverNative
{
    // 真正讀取策略只借Win32 port；配置前界限、通知race、strict解碼與close都在此統一驗。
    public static HostClipboardValue ObserveClipboard(IHostClipboardAccess port, uint notifiedVersion, int editorPid)
    {
        HostClipboardValue value=new HostClipboardValue();bool opened=false;byte[] bytes=null;
        try
        {
            uint before=port.Sequence();
            if (!SameClipboardVersion(notifiedVersion,before,before)) {value.Code="host_clipboard_unstable";return value;}
            opened=port.Open();
            if (!opened) {value.Code="host_clipboard_busy";return value;}
            if (!port.HasUnicode()) return value;
            ulong size=port.ContainerSize();
            if (size<2 || size>65538 || size%2!=0) {value.Code="host_text_too_large";return value;}
            bytes=port.ReadContainer((int)size);
            if (bytes==null) {value.Code="host_text_unreadable";return value;}
            if (bytes.Length!=(int)size) throw new InvalidDataException();
            string text=DecodeClipboardContainer(bytes);
            value.OwnerMatches=port.OwnerMatches(editorPid);value.Version=before;
            value.Stable=SameClipboardVersion(notifiedVersion,before,port.Sequence());
            if (!value.Stable) {value.Code="host_clipboard_unstable";return value;}
            value.Text=text;value.Code="host_observed";return value;
        }
        catch {value.Text=null;value.Stable=false;value.Code="host_text_invalid";return value;}
        finally
        {
            if (bytes!=null) Array.Clear(bytes,0,bytes.Length);
            if (opened)
            {
                try {value.ResourcesClosed=port.Close();} catch {value.ResourcesClosed=false;}
                if (!value.ResourcesClosed) {value.Text=null;value.Stable=false;value.Code="host_cleanup_unavailable";}
            }
        }
    }
    // 每一項有自有資源的清理皆需成功，thread退出不能代替API結果。
    public static bool CleanupSuccessful(bool listener, bool window, bool windowClass, bool clipboard) { return listener && window && windowClass && clipboard; }
    // GlobalUnlock零且NO_ERROR表示已解鎖成功，不能把正常zero誤當錯誤或忽略真失敗。
    public static bool UnlockSuccessful(bool result, int error) { return result || error == 0; }
    // 通知只關聯同穩定版本；零序號不可用，不能用新內容替換排隊舊通知。
    public static bool SameClipboardVersion(uint notified, uint before, uint after) { return before != 0 && before == after && (notified == 0 || notified == before); }
    // 原生配置大小先驗且terminator必在界內；只回child RAM字串，不trim／normalize。
    public static string DecodeClipboardContainer(byte[] bytes)
    {
        if (bytes == null || bytes.Length < 2 || bytes.Length > 65538 || bytes.Length % 2 != 0) throw new InvalidDataException();
        int end = -1;
        for (int i=0; i<bytes.Length; i+=2) if (bytes[i] == 0 && bytes[i+1] == 0) { end=i; break; }
        if (end < 0) throw new InvalidDataException();
        try
        {
            string text = new UnicodeEncoding(false,false,true).GetString(bytes,0,end);
            if (!IsSafeText(text,32768)) throw new InvalidDataException();
            return text;
        }
        catch (DecoderFallbackException) { throw new InvalidDataException(); }
    }
    // UTF8 strict驗scalar／NUL／雙重容量，字串僅child RAM，不能截斷求相等。
    public static bool IsSafeText(string text, int maxBytes)
    {
        if (maxBytes < 1 || maxBytes > 32768 || text == null || text.Length > maxBytes || text.IndexOf('\0') >= 0) return false;
        try { return new UTF8Encoding(false, true).GetByteCount(text) <= maxBytes; }
        catch (EncoderFallbackException) { return false; }
    }
    // 真RAM比較只在同query／穩定版本／穩定UIA／scope成立；false不能冒稱資料彼此相等。
    public static HostTextComparison CompareText(string before, string after, string clipboard, string expected, bool scope, bool clipboardStable)
    {
        HostTextComparison value = new HostTextComparison();
        if (!scope || !IsSafeText(expected,4096) || !IsSafeText(before,32768) || !IsSafeText(after,32768)) return value;
        value.EditorStable = String.Equals(before,after,StringComparison.Ordinal);
        value.EditorExact = value.EditorStable && String.Equals(after,expected,StringComparison.Ordinal);
        if (clipboardStable && IsSafeText(clipboard,32768))
        {
            value.ClipboardExact = String.Equals(clipboard,expected,StringComparison.Ordinal);
            if (value.EditorStable) value.ClipboardMatchesEditor = String.Equals(after,clipboard,StringComparison.Ordinal);
        }
        return value;
    }
    private readonly long origin = Stopwatch.GetTimestamp();
    private readonly Queue<HostClipboardNotice> notices = new Queue<HostClipboardNotice>();
    private readonly ManualResetEvent initialized = new ManualResetEvent(false);
    private readonly Thread thread;
    private readonly WndProc callback;
    private IntPtr window;
    private uint threadId;
    private int count;
    private bool listenerClosed, windowClosed, classClosed, clipboardClosed = true;
    private bool signalDisposed;
    public bool Overflow;
    public bool Ready;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WndClass { public uint Style; public IntPtr Procedure; public int ClassExtra; public int WindowExtra; public IntPtr Instance; public IntPtr Icon; public IntPtr Cursor; public IntPtr Background; public string Menu; public string Name; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public int X; public int Y; public uint Private; }
    // callback只收原生metadata，不進UIA、不拿文字、不改owner。
    private delegate IntPtr WndProc(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // Win32宣告僅初始化／移除自有message-only listener。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WndClass value);
    // 視窗不可見，Parent固定HWND_MESSAGE。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data);
    // 原生訊息只在自有thread分派。
    [DllImport("user32.dll")] private static extern int GetMessageW(out Message message, IntPtr window, uint min, uint max);
    // 自有window callback照原DefWindowProc語意處理其他訊息。
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref Message message);
    // 不注入keyboard或mouse message。
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    // 註冊唯讀clipboard變更通知。
    [DllImport("user32.dll")] private static extern bool AddClipboardFormatListener(IntPtr hwnd);
    // 只移除自身listener。
    [DllImport("user32.dll")] private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);
    // 只破壞自身message-only window。
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr hwnd);
    // 自有window class正常收尾。
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClassW(string name, IntPtr instance);
    // WM_QUIT只送本次自有thread，與產品輸入無關。
    [DllImport("user32.dll")] private static extern bool PostThreadMessageW(uint id, uint message, UIntPtr wParam, IntPtr lParam);
    // 元件module handle留在RAM。
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    // 只記自有listener thread identity。
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    // sequence僅用於通知版本與讀取race，不輪詢代替listener。
    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
    // 不重試短暫clipboard lock；不呼任何寫入API。
    [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr hwnd);
    // 正常／故障都釋放自有read lock。
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    // 只接受CF_UNICODETEXT。
    [DllImport("user32.dll")] private static extern bool IsClipboardFormatAvailable(uint format);
    // 唯讀可能觸發delayed rendering，不能宣稱零擾動。
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardData(uint format);
    // 先驗配置大小，再複製有界bytes。
    [DllImport("kernel32.dll")] private static extern UIntPtr GlobalSize(IntPtr handle);
    // borrowed native pointer不外傳。
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr handle);
    // 不free他人clipboard配置，只解除borrowed lock。
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalUnlock(IntPtr handle);
    // owner HWND只留RAM，不能當Ctrl+C因果ID。
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    // PID僅比較同一授權Notepad，不列程序或輸出識別。
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    // 最小讀權限，用於同使用者檢查。
    [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
    // token只查詢，不更改權限或模擬使用者。
    [DllImport("advapi32.dll")] private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    // 釋放本次自行取得的handle。
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    // 初始化只建立自有listener，不建可見視窗。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    public HostObserverNative()
    {
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
        callback = OnMessage;
        // thread只處理notification metadata，所有UIA query由單一child主執行緒負責。
        thread = new Thread(delegate() { Listen(); });
        thread.IsBackground = true;
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        initialized.WaitOne(500);
    }
    // 同一host來源的相對微秒，不與Main performance.now硬排序。
    public long Microseconds() { return Math.Max(0, (long)((Stopwatch.GetTimestamp() - origin) * 1000000.0 / Stopwatch.Frequency)); }
    // 不讓原生callback例外或無界queue外溢。
    private IntPtr OnMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        if (message == 0x031D)
        {
            lock (notices)
            {
                if (count >= 64) Overflow = true;
                else notices.Enqueue(new HostClipboardNotice { Ordinal = ++count, Us = Microseconds(), Version = GetClipboardSequenceNumber() });
            }
        }
        return DefWindowProcW(hwnd, message, wParam, lParam);
    }
    // window只能屬於本次thread；正常退出時解除所有notification資源。
    private void Listen()
    {
        string name = "RdWebHostObserver_" + Guid.NewGuid().ToString("N");
        IntPtr instance = GetModuleHandleW(null);
        threadId = GetCurrentThreadId();
        bool registered=false, listening=false;
        try
        {
            WndClass cls = new WndClass { Procedure = Marshal.GetFunctionPointerForDelegate(callback), Instance = instance, Name = name };
            if (RegisterClassW(ref cls) == 0) return;
            registered=true;
            window = CreateWindowExW(0, name, "", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, instance, IntPtr.Zero);
            Ready = window != IntPtr.Zero && AddClipboardFormatListener(window);
            listening=Ready;
            initialized.Set();
            if (!Ready) return;
            Message message;
            int received;
            while ((received=GetMessageW(out message, IntPtr.Zero, 0, 0)) > 0) DispatchMessageW(ref message);
            if (received < 0) clipboardClosed=false;
        }
        finally
        {
            listenerClosed=!listening || RemoveClipboardFormatListener(window);
            windowClosed=window == IntPtr.Zero || DestroyWindow(window);
            classClosed=!registered || UnregisterClassW(name, instance);
            Ready = false;
            initialized.Set();
        }
    }
    // 一次最多64個metadata，版本只在child RAM使用。
    public HostClipboardNotice[] Drain() { lock (notices) { HostClipboardNotice[] value = notices.ToArray(); notices.Clear(); return value; } }
    // 只停止自身thread；失敗由parent watchdog清自身child，不動其他程序。
    public bool Stop()
    {
        bool signaled=!thread.IsAlive || (threadId != 0 && PostThreadMessageW(threadId,0x0012,UIntPtr.Zero,IntPtr.Zero));
        bool joined=thread.Join(500);
        if (joined && !signalDisposed) { initialized.Dispose(); signalDisposed=true; }
        return signaled && joined && CleanupSuccessful(listenerClosed,windowClosed,classClosed,clipboardClosed);
    }
    // 比較同使用者token，不能以只有同session代替owner guard。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    public static bool SameUser(int pid)
    {
        IntPtr process = IntPtr.Zero, token = IntPtr.Zero;
        try
        {
            process = OpenProcess(0x1000, false, (uint)pid);
            if (process == IntPtr.Zero || !OpenProcessToken(process, 8, out token)) return false;
            using (WindowsIdentity identity = new WindowsIdentity(token))
            using (WindowsIdentity current = WindowsIdentity.GetCurrent()) return identity.User != null && identity.User.Equals(current.User);
        }
        catch { return false; }
        finally { if (token != IntPtr.Zero) CloseHandle(token); if (process != IntPtr.Zero) CloseHandle(process); }
    }
    // CF_UNICODETEXT所有策略沿已測core，只將不可執行的Win32 boundary留在native adapter。
    public HostClipboardValue ReadClipboard(uint notifiedVersion, int editorPid)
    {
        HostClipboardValue value=ObserveClipboard(new ClipboardAccess(window),notifiedVersion,editorPid);
        clipboardClosed &= value.ResourcesClosed;
        return value;
    }
    // 短命borrowed handle／pointer留RAM，沒有任何clipboard寫入能力。
    private sealed class ClipboardAccess : IHostClipboardAccess
    {
        private readonly IntPtr window;
        private IntPtr handle;
        private bool unlocked=true;
        // adapter只能借本次listener window。
        public ClipboardAccess(IntPtr window) {this.window=window;}
        // 查序號不產生notification，不輪詢。
        public uint Sequence() {return GetClipboardSequenceNumber();}
        // busy不重試、不sleep。
        public bool Open() {return OpenClipboard(window);}
        // 只接受Unicode text。
        public bool HasUnicode() {return IsClipboardFormatAvailable(13);}
        // delayed rendering可能阻塞，由parent監督整個query。
        public ulong ContainerSize() {handle=GetClipboardData(13);return handle==IntPtr.Zero ? 0 : GlobalSize(handle).ToUInt64();}
        // caller已驗65538上限；不使用無界PtrToStringUni。
        public byte[] ReadContainer(int count)
        {
            if (count<2 || count>65538) throw new InvalidDataException();
            IntPtr pointer=GlobalLock(handle);if (pointer==IntPtr.Zero) return null;
            byte[] bytes=new byte[count];
            try {Marshal.Copy(pointer,bytes,0,count);return bytes;}
            catch {Array.Clear(bytes,0,bytes.Length);throw;}
            finally {bool result=GlobalUnlock(handle);unlocked &= UnlockSuccessful(result,Marshal.GetLastWin32Error());}
        }
        // PID／HWND不離開adapter，僅比較同已驗Notepad process。
        public bool? OwnerMatches(int editorPid)
        {
            uint pid;IntPtr owner=GetClipboardOwner();
            return owner!=IntPtr.Zero && GetWindowThreadProcessId(owner,out pid)!=0 ? (bool?)(pid==(uint)editorPid) : null;
        }
        // borrowed data不能free，僅關本次OpenClipboard。
        public bool Close() {bool closed=CloseClipboard();return unlocked && closed;}
    }
    // parent讀frame先限制8192，逾時不等原生query；未完成read由kill／close自有pipe解除。
    public static string ReadFrame(Stream stream, int milliseconds)
    {
        Stopwatch clock = Stopwatch.StartNew();
        byte[] bytes = new byte[8192], one = new byte[1];
        int count = 0;
        try
        {
            while (count < bytes.Length)
            {
                int left = milliseconds - (int)clock.ElapsedMilliseconds;
                if (left <= 0) throw new TimeoutException();
                System.Threading.Tasks.Task<int> read = stream.ReadAsync(one, 0, 1);
                if (!read.Wait(left)) throw new TimeoutException();
                if (read.Result == 0) throw new EndOfStreamException();
                if (one[0] == 10) return new UTF8Encoding(false, true).GetString(bytes, 0, count);
                bytes[count++] = one[0];
            }
            throw new InvalidDataException();
        }
        finally { Array.Clear(bytes, 0, bytes.Length); Array.Clear(one, 0, one.Length); }
    }
}
