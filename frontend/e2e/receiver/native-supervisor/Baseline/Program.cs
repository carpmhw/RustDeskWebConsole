using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeBaseline.Windows;

// 基線只有固定參數及既有host，不提供任意來源或命令模式。
internal static class Program
{
    // 與舊入口使用同一driver／clock／原生owner，只選固定baseline來源。
    private static int Main(string[] args) => ProbeConsole.ExecuteBaseline(args, new ProbeConsoleHost());
}
