using System.Runtime.InteropServices;
using System.Text;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 原生邊界建構拒絕必須在任何kernel32載入之前。
internal sealed class WindowsNativeApi : IProbeNativeApi
{
    private readonly OwnedNativeResources _auxiliaryHandles;
    private readonly List<nint> _temporaryMemory = [];
    private readonly List<nint> _attributeLists = [];
    private readonly Dictionary<nint, bool?> _localMemory = [];
    private bool _auxiliaryClosed, _auxiliaryResult;

    // 唯一平台邊界；拒絕發生在第一次P/Invoke前，沒有DllNotFound降級。
    internal WindowsNativeApi()
    {
        if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
            throw new PlatformNotSupportedException("native_supervisor_platform_unavailable");
        _auxiliaryHandles = new(this);
    }

    public bool Supported => true;

    // 只讀目前token的SID，所有中間配置及handle均移交adapter自己的owner。
    public nint CreateDescriptor()
    {
        if (NativeAbi.OpenProcessToken(NativeAbi.GetCurrentProcess(), 8, out var token) == 0) return 0;
        _auxiliaryHandles.Own(token);
        NativeAbi.GetTokenInformation(token, 1, 0, 0, out var length);
        if (length < 8 || length > int.MaxValue) return 0;
        var information = Temporary((int)length);
        if (NativeAbi.GetTokenInformation(token, 1, information, length, out _) == 0) return 0;
        if (NativeAbi.ConvertSidToStringSidW(Marshal.ReadIntPtr(information), out var sidText) == 0) return 0;
        _localMemory.Add(sidText, null);
        var sid = Marshal.PtrToStringUni(sidText);
        if (sid is null) return 0;
        if (NativeAbi.ConvertStringSecurityDescriptorToSecurityDescriptorW("D:P(A;;GA;;;" + sid + ")", 1, out var descriptor, out _) == 0) return 0;
        _localMemory.Add(descriptor, null);
        return descriptor;
    }

    // LocalFree失敗不重試、不把pointer視為已釋放。
    public bool FreeDescriptor(nint descriptor) => FreeLocal(descriptor);

    // 配置先清零，OVERLAPPED未使用欄位必為零；其生命週期由caller owner負責。
    public nint Allocate(int size)
    {
        var memory = Marshal.AllocHGlobal(size);
        Marshal.Copy(new byte[size], 0, memory, size);
        return memory;
    }

    // 呼叫者只在確認沒有pending引用後使用。
    public void Free(nint memory) => Marshal.FreeHGlobal(memory);

    // 不命名、不繼承job，不加入caller。
    public nint CreateJob() => NativeAbi.CreateJobObjectW(0, null);

    // 唯一limit是KILL_ON_JOB_CLOSE，不開breakaway或其他限制。
    public bool LimitJob(nint job)
    {
        var limit = new NativeAbi.ExtendedLimit { Basic = new NativeAbi.BasicLimit { Flags = 0x2000 } };
        return NativeAbi.SetInformationJobObject(job, 9, ref limit, 144) != 0;
    }

    // 各路獨立manual-reset event，無可繼承security。
    public nint CreateEvent() => NativeAbi.CreateEventW(0, 1, 0, null);

    // 單向byte-mode、單instance、first-instance、拒絕遠端，明確SID-only DACL。
    public nint CreatePipeServer(string name, nint descriptor)
    {
        var security = new NativeAbi.SecurityAttributes { Length = 24, Descriptor = descriptor };
        return NativeAbi.CreateNamedPipeW(name, 0x40080001, 8, 1, 0, 8192, 0, ref security);
    }

    // 已存在pipe的本地同步write端，只有此handle可由child繼承。
    public nint OpenPipeWriter(string name)
    {
        var security = new NativeAbi.SecurityAttributes { Length = 24, Inherit = 1 };
        return NativeAbi.CreateFileW(name, 0x40000000, 0, ref security, 3, 0, 0);
    }

    // ERROR_PIPE_CONNECTED是client先完成連接，不是pending或錯誤。
    public IoResult Connect(nint pipe, nint overlapped)
    {
        if (NativeAbi.ConnectNamedPipe(pipe, overlapped) != 0) return new(IoState.Complete);
        var error = Marshal.GetLastPInvokeError();
        return error == 535 ? new(IoState.Complete) : IoFailure(error);
    }

    // 同步完成也只回本次byte數，不假造EOF。
    public IoResult Read(nint pipe, nint buffer, uint capacity, nint overlapped)
    {
        if (NativeAbi.ReadFile(pipe, buffer, capacity, out var read, overlapped) != 0) return new(IoState.Complete, read);
        return IoFailure(Marshal.GetLastPInvokeError());
    }

    // GetOverlappedResult(bWait=FALSE)為唯一完成確認，不信CancelIoEx返回。
    public IoResult Complete(nint pipe, nint overlapped)
    {
        if (NativeAbi.GetOverlappedResult(pipe, overlapped, out var transferred, 0) != 0) return new(IoState.Complete, transferred);
        return IoFailure(Marshal.GetLastPInvokeError());
    }

    // NOT_FOUND可能是完成競合，不提供任何EOF或資源完成證據。
    public bool Cancel(nint pipe, nint overlapped) => NativeAbi.CancelIoEx(pipe, overlapped) != 0 || Marshal.GetLastPInvokeError() == 1168;

    // API失敗out值不交owner；成功後parent立即關write端使child stdin為EOF。
    public bool CreateStdin(out nint read, out nint write)
    {
        var security = new NativeAbi.SecurityAttributes { Length = 24, Inherit = 1 };
        var success = NativeAbi.CreatePipe(out read, out write, ref security, 0) != 0;
        if (!success) { read = 0; write = 0; }
        return success;
    }

    // 僅接來源guard將來提供的內部固定計畫，本層只驗Win32必要字串形狀與長度。
    public ProcessResult CreateSuspended(ProbeLaunchPlan plan, nint stdin, nint stdout, nint stderr)
    {
        if (plan.CommandLine.Length >= 32767 || plan.CommandLine.Contains('\0') ||
            plan.Application.Contains('\0') || plan.Directory.Contains('\0') ||
            !plan.Environment.EndsWith("\0\0", StringComparison.Ordinal)) return new(false, 0, 0);
        nuint size = 0;
        NativeAbi.InitializeProcThreadAttributeList(0, 1, 0, ref size);
        if (size == 0 || size > int.MaxValue) return new(false, 0, 0);
        var attributes = Temporary((int)size);
        if (NativeAbi.InitializeProcThreadAttributeList(attributes, 1, 0, ref size) == 0) return new(false, 0, 0);
        _attributeLists.Add(attributes);
        var handles = Temporary(24);
        Marshal.WriteIntPtr(handles, 0, stdin);
        Marshal.WriteIntPtr(handles, 8, stdout);
        Marshal.WriteIntPtr(handles, 16, stderr);
        if (NativeAbi.UpdateProcThreadAttribute(attributes, 0, 0x20002, handles, 24, 0, 0) == 0) return new(false, 0, 0);
        var environmentBytes = Encoding.Unicode.GetBytes(plan.Environment);
        var environment = Temporary(environmentBytes.Length);
        Marshal.Copy(environmentBytes, 0, environment, environmentBytes.Length);
        var startup = new NativeAbi.StartupInfoEx
        {
            Startup = new NativeAbi.StartupInfo { Cb = 112, Flags = 0x100, Stdin = stdin, Stdout = stdout, Stderr = stderr },
            Attributes = attributes
        };
        var success = NativeAbi.CreateProcessW(plan.Application, new StringBuilder(plan.CommandLine), 0, 0, 1,
            0x00080404, environment, plan.Directory, ref startup, out var process) != 0;
        return success ? new(true, process.Process, process.Thread) : new(false, 0, 0);
    }

    // API成功立即取得physical job ownership，獨立於回驗。
    public bool Assign(nint job, nint process) => NativeAbi.AssignProcessToJobObject(job, process) != 0;

    // 指定非NULL job，API失敗或membership false都不放行resume。
    public bool Belongs(nint job, nint process) => job != 0 && NativeAbi.IsProcessInJob(process, job, out var result) != 0 && result != 0;

    // 僅回原始suspend count交session判定一次resume。
    public uint Resume(nint thread) => NativeAbi.ResumeThread(thread);

    // 未signal不讀exit碼，避免把STILL_ACTIVE與正常退出混淆。
    public ProcessObservation ObserveProcess(nint process)
    {
        var wait = NativeAbi.WaitForSingleObject(process, 0);
        if (wait == 258) return new(true, false, 0);
        if (wait != 0 || NativeAbi.GetExitCodeProcess(process, out var code) == 0) return new(false, false, 0);
        return new(true, true, code);
    }

    // NULL永遠拒絕，不默查呼叫者job；完整大小及返回長度均須符合。
    public bool QueryActive(nint job, out uint active)
    {
        active = 0;
        if (job == 0 || NativeAbi.QueryInformationJobObject(job, 1, out var accounting, 48, out var returned) == 0 || returned != 48) return false;
        active = accounting.ActiveProcesses;
        return true;
    }

    // 不使用PID重新開程序，只取消原回傳的owned handle。
    public bool TerminateProcess(nint process) => NativeAbi.TerminateProcess(process, 2) != 0;

    // 不改外層job，不掃子孫process。
    public bool TerminateJob(nint job) => NativeAbi.TerminateJobObject(job, 2) != 0;

    // 真CloseHandle結果交owner保存，無Dispose成功捷徑。
    public bool Close(nint handle) => NativeAbi.CloseHandle(handle) != 0;

    // 同步API的暫存項無pending引用；順序先Delete attribute再free，token與LocalFree錯誤仍保留。
    public bool CloseAuxiliary()
    {
        if (_auxiliaryClosed) return _auxiliaryResult;
        _auxiliaryClosed = true;
        foreach (var attributes in _attributeLists) NativeAbi.DeleteProcThreadAttributeList(attributes);
        foreach (var memory in _temporaryMemory) Free(memory);
        var result = _auxiliaryHandles.CloseAll();
        foreach (var memory in _localMemory.Keys.ToArray()) result = FreeLocal(memory) && result;
        _auxiliaryResult = result;
        return result;
    }

    // 暫存配置即使後續API失敗也可由單一附屬owner收回。
    private nint Temporary(int size)
    {
        var memory = Allocate(size);
        _temporaryMemory.Add(memory);
        return memory;
    }

    // 只釋放本輪已記錄的LocalAlloc物件，每筆最多一次。
    private bool FreeLocal(nint memory)
    {
        if (!_localMemory.TryGetValue(memory, out var previous)) return false;
        if (previous is not null) return previous.Value;
        var result = NativeAbi.LocalFree(memory) == 0;
        _localMemory[memory] = result;
        return result;
    }

    // 固定原生分類，不輸出錯誤數值、路徑或exception。
    private static IoResult IoFailure(int error) => error switch
    {
        997 or 996 => new(IoState.Pending),
        109 => new(IoState.Eof),
        995 => new(IoState.Aborted),
        _ => new(IoState.Failed)
    };
}
