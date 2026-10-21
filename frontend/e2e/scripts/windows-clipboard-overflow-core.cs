using System;
using System.Threading;

// 原生邊界僅可準備固定65份公開容器，不提供內容讀取或任意payload。
public interface IHostOverflowClipboardPort
{
    // 準備不開啟或修改clipboard。
    bool PrepareFixedContainers();
    // 每輪只開一次，不重試。
    bool Open();
    // 清除屬另行授權的新fixture能力。
    bool Empty();
    // index只允許固定序列0..64。
    bool PublishFixedContainer(int zeroBasedIndex);
    // 每次成功Open必嘗試Close。
    bool Close();
    // 原生owner只留child RAM。
    bool OwnsClipboard();
    // 版本不作通知輪詢。
    uint Sequence();
    // 只釋放尚屬自有的資源。
    bool Release();
}

// 生產策略及原生跨thread wrapper共同提供的固定發布入口。
public interface IHostOverflowWriter
{
    bool Ready { get; }
    int Publications { get; }
    // 消耗下一個固定slot，不接受payload或次數。
    HostOverflowPublication PublishNext();
    // 同一發布物曾失效就不可恢復。
    bool MatchesPublished();
    // 版本只供同child的metadata比較。
    uint PublishedVersion();
    // 正常收尾證據不由程序退出替代。
    bool Stop();
}

// 僅接收原listener metadata，不提供注入／重設／內容API。
public interface IHostOverflowNoticePort
{
    bool Ready { get; }
    bool Overflow { get; }
    // Drain不代表重設lifetime計數。
    HostClipboardNotice[] Drain();
}

// 全burst共用預算，不為每輪建立新期限。
public interface IHostOverflowBudget
{
    // 零代表停止，正式實作最大800ms。
    int RemainingMilliseconds();
    // 只讓出thread，不重新讀寫clipboard。
    void Yield();
}

// 發布副本沒有原生識別，計數以內部狀態為準。
public sealed class HostOverflowPublication
{
    public bool Published, WriterOpenClosed;
    public int Publications;
    public string Code = "host_capability_unavailable";
}

// 只保存固定安全sample欄位，不持有native value。
public sealed class HostOverflowSample
{
    public bool ScopeVerified, ProducerCompleted, First64Verified, OverflowObserved, ContentReadAttempted;
    public int Publications, RetainedNotifications;
    public string Code = "host_capability_unavailable";
}

// 安全closed結果不包含process證據，process由parent另驗。
public sealed class HostOverflowResult
{
    public bool ScopeVerified, ProducerCompleted, First64Verified, OverflowObserved, ContentReadAttempted;
    public int Publications, RetainedNotifications;
    public string Code = "host_capability_unavailable";
    public bool OverflowSticky, WriterResourcesClosed, ListenerResourcesClosed, ResourcesClosed;
}

// 診斷只回固定安全分類，不改原Sample／Result契約。
public sealed class HostOverflowDiagnosticSnapshot
{
    public string StopStage = "none", StopReason = "none", SampleCode = "unknown", TailProof = "not_checked";
    public int Attempts = 0;
}

// 新Open失敗metadata只保留三個固定字串分類，不持有native值。
public sealed class HostOpenFailureSnapshot
{
    public string State = "not_applicable", ErrorClass = "not_captured", OpenerSnapshot = "not_queried";
}

// 建立在child主執行緒，writer thread只可保存固定分類且快照封存後不接受晚回覆。
public sealed class HostOpenFailureCollector
{
    private readonly object gate = new object();
    private readonly int creator = Thread.CurrentThread.ManagedThreadId;
    private int writer;
    private bool writerBound, sealedSnapshot, failureRecorded;
    private string state = "not_applicable", errorClass = "not_captured", openerSnapshot = "not_queried";
    // 建立時不碰native，後續只綁一個writer thread。
    public HostOpenFailureCollector() { }
    // 首次capture於writer thread綁定；不能轉交或重設。
    internal bool BindWriter()
    {
        int current = Thread.CurrentThread.ManagedThreadId;
        lock (gate)
        {
            if (sealedSnapshot) return false;
            if (!writerBound) { writer = current; writerBound = true; return true; }
            return writer == current;
        }
    }
    // 記錄slot已進入native邊界，避免seal將在途查詢誤報成未開始。
    internal void BeginAttempt()
    {
        lock (gate)
        {
            if (!CanWrite() || failureRecorded) return;
            state = "pending"; errorClass = "not_captured"; openerSnapshot = "not_queried";
        }
    }
    // 成功Open不保存error／opener，並允許同writer下一個slot。
    internal void Success()
    {
        lock (gate)
        {
            if (!CanWrite() || failureRecorded) return;
            state = "not_applicable"; errorClass = "not_captured"; openerSnapshot = "not_queried";
        }
    }
    // 只接受spec固定pair；raw native值不能進collector。
    internal void Complete(string errorClass, string openerSnapshot)
    {
        lock (gate)
        {
            if (!CanWrite() || failureRecorded) return;
            string nextState;
            if (IsCapturedError(errorClass) && IsCapturedOpener(openerSnapshot)) nextState = "captured";
            else if (errorClass == "capture_unavailable" && IsCapturedOpener(openerSnapshot)) nextState = "partial";
            else if (IsCapturedError(errorClass) && openerSnapshot == "query_unavailable") nextState = "partial";
            else if (errorClass == "capture_unavailable" && openerSnapshot == "query_unavailable") nextState = "unavailable";
            else { SetUnavailable(); return; }
            state = nextState; this.errorClass = errorClass; this.openerSnapshot = openerSnapshot; failureRecorded = true;
        }
    }
    // native Open throw或缺少可信query時固定降級，不保存例外資訊。
    internal void Unavailable()
    {
        lock (gate)
        {
            if (!CanWrite() || failureRecorded) return;
            SetUnavailable();
        }
    }
    // 只由建立者封存，writer晚回覆不得改寫已交付副本。
    public HostOpenFailureSnapshot SealAndSnapshot()
    {
        if (Thread.CurrentThread.ManagedThreadId != creator) return null;
        lock (gate)
        {
            sealedSnapshot = true;
            return new HostOpenFailureSnapshot { State = state, ErrorClass = errorClass, OpenerSnapshot = openerSnapshot };
        }
    }
    // 判斷當前呼叫是否仍屬自有writer且snapshot未封存。
    private bool CanWrite() { return writerBound && writer == Thread.CurrentThread.ManagedThreadId && !sealedSnapshot; }
    // 將未知pair降成固定unavailable三欄，永不保留輸入字串。
    private void SetUnavailable()
    {
        state = "unavailable"; errorClass = "capture_unavailable"; openerSnapshot = "query_unavailable"; failureRecorded = true;
    }
    // 只允許OS錯誤白名單，呼叫者不提供文字或數值。
    private static bool IsCapturedError(string value)
    {
        return value == "access_denied" || value == "invalid_window_handle" || value == "other_nonzero" || value == "zero_indeterminate";
    }
    // 只允許一次快照中固定的視窗關係分類。
    private static bool IsCapturedOpener(string value)
    {
        return value == "other_window_seen" || value == "self_window_seen" || value == "null_indeterminate";
    }
}

// 一次Open由capture策略排序，default分支維持單次legacy呼叫。
internal interface IHostOpenFailureNativePort
{
    // 呼叫既有未快取error的Open宣告。
    bool OpenLegacy(IntPtr window);
    // 只清除目前writer thread的last-error狀態。
    void ClearError();
    // 呼叫同一Open entry並緊接保存可用的cached error。
    bool OpenAndCapture(IntPtr window, bool trustError, out bool errorAvailable, out int errorBits);
    // 失敗後只查一次目前關聯的open window。
    IntPtr QueryOpenWindow();
}

// 一個capture instance對應同一writer的原65個slot，首個false／throw後sticky拒絕重試。
internal sealed class HostOpenFailureCapture
{
    private readonly HostOpenFailureCollector collector;
    private readonly int writer = Thread.CurrentThread.ManagedThreadId;
    private bool failed;
    // 建構只綁純RAM collector，不呼叫native。
    public HostOpenFailureCapture(HostOpenFailureCollector collector)
    {
        if (collector == null) throw new ArgumentNullException("collector");
        if (!collector.BindWriter()) throw new InvalidOperationException();
        this.collector = collector;
    }
    // 每slot一次native Open；只在native BOOL false後查一次opener。
    internal bool OpenSlot(IHostOpenFailureNativePort port, IntPtr window)
    {
        if (Thread.CurrentThread.ManagedThreadId != writer || failed) return false;
        if (port == null) throw new ArgumentNullException("port");
        try { collector.BeginAttempt(); } catch { }
        bool trustError = true;
        try { port.ClearError(); } catch { trustError = false; }
        bool errorAvailable; int errorBits;
        bool opened;
        try { opened = port.OpenAndCapture(window, trustError, out errorAvailable, out errorBits); }
        catch { failed = true; SafeUnavailable(); throw; }
        if (opened) { SafeSuccess(); return true; }
        failed = true;
        string error = trustError && errorAvailable ? ClassifyError(errorBits) : "capture_unavailable";
        string relation;
        try
        {
            IntPtr opener = port.QueryOpenWindow();
            relation = opener == IntPtr.Zero ? "null_indeterminate" : opener == window ? "self_window_seen" : "other_window_seen";
        }
        catch { relation = "query_unavailable"; }
        SafeComplete(error, relation); return false;
    }
    // collector metadata故障不能改已知native BOOL或阻止producer finally Close。
    private void SafeSuccess() { try { collector.Success(); } catch { } }
    // 保存錯誤與opener的安全pair；不傳入raw bits或handle。
    private void SafeComplete(string error, string opener) { try { collector.Complete(error, opener); } catch { SafeUnavailable(); } }
    // native Open例外只記固定不可用分類，再原樣傳回producer。
    private void SafeUnavailable() { try { collector.Unavailable(); } catch { } }
    // 無capture時只回舊Open路徑，不清錯誤或查opener。
    internal static bool Dispatch(IHostOpenFailureNativePort port, IntPtr window, HostOpenFailureCapture capture)
    {
        if (port == null) throw new ArgumentNullException("port");
        return capture == null ? port.OpenLegacy(window) : capture.OpenSlot(port, window);
    }
    // 固定分類raw bits，不保留或輸出原始整數。
    internal static string ClassifyError(int bits)
    {
        if (bits == 5) return "access_denied";
        if (bits == 1400) return "invalid_window_handle";
        if (bits == 0) return "zero_indeterminate";
        return "other_nonzero";
    }
}

// 只有短RAM鎖；不跨native、訊息等待或I/O持鎖，不提供reset。
public sealed class HostOverflowDiagnosticTrace
{
    private readonly object gate = new object();
    private string stage = "none", reason = "none", sample = "unknown", tail = "not_checked";
    private int attempts, failureAttempts;
    private bool failed, sampled, tailStarted, tailArmed;
    // 白名單pair以固定值比對，未知輸入永不保存原文。
    private static bool Allowed(string stage, string reason)
    {
        switch (stage)
        {
            case "none": return reason == "none";
            case "unknown": return reason == "unknown";
            case "prepare": case "open": case "empty": case "set": case "close": case "release": return reason == "returned_false" || reason == "threw";
            case "publish_owner": case "proof_owner": return reason == "owner_mismatch" || reason == "threw";
            case "publish_version": return reason == "version_zero" || reason == "threw";
            case "proof_version": return reason == "version_mismatch" || reason == "version_zero" || reason == "threw";
            case "initial": return reason == "not_ready" || reason == "initial_dirty" || reason == "invalid_input";
            case "budget": return reason == "budget_exhausted" || reason == "budget_invalid" || reason == "threw";
            case "pending_notice": return reason == "initial_dirty" || reason == "null_batch" || reason == "not_ready" || reason == "early_overflow";
            case "publication": return reason == "publication_invalid" || reason == "threw";
            case "notice": return reason == "null_batch" || reason == "null_notice" || reason == "not_ready" || reason == "extra_notice" || reason == "early_overflow" || reason == "ordinal_mismatch" || reason == "notice_time_invalid" || reason == "notice_version_mismatch" || reason == "threw";
            case "version": return reason == "version_zero" || reason == "version_duplicate";
            case "coordinator": return reason == "threw";
            case "writer_initialize": case "writer_dispatch": case "writer_stop": return reason == "returned_false" || reason == "wait_timeout" || reason == "threw";
            case "scope": return reason == "scope_unavailable";
            default: return false;
        }
    }
    // 首次失敗不可由後續收尾覆蓋。
    public void RecordFailure(string stage, string reason)
    {
        lock (gate)
        {
            if (failed) return;
            if (!Allowed(stage, reason) || stage == "none") { stage = "unknown"; reason = "unknown"; }
            this.stage = stage; this.reason = reason; failureAttempts = attempts; failed = true;
        }
    }
    // 原sample與最終分類必須分開保存。
    public void RecordSample(string code)
    {
        lock (gate)
        {
            if (sampled) return;
            sampled = true;
            switch (code)
            {
                case "host_observation_overflow": case "host_capability_unavailable": case "host_cleanup_unavailable": case "host_scope_changed": case "host_clipboard_unstable": sample = code; break;
                default: sample = "unknown"; break;
            }
            if (sample != "host_observation_overflow" && !failed) { stage = "unknown"; reason = "unknown"; failureAttempts = attempts; failed = true; }
        }
    }
    // 只包原有tail查詢，不發出查詢。
    public void BeginTail() { lock (gate) { if (tailStarted) return; tailStarted = tailArmed = true; tail = "unknown"; } }
    // 停止接受晚到的proof。
    public void EndTail() { lock (gate) { tailArmed = false; } }
    // 派送未確認的tail不能把搶先抵達的callback當成已確認證據。
    internal void RejectTail() { lock (gate) { if (tailArmed) { tail = "unknown"; tailArmed = false; } } }
    // 副本不暴露可寫內部狀態。
    public HostOverflowDiagnosticSnapshot Snapshot()
    {
        lock (gate) { return new HostOverflowDiagnosticSnapshot { StopStage = stage, StopReason = reason, Attempts = failed ? failureAttempts : attempts, SampleCode = sample, TailProof = tail }; }
    }
    // 只由真producer消耗slot時推進。
    internal void Attempt(int slots) { lock (gate) { if (slots >= attempts && slots <= 65) attempts = slots; } }
    // 只記已存在的查詢結果。
    internal void Proof(string state)
    {
        lock (gate)
        {
            if (!tailArmed || tail != "unknown") return;
            switch (state)
            {
                case "matched": case "blocked_prior_failure": case "owner_mismatch": case "version_mismatch": case "query_unavailable": case "not_ready": tail = state; break;
            }
        }
    }
}

// 固定65個slot的發布狀態綁自有thread；不提供重播／還原或任意payload。
public sealed class HostClipboardOverflowProducer : IHostOverflowWriter
{
    private readonly IHostOverflowClipboardPort port;
    private readonly HostOverflowDiagnosticTrace trace;
    private readonly int owner;
    private bool attempted, prepared, faulted, stopped, cleanupFailed, stopResult;
    private int slots, publications;
    private uint version;
    // 建構不碰clipboard，只記操作thread。
    public HostClipboardOverflowProducer(IHostOverflowClipboardPort port) : this(port, null) { }
    // 可選診斷不更換port或增加OS查詢。
    public HostClipboardOverflowProducer(IHostOverflowClipboardPort port, HostOverflowDiagnosticTrace trace)
    {
        if (port == null) throw new ArgumentNullException("port");
        this.port = port; this.trace = trace; owner = Thread.CurrentThread.ManagedThreadId;
    }
    // 只傳固定stage／reason，不呼port。
    private void Failure(string stage, string reason) { if (trace != null) trace.RecordFailure(stage, reason); }
    // Tail只有caller已arm時才收既有proof結果。
    private void Proof(string value) { if (trace != null) trace.Proof(value); }
    // 跨thread不能污染原建立者的狀態。
    private bool Owned() { return Thread.CurrentThread.ManagedThreadId == owner; }
    // 已耗盡slot仍可查最後proof及Stop，但不可再發。
    public bool Ready { get { return Owned() && prepared && !faulted && !stopped; } }
    // 計數以成功Set為準，副本無法更改。
    public int Publications { get { return Owned() ? publications : 0; } }
    // 僅準備一次固定自有配置；失敗亦不可再試。
    public bool Prepare()
    {
        if (!Owned() || attempted || stopped) return false;
        attempted = true;
        try { prepared = port.PrepareFixedContainers(); if (!prepared) Failure("prepare", "returned_false"); } catch { prepared = false; Failure("prepare", "threw"); }
        faulted = !prepared; return prepared;
    }
    // 每輪在Open前消耗slot，任何失敗阻止後續所有slot。
    public HostOverflowPublication PublishNext()
    {
        HostOverflowPublication result = new HostOverflowPublication { Publications = Publications };
        if (!Ready || slots >= 65) return result;
        if (publications > 0 && !MatchesPublished()) return result;
        int index = slots++;
        if (trace != null) trace.Attempt(slots);
        bool opened = false;
        string operation = "open";
        try
        {
            opened = port.Open();
            if (!opened) Failure("open", "returned_false");
            else
            {
                operation = "empty";
                if (!port.Empty()) Failure("empty", "returned_false");
                else
                {
                    operation = "set";
                    if (port.PublishFixedContainer(index)) { result.Published = true; publications++; }
                    else Failure("set", "returned_false");
                }
            }
        }
        catch { faulted = true; Failure(operation, "threw"); }
        finally
        {
            if (opened)
            {
                try { result.WriterOpenClosed = port.Close(); if (!result.WriterOpenClosed) Failure("close", "returned_false"); } catch { result.WriterOpenClosed = false; Failure("close", "threw"); }
                if (!result.WriterOpenClosed) { cleanupFailed = true; result.Code = "host_cleanup_unavailable"; }
            }
        }
        result.Publications = publications;
        if (result.Published && result.WriterOpenClosed && !faulted)
        {
            operation = "publish_owner";
            try
            {
                if (port.OwnsClipboard())
                {
                    operation = "publish_version"; version = port.Sequence();
                    if (version == 0) Failure("publish_version", "version_zero");
                }
                else { version = 0; Failure("publish_owner", "owner_mismatch"); }
            }
            catch { version = 0; Failure(operation, "threw"); }
            if (version != 0) { result.Code = "host_observed"; return result; }
        }
        faulted = true; return result;
    }
    // 曾失去owner或版本即永久失效，不接受較晚恢復。
    public bool MatchesPublished()
    {
        if (!Owned()) return false;
        if (!Ready || publications == 0 || version == 0) { Proof(faulted ? "blocked_prior_failure" : "not_ready"); return false; }
        string operation = "proof_owner";
        try
        {
            if (!port.OwnsClipboard()) { Failure("proof_owner", "owner_mismatch"); Proof("owner_mismatch"); }
            else
            {
                operation = "proof_version"; uint current = port.Sequence();
                if (current == version) { Proof("matched"); return true; }
                Failure("proof_version", current == 0 ? "version_zero" : "version_mismatch");
                Proof(current == 0 ? "query_unavailable" : "version_mismatch");
            }
        }
        catch { Failure(operation, "threw"); Proof("query_unavailable"); }
        faulted = true; return false;
    }
    // 不另查sequence，只回本輪已保存的非零版本。
    public uint PublishedVersion() { return Ready ? version : 0; }
    // Release最多一次，Close及Release任一失敗皆sticky。
    public bool Stop()
    {
        if (!Owned()) return false;
        if (stopped) return stopResult;
        stopped = true;
        try { stopResult = port.Release(); if (!stopResult) Failure("release", "returned_false"); } catch { stopResult = false; Failure("release", "threw"); }
        stopResult = stopResult && !cleanupFailed; return stopResult;
    }
}

// 逐輪等真正通知，不輪詢sequence或重發公開文字求通知。
public sealed class HostClipboardOverflowCoordinator
{
    private bool consumed;
    private readonly HostOverflowDiagnosticTrace trace;
    // 相容既有無診斷caller。
    public HostClipboardOverflowCoordinator() : this(null) { }
    // 與producer共用同一純RAM記錄。
    public HostClipboardOverflowCoordinator(HostOverflowDiagnosticTrace trace) { this.trace = trace; }
    // 只在原本已拒絕處保存固定診斷，不改result。
    private HostOverflowSample Fail(HostOverflowSample result, string stage, string reason) { if (trace != null) trace.RecordFailure(stage, reason); return result; }
    // 單一預算僅允許0..800，假邊界異常亦不可變成無限等待。
    private bool HasTime(IHostOverflowBudget budget)
    {
        try
        {
            int left = budget.RemainingMilliseconds(); bool ok = left > 0 && left <= 800;
            if (!ok && trace != null) trace.RecordFailure("budget", left == 0 ? "budget_exhausted" : "budget_invalid");
            return ok;
        }
        catch { if (trace != null) trace.RecordFailure("budget", "threw"); throw; }
    }
    // 一次sample只可跑一次；回傳count是實際成功Set／驗過metadata。
    public HostOverflowSample Run(IHostOverflowWriter writer, IHostOverflowNoticePort notices, IHostOverflowBudget budget, bool scopeVerified)
    {
        HostOverflowSample result = new HostOverflowSample();
        if (consumed) return result;
        consumed = true; result.ScopeVerified = scopeVerified;
        if (!scopeVerified) { result.Code = "host_scope_changed"; return Fail(result, "scope", "scope_unavailable"); }
        if (writer == null || notices == null || budget == null) return Fail(result, "initial", "invalid_input");
        uint[] versions = new uint[65];
        long lastUs = 0;
        string operation = "coordinator";
        try
        {
            if (!writer.Ready || !notices.Ready) return Fail(result, "initial", "not_ready");
            if (writer.Publications != 0) return Fail(result, "initial", "initial_dirty");
            for (int index = 0; index < 65; index++)
            {
                if (!HasTime(budget)) return result;
                operation = "coordinator";
                HostClipboardNotice[] pending = notices.Drain();
                if (pending == null) return Fail(result, "pending_notice", "null_batch");
                if (pending.Length != 0) return Fail(result, "pending_notice", "initial_dirty");
                if (!notices.Ready) return Fail(result, "pending_notice", "not_ready");
                if (notices.Overflow) return Fail(result, "pending_notice", "early_overflow");
                operation = "publication";
                HostOverflowPublication publication = writer.PublishNext();
                operation = "coordinator";
                if (publication == null || publication.Publications < 0 || publication.Publications > 65) return Fail(result, "publication", "publication_invalid");
                result.Publications = publication.Publications;
                if (!publication.Published || !publication.WriterOpenClosed || publication.Code != "host_observed" || publication.Publications != index + 1)
                {
                    if (publication.Code == "host_cleanup_unavailable") result.Code = "host_cleanup_unavailable";
                    return Fail(result, "publication", "publication_invalid");
                }
                if (!HasTime(budget)) return result;
                if (!writer.MatchesPublished()) { result.Code = "host_clipboard_unstable"; return result; }
                uint version = writer.PublishedVersion();
                if (version == 0 || Array.IndexOf(versions, version, 0, index) >= 0) { result.Code = "host_clipboard_unstable"; return Fail(result, "version", version == 0 ? "version_zero" : "version_duplicate"); }
                versions[index] = version;
                if (index == 64) result.ProducerCompleted = true;
                bool received = false;
                while (HasTime(budget))
                {
                    operation = "notice";
                    HostClipboardNotice[] batch = notices.Drain();
                    if (batch == null) return Fail(result, "notice", "null_batch");
                    if (!notices.Ready) return Fail(result, "notice", "not_ready");
                    bool overflow = notices.Overflow;
                    if (index == 64)
                    {
                        if (batch.Length != 0) return Fail(result, "notice", "extra_notice");
                        if (overflow) { result.OverflowObserved = true; received = true; break; }
                    }
                    else
                    {
                        if (overflow) return Fail(result, "notice", "early_overflow");
                        if (batch.Length > 1) return Fail(result, "notice", "extra_notice");
                        if (batch.Length == 1)
                        {
                            HostClipboardNotice notice = batch[0];
                            if (notice == null) return Fail(result, "notice", "null_notice");
                            if (notice.Ordinal != index + 1) return Fail(result, "notice", "ordinal_mismatch");
                            if (notice.Version != version) return Fail(result, "notice", "notice_version_mismatch");
                            if (notice.Us < 0 || notice.Us < lastUs) return Fail(result, "notice", "notice_time_invalid");
                            lastUs = notice.Us; result.RetainedNotifications++;
                            result.First64Verified = result.RetainedNotifications == 64;
                            received = true; break;
                        }
                    }
                    budget.Yield();
                }
                if (!received || !HasTime(budget)) return result;
                operation = "coordinator";
                if (!writer.MatchesPublished()) { result.Code = "host_clipboard_unstable"; return result; }
            }
            result.Code = "host_observation_overflow";
        }
        catch { Fail(result, operation, "threw"); result.Code = "host_capability_unavailable"; }
        return result;
    }
}

// 負向成功仍要求全部來源／overflow／收尾證據，不是只認code。
public static class HostClipboardOverflowCalibration
{
    // 非法資料固定拒絕，正常資源關閉與overflow各自保留。
    public static HostOverflowResult Classify(HostOverflowSample sample, bool scopeVerified, bool publicationTailMatched, bool writerClosed, bool listenerClosed, bool overflowAfterStop, int lateNotifications)
    {
        HostOverflowResult result = new HostOverflowResult { WriterResourcesClosed = writerClosed, ListenerResourcesClosed = listenerClosed, ResourcesClosed = writerClosed && listenerClosed };
        string[] codes = { "host_observation_overflow", "host_capability_unavailable", "host_cleanup_unavailable", "host_scope_changed", "host_clipboard_unstable" };
        if (sample == null || sample.Publications < 0 || sample.Publications > 65 || sample.RetainedNotifications < 0 || sample.RetainedNotifications > 64 || Array.IndexOf(codes, sample.Code) < 0 || lateNotifications < 0 || lateNotifications > 64) return result;
        result.ScopeVerified = sample.ScopeVerified && scopeVerified;
        result.ProducerCompleted = sample.ProducerCompleted; result.Publications = sample.Publications;
        result.RetainedNotifications = sample.RetainedNotifications; result.First64Verified = sample.First64Verified;
        result.OverflowObserved = sample.OverflowObserved; result.OverflowSticky = sample.OverflowObserved && overflowAfterStop;
        result.ContentReadAttempted = sample.ContentReadAttempted;
        if (!result.ResourcesClosed || sample.Code == "host_cleanup_unavailable") result.Code = "host_cleanup_unavailable";
        else if (!result.ScopeVerified) result.Code = "host_scope_changed";
        else if (!publicationTailMatched) result.Code = "host_clipboard_unstable";
        else if (sample.Code == "host_observation_overflow" && result.ProducerCompleted && result.Publications == 65 && result.RetainedNotifications == 64 && result.First64Verified && result.OverflowSticky && !result.ContentReadAttempted && lateNotifications == 0) result.Code = "host_observation_overflow";
        else if (sample.Code != "host_observation_overflow") result.Code = sample.Code;
        return result;
    }
}
