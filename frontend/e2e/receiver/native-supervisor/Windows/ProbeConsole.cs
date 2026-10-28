namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 固定入口的序列driver；來源／採信／取消／Finish仍由既有owner及唯一Core決定。
internal static class ProbeConsole
{
    // 錯參零副作用；任何缺證或handled邊界故障只安全不可用，不回顯動態資料。
    internal static int Execute(string[] args, IProbeConsoleHost host)
    {
        if (args.Length != 1 || args[0] != "--receiver-native-cases-v1") return 2;
        OwnedProbeSources? sources = null;
        OwnedProbeRun? run = null;
        var value = ProbeWire.Unknown();
        var failed = false;
        var canWait = true;
        long lastTime = 0;
        // 這是正式OS組裝邊界；typed owner內不重複catch，fatal錯誤不承諾還原或輸出。
        try
        {
            if (host.Supported)
            {
                sources = host.AcquireSources();
                var api = host.CreateNativeApi();
                if (OwnedProbeRun.TryCreate(sources, api, out run) && run!.Prepare())
                {
                    var launched = false;
                    while (!run.NeedsCleanup)
                    {
                        // 首次先詢問launch，pending時Poll連接，再於下一輪詢問；成功後不再呼。
                        if (!launched) launched = run.Launch();
                        if (run.NeedsCleanup) break;
                        run.Poll();
                        if (run.NeedsCleanup) break;
                        if (!Pause(host, 18000, ref lastTime)) { failed = true; canWait = false; break; }
                    }
                }
            }
        }
        catch (Exception error) when (error is not (OutOfMemoryException or AccessViolationException)) { failed = true; }
        try
        {
            if (run is not null)
            {
                while (!run.IsTerminal)
                {
                    run.Cleanup();
                    if (run.IsTerminal || !canWait) break;
                    if (!Pause(host, run.CleanupDeadline!.Value, ref lastTime)) { failed = true; canWait = false; }
                }
                if (run.IsTerminal && !failed) value = run.Snapshot();
            }
            // factory或移交前失敗仍收自己取得的lease；無run就不能宣告任何Core成功。
            else if (sources is not null) sources.Close(Math.Min(20000, Math.Max(0, host.ElapsedMs) + 2000));
        }
        catch (Exception error) when (error is not (OutOfMemoryException or AccessViolationException)) { failed = true; }
        try
        {
            var result = ProbeWire.FormatResult(failed ? ProbeWire.Unknown() : value);
            if (!host.WriteResult(result.Wire)) return 2;
            return result.Status switch { ProbeStatus.Observed => 0, ProbeStatus.DefectObserved => 1, _ => 2 };
        }
        catch (Exception error) when (error is not (OutOfMemoryException or AccessViolationException)) { return 2; }
    }

    // 兩階段共用有界等待；截止已到不sleep，下一輪交owner終結，停止／倒退永久停止等待。
    private static bool Pause(IProbeConsoleHost host, long deadline, ref long lastTime)
    {
        var now = host.ElapsedMs;
        if (!host.IsRunning || now < 0 || now < lastTime) return false;
        lastTime = now;
        return now >= deadline || host.Wait((int)Math.Min(10, deadline - now));
    }
}
