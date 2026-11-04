using System.Runtime.InteropServices;
using System.Text;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// Windows x64的blittable布局；原生BOOL一律int，不使用平台相依的managed bool。
internal static class NativeAbi
{
    [StructLayout(LayoutKind.Sequential)]
    internal struct SecurityAttributes
    {
        internal uint Length;
        internal nint Descriptor;
        internal int Inherit;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct StartupInfo
    {
        internal uint Cb;
        internal nint Reserved, Desktop, Title;
        internal uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        internal ushort ShowWindow, Reserved2Size;
        internal nint Reserved2, Stdin, Stdout, Stderr;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct StartupInfoEx
    {
        internal StartupInfo Startup;
        internal nint Attributes;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct ProcessInformation
    {
        internal nint Process, Thread;
        internal uint ProcessId, ThreadId;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct Overlapped
    {
        internal nuint Internal, InternalHigh;
        internal uint Offset, OffsetHigh;
        internal nint Event;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct BasicLimit
    {
        internal long ProcessTime, JobTime;
        internal uint Flags;
        internal nuint MinimumWorkingSet, MaximumWorkingSet;
        internal uint ActiveProcessLimit;
        internal nuint Affinity;
        internal uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct IoCounters
    {
        internal ulong ReadOperations, WriteOperations, OtherOperations;
        internal ulong ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct ExtendedLimit
    {
        internal BasicLimit Basic;
        internal IoCounters Io;
        internal nuint ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct Accounting
    {
        internal long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        internal uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }

    // 明確W入口與可寫命令buffer，BOOL參數採32-bit。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int CreateProcessW(string application, StringBuilder command, nint processSecurity, nint threadSecurity,
        int inherit, uint flags, nint environment, string directory, ref StartupInfoEx startup, out ProcessInformation process);
    // 不命名job，security=NULL保持不可繼承。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern nint CreateJobObjectW(nint security, string? name);
    // 使用完整extended-limit布局，不將SIZE_T截成DWORD。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int SetInformationJobObject(nint job, int informationClass, ref ExtendedLimit limit, uint length);
    // 指定本輪非NULL job，不查caller job。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int QueryInformationJobObject(nint job, int informationClass, out Accounting accounting, uint length, out uint returned);
    // 指派成功與後續回驗成功是兩個獨立事實。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int AssignProcessToJobObject(nint job, nint process);
    // API成功及out BOOL均須確認，不能只讀out。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int IsProcessInJob(nint process, nint job, out int result);
    // 返回原suspend count，不是BOOL。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern uint ResumeThread(nint thread);
    // 只使用直接持有的process handle查詢。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetExitCodeProcess(nint process, out uint code);
    // session僅以零timeout輪詢，不在API內另開等待預算。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern uint WaitForSingleObject(nint handle, uint milliseconds);
    // 指派前的owned suspended process取消。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int TerminateProcess(nint process, uint code);
    // 指派後的owned job取消，不掃PID。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int TerminateJobObject(nint job, uint code);
    // 無name及不可繼承的manual-reset event。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern nint CreateEventW(nint security, int manualReset, int initialState, string? name);
    // 使用顯式安全描述元，不依預設DACL。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern nint CreateNamedPipeW(string name, uint openMode, uint pipeMode, uint instances,
        uint outputBuffer, uint inputBuffer, uint defaultTimeout, ref SecurityAttributes security);
    // parent自行開同步可繼承write端，沒有外部pipe名稱參數。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern nint CreateFileW(string name, uint access, uint sharing, ref SecurityAttributes security,
        uint disposition, uint flags, nint template);
    // OVERLAPPED由owner以穩定配置傳入，不能傳stack上暫存ref。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int ConnectNamedPipe(nint pipe, nint overlapped);
    // 固定buffer與容量，原生只能寫入本次指定範圍。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int ReadFile(nint pipe, nint buffer, uint count, out uint read, nint overlapped);
    // bWait=0避免在完成查詢中另加阻塞預算。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetOverlappedResult(nint pipe, nint overlapped, out uint transferred, int wait);
    // 取消指定操作而非整條程序／thread，回值不證完成。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int CancelIoEx(nint pipe, nint overlapped);
    // stdin為匿名pipe，寫端由parent立即關閉。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int CreatePipe(out nint read, out nint write, ref SecurityAttributes security, uint size);
    // 明確關閉並保留錯誤回值，不能靠IsClosed補證據。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int CloseHandle(nint handle);
    // 第一次以NULL查容量，第二次建立attribute-list。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int InitializeProcThreadAttributeList(nint list, uint count, uint flags, ref nuint size);
    // handle allowlist的資料在CreateProcess返回前保持存活。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int UpdateProcThreadAttribute(nint list, uint flags, nuint attribute, nint value,
        nuint size, nint previous, nint returned);
    // 刪除初始化完成的attribute-list後才能free其記憶體。
    [DllImport("kernel32.dll", ExactSpelling = true)]
    internal static extern void DeleteProcThreadAttributeList(nint list);
    // current process僅為pseudo-handle，不可加入owned Close集合。
    [DllImport("kernel32.dll", ExactSpelling = true)]
    internal static extern nint GetCurrentProcess();
    // 僅以TOKEN_QUERY取得目前身份，不能開外部process。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int OpenProcessToken(nint process, uint access, out nint token);
    // TokenUser資料使用呼叫端有界配置，內含SID pointer只在配置存活時讀。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetTokenInformation(nint token, int informationClass, nint information, uint length, out uint needed);
    // SID字串只在本組件組DACL，不回傳診斷。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int ConvertSidToStringSidW(nint sid, out nint text);
    // LocalAlloc描述元由LocalFree對稱釋放，不能Marshal.FreeHGlobal。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int ConvertStringSecurityDescriptorToSecurityDescriptorW(string text, uint revision, out nint descriptor, out uint size);
    // 成功返回NULL，失敗返回未釋放的原pointer。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern nint LocalFree(nint memory);
}
