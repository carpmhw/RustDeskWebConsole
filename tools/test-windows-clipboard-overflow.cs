using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;

// 只替換OS／訊息交付與clock，真正producer／coordinator／classifier全部執行。
internal static class OverflowCoreTests
{
    internal sealed class Port : IHostOverflowClipboardPort, IHostOverflowNoticePort
    {
        public string Fault = "", Mode = "";
        public int FaultSlot = -1, Prepares, Opens, Empties, Sets, Closes, Releases, Frees;
        public bool Throw, Owner = true, OverflowState, TailExtra;
        // 新診斷測試只替換Open的OS邊界，其餘producer／coordinator仍執行真策略。
        public Func<bool> OpenOverride;
        public readonly List<string> Calls = new List<string>();
        // 模擬OS邊界已備妥，不替代真正producer的Ready策略。
        public bool Ready { get { Calls.Add("ready"); return true; } }
        // Drain不能將已交付邊界的overflow清零。
        public bool Overflow { get { Calls.Add("overflow"); return OverflowState || Mode == "initial_overflow"; } }
        private readonly Queue<HostClipboardNotice> queued = new Queue<HostClipboardNotice>();
        // 故障只放OS邊界，不能直接回成功DTO。
        private bool Step(string name)
        {
            Calls.Add(name);
            if (Fault != name || (FaultSlot >= 0 && Opens - 1 != FaultSlot)) return true;
            if (Throw) throw new InvalidOperationException();
            return false;
        }
        // 準備不發訊息，不開clip。
        public bool PrepareFixedContainers() { Prepares++; return Step("prepare"); }
        // 開啟次數由真正producer控制。
        public bool Open()
        {
            Opens++;
            if (OpenOverride != null) { Calls.Add("open"); return OpenOverride(); }
            return Step("open");
        }
        // 模擬另授權副作用的OS結果。
        public bool Empty() { Empties++; return Step("empty"); }
        // 固定slot順序可抓錯誤index或重播。
        public bool PublishFixedContainer(int index) { Assert(index == Sets && index < 65); bool ok = Step("set"); if (ok) Sets++; return ok; }
        // 只在成功Close之後交付公開metadata，不模擬producer／classifier。
        public bool Close()
        {
            Closes++;
            if (!Step("close")) return false;
            if (Sets > 0 && Sets <= 64)
            {
                HostClipboardNotice notice = new HostClipboardNotice { Ordinal = Sets, Us = Sets * 10, Version = Sequence() };
                if (Mode == "ordinal") notice.Ordinal++;
                if (Mode == "duplicate_ordinal" && Sets == 2) notice.Ordinal = 1;
                if (Mode == "equal_us") notice.Us = 0;
                if (Mode == "negative_us") notice.Us = -1;
                if (Mode == "regress_us" && Sets == 2) notice.Us = 0;
                if (Mode == "wrong_version") notice.Version = 123;
                if (Mode == "zero_notice") notice.Version = 0;
                if (Mode != "missing") queued.Enqueue(Mode == "null_row" ? null : notice);
                if (Mode == "extra") queued.Enqueue(notice);
                if (Mode == "early_overflow") OverflowState = true;
                if (Mode == "owner") Owner = false;
            }
            else if (Sets == 65 && Mode != "no_overflow") OverflowState = true;
            return true;
        }
        // 公開替身不輸出任何原生handle。
        public bool OwnsClipboard() { return Step("owner") && Owner; }
        // 跨wrap仍只相等比對；版本與notice來自同一次OS邊界。
        public uint Sequence() { if (!Step("sequence")) return 0; return Mode == "zero_version" ? 0u : Mode == "repeat_version" ? 1u : Sets == 1 ? uint.MaxValue : (uint)(Sets - 1); }
        // 成功Set的slot已移交，不可被真正Stop策略要求重發。
        public bool Release() { Releases++; Frees = 65 - Sets; return Step("release"); }
        // 一次交付一筆的邊界，Drain不改OverflowState；尾端污染是額外訊息。
        public HostClipboardNotice[] Drain()
        {
            Calls.Add("drain");
            if (Mode == "null_batch") return null;
            if (Mode == "initial") return new[] { new HostClipboardNotice { Ordinal = 1, Us = 0, Version = 1 } };
            if (TailExtra) { TailExtra = false; return new[] { new HostClipboardNotice { Ordinal = 65, Us = 650, Version = 64 } }; }
            HostClipboardNotice[] result = queued.ToArray(); queued.Clear();
            if (Mode == "tail_extra" && Sets == 64 && result.Length == 1) TailExtra = true;
            if (Mode == "owner17" && Sets == 17 && result.Length == 1) Owner = false;
            return result;
        }
    }

    private sealed class Budget : IHostOverflowBudget
    {
        public int Left = 800, StopAfter = 100;
        public Port Port;
        // 假clock只替換時間來源，0後不能藉下一輪恢復。
        public int RemainingMilliseconds() { if (Port != null) Port.Calls.Add("remaining"); return Port != null && Port.Sets >= StopAfter ? 0 : Left; }
        // 無通知時也會耗盡同一預算，不靠真的Sleep拖慢測試。
        public void Yield() { if (Port != null) Port.Calls.Add("yield"); Left--; }
    }

    // 若Prepare碰clip、slot越界或多發第66輪，此測試會失敗。
    private static void PrepareDoesNotWriteAndPublishesAtMost65()
    {
        Port p = new Port(); HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p);
        Assert(producer.Prepare() && !producer.Prepare());
        Assert(p.Prepares == 1 && p.Opens == 0 && p.Empties == 0 && p.Sets == 0 && !producer.MatchesPublished());
        for (int i = 0; i < 65; i++)
        {
            HostOverflowPublication publication = producer.PublishNext();
            Assert(publication.Published && publication.WriterOpenClosed && publication.Publications == i + 1 && publication.Code == "host_observed");
            Assert(producer.MatchesPublished() && producer.PublishedVersion() != 0);
        }
        Assert(!producer.PublishNext().Published && p.Opens == 65 && p.Empties == 65 && p.Sets == 65 && p.Closes == 65);
        Assert(producer.Stop() && producer.Stop() && p.Releases == 1 && p.Frees == 0);
    }

    // 任一slot失敗不得重播或漏finally Close，Close失敗不得被Release洗白。
    private static void FailureConsumesSlotAndCleanupSticks()
    {
        foreach (int slot in new[] { 0, 31, 64 })
        foreach (string fault in new[] { "open", "empty", "set", "close" })
        foreach (bool throws in new[] { false, true })
        {
            Port p = new Port { Fault = fault, FaultSlot = slot, Throw = throws };
            HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p); Assert(producer.Prepare());
            for (int i = 0; i < slot; i++) Assert(producer.PublishNext().Published);
            HostOverflowPublication value = producer.PublishNext();
            Assert(value.Code != "host_observed" && value.Published == (fault == "close"));
            Assert(!producer.PublishNext().Published && p.Opens == slot + 1);
            Assert(p.Closes == slot + (fault == "open" ? 0 : 1));
            Assert(p.Sets == slot + (fault == "close" ? 1 : 0));
            Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
            bool stopped = producer.Stop(); Assert(stopped == (fault != "close"));
            Assert(producer.Stop() == stopped && p.Releases == 1 && p.Frees == 65 - p.Sets);
        }
        foreach (string fault in new[] { "prepare", "release" })
        foreach (bool throws in new[] { false, true })
        {
            Port p = new Port { Fault = fault, Throw = throws };
            HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p);
            Assert(producer.Prepare() == (fault != "prepare")); Assert(!producer.Prepare());
            if (fault == "prepare") Assert(!producer.PublishNext().Published && p.Opens == 0);
            bool stopped = producer.Stop(); Assert(stopped == (fault != "release"));
            Assert(producer.Stop() == stopped && p.Releases == 1);
        }
    }

    // 改副本、跨thread或恢復舊owner均不能恢復內部proof／once gate。
    private static void ProofCannotRecoverOrMutateViaDto()
    {
        Port p = new Port(); HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p); Assert(producer.Prepare());
        HostOverflowPublication copy = producer.PublishNext(); copy.Publications = 0; copy.Published = false;
        Assert(producer.Publications == 1 && producer.MatchesPublished());
        bool denied = false;
        // 真managed thread不應觸及建立者的port。
        Thread thread = new Thread(delegate() { denied = !producer.Prepare() && !producer.PublishNext().Published && !producer.MatchesPublished() && producer.PublishedVersion() == 0 && !producer.Stop(); });
        thread.Start(); Assert(thread.Join(1000) && denied && p.Opens == 1 && p.Releases == 0);
        p.Owner = false; Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
        p.Owner = true; Assert(!producer.MatchesPublished() && !producer.PublishNext().Published && p.Opens == 1);
        Assert(producer.Stop());
    }

    // 每次Drain只有一筆仍必累計64；只替OS／delivery，真正策略完成65輪。
    private static void LifetimeLimitSurvivesDrains()
    {
        foreach (string mode in new[] { "", "equal_us" })
        {
            Port p = new Port { Mode = mode }; HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p); Assert(producer.Prepare());
            HostOverflowSample result = new HostClipboardOverflowCoordinator().Run(producer, p, new Budget(), true);
            Assert(result.Publications == 65 && result.RetainedNotifications == 64 && result.ProducerCompleted && result.First64Verified && result.OverflowObserved);
            Assert(!result.ContentReadAttempted && result.Code == "host_observation_overflow");
            Assert(p.Opens == 65 && p.Sets == 65 && p.Closes == 65 && !producer.PublishNext().Published);
            Assert(p.Drain().Length == 0 && p.Overflow && producer.Stop());
        }
    }

    // 污染／錯版本／額外訊息不能挑一筆符合的繼續寫，初始不符應零寫入。
    private static void ContaminatedOrContradictoryNoticesStopWrites()
    {
        foreach (string mode in new[] { "initial", "initial_overflow", "null_batch", "null_row", "ordinal", "duplicate_ordinal", "negative_us", "regress_us", "wrong_version", "zero_notice", "zero_version", "repeat_version", "extra", "early_overflow", "tail_extra", "owner", "missing" })
        {
            Port p = new Port { Mode = mode }; HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p); Assert(producer.Prepare());
            HostOverflowSample result = new HostClipboardOverflowCoordinator().Run(producer, p, new Budget(), true);
            Assert(!result.ProducerCompleted && result.Code != "host_observed" && p.Opens <= 64);
            if (mode == "initial" || mode == "initial_overflow" || mode == "null_batch") Assert(p.Opens == 0);
            else if (mode == "duplicate_ordinal" || mode == "regress_us" || mode == "repeat_version") Assert(p.Opens == 2);
            else if (mode == "tail_extra") Assert(p.Opens == 64);
            else Assert(p.Opens == 1);
            Assert(producer.Stop());
        }
    }

    // 65次Set不代表實際overflow；單一預算及coordinator gate不可重建。
    private static void FinalPublicationWithoutOverflowFails()
    {
        Port p = new Port { Mode = "no_overflow" }; HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p); Assert(producer.Prepare());
        HostOverflowSample value = new HostClipboardOverflowCoordinator().Run(producer, p, new Budget(), true);
        Assert(p.Sets == 65 && !value.OverflowObserved && value.Code != "host_observation_overflow"); Assert(producer.Stop());
    }

    // 若每slot重建deadline或Run重新建gate，會多發公開內容。
    private static void OneBudgetAndOneRunCannotReset()
    {
        foreach (int stop in new[] { 0, 3, 31, 64 })
        {
            Port p = new Port(); HostClipboardOverflowProducer producer = new HostClipboardOverflowProducer(p); Assert(producer.Prepare());
            Budget budget = new Budget { Port = p, StopAfter = stop };
            HostClipboardOverflowCoordinator coordinator = new HostClipboardOverflowCoordinator();
            HostOverflowSample sample = coordinator.Run(producer, p, budget, true);
            Assert(!sample.ProducerCompleted && p.Sets == stop);
            coordinator.Run(producer, p, new Budget(), true); Assert(p.Sets == stop && producer.Stop());
        }
        Port other = new Port(); HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(other); Assert(writer.Prepare());
        HostClipboardOverflowCoordinator denied = new HostClipboardOverflowCoordinator(); denied.Run(writer, other, new Budget(), false);
        denied.Run(writer, other, new Budget(), true); Assert(other.Opens == 0 && writer.Stop());
    }

    // 手寫literal逐項改證據，不能讓未知code或late cleanup變成成功。
    private static void FinalClassificationRejectsLateContradictions()
    {
        foreach (string mutation in new[] { "valid", "null", "scope", "tail", "writer", "listener", "overflow_tail", "late", "bad_late", "unknown", "publications", "negative", "retained", "first64", "completed", "overflow", "read" })
        {
            HostOverflowSample sample = new HostOverflowSample { ScopeVerified = true, ProducerCompleted = true, First64Verified = true, OverflowObserved = true, ContentReadAttempted = false, Publications = 65, RetainedNotifications = 64, Code = "host_observation_overflow" };
            bool scope = true, tail = true, writer = true, listener = true, overflow = true; int late = 0;
            switch (mutation)
            {
                case "null": sample = null; break;
                case "scope": scope = false; break;
                case "tail": tail = false; break;
                case "writer": writer = false; break;
                case "listener": listener = false; break;
                case "overflow_tail": overflow = false; break;
                case "late": late = 1; break;
                case "bad_late": late = -1; break;
                case "unknown": sample.Code = "Unknown public code"; break;
                case "publications": sample.Publications = 64; break;
                case "negative": sample.Publications = -1; break;
                case "retained": sample.RetainedNotifications = 63; break;
                case "first64": sample.First64Verified = false; break;
                case "completed": sample.ProducerCompleted = false; break;
                case "overflow": sample.OverflowObserved = false; break;
                case "read": sample.ContentReadAttempted = true; break;
            }
            HostOverflowResult result = HostClipboardOverflowCalibration.Classify(sample, scope, tail, writer, listener, overflow, late);
            Assert((result.Code == "host_observation_overflow") == (mutation == "valid"));
            Assert(result.Code != "Unknown public code");
            if (mutation == "valid") Assert(result.ResourcesClosed && result.OverflowSticky && !result.ContentReadAttempted && result.Publications == 65 && result.RetainedNotifications == 64);
        }
        Assert(typeof(HostOverflowSample).GetFields(BindingFlags.Public | BindingFlags.Instance).Length == 8);
        Assert(typeof(HostOverflowResult).GetFields(BindingFlags.Public | BindingFlags.Instance).Length == 12);
    }

    // 同一17／17的兩個原因若再被final code遮蔽，本測試會失敗。
    private static void Partial17CasesKeepPrimaryButSeparateCause()
    {
        foreach (bool failOpen in new[] { true, false })
        {
            Port p = new Port { Fault = failOpen ? "open" : "", FaultSlot = 17, Mode = failOpen ? "" : "owner17" };
            HostOverflowDiagnosticTrace trace = new HostOverflowDiagnosticTrace();
            HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(p, trace); Assert(writer.Prepare());
            HostOverflowSample sample = new HostClipboardOverflowCoordinator(trace).Run(writer, p, new Budget(), true);
            trace.RecordSample(sample.Code); trace.BeginTail(); bool tail = writer.MatchesPublished(); trace.EndTail();
            bool closed = writer.Stop();
            HostOverflowResult result = HostClipboardOverflowCalibration.Classify(sample, true, tail, closed, true, false, 0);
            Assert(sample.Publications == 17 && sample.RetainedNotifications == 17 && result.Code == "host_clipboard_unstable" && result.ResourcesClosed && !tail);
            Assert(sample.Code == (failOpen ? "host_capability_unavailable" : "host_clipboard_unstable"));
            DiagnosticEquals(trace.Snapshot(), failOpen ? "open" : "proof_owner", failOpen ? "returned_false" : "owner_mismatch", failOpen ? 18 : 17, sample.Code, "blocked_prior_failure");
        }
    }

    // first cause、slot先消耗、跨thread與DTO不回寫均由真正producer驗證。
    private static void FirstCauseAndAttemptDoNotReset()
    {
        foreach (string fault in new[] { "prepare", "open", "empty", "set", "close", "release" })
        foreach (bool throws in new[] { false, true })
        foreach (int slot in new[] { 0, 16, 17, 64 })
        {
            Port p = new Port { Fault = fault, FaultSlot = fault == "prepare" ? -1 : slot, Throw = throws };
            HostOverflowDiagnosticTrace trace = new HostOverflowDiagnosticTrace();
            HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(p, trace);
            bool prepared = writer.Prepare(); Assert(prepared == (fault != "prepare"));
            if (prepared) for (int i = 0; i <= slot; i++) writer.PublishNext();
            writer.Stop(); trace.RecordFailure("scope", "scope_unavailable"); trace.RecordSample("host_capability_unavailable");
            int attempts = fault == "prepare" ? 0 : slot + 1;
            DiagnosticEquals(trace.Snapshot(), fault, throws ? "threw" : "returned_false", attempts, "host_capability_unavailable", "not_checked");
            HostOverflowDiagnosticSnapshot copy = trace.Snapshot(); copy.StopStage = "unknown"; copy.Attempts = 65;
            Assert(trace.Snapshot().StopStage == fault && trace.Snapshot().Attempts == attempts);
        }
        HostOverflowDiagnosticTrace foreignTrace = new HostOverflowDiagnosticTrace(); Port foreign = new Port();
        HostClipboardOverflowProducer owned = new HostClipboardOverflowProducer(foreign, foreignTrace); Assert(owned.Prepare());
        // 跨thread拒絕不能污染建立者診斷或呼叫native。
        Thread thread = new Thread(delegate() { owned.PublishNext(); owned.MatchesPublished(); owned.Stop(); });
        thread.Start(); Assert(thread.Join(1000));
        DiagnosticEquals(foreignTrace.Snapshot(), "none", "none", 0, "unknown", "not_checked"); Assert(foreign.Opens == 0 && owned.Stop());
        HostOverflowDiagnosticTrace unknown = new HostOverflowDiagnosticTrace(); unknown.RecordFailure("Public unknown", "Public unknown"); unknown.RecordSample("Public unknown");
        DiagnosticEquals(unknown.Snapshot(), "unknown", "unknown", 0, "unknown", "not_checked");
        HostOverflowDiagnosticTrace missing = new HostOverflowDiagnosticTrace(); missing.RecordSample("host_capability_unavailable"); missing.RecordSample("host_observation_overflow");
        DiagnosticEquals(missing.Snapshot(), "unknown", "unknown", 0, "host_capability_unavailable", "not_checked");
        Assert(typeof(HostOverflowDiagnosticSnapshot).GetFields(BindingFlags.Public | BindingFlags.Instance).Length == 5);
    }

    // tail只在既有Matches取得證據，不允許晚到callback或第二次arming改寫。
    private static void TailOnlyCapturesExistingCheck()
    {
        foreach (string mode in new[] { "matched", "owner", "version", "zero", "throws", "sticky", "not_ready" })
        {
            Port p = new Port(); HostOverflowDiagnosticTrace trace = new HostOverflowDiagnosticTrace();
            HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(p, trace); Assert(writer.Prepare());
            if (mode != "not_ready") Assert(writer.PublishNext().Published);
            if (mode == "owner" || mode == "sticky") p.Owner = false;
            if (mode == "version") p.Mode = "repeat_version";
            if (mode == "zero") p.Mode = "zero_version";
            if (mode == "throws") { p.Fault = "sequence"; p.Throw = true; }
            if (mode == "sticky") Assert(!writer.MatchesPublished());
            Assert(trace.Snapshot().TailProof == "not_checked");
            trace.BeginTail(); bool matched = writer.MatchesPublished(); trace.EndTail();
            string expected = mode == "matched" ? "matched" : mode == "owner" ? "owner_mismatch" : mode == "version" ? "version_mismatch" : mode == "zero" || mode == "throws" ? "query_unavailable" : mode == "sticky" ? "blocked_prior_failure" : "not_ready";
            Assert(matched == (mode == "matched") && trace.Snapshot().TailProof == expected);
            p.Owner = false; writer.MatchesPublished(); trace.BeginTail(); writer.MatchesPublished(); trace.EndTail();
            Assert(trace.Snapshot().TailProof == expected && writer.Stop());
        }
        HostOverflowDiagnosticTrace late = new HostOverflowDiagnosticTrace(); late.BeginTail(); late.EndTail(); late.Proof("matched");
        Assert(late.Snapshot().TailProof == "unknown");
        HostOverflowDiagnosticTrace timeout = new HostOverflowDiagnosticTrace(); timeout.BeginTail(); timeout.Proof("matched"); timeout.RejectTail(); timeout.EndTail(); timeout.Proof("matched");
        Assert(timeout.Snapshot().TailProof == "unknown");
    }

    // 若trace增加guard／clock查詢或改短路順序，與default的OS交付紀錄將不相同。
    private static void DiagnosticDoesNotAddCalls()
    {
        foreach (string mode in new[] { "", "owner17", "extra", "repeat_version", "missing", "null_batch" })
        foreach (int stop in new[] { 0, 17, 100 })
        {
            string calls = null, sampleCode = null; int publications = -1, retained = -1;
            foreach (bool enabled in new[] { false, true })
            {
                Port p = new Port { Mode = mode }; HostOverflowDiagnosticTrace trace = enabled ? new HostOverflowDiagnosticTrace() : null;
                HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(p, trace); Assert(writer.Prepare());
                HostOverflowSample sample = new HostClipboardOverflowCoordinator(trace).Run(writer, p, new Budget { Port = p, StopAfter = stop }, true);
                if (trace != null) { trace.RecordSample(sample.Code); trace.BeginTail(); }
                bool tail = writer.MatchesPublished(); if (trace != null) trace.EndTail(); bool closed = writer.Stop();
                HostOverflowResult result = HostClipboardOverflowCalibration.Classify(sample, true, tail, closed, true, p.Overflow, 0);
                string actual = string.Join(",", p.Calls);
                if (!enabled) { calls = actual; sampleCode = result.Code; publications = result.Publications; retained = result.RetainedNotifications; }
                else Assert(actual == calls && result.Code == sampleCode && result.Publications == publications && result.RetainedNotifications == retained);
            }
        }
    }

    // budget／通知的first stop不能被之後tail或cleanup覆蓋，正常65輪保持none。
    private static void CoordinatorDiagnosticReasons()
    {
        string[] modes = { "", "", "extra", "repeat_version", "negative_us", "wrong_version", "ordinal", "early_overflow", "null_row", "null_batch" };
        int[] stops = { 100, 17, 100, 100, 100, 100, 100, 100, 100, 100 };
        string[] stages = { "none", "budget", "notice", "version", "notice", "notice", "notice", "notice", "notice", "pending_notice" };
        string[] reasons = { "none", "budget_exhausted", "extra_notice", "version_duplicate", "notice_time_invalid", "notice_version_mismatch", "ordinal_mismatch", "early_overflow", "null_notice", "null_batch" };
        int[] attempts = { 65, 17, 1, 2, 1, 1, 1, 1, 1, 0 };
        for (int i = 0; i < modes.Length; i++)
        {
            Port p = new Port { Mode = modes[i] }; HostOverflowDiagnosticTrace trace = new HostOverflowDiagnosticTrace();
            HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(p, trace); Assert(writer.Prepare());
            HostOverflowSample sample = new HostClipboardOverflowCoordinator(trace).Run(writer, p, new Budget { Port = p, StopAfter = stops[i] }, true);
            trace.RecordSample(sample.Code); trace.BeginTail(); writer.MatchesPublished(); trace.EndTail(); writer.Stop();
            Assert(trace.Snapshot().StopStage == stages[i] && trace.Snapshot().StopReason == reasons[i] && trace.Snapshot().Attempts == attempts[i]);
            if (i == 0) DiagnosticEquals(trace.Snapshot(), "none", "none", 65, "host_observation_overflow", "matched");
        }
        foreach (int invalid in new[] { -1, 801 })
        {
            Port p = new Port(); HostOverflowDiagnosticTrace trace = new HostOverflowDiagnosticTrace(); HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(p, trace); Assert(writer.Prepare());
            new HostClipboardOverflowCoordinator(trace).Run(writer, p, new Budget { Left = invalid }, true);
            Assert(trace.Snapshot().StopStage == "budget" && trace.Snapshot().StopReason == "budget_invalid" && p.Opens == 0 && writer.Stop());
        }
    }

    // 手寫literal只比較公開snapshot，沒有用collector生成expected。
    private static void DiagnosticEquals(HostOverflowDiagnosticSnapshot value, string stage, string reason, int attempts, string code, string tail)
    {
        Assert(value.StopStage == stage && value.StopReason == reason && value.Attempts == attempts && value.SampleCode == code && value.TailProof == tail);
    }

    // 每組獨立執行，RED能顯示實際失敗語意而不以編譯錯誤代替。
    private static void DiagnosticTests()
    {
        Action[] tests = { Partial17CasesKeepPrimaryButSeparateCause, FirstCauseAndAttemptDoNotReset, TailOnlyCapturesExistingCheck, DiagnosticDoesNotAddCalls, CoordinatorDiagnosticReasons };
        string[] names = { "partial17", "first_cause", "tail_evidence", "noninterference", "coordinator_reasons" };
        bool failed = false;
        for (int i = 0; i < tests.Length; i++)
        {
            try { tests[i](); } catch { failed = true; Console.WriteLine("overflow_diagnostic_test_failed,case=" + names[i] + ",windowsNative=false"); }
        }
        Assert(!failed);
    }

    // Windows明列not run；非Windows只驗factory先拒絕，不載Win32。
    private static void NonWindowsFactoryRejectsBeforeNativeStart()
    {
        if (Environment.OSVersion.Platform == PlatformID.Win32NT) { Console.WriteLine("overflow_native_factory_guard_not_run,windowsNative=false"); return; }
        bool rejected = false;
        try { HostClipboardOverflowWindows.StartWindows(); } catch (PlatformNotSupportedException) { rejected = true; }
        Assert(rejected);
        rejected = false;
        try { HostClipboardOverflowWindows.StartWindows(new HostOverflowDiagnosticTrace()); } catch (PlatformNotSupportedException) { rejected = true; }
        Assert(rejected);
    }

    // 僅保存原生oracle定義，不由Main／MJS／CI呼叫，實際執行仍須另授權。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    private static void NativeWriterOracleNotInvoked()
    {
        HostClipboardOverflowWindows writer = HostClipboardOverflowWindows.StartWindows();
        HostObserverNative native = null;
        try
        {
            Assert(writer.Ready); native = new HostObserverNative(); Assert(native.Ready);
            HostOverflowSample sample = new HostClipboardOverflowCoordinator().Run(writer, new HostClipboardOverflowNotices(native), new HostClipboardOverflowBudget(), true);
            Assert(sample.Publications == 65 && sample.RetainedNotifications == 64 && sample.OverflowObserved && sample.First64Verified);
            Assert(writer.MatchesPublished() && !sample.ContentReadAttempted);
        }
        finally
        {
            bool writerClosed = writer.Stop();
            bool listenerClosed = native == null || native.Stop();
            Assert(writerClosed && listenerClosed);
        }
    }

    // 只跑pure策略，任何平台都不啟原生writer。
    private static int Main()
    {
        string stage = "prepare";
        try
        {
            PrepareDoesNotWriteAndPublishesAtMost65();
            stage = "failures"; FailureConsumesSlotAndCleanupSticks();
            stage = "proof"; ProofCannotRecoverOrMutateViaDto();
            stage = "lifetime"; LifetimeLimitSurvivesDrains();
            stage = "contradictions"; ContaminatedOrContradictoryNoticesStopWrites();
            stage = "final_missing"; FinalPublicationWithoutOverflowFails();
            stage = "budget"; OneBudgetAndOneRunCannotReset();
            stage = "classification"; FinalClassificationRejectsLateContradictions();
            stage = "diagnostics"; DiagnosticTests();
            stage = "open_failure_diagnostics"; HostOpenFailureTests.Run();
            stage = "platform_guard"; NonWindowsFactoryRejectsBeforeNativeStart();
            Console.WriteLine("clipboard_overflow_core_observed,windowsNative=false"); return 0;
        }
        catch { Console.WriteLine("clipboard_overflow_core_unavailable,stage=" + stage + ",windowsNative=false"); return 1; }
    }
    // 不輸出未知內容／例外，只由Main固定stage分類。
    private static void Assert(bool condition) { if (!condition) throw new InvalidOperationException(); }
}
