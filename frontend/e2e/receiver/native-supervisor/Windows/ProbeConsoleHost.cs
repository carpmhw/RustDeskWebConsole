using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 只有既有friend能替換OS；driver與所有owner共用此clock，不替換model／run。
internal interface IProbeConsoleHost : IProbeClock
{
    bool Supported { get; }
    // 固定來源集合只在host的OS邊界建立，正式版本不接受caller路徑或pins。
    OwnedProbeSources AcquireSources();
    // baseline只使用自己的固定wrapper pins，不從參數選來源。
    OwnedProbeSources AcquireBaselineSources();
    // 正式版本只建立現有Windows adapter。
    IProbeNativeApi CreateNativeApi();
    // 等待失敗是sticky控制流程失敗，不能當成時間已推進。
    bool Wait(int milliseconds);
    // 寫入至多一次，false不允許重送wire。
    bool WriteResult(string wire);
}

// 正式clock在入口建立即開始，平台gate不呼Win32。
internal sealed class ProbeConsoleHost : IProbeConsoleHost
{
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    public long ElapsedMs => _clock.ElapsedMilliseconds;
    public bool IsRunning => _clock.IsRunning;
    public bool Supported => OperatingSystem.IsWindows() && RuntimeInformation.ProcessArchitecture == Architecture.X64;
    // 唯一來源factory不收root／pins，guard、claim與後續run皆共用本clock。
    public OwnedProbeSources AcquireSources() => OwnedProbeSources.Acquire(new WindowsSourceApi(), this);
    // 基線固定自己的pins與EXE辨識環境，仍共用原OS邊界與clock。
    public OwnedProbeSources AcquireBaselineSources() => OwnedProbeSources.AcquireBaseline(new WindowsSourceApi(), this);
    // adapter建構仍有自身平台gate，不提供任意程序命令。
    public IProbeNativeApi CreateNativeApi() => new WindowsNativeApi();
    // 只讓出執行緒，不保證OS硬截止；失敗回false，不重試或當作已經過時間。
    public bool Wait(int milliseconds)
    {
        if (milliseconds is < 1 or > 10) return false;
        try { Thread.Sleep(milliseconds); return true; }
        catch (ThreadInterruptedException) { return false; }
    }
    // 一次寫出ASCII／LF且不加BOM；失敗不回顯例外、不補另一份wire。
    public bool WriteResult(string wire)
    {
        try
        {
            using var output = Console.OpenStandardOutput();
            output.Write(Encoding.ASCII.GetBytes(wire));
            output.Flush();
            return true;
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }
}
