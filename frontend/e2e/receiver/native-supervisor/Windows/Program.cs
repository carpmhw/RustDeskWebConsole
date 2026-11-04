namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 固定診斷console；沒有任意命令、來源或案例參數。
internal static class Program
{
    // 所有入口行為與測試共用同一driver，managed clock從host建立起算。
    private static int Main(string[] args) => ProbeConsole.Execute(args, new ProbeConsoleHost());
}
