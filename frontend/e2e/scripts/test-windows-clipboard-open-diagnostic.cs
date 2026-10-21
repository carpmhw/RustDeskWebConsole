using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

// 只替換Win32 Open／error／opener邊界；collector、capture、producer與coordinator執行真策略。
internal static class HostOpenFailureTests
{
    private sealed class NativePort : IHostOpenFailureNativePort
    {
        public int FailAt = int.MaxValue, OpenErrorBits = 5, ErrorBits, QueryErrorBits = 1400;
        public bool ClearThrows, OpenThrows, QueryThrows, ErrorAvailable = true;
        public IntPtr QueryValue = new IntPtr(45);
        public ManualResetEvent QueryEntered, QueryGate;
        public readonly List<string> Calls = new List<string>();
        public int Clears, Opens, Queries, LegacyOpens;

        // default路徑只記錄舊Open，不查新診斷metadata。
        public bool OpenLegacy(IntPtr window)
        {
            Calls.Add("legacy"); LegacyOpens++; return true;
        }

        // 只替換既有SetLastError(0)結果，不模擬clipboard狀態。
        public void ClearError()
        {
            Calls.Add("clear"); Clears++;
            if (ClearThrows) throw new InvalidOperationException();
            ErrorBits = 0;
        }

        // 逐次提供手寫OS BOOL；cached error只在失敗且caller信任時返回。
        public bool OpenAndCapture(IntPtr window, bool trustError, out bool errorAvailable, out int errorBits)
        {
            Calls.Add(trustError ? "open_trusted" : "open_untrusted"); Opens++;
            errorAvailable = false; errorBits = 0;
            if (OpenThrows) throw new InvalidOperationException();
            bool succeeded = Opens != FailAt;
            if (!succeeded) ErrorBits = OpenErrorBits;
            if (!succeeded && trustError && ErrorAvailable) { errorAvailable = true; errorBits = ErrorBits; }
            return succeeded;
        }

        // query只回固定window關係，並模擬其native呼叫可能覆蓋thread last-error。
        public IntPtr QueryOpenWindow()
        {
            Calls.Add("query"); Queries++; ErrorBits = QueryErrorBits;
            if (QueryEntered != null) QueryEntered.Set();
            if (QueryGate != null && !QueryGate.WaitOne(2000)) throw new InvalidOperationException();
            if (QueryThrows) throw new InvalidOperationException();
            return QueryValue;
        }
    }

    private sealed class Budget : IHostOverflowBudget
    {
        // 假clock固定維持原800ms界線，不引入真實等待。
        public int RemainingMilliseconds() { return 800; }
        // 通知fixture立即交付，正常測試不需讓出thread。
        public void Yield() { }
    }

    // 以白名單literal檢查副本，不讓collector自行產生預期值。
    private static void AssertSnapshot(HostOpenFailureSnapshot value, string state, string error, string opener)
    {
        Assert(value != null && value.State == state && value.ErrorClass == error && value.OpenerSnapshot == opener);
    }

    // 未啟用capture時保留舊Open路徑，不清error或查opener。
    private static void DefaultDispatchNeverCaptures()
    {
        NativePort native = new NativePort();
        Assert(HostOpenFailureCapture.Dispatch(native, new IntPtr(44), null));
        Assert(native.LegacyOpens == 1 && native.Clears == 0 && native.Opens == 0 && native.Queries == 0);
        Assert(string.Join(",", native.Calls.ToArray()) == "legacy");
    }

    // 手寫錯誤碼與關係literal釘住分類，不輸出原始OS數值。
    private static void ErrorAndRelationLiterals()
    {
        int[] bits = { 5, 1400, 0, 6, -1, int.MinValue };
        string[] classes = { "access_denied", "invalid_window_handle", "zero_indeterminate", "other_nonzero", "other_nonzero", "other_nonzero" };
        IntPtr[] windows = { new IntPtr(45), new IntPtr(44), IntPtr.Zero, new IntPtr(45), new IntPtr(45), new IntPtr(45) };
        string[] openers = { "other_window_seen", "self_window_seen", "null_indeterminate", "other_window_seen", "other_window_seen", "other_window_seen" };
        for (int index = 0; index < bits.Length; index++)
        {
            try
            {
                HostOpenFailureCollector collector = new HostOpenFailureCollector();
                HostOpenFailureCapture capture = new HostOpenFailureCapture(collector);
                NativePort native = new NativePort { FailAt = 1, OpenErrorBits = bits[index], QueryValue = windows[index] };
                Assert(!capture.OpenSlot(native, new IntPtr(44)));
                AssertSnapshot(collector.SealAndSnapshot(), "captured", classes[index], openers[index]);
                Assert(string.Join(",", native.Calls.ToArray()) == "clear,open_trusted,query");
            }
            catch { Console.WriteLine("open_failure_literal_unavailable,index=" + index + ",windowsNative=false"); throw; }
        }
        NativePort queryFailure = new NativePort { FailAt = 1, QueryThrows = true, OpenErrorBits = 5 };
        HostOpenFailureCollector partialCollector = new HostOpenFailureCollector();
        Assert(!new HostOpenFailureCapture(partialCollector).OpenSlot(queryFailure, new IntPtr(44)));
        AssertSnapshot(partialCollector.SealAndSnapshot(), "partial", "access_denied", "query_unavailable");
        Assert(queryFailure.Opens == 1 && queryFailure.Queries == 1);
        NativePort noError = new NativePort { FailAt = 1, ErrorAvailable = false, QueryValue = IntPtr.Zero };
        HostOpenFailureCollector noErrorCollector = new HostOpenFailureCollector();
        Assert(!new HostOpenFailureCapture(noErrorCollector).OpenSlot(noError, new IntPtr(44)));
        AssertSnapshot(noErrorCollector.SealAndSnapshot(), "partial", "capture_unavailable", "null_indeterminate");
        HostOpenFailureCollector invalidPair = new HostOpenFailureCollector(); Assert(invalidPair.BindWriter());
        invalidPair.BeginAttempt(); invalidPair.Complete("Public unknown", "other_window_seen");
        AssertSnapshot(invalidPair.SealAndSnapshot(), "unavailable", "capture_unavailable", "query_unavailable");
    }

    // 第一native失敗與三欄資料契約sticky，副本不暴露其他metadata。
    private static void CollectorLatchesFirstFailureAndOnlyThreeFields()
    {
        HostOpenFailureCollector collector = new HostOpenFailureCollector(); Assert(collector.BindWriter());
        collector.BeginAttempt(); collector.Complete("access_denied", "other_window_seen");
        collector.BeginAttempt(); collector.Complete("invalid_window_handle", "self_window_seen"); collector.Success(); collector.Unavailable();
        HostOpenFailureSnapshot snapshot = collector.SealAndSnapshot();
        AssertSnapshot(snapshot, "captured", "access_denied", "other_window_seen");
        System.Reflection.FieldInfo[] fields = typeof(HostOpenFailureSnapshot).GetFields();
        Assert(fields.Length == 3);
        Assert(typeof(HostOpenFailureSnapshot).GetField("State") != null && typeof(HostOpenFailureSnapshot).GetField("ErrorClass") != null && typeof(HostOpenFailureSnapshot).GetField("OpenerSnapshot") != null);
    }

    // query會改寫fake last-error時，capture仍使用OpenAndCapture立即保存的local。
    private static void ClearFailureAndQueryCannotForgeError()
    {
        NativePort native = new NativePort { FailAt = 1, ClearThrows = true, OpenErrorBits = 5, QueryErrorBits = 1400, QueryValue = new IntPtr(45) };
        HostOpenFailureCollector collector = new HostOpenFailureCollector();
        Assert(!new HostOpenFailureCapture(collector).OpenSlot(native, new IntPtr(44)));
        AssertSnapshot(collector.SealAndSnapshot(), "partial", "capture_unavailable", "other_window_seen");
        Assert(string.Join(",", native.Calls.ToArray()) == "clear,open_untrusted,query");
    }

    // 診斷清零或query失敗不可改變真producer看到的BOOL與finally Close。
    private static void MetadataFailurePreservesOpenAndCleanup()
    {
        NativePort succeeds = new NativePort { ClearThrows = true };
        HostOpenFailureCollector successCollector = new HostOpenFailureCollector();
        HostOpenFailureCapture successCapture = new HostOpenFailureCapture(successCollector);
        OverflowCoreTests.Port successPort = new OverflowCoreTests.Port { OpenOverride = delegate { return successCapture.OpenSlot(succeeds, new IntPtr(44)); } };
        HostClipboardOverflowProducer successfulWriter = new HostClipboardOverflowProducer(successPort);
        Assert(successfulWriter.Prepare());
        HostOverflowPublication published = successfulWriter.PublishNext();
        Assert(published.Published && published.WriterOpenClosed && successPort.Closes == 1 && successPort.Sets == 1);
        AssertSnapshot(successCollector.SealAndSnapshot(), "not_applicable", "not_captured", "not_queried");
        Assert(successfulWriter.Stop());

        NativePort fails = new NativePort { FailAt = 1, QueryThrows = true };
        HostOpenFailureCapture failureCapture = new HostOpenFailureCapture(new HostOpenFailureCollector());
        OverflowCoreTests.Port failurePort = new OverflowCoreTests.Port { OpenOverride = delegate { return failureCapture.OpenSlot(fails, new IntPtr(44)); } };
        HostClipboardOverflowProducer failedWriter = new HostClipboardOverflowProducer(failurePort);
        Assert(failedWriter.Prepare());
        HostOverflowPublication failed = failedWriter.PublishNext();
        Assert(!failed.Published && failed.Code == "host_capability_unavailable" && failurePort.Closes == 0 && failurePort.Sets == 0 && fails.Opens == 1 && fails.Queries == 1);
        Assert(failedWriter.Stop());

        NativePort throwsOpen = new NativePort { OpenThrows = true };
        HostOpenFailureCollector thrownCollector = new HostOpenFailureCollector();
        HostOpenFailureCapture thrownCapture = new HostOpenFailureCapture(thrownCollector);
        bool originalExceptionPreserved = false;
        try { thrownCapture.OpenSlot(throwsOpen, new IntPtr(44)); } catch (InvalidOperationException) { originalExceptionPreserved = true; }
        Assert(originalExceptionPreserved && throwsOpen.Opens == 1 && throwsOpen.Queries == 0);
        AssertSnapshot(thrownCollector.SealAndSnapshot(), "unavailable", "capture_unavailable", "query_unavailable");
    }

    // 主執行緒封存pending副本後，慢query的晚到結果不能改寫已交付snapshot。
    private static void SealedPendingCannotAcceptLateResult()
    {
        using (ManualResetEvent entered = new ManualResetEvent(false))
        using (ManualResetEvent release = new ManualResetEvent(false))
        {
            HostOpenFailureCollector collector = new HostOpenFailureCollector();
            NativePort native = new NativePort { FailAt = 1, QueryEntered = entered, QueryGate = release };
            bool result = true;
            Thread writer = new Thread(delegate() { result = new HostOpenFailureCapture(collector).OpenSlot(native, new IntPtr(44)); });
            writer.Start();
            Assert(entered.WaitOne(2000));
            AssertSnapshot(collector.SealAndSnapshot(), "pending", "not_captured", "not_queried");
            release.Set(); Assert(writer.Join(2000) && !result);
            AssertSnapshot(collector.SealAndSnapshot(), "pending", "not_captured", "not_queried");
            Assert(native.Clears == 1 && native.Opens == 1 && native.Queries == 1);
        }
    }

    // 同一capture可連續成功到下一slot，首個false後後續呼叫零native副作用。
    private static void SuccessfulOpensCanContinueButFailureIsSticky()
    {
        NativePort native = new NativePort { FailAt = 3 };
        HostOpenFailureCollector collector = new HostOpenFailureCollector();
        HostOpenFailureCapture capture = new HostOpenFailureCapture(collector);
        bool foreignResult = true; HostOpenFailureSnapshot foreignSnapshot = new HostOpenFailureSnapshot();
        Thread foreign = new Thread(delegate() { foreignResult = capture.OpenSlot(native, new IntPtr(44)); foreignSnapshot = collector.SealAndSnapshot(); });
        foreign.Start(); Assert(foreign.Join(1000));
        Assert(!foreignResult && foreignSnapshot == null && native.Calls.Count == 0);
        Assert(capture.OpenSlot(native, new IntPtr(44)));
        Assert(capture.OpenSlot(native, new IntPtr(44)));
        Assert(!capture.OpenSlot(native, new IntPtr(44)));
        int callsAfterFailure = native.Calls.Count;
        Assert(!capture.OpenSlot(native, new IntPtr(44)) && native.Calls.Count == callsAfterFailure);
        Assert(native.Clears == 3 && native.Opens == 3 && native.Queries == 1);
        AssertSnapshot(collector.SealAndSnapshot(), "captured", "access_denied", "other_window_seen");
    }

    // 假listener僅交metadata；在第20次Open失敗仍以真coordinator／Classify保留原primary。
    private static void Partial19KeepsOverflowPrimary()
    {
        NativePort native = new NativePort { FailAt = 20, OpenErrorBits = 5, QueryValue = new IntPtr(45) };
        HostOpenFailureCollector openDiagnostic = new HostOpenFailureCollector();
        HostOpenFailureCapture capture = new HostOpenFailureCapture(openDiagnostic);
        HostOverflowDiagnosticTrace diagnostic = new HostOverflowDiagnosticTrace();
        OverflowCoreTests.Port port = new OverflowCoreTests.Port { OpenOverride = delegate { return capture.OpenSlot(native, new IntPtr(44)); } };
        HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(port, diagnostic); Assert(writer.Prepare());
        HostOverflowSample sample = new HostClipboardOverflowCoordinator(diagnostic).Run(writer, port, new Budget(), true);
        diagnostic.RecordSample(sample.Code); diagnostic.BeginTail(); bool tail = writer.MatchesPublished(); diagnostic.EndTail();
        bool writerClosed = writer.Stop();
        HostOverflowResult primary = HostClipboardOverflowCalibration.Classify(sample, true, tail, writerClosed, true, false, 0);
        Assert(sample.Publications == 19 && sample.RetainedNotifications == 19 && sample.Code == "host_capability_unavailable");
        Assert(!sample.ProducerCompleted && !sample.First64Verified && !sample.OverflowObserved && !tail);
        Assert(primary.Code == "host_clipboard_unstable" && primary.ResourcesClosed && port.Closes == 19 && port.Sets == 19);
        Assert(diagnostic.Snapshot().StopStage == "open" && diagnostic.Snapshot().StopReason == "returned_false" && diagnostic.Snapshot().Attempts == 20 && diagnostic.Snapshot().TailProof == "blocked_prior_failure");
        AssertSnapshot(openDiagnostic.SealAndSnapshot(), "captured", "access_denied", "other_window_seen");
        Assert(native.Clears == 20 && native.Opens == 20 && native.Queries == 1 && writerClosed);
    }

    // 成功65輪時仍沿原通知overflow策略，診斷不讀error或opener。
    private static void Healthy65NeverQueriesMetadata()
    {
        NativePort native = new NativePort();
        HostOpenFailureCollector collector = new HostOpenFailureCollector();
        HostOpenFailureCapture capture = new HostOpenFailureCapture(collector);
        OverflowCoreTests.Port port = new OverflowCoreTests.Port { OpenOverride = delegate { return capture.OpenSlot(native, new IntPtr(44)); } };
        HostClipboardOverflowProducer writer = new HostClipboardOverflowProducer(port); Assert(writer.Prepare());
        HostOverflowSample sample = new HostClipboardOverflowCoordinator().Run(writer, port, new Budget(), true);
        bool stopped = writer.Stop();
        Assert(sample.Publications == 65 && sample.RetainedNotifications == 64 && sample.First64Verified && sample.OverflowObserved && sample.Code == "host_observation_overflow");
        Assert(stopped && native.Clears == 65 && native.Opens == 65 && native.Queries == 0);
        AssertSnapshot(collector.SealAndSnapshot(), "not_applicable", "not_captured", "not_queried");
    }

    // 新factory在非Windows必先拒絕，不建立events／thread或呼Win32。
    private static void OptionalFactoryRejectsBeforeNativeStart()
    {
        if (Environment.OSVersion.Platform == PlatformID.Win32NT) return;
        Type[] parameters = { typeof(HostOverflowDiagnosticTrace), typeof(HostOpenFailureCollector) };
        MethodInfo factory = typeof(HostClipboardOverflowWindows).GetMethod("StartWindows", BindingFlags.Public | BindingFlags.Static, null, parameters, null);
        Assert(factory != null);
        bool rejected = false;
        try { factory.Invoke(null, new object[] { null, new HostOpenFailureCollector() }); }
        catch (TargetInvocationException exception) { rejected = exception.InnerException is PlatformNotSupportedException; }
        Assert(rejected);
    }

    // 舊default Open與新SetLastError宣告必須共用ABI且只有新宣告快取error。
    private static void InteropBindingsKeepDistinctErrorContract()
    {
        Type nativeOwner = typeof(HostClipboardOverflowWindows);
        BindingFlags flags = BindingFlags.NonPublic | BindingFlags.Static;
        MethodInfo legacy = nativeOwner.GetMethod("OpenClipboard", flags);
        MethodInfo captured = nativeOwner.GetMethod("OpenClipboardWithError", flags);
        MethodInfo opener = nativeOwner.GetMethod("GetOpenClipboardWindow", flags);
        Assert(legacy != null && captured != null && opener != null);
        DllImportAttribute legacyImport = legacy.GetCustomAttribute<DllImportAttribute>();
        DllImportAttribute capturedImport = captured.GetCustomAttribute<DllImportAttribute>();
        DllImportAttribute openerImport = opener.GetCustomAttribute<DllImportAttribute>();
        Assert(legacyImport != null && capturedImport != null && openerImport != null);
        Assert(legacyImport.Value == "user32.dll" && capturedImport.Value == "user32.dll" && openerImport.Value == "user32.dll");
        Assert((legacyImport.EntryPoint ?? legacy.Name) == "OpenClipboard" && capturedImport.EntryPoint == "OpenClipboard");
        Assert(legacy.ReturnType == typeof(bool) && captured.ReturnType == legacy.ReturnType && capturedImport.ExactSpelling && !legacyImport.SetLastError && capturedImport.SetLastError);
        ParameterInfo[] oldParameters = legacy.GetParameters(), newParameters = captured.GetParameters();
        Assert(oldParameters.Length == 1 && newParameters.Length == 1 && oldParameters[0].ParameterType == typeof(IntPtr) && newParameters[0].ParameterType == oldParameters[0].ParameterType);
        Assert(opener.ReturnType == typeof(IntPtr) && !openerImport.SetLastError);
    }

    // 依固定名稱分類各個真策略案例，失敗不輸出例外或輸入原文。
    public static void Run()
    {
        Action[] tests = { DefaultDispatchNeverCaptures, ErrorAndRelationLiterals, CollectorLatchesFirstFailureAndOnlyThreeFields, ClearFailureAndQueryCannotForgeError, MetadataFailurePreservesOpenAndCleanup, SealedPendingCannotAcceptLateResult, SuccessfulOpensCanContinueButFailureIsSticky, Partial19KeepsOverflowPrimary, Healthy65NeverQueriesMetadata, OptionalFactoryRejectsBeforeNativeStart, InteropBindingsKeepDistinctErrorContract };
        string[] names = { "default_dispatch", "error_relation", "collector_sticky", "clear_query", "open_cleanup", "sealed_pending", "sticky_failure", "partial19", "healthy65", "factory_guard", "interop_bindings" };
        bool failed = false;
        for (int index = 0; index < tests.Length; index++)
        {
            try { tests[index](); }
            catch { failed = true; Console.WriteLine("open_failure_case_unavailable,case=" + names[index] + ",windowsNative=false"); }
        }
        if (failed) throw new InvalidOperationException();
    }

    // 只以具名literal行為斷言，永不輸出原始OS錯誤或native handle。
    private static void Assert(bool condition) { if (!condition) throw new InvalidOperationException(); }
}
