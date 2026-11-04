using System.Reflection;
using System.Runtime.InteropServices;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 依官方Windows header的x64自然對齊手算oracle；Linux只驗managed宣告。
internal static class NativeAbiCases
{
    // 錯誤pointer或BOOL寬度會移動標準handle及attribute-list位置。
    internal static void StartupLayout()
    {
        Require(IntPtr.Size == 8);
        Require(Marshal.SizeOf<NativeAbi.SecurityAttributes>() == 24);
        Require(Marshal.SizeOf<NativeAbi.StartupInfo>() == 104);
        Require(Marshal.SizeOf<NativeAbi.StartupInfoEx>() == 112);
        Require(Marshal.SizeOf<NativeAbi.ProcessInformation>() == 24);
    }

    // OVERLAPPED不可因ULONG_PTR誤宣告成DWORD而縮小，job則需完整尾部。
    internal static void JobIoLayout()
    {
        Require(Marshal.SizeOf<NativeAbi.Overlapped>() == 32);
        Require(Marshal.SizeOf<NativeAbi.BasicLimit>() == 64);
        Require(Marshal.SizeOf<NativeAbi.IoCounters>() == 48);
        Require(Marshal.SizeOf<NativeAbi.ExtendedLimit>() == 144);
        Require(Marshal.SizeOf<NativeAbi.Accounting>() == 48);
    }

    // 宣告不能退成ANSI或managed bool；僅反射metadata，不載入kernel32。
    internal static void EntryPoints()
    {
        foreach (var name in new[] { "CreateProcessW", "AssignProcessToJobObject", "IsProcessInJob", "ReadFile", "GetOverlappedResult", "CancelIoEx", "CloseHandle" })
        {
            var method = typeof(NativeAbi).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Static);
            Require(method is not null && method.ReturnType == typeof(int));
            var import = method!.GetCustomAttribute<DllImportAttribute>();
            Require(import is not null && import.ExactSpelling && import.SetLastError);
        }
        var create = typeof(NativeAbi).GetMethod("CreateProcessW", BindingFlags.NonPublic | BindingFlags.Static)!;
        Require(create.GetCustomAttribute<DllImportAttribute>()!.CharSet == CharSet.Unicode);
        Require(create.GetParameters()[4].ParameterType == typeof(int));
        Require(Marshal.OffsetOf<NativeAbi.StartupInfo>(nameof(NativeAbi.StartupInfo.Stdin)).ToInt32() == 80);
        Require(Marshal.OffsetOf<NativeAbi.StartupInfoEx>(nameof(NativeAbi.StartupInfoEx.Attributes)).ToInt32() == 104);
        Require(Marshal.OffsetOf<NativeAbi.Accounting>(nameof(NativeAbi.Accounting.ActiveProcesses)).ToInt32() == 40);
        Require(Marshal.OffsetOf<NativeAbi.Overlapped>(nameof(NativeAbi.Overlapped.Event)).ToInt32() == 24);
    }

    // Linux入口必先拒絕平台，不能靠DllNotFoundException掩蓋真的嘗試呼叫。
    internal static void PlatformRefusal()
    {
        if (OperatingSystem.IsWindows()) return;
        var rejected = false;
        try { _ = new WindowsNativeApi(); }
        catch (PlatformNotSupportedException error) { rejected = error.Message == "native_supervisor_platform_unavailable"; }
        Require(rejected);
    }

    // 固定安全斷言，避免測試runner輸出動態反射資料。
    private static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException("native_abi_assertion_failed");
    }
}
