using System.Reflection;
using System.Runtime.InteropServices;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 只驗managed宣告，不在Linux載入Windows原生library。
internal static class SourceNativeAbiCases
{
    // 以DWORD FILETIME各兩欄手算布局，不能用錯誤ABI自算預期。
    internal static void Layout()
    {
        ProbeSourceCases.Require(Marshal.SizeOf<SourceNativeAbi.FileInformation>() == 52);
        ProbeSourceCases.Require(Marshal.OffsetOf<SourceNativeAbi.FileInformation>("Links").ToInt32() == 40);
        ProbeSourceCases.Require(Marshal.OffsetOf<SourceNativeAbi.FileInformation>("IndexHigh").ToInt32() == 44);
    }
    // API回值家族分開：GetSecurityInfo為DWORD、LocalFree為pointer、BOOL為int。
    internal static void EntryPoints()
    {
        foreach (var (name, result) in new (string, Type)[] {
            ("GetSecurityInfo", typeof(uint)), ("LocalFree", typeof(nint)), ("CreateFileW", typeof(nint)),
            ("GetFileInformationByHandle", typeof(int)), ("DuplicateToken", typeof(int)),
            ("CheckTokenMembership", typeof(int)), ("CloseHandle", typeof(int)), ("ReadFile", typeof(int)) })
        {
            var method = typeof(SourceNativeAbi).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Static);
            ProbeSourceCases.Require(method?.ReturnType == result);
            var import = method!.GetCustomAttribute<DllImportAttribute>();
            ProbeSourceCases.Require(import is not null && import.ExactSpelling);
            ProbeSourceCases.Require(method!.GetParameters().All(parameter => parameter.ParameterType != typeof(bool)));
        }
    }
    // 必須先判平台，不接受DllNotFoundException當作早拒絕。
    internal static void PlatformRefusal()
    {
        if (OperatingSystem.IsWindows()) return;
        var refused = false;
        try { _ = new WindowsSourceApi(); }
        catch (PlatformNotSupportedException error) { refused = error.Message == "native_supervisor_platform_unavailable"; }
        ProbeSourceCases.Require(refused);
    }
}
