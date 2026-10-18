using System;
using System.IO;
using System.Threading;

// 只替OS port；真producer／classifier與recorder承擔全部受測行為。
internal static class ReadRaceDiagnosticTests
{
    private static string stage;
    private sealed class Port : IHostReadRaceClipboardPort
    {
        public uint Version = 7;
        public bool Advance = true, Throws;
        public string Failure = "";
        public Action OnSequence;
        public int Prepares, Opens, Empties, Sets, Formats, Closes, Sequences, Renders, Releases;
        // 固定OS故障邊界，不生成受測證據。
        private bool Step(string name) { if (Failure != name) return true; if (Throws) throw new IOException(); return false; }
        // 只記Prepare副作用。
        public bool PrepareDelayedOwner() { Prepares++; return Step("prepare"); }
        // 每次Open皆可查核。
        public bool Open() { Opens++; return Step("open"); }
        // 清除次數由真producer決定。
        public bool Empty() { Empties++; return Step("empty"); }
        // 模擬NULL延遲註冊。
        public bool RegisterDelayed() { Sets++; return Step("set"); }
        // 模擬格式後驗。
        public bool FormatAvailable() { Formats++; return Step("format"); }
        // 每個成功Open恰一次Close。
        public bool Close() { Closes++; return Step("close"); }
        // owner僅提供布林。
        public bool OwnsClipboard() { return Step("owner"); }
        // 可在真Evidence查詢內注入callback重入，不增加另一輪查詢。
        public uint Sequence() { Sequences++; if (OnSequence != null) OnSequence(); return Step("sequence") ? Version : 0; }
        // 唯一固定交付可選擇是否改變版本。
        public bool RenderFixedPayload() { Renders++; bool ok = Step("render"); if (ok && Advance) Version = 8; return ok; }
        // 只模擬自有資源收尾。
        public bool Release() { Releases++; return Step("release"); }
    }
    private sealed class Rig
    {
        public readonly Port Port = new Port();
        public readonly HostReadRaceDiagnosticTrace Trace;
        public readonly HostClipboardReadRaceProducer Producer;
        public readonly HostReadRaceRegistration Registration;
        public HostReadRaceRenderEvidence Evidence;
        // 每個測試建立全新once gate及固定baseline。
        public Rig()
        {
            Trace = new HostReadRaceDiagnosticTrace(Thread.CurrentThread.ManagedThreadId);
            Producer = new HostClipboardReadRaceProducer(new HostReadRaceDiagnosticPort(Port, Trace));
            Assert(Producer.Prepare());
            Assert(Trace.SetPhase(HostReadRaceDiagnosticPhase.Registration));
            Trace.BeginContext(HostReadRaceDiagnosticContext.Registration);
            try { Registration = Producer.Register(); } finally { Trace.EndContext(); }
            Assert(Trace.SetPhase(HostReadRaceDiagnosticPhase.BeforeReader));
        }
        // 模擬caller bracket內的系統callback，不觸Windows。
        public void Render() { Trace.RecordRenderCallback(); Producer.Render(); }
        // 原Evidence只呼一次，sample仍在同context內封存。
        public HostReadRaceDiagnosticSnapshot Capture()
        {
            Trace.BeginContext(HostReadRaceDiagnosticContext.Evidence);
            try { Evidence = Producer.RenderEvidence(); return Trace.SealSample(Registration, Evidence); }
            finally { Trace.EndContext(); }
        }
        // 模擬正常自有資源收尾，不補查版本。
        public HostReadRaceDiagnosticFinal Close()
        {
            Assert(Trace.SetPhase(HostReadRaceDiagnosticPhase.Closing));
            return Trace.SealFinal(Producer.Stop());
        }
    }
    // 缺少任一分項紀錄或將Text當作渲染證據都會失敗。
    private static void KnownRenderKeepsIndependentProofs()
    {
        Rig r = new Rig(); Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket)); r.Render();
        Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
        HostReadRaceDiagnosticSnapshot s = r.Capture();
        Assert(s.RenderSeen == "yes" && s.RequestExactlyOnce == "yes" && s.DeliveryStatus == "succeeded");
        Assert(s.SequenceStatus == "changed" && s.FailureObserved == "no" && s.FirstRenderPhase == "reader_bracket");
        Assert(s.MultipleRenderPhases == "no" && s.TraceValid && s.EvidenceConsistent && s.ReaderCode == "unknown");
        HostReadRaceDiagnosticSnapshot code = s.WithReaderCode("host_observed");
        Assert(code.ReaderCode == "host_observed" && s.ReaderCode == "unknown" && code.WithReaderCode("Public unknown").ReaderCode == "unknown");
        HostClipboardValue reader = new HostClipboardValue { Code = "host_clipboard_unstable", Version = 7, Stable = false, OwnerMatches = false, Text = null, ResourcesClosed = true };
        Assert(HostClipboardReadRaceCalibration.Classify(r.Registration, r.Evidence, reader, true, true, false).ReaderRejected);
        HostReadRaceDiagnosticCapture copy = new HostReadRaceDiagnosticCapture(r.Evidence, s); r.Evidence.Requests = 9;
        Assert(copy.Evidence.Requests == 1 && new HostReadRaceDiagnosticCapture(null, s).Evidence == null);
        Assert(r.Close().TraceFinalized);
    }
    // 零筆與多筆不能都縮成未交付；phase分類必須保留。
    private static void NoRenderIsNotFailedDelivery()
    {
        Rig zero = new Rig(); Assert(zero.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
        HostReadRaceDiagnosticSnapshot s = zero.Capture();
        Assert(s.RenderSeen == "no" && s.RequestExactlyOnce == "no" && s.DeliveryStatus == "not_attempted");
        Assert(s.FirstRenderPhase == "none" && s.MultipleRenderPhases == "no" && s.SequenceStatus == "unchanged"); zero.Close();
        foreach (bool cross in new[] { false, true })
        {
            Rig r = new Rig();
            if (!cross) Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket));
            r.Render();
            if (cross) Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket));
            if (cross) Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
            r.Render(); if (!cross) Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
            s = r.Capture(); Assert(s.RenderSeen == "yes" && s.RequestExactlyOnce == "no");
            Assert(s.MultipleRenderPhases == (cross ? "yes" : "no"));
            Assert(r.Port.Renders == 1); r.Close();
        }
    }
    // 成功交付後的版本故障不可被預設False偽裝成unchanged。
    private static void DeliverySuccessThenSequenceFailureStaysPartial()
    {
        foreach (bool throws in new[] { false, true })
        {
            Rig r = new Rig(); r.Render(); r.Port.Failure = "sequence"; r.Port.Throws = throws;
            Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
            HostReadRaceDiagnosticSnapshot s = r.Capture();
            Assert(s.DeliveryStatus == "succeeded" && s.SequenceStatus == "unknown");
            Assert(s.FailureObserved == (throws ? "yes" : "no")); r.Close();
        }
        Rig missing = new Rig(); Assert(missing.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
        missing.Trace.BeginContext(HostReadRaceDiagnosticContext.Evidence);
        HostReadRaceDiagnosticSnapshot absent = missing.Trace.SealSample(missing.Registration, new HostReadRaceRenderEvidence());
        Assert(absent.SequenceStatus == "unknown"); missing.Trace.EndContext(); missing.Close();
        Rig wrong = new Rig(); wrong.Trace.RecordSequence(true, 7);
        Assert(wrong.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader)); Assert(!wrong.Capture().TraceValid); wrong.Close();
    }
    // 不合法phase或錯thread只能使證據失效，不能污染合法phase或晚恢復。
    private static void PhaseAndThreadFailuresStaySticky()
    {
        Rig r = new Rig();
        Thread other = new Thread(() => { Assert(!r.Trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket)); r.Trace.RecordRenderCallback(); });
        other.Start(); other.Join();
        Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader)); Assert(!r.Capture().TraceValid); r.Close();
        Rig back = new Rig(); Assert(!back.Trace.SetPhase(HostReadRaceDiagnosticPhase.Registration));
        Assert(back.Trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket)); Assert(back.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
        Assert(!back.Trace.SetPhase(HostReadRaceDiagnosticPhase.ReaderBracket)); Assert(!back.Capture().TraceValid); back.Close();
        HostReadRaceDiagnosticTrace early = new HostReadRaceDiagnosticTrace(Thread.CurrentThread.ManagedThreadId);
        early.RecordRenderCallback(); Assert(early.SetPhase(HostReadRaceDiagnosticPhase.Registration));
        Assert(!early.SealFinal(true).TraceValid);
        Rig repeated = new Rig(); Assert(repeated.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader)); repeated.Capture();
        Assert(!repeated.Capture().TraceValid); repeated.Close();
    }
    // Requests快照之後發生callback，原DTO仍保留但診斷不可宣稱一致。
    private static void EvidenceReentryNeverRecovers()
    {
        Rig r = new Rig(); Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
        r.Port.OnSequence = r.Render;
        HostReadRaceDiagnosticSnapshot s = r.Capture();
        Assert(!s.EvidenceConsistent && s.RequestExactlyOnce == "unknown" && r.Port.Sequences == 2);
        Assert(r.Evidence.Requests == 0 && r.Port.Renders == 1); r.Close();
    }
    // Trace失效後不能輸出succeeded配unknown renderSeen的矛盾安全frame。
    private static void InvalidTraceDoesNotExportContradictoryDelivery()
    {
        Rig r = new Rig(); r.Render(); r.Trace.Invalidate();
        Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader));
        HostReadRaceDiagnosticSnapshot s = r.Capture();
        Assert(!s.TraceValid && s.RenderSeen == "unknown" && s.DeliveryStatus == "unknown");
        r.Close();
    }
    // 晚事件必須sticky，即使計數已飽和或原sample沒有事件。
    private static void LateRenderSurvivesSaturation()
    {
        foreach (int count in new[] { 0, 1, 20 })
        {
            Rig r = new Rig(); for (int i = 0; i < count; i++) r.Render();
            Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader)); HostReadRaceDiagnosticSnapshot s = r.Capture();
            Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.Closing)); r.Render();
            HostReadRaceDiagnosticFinal f = r.Trace.SealFinal(r.Producer.Stop());
            Assert(f.TraceFinalized && f.LateRender && f.FirstRenderPhase == (count == 0 ? "closing" : "before_reader"));
            Assert(s.FirstRenderPhase == (count == 0 ? "none" : "before_reader"));
            Assert(!r.Trace.SealFinal(true).TraceFinalized);
        }
        Rig failed = new Rig(); Assert(failed.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader)); failed.Capture();
        Assert(!failed.Trace.SealFinal(false).TraceFinalized && !failed.Trace.SealFinal(true).TraceFinalized); failed.Producer.Stop();
    }
    // 真producer決定API次數，decorator不能添加探測或吞掉故障。
    private static void DecoratorAddsNoCallsAndPreservesLegacy()
    {
        foreach (bool render in new[] { false, true })
        {
            Rig r = new Rig(); if (render) r.Render(); Assert(r.Trace.SetPhase(HostReadRaceDiagnosticPhase.AfterReader)); r.Capture(); r.Close();
            Assert(r.Port.Opens == 1 && r.Port.Empties == 1 && r.Port.Sets == 1 && r.Port.Closes == 1);
            Assert(r.Port.Sequences == 2 && r.Port.Renders == (render ? 1 : 0) && r.Port.Releases == 1);
        }
        foreach (string failure in new[] { "open", "empty", "set", "format", "close", "owner", "sequence", "render", "release" })
        foreach (bool throws in new[] { false, true })
        {
            Port p = new Port { Failure = failure, Throws = throws };
            HostReadRaceDiagnosticTrace t = new HostReadRaceDiagnosticTrace(Thread.CurrentThread.ManagedThreadId);
            HostClipboardReadRaceProducer producer = new HostClipboardReadRaceProducer(new HostReadRaceDiagnosticPort(p, t));
            Assert(producer.Prepare()); t.SetPhase(HostReadRaceDiagnosticPhase.Registration); t.BeginContext(HostReadRaceDiagnosticContext.Registration);
            HostReadRaceRegistration registration = producer.Register(); t.EndContext(); t.SetPhase(HostReadRaceDiagnosticPhase.BeforeReader);
            if (registration.Code == "host_observed") { t.RecordRenderCallback(); producer.Render(); }
            t.SetPhase(HostReadRaceDiagnosticPhase.AfterReader); t.BeginContext(HostReadRaceDiagnosticContext.Evidence);
            HostReadRaceRenderEvidence evidence = producer.RenderEvidence(); t.SealSample(registration, evidence); t.EndContext();
            bool stopped = producer.Stop(); Assert(producer.Stop() == stopped && p.Releases == 1 && p.Opens == 1);
            Assert(p.Closes == (failure == "open" ? 0 : 1) && p.Renders <= 1 && p.Sequences <= 2);
        }
    }
    // 失敗只報固定測試階段，不輸出原始資料或exception。
    private static void Assert(bool condition) { if (!condition) throw new InvalidOperationException(); }
    // 非Windows必須在任何native或thread之前拒絕；Windows不呼factory。
    private static void NonWindowsDiagnosticFactoryRejectsBeforeNative()
    {
        if (OperatingSystem.IsWindows()) { Console.WriteLine("read_race_diagnostic_native_factory_guard_not_run,windowsNative=false"); return; }
        bool rejected = false;
        try { HostReadRaceDiagnosticWindows.StartWindows(); } catch (PlatformNotSupportedException) { rejected = true; }
        Assert(rejected);
    }
    // 只保存需另授權的Windows oracle定義；Main與CI永不呼叫，scope仍由外層授權driver確認。
    private static bool WindowsDiagnosticOracleNotInvoked(bool diagnostic, bool allowOverwrite, int editorPid)
    {
        if (!diagnostic || !allowOverwrite || !OperatingSystem.IsWindows()) return false;
        HostReadRaceDiagnosticWindows fixture = HostReadRaceDiagnosticWindows.StartWindows();
        HostObserverNative native = null; HostClipboardValue value = null;
        try
        {
            native = new HostObserverNative(); if (!fixture.Ready || !native.Ready) return false;
            HostReadRaceRegistration registration = fixture.Register();
            if (registration.Code != "host_observed" || !fixture.OwnsClipboard() || !fixture.BeginReader()) return false;
            try { value = native.ReadClipboard(registration.RegistrationVersion, editorPid); }
            finally { fixture.EndReader(); }
            HostReadRaceDiagnosticCapture capture = fixture.CaptureSample();
            bool fixtureClosed = fixture.Stop(), nativeClosed = native.Stop();
            HostReadRaceDiagnosticFinal final = fixture.GetFinalTrace();
            return capture.Diagnostic.TraceValid && capture.Diagnostic.EvidenceConsistent && fixtureClosed && nativeClosed && final.TraceFinalized && !final.LateRender;
        }
        finally { if (value != null) value.Text = null; fixture.Stop(); if (native != null) native.Stop(); }
    }
    // 全部Main路徑皆pure，不引用原生oracle。
    private static int Main()
    {
        try
        {
            stage = "known"; KnownRenderKeepsIndependentProofs(); stage = "none"; NoRenderIsNotFailedDelivery();
            stage = "sequence"; DeliverySuccessThenSequenceFailureStaysPartial(); stage = "thread"; PhaseAndThreadFailuresStaySticky();
            stage = "reentry"; EvidenceReentryNeverRecovers(); stage = "late"; LateRenderSurvivesSaturation();
            stage = "invalid_projection"; InvalidTraceDoesNotExportContradictoryDelivery();
            stage = "calls"; DecoratorAddsNoCallsAndPreservesLegacy();
            stage = "factory"; NonWindowsDiagnosticFactoryRejectsBeforeNative();
            Console.WriteLine("clipboard_read_race_diagnostic_core_observed,windowsNative=false"); return 0;
        }
        catch { Console.WriteLine("clipboard_read_race_diagnostic_core_unavailable,stage=" + stage); return 1; }
    }
}
