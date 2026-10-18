using System;
using System.Threading;

public enum HostReadRaceDiagnosticPhase { Unknown, Registration, BeforeReader, ReaderBracket, AfterReader, Closing }
public enum HostReadRaceDiagnosticContext { None, Registration, Evidence }
// 安全immutable快照，不攜帶raw序號或文字。
public sealed class HostReadRaceDiagnosticSnapshot
{
    public readonly string RenderSeen, RequestExactlyOnce, DeliveryStatus, SequenceStatus, FailureObserved, FirstRenderPhase, MultipleRenderPhases, ReaderCode;
    public readonly bool EvidenceConsistent, TraceValid;
    // 只保存固定安全投影，不持有native資源。
    public HostReadRaceDiagnosticSnapshot(string renderSeen, string requestExactlyOnce, string deliveryStatus, string sequenceStatus, string failureObserved, string firstRenderPhase, string multipleRenderPhases, bool evidenceConsistent, bool traceValid, string readerCode)
    { RenderSeen = renderSeen; RequestExactlyOnce = requestExactlyOnce; DeliveryStatus = deliveryStatus; SequenceStatus = sequenceStatus; FailureObserved = failureObserved; FirstRenderPhase = firstRenderPhase; MultipleRenderPhases = multipleRenderPhases; EvidenceConsistent = evidenceConsistent; TraceValid = traceValid; ReaderCode = readerCode; }
    // 白名單投影回新副本，未知字串不保存在結果中。
    public HostReadRaceDiagnosticSnapshot WithReaderCode(string code)
    {
        string[] codes = { "host_observed", "host_capability_unavailable", "host_cleanup_unavailable", "host_clipboard_unstable", "host_clipboard_busy", "host_clipboard_format_unavailable", "host_text_too_large", "host_text_invalid", "host_text_unreadable" };
        string safe = Array.IndexOf(codes, code) >= 0 ? code : "unknown";
        return new HostReadRaceDiagnosticSnapshot(RenderSeen, RequestExactlyOnce, DeliveryStatus, SequenceStatus, FailureObserved, FirstRenderPhase, MultipleRenderPhases, EvidenceConsistent, TraceValid, safe);
    }
}
// 正常join後才能發布的final安全資料。
public sealed class HostReadRaceDiagnosticFinal
{
    public readonly bool TraceFinalized, LateRender, TraceValid;
    public readonly string FirstRenderPhase, MultipleRenderPhases;
    // 建構只接安全欄位。
    public HostReadRaceDiagnosticFinal(bool traceFinalized, bool lateRender, string firstRenderPhase, string multipleRenderPhases, bool traceValid)
    { TraceFinalized = traceFinalized; LateRender = lateRender; FirstRenderPhase = firstRenderPhase; MultipleRenderPhases = multipleRenderPhases; TraceValid = traceValid; }
}
// Raw證據只留child RAM，副本不能反向改producer。
public sealed class HostReadRaceDiagnosticCapture
{
    public readonly HostReadRaceRenderEvidence Evidence;
    public readonly HostReadRaceDiagnosticSnapshot Diagnostic;
    // null保留未知，不捏造零筆。
    public HostReadRaceDiagnosticCapture(HostReadRaceRenderEvidence evidence, HostReadRaceDiagnosticSnapshot diagnostic)
    { Evidence = evidence == null ? null : new HostReadRaceRenderEvidence { Requests = evidence.Requests, Delivered = evidence.Delivered, Advanced = evidence.Advanced, Failed = evidence.Failed }; Diagnostic = diagnostic; }
}
// Caller只寫原子phase；owner獨佔其餘固定容量資料，錯thread只設atomic失效旗標。
public sealed class HostReadRaceDiagnosticTrace
{
    private readonly int callerThread, ownerThread;
    private int phase, invalid, requests, phases;
    private HostReadRaceDiagnosticContext context;
    private HostReadRaceDiagnosticPhase first;
    private bool registrationContextUsed, evidenceContextUsed, consistent = true;
    private bool baselineKnown, evidenceKnown, deliveryAttempted, deliveryEnded, delivered;
    private bool sampleSealed, finalSealed, late;
    private uint baseline, evidenceVersion;
    private int sequenceCalls;
    // 建構僅綁定managed thread，不啟動thread或呼Win32。
    public HostReadRaceDiagnosticTrace(int callerThreadId)
    { callerThread = callerThreadId; ownerThread = Thread.CurrentThread.ManagedThreadId; if (callerThreadId <= 0) Invalidate(); }
    // 錯thread不能寫owner欄位，只能永久取消可信度。
    private bool OnOwner() { if (Thread.CurrentThread.ManagedThreadId == ownerThread) return true; Invalidate(); return false; }
    // phase透過全屏障讀取，不推定OS持鎖狀態。
    private HostReadRaceDiagnosticPhase CurrentPhase() { return (HostReadRaceDiagnosticPhase)Interlocked.CompareExchange(ref phase, 0, 0); }
    // 合法切換即使已失效也可供cleanup使用，但不能恢復可信度。
    public bool SetPhase(HostReadRaceDiagnosticPhase next)
    {
        if (Thread.CurrentThread.ManagedThreadId != callerThread) { Invalidate(); return false; }
        HostReadRaceDiagnosticPhase before = CurrentPhase();
        bool allowed = (before == HostReadRaceDiagnosticPhase.Unknown && next == HostReadRaceDiagnosticPhase.Registration)
            || (before == HostReadRaceDiagnosticPhase.Registration && next == HostReadRaceDiagnosticPhase.BeforeReader)
            || (before == HostReadRaceDiagnosticPhase.BeforeReader && (next == HostReadRaceDiagnosticPhase.ReaderBracket || next == HostReadRaceDiagnosticPhase.AfterReader))
            || (before == HostReadRaceDiagnosticPhase.ReaderBracket && next == HostReadRaceDiagnosticPhase.AfterReader)
            || (before == HostReadRaceDiagnosticPhase.AfterReader && next == HostReadRaceDiagnosticPhase.Closing);
        if (!allowed) { Invalidate(); return false; }
        Interlocked.Exchange(ref phase, (int)next); return true;
    }
    // Context各一次；不能借另一輪Sequence或重查補票。
    public void BeginContext(HostReadRaceDiagnosticContext next)
    {
        if (!OnOwner()) return;
        if (context != HostReadRaceDiagnosticContext.None || next == HostReadRaceDiagnosticContext.None || finalSealed
            || (next == HostReadRaceDiagnosticContext.Registration && (registrationContextUsed || CurrentPhase() != HostReadRaceDiagnosticPhase.Registration))
            || (next == HostReadRaceDiagnosticContext.Evidence && (evidenceContextUsed || CurrentPhase() != HostReadRaceDiagnosticPhase.AfterReader))) Invalidate();
        if (next == HostReadRaceDiagnosticContext.Registration) registrationContextUsed = true;
        else if (next == HostReadRaceDiagnosticContext.Evidence) evidenceContextUsed = true;
        else Invalidate();
        context = next; sequenceCalls = 0;
    }
    // 結束不增加native呼叫，沒有active context即失效。
    public void EndContext() { if (!OnOwner()) return; if (context == HostReadRaceDiagnosticContext.None) Invalidate(); context = HostReadRaceDiagnosticContext.None; }
    // 只紀錄原呼叫結果，零或throw不能視為已知未變。
    public void RecordSequence(bool returned, uint value)
    {
        if (!OnOwner()) return;
        if (context == HostReadRaceDiagnosticContext.None || finalSealed || ++sequenceCalls != 1) { Invalidate(); return; }
        if (context == HostReadRaceDiagnosticContext.Registration) { baselineKnown = returned && value != 0; baseline = value; }
        else if (context == HostReadRaceDiagnosticContext.Evidence) { evidenceKnown = returned && value != 0; evidenceVersion = value; }
        else Invalidate();
    }
    // 每筆callback均記late，計數飽和不會吞掉晚事件。
    public void RecordRenderCallback()
    {
        if (!OnOwner()) return;
        if (finalSealed) { Invalidate(); return; }
        if (sampleSealed) late = true;
        if (context == HostReadRaceDiagnosticContext.Evidence) consistent = false;
        HostReadRaceDiagnosticPhase seen = CurrentPhase();
        if (seen < HostReadRaceDiagnosticPhase.Registration || seen > HostReadRaceDiagnosticPhase.Closing) Invalidate();
        if (requests == 0) first = seen;
        if (requests < 2) requests++;
        if (seen >= HostReadRaceDiagnosticPhase.Registration && seen <= HostReadRaceDiagnosticPhase.Closing) phases |= 1 << (int)seen;
    }
    // 只紀錄實際payload port入口，不能由Text推斷交付。
    public void BeginDelivery() { if (!OnOwner()) return; if (deliveryAttempted || finalSealed) Invalidate(); deliveryAttempted = true; }
    // false或throw都已證明嘗試失敗，不等於未嘗試。
    public void EndDelivery(bool returned, bool value) { if (!OnOwner()) return; if (!deliveryAttempted || deliveryEnded || finalSealed) Invalidate(); deliveryEnded = true; delivered = returned && value; }
    // 唯一可由錯thread觸及的sticky失效狀態。
    public void Invalidate() { Interlocked.Exchange(ref invalid, 1); }
    // 固定分類不反射enum或其他外來文字。
    private static string PhaseName(HostReadRaceDiagnosticPhase value)
    {
        switch (value) {
            case HostReadRaceDiagnosticPhase.Registration: return "registration";
            case HostReadRaceDiagnosticPhase.BeforeReader: return "before_reader";
            case HostReadRaceDiagnosticPhase.ReaderBracket: return "reader_bracket";
            case HostReadRaceDiagnosticPhase.AfterReader: return "after_reader";
            case HostReadRaceDiagnosticPhase.Closing: return "closing";
            default: return "unknown";
        }
    }
    // 未知快照不能冒稱零筆。
    private static HostReadRaceDiagnosticSnapshot Unknown() { return new HostReadRaceDiagnosticSnapshot("unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", false, false, "unknown"); }
    // 只在owner的Evidence context一次封存，raw DTO不修改。
    public HostReadRaceDiagnosticSnapshot SealSample(HostReadRaceRegistration registration, HostReadRaceRenderEvidence evidence)
    {
        if (!OnOwner() || sampleSealed || finalSealed) { Invalidate(); return Unknown(); }
        sampleSealed = true;
        if (context != HostReadRaceDiagnosticContext.Evidence || CurrentPhase() != HostReadRaceDiagnosticPhase.AfterReader) Invalidate();
        bool known = evidence != null && evidence.Requests >= 0;
        if (!known || Math.Min(evidence.Requests, 2) != requests || evidence.Delivered != (deliveryEnded && delivered)
            || (deliveryEnded && !delivered && !evidence.Failed)) consistent = false;
        bool versionsKnown = baselineKnown && evidenceKnown && registration != null && registration.RegistrationVersion == baseline;
        if (known && versionsKnown && evidence.Advanced != (baseline != evidenceVersion)) consistent = false;
        bool valid = Interlocked.CompareExchange(ref invalid, 0, 0) == 0;
        string delivery = !valid ? "unknown" : !deliveryAttempted ? "not_attempted" : !deliveryEnded ? "unknown" : delivered ? "succeeded" : "failed";
        return new HostReadRaceDiagnosticSnapshot(valid ? (requests == 0 ? "no" : "yes") : "unknown",
            valid && consistent && known ? (evidence.Requests == 1 ? "yes" : "no") : "unknown", delivery,
            valid && consistent && versionsKnown ? (baseline == evidenceVersion ? "unchanged" : "changed") : "unknown",
            known ? (evidence.Failed ? "yes" : "no") : "unknown", valid ? (requests == 0 ? "none" : PhaseName(first)) : "unknown",
            valid ? ((phases & (phases - 1)) != 0 ? "yes" : "no") : "unknown", consistent && valid, valid, "unknown");
    }
    // 原生正常Release後才可信封存；第二次呼叫不能恢復先前失敗。
    public HostReadRaceDiagnosticFinal SealFinal(bool nativeCleanupSucceeded)
    {
        if (!OnOwner() || finalSealed) { Invalidate(); return new HostReadRaceDiagnosticFinal(false, false, "unknown", "unknown", false); }
        finalSealed = true;
        if (!sampleSealed || context != HostReadRaceDiagnosticContext.None || CurrentPhase() != HostReadRaceDiagnosticPhase.Closing) Invalidate();
        bool valid = Interlocked.CompareExchange(ref invalid, 0, 0) == 0;
        return new HostReadRaceDiagnosticFinal(nativeCleanupSucceeded, late, valid ? (requests == 0 ? "none" : PhaseName(first)) : "unknown",
            valid ? ((phases & (phases - 1)) != 0 ? "yes" : "no") : "unknown", valid);
    }
}
// 透明port decorator：每個原呼叫最多轉送一次，不增加探測。
public sealed class HostReadRaceDiagnosticPort : IHostReadRaceClipboardPort
{
    private readonly IHostReadRaceClipboardPort inner;
    private readonly HostReadRaceDiagnosticTrace trace;
    // 僅借既有port。
    public HostReadRaceDiagnosticPort(IHostReadRaceClipboardPort inner, HostReadRaceDiagnosticTrace trace)
    { if (inner == null || trace == null) throw new ArgumentNullException(); this.inner = inner; this.trace = trace; }
    // 一次轉送Prepare。
    public bool PrepareDelayedOwner() { return inner.PrepareDelayedOwner(); }
    // 一次轉送Open。
    public bool Open() { return inner.Open(); }
    // 一次轉送Empty。
    public bool Empty() { return inner.Empty(); }
    // 一次轉送Set(NULL)。
    public bool RegisterDelayed() { return inner.RegisterDelayed(); }
    // 一次轉送格式後驗。
    public bool FormatAvailable() { return inner.FormatAvailable(); }
    // 一次轉送Close。
    public bool Close() { return inner.Close(); }
    // 一次轉送owner比對。
    public bool OwnsClipboard() { return inner.OwnsClipboard(); }
    // 不增加版本查詢。
    public uint Sequence() { bool returned = false; uint value = 0; try { value = inner.Sequence(); returned = true; return value; } finally { trace.RecordSequence(returned, value); } }
    // 不增加交付。
    public bool RenderFixedPayload() { bool returned = false, value = false; trace.BeginDelivery(); try { value = inner.RenderFixedPayload(); returned = true; return value; } finally { trace.EndDelivery(returned, value); } }
    // 不增加Release。
    public bool Release() { return inner.Release(); }
}
