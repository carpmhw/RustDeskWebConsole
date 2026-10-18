using System;
using System.IO;
using System.Reflection;
using System.Threading;

// 測試只替OS port，不替producer與classifier；契約全部手寫literal。
internal static class ReadRaceTests
{
    private sealed class Port : IHostReadRaceClipboardPort
    {
        public string Failure = "";
        public bool Throws, Transferred;
        public bool Owner = true;
        public uint Version = 7;
        public int Prepares, Opens, Empties, Sets, Formats, Closes, Renders, Releases, Frees, Sequences;
        // 固定失敗邊界驗consumer分支，不回預製成功DTO。
        private bool Step(string name) { if (Failure != name) return true; if (Throws) throw new IOException(); return false; }
        // 模擬固定delayed owner準備，不碰Windows。
        public bool PrepareDelayedOwner() { Prepares++; return Step("prepare"); }
        // Open由真producer調度。
        public bool Open() { Opens++; return Step("open"); }
        // 僅記不可還原邊界是否被呼叫。
        public bool Empty() { Empties++; return Step("empty"); }
        // 模擬Set(13,NULL)註冊成功；delayed無資料handle可回。
        public bool RegisterDelayed() { Sets++; return Step("set"); }
        // 模擬格式可用性後驗。
        public bool FormatAvailable() { Formats++; return Step("format"); }
        // 每個成功Open的finally可被查核。
        public bool Close() { Closes++; return Step("close"); }
        // 模擬真正owner查詢例外或失效。
        public bool OwnsClipboard() { if (!Step("owner")) return false; return Owner; }
        // 版本只在child RAM；渲染成功模擬推進為S2。
        public uint Sequence() { Sequences++; if (!Step("sequence")) return 0; return Version; }
        // 模擬渲染時配置／回驗／交付；成功即轉交所有權並推進序號。
        public bool RenderFixedPayload() { Renders++; bool ok = Step("render"); if (ok) { Transferred = true; Version = 8; } return ok; }
        // 真正轉交後不能free，Stop不得重播。
        public bool Release() { Releases++; if (!Transferred) Frees++; return Step("release"); }
    }
    // 固定bytes／padding／真邊界被放寬或用替換字元都會失敗。
    private static void FixedPayloadRequiresPublicTextAndZeroPadding()
    {
        byte[] created = HostReadRacePayload.CreateFixedBytes();
        Assert(created.Length == 32);
        char[] expected = "RdWeb read-race".ToCharArray();
        for (int i = 0; i < expected.Length; i++) Assert(created[i * 2] == (byte)expected[i] && created[i * 2 + 1] == 0);
        Assert(created[30] == 0 && created[31] == 0);
        foreach (int size in new[] { 32, 40, 65536, 65538 })
        {
            byte[] bytes = new byte[size]; Array.Copy(created, bytes, created.Length);
            Assert(HostReadRacePayload.AcceptsSize((ulong)size) && HostReadRacePayload.VerifyFixedBytes(bytes));
        }
        foreach (ulong size in new ulong[] { 0, 2, 30, 31, 33, 65537, 65540, ulong.MaxValue }) Assert(!HostReadRacePayload.AcceptsSize(size));
        byte[] padded = new byte[40]; Array.Copy(created, padded, created.Length); padded[33] = 1;
        byte[] wrongText = new byte[32]; Array.Copy(created, wrongText, 32); wrongText[3] = 65;
        byte[] surrogate = new byte[32]; Array.Copy(created, surrogate, 32); surrogate[31] = 216;
        byte[] invalidContainer = new byte[32]; invalidContainer[1] = 216;
        byte[] truncated = new byte[30]; Array.Copy(created, truncated, 30);
        foreach (byte[] bad in new byte[][] { null, padded, wrongText, surrogate, invalidContainer, truncated }) Assert(!HostReadRacePayload.VerifyFixedBytes(bad));
        byte[] first = HostReadRacePayload.CreateFixedBytes(), second = HostReadRacePayload.CreateFixedBytes();
        first[0] = 0; Assert(second[0] == (byte)'R' && !Object.ReferenceEquals(first, second));
    }
    // Prepare不能註冊或重播；Register故障表一次消耗且每個成功Open恰一次Close。
    private static void PrepareDoesNotRegisterAndConsumesOnce()
    {
        Port port = new Port(); HostClipboardReadRaceProducer producer = new HostClipboardReadRaceProducer(port);
        Assert(producer.Prepare() && !producer.Prepare());
        Assert(port.Prepares == 1 && port.Opens == 0 && port.Empties == 0 && port.Sets == 0 && port.Formats == 0 && port.Renders == 0);
        Assert(!producer.OwnsClipboard() && producer.RenderEvidence().Requests == 0);
        Assert(producer.Stop() && producer.Stop() && port.Releases == 1);
        foreach (string failure in new[] { "open", "empty", "set", "format", "close" })
        foreach (bool throws in new[] { false, true })
        {
            Port table = new Port { Failure = failure, Throws = throws };
            HostClipboardReadRaceProducer candidate = new HostClipboardReadRaceProducer(table); Assert(candidate.Prepare());
            HostReadRaceRegistration value = candidate.Register();
            Assert(value.Code != "host_observed" && value.Registered == (failure == "close") && value.RegistrationVersion == 0);
            Assert(value.OpenClosed == (failure != "open" && failure != "close"));
            Assert(!candidate.OwnsClipboard() && !candidate.Register().Registered);
            Assert(table.Opens == 1 && table.Empties == (failure == "open" ? 0 : 1));
            Assert(table.Sets == (failure == "open" || failure == "empty" ? 0 : 1) && table.Formats == (failure == "open" || failure == "empty" || failure == "set" ? 0 : 1));
            Assert(table.Closes == (failure == "open" ? 0 : 1));
            bool stopped = candidate.Stop(); Assert(stopped == (failure != "close") && candidate.Stop() == stopped && table.Releases == 1);
            Assert(table.Frees == (table.Transferred ? 0 : 1));
        }
    }
    // metadata失效不能被之後的恢復補票，DTO不能改內部所有權。
    private static void RegistrationAndOwnershipFailuresStaySticky()
    {
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port(); HostClipboardReadRaceProducer producer = new HostClipboardReadRaceProducer(port);
            Assert(producer.Prepare()); HostReadRaceRegistration value = producer.Register();
            Assert(value.Registered && value.OpenClosed && value.Code == "host_observed" && value.RegistrationVersion == 7);
            value.Registered = false; value.Code = "Unknown public code";
            Assert(producer.OwnsClipboard());
            if (throws) { port.Failure = "owner"; port.Throws = true; } else port.Owner = false;
            Assert(!producer.OwnsClipboard());
            port.Owner = true; port.Failure = ""; port.Throws = false;
            Assert(!producer.OwnsClipboard() && producer.Stop() && port.Releases == 1);
        }
        foreach (string failure in new[] { "owner", "sequence", "owner_throw", "sequence_throw" })
        {
            Port port = new Port { Failure = failure.StartsWith("owner") ? "owner" : "sequence", Throws = failure.EndsWith("throw") };
            HostClipboardReadRaceProducer producer = new HostClipboardReadRaceProducer(port);
            Assert(producer.Prepare()); HostReadRaceRegistration value = producer.Register();
            Assert(value.Registered && value.OpenClosed && value.Code != "host_observed" && value.RegistrationVersion == 0);
            Assert(!producer.OwnsClipboard());
            port.Owner = true; port.Version = 7; port.Failure = ""; port.Throws = false;
            Assert(!producer.OwnsClipboard() && !producer.Register().Registered && port.Opens == 1 && producer.Stop() && port.Releases == 1);
        }
    }
    // Stop／Prepare失敗sticky，真外來thread不能觸port或消耗owner gate。
    private static void StopIsStickyAndCrossThreadDoesNotTouchPort()
    {
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port { Failure = "release", Throws = throws };
            HostClipboardReadRaceProducer producer = new HostClipboardReadRaceProducer(port);
            Assert(producer.Prepare() && !producer.Stop() && !producer.Stop() && port.Releases == 1);
            Assert(!producer.Prepare() && !producer.Register().Registered);
            Port failed = new Port { Failure = "prepare", Throws = throws }; producer = new HostClipboardReadRaceProducer(failed);
            Assert(!producer.Prepare() && !producer.Prepare() && !producer.Register().Registered && failed.Prepares == 1 && failed.Opens == 0 && producer.Stop());
        }
        Port owned = new Port(); bool denied = false;
        HostClipboardReadRaceProducer same = new HostClipboardReadRaceProducer(owned);
        // managed thread只驗策略，絕不建立原生window。
        Thread thread = new Thread(delegate() { denied = !same.Prepare() && !same.Register().Registered && !same.OwnsClipboard() && same.RenderEvidence().Requests == 0 && !same.Stop(); same.Render(); });
        thread.Start(); Assert(thread.Join(1000));
        Assert(denied && same.RenderEvidence().Requests == 0 && owned.Prepares == 0 && owned.Opens == 0 && owned.Releases == 0 && owned.Sequences == 0 && same.Prepare() && same.Stop());
    }
    // 渲染once僅第一筆交付，Advanced於查詢時判定且Sequence例外不得成功。
    private static void RenderConsumesOnceAndAdvancedIsCheckedAtQuery()
    {
        Port port = new Port(); HostClipboardReadRaceProducer producer = new HostClipboardReadRaceProducer(port);
        Assert(producer.Prepare()); Assert(producer.Register().Code == "host_observed");
        HostReadRaceRenderEvidence before = producer.RenderEvidence();
        Assert(before.Requests == 0 && !before.Delivered && !before.Advanced && !before.Failed);
        producer.Render();
        HostReadRaceRenderEvidence first = producer.RenderEvidence();
        Assert(first.Requests == 1 && first.Delivered && first.Advanced && !first.Failed && port.Renders == 1 && port.Transferred);
        producer.Render();
        HostReadRaceRenderEvidence second = producer.RenderEvidence();
        Assert(second.Requests == 2 && second.Delivered && !second.Failed && port.Renders == 1);
        port.Version = 7;
        HostReadRaceRenderEvidence unchanged = producer.RenderEvidence();
        Assert(unchanged.Requests == 2 && unchanged.Delivered && !unchanged.Advanced && !unchanged.Failed);
        port.Failure = "sequence"; port.Throws = true;
        HostReadRaceRenderEvidence thrown = producer.RenderEvidence();
        Assert(thrown.Requests == 2 && thrown.Delivered && thrown.Failed);
        port.Failure = ""; port.Throws = false;
        Assert(producer.Stop() && port.Frees == 0 && port.Releases == 1);
        // Stop後仍見同一交付且不再渲染。
        HostReadRaceRenderEvidence afterStop = producer.RenderEvidence();
        Assert(afterStop.Requests == 2 && afterStop.Delivered && port.Renders == 1);
        Port refused = new Port { Failure = "render" };
        producer = new HostClipboardReadRaceProducer(refused);
        Assert(producer.Prepare()); Assert(producer.Register().Code == "host_observed");
        producer.Render();
        HostReadRaceRenderEvidence failed = producer.RenderEvidence();
        Assert(failed.Requests == 1 && !failed.Delivered && failed.Failed && refused.Renders == 1 && !refused.Transferred);
        Assert(producer.Stop() && refused.Frees == 1 && refused.Releases == 1);
    }
    // 完整證據每項獨立缺失均拒絕，不鏡像classifier邏輯。
    private static void ReadRaceEvidenceRejectsEveryMissingProof()
    {
        foreach (string mutation in new[] { "valid", "null_registration", "registered", "open_closed", "registration_version", "registration_code", "null_render", "render_requests0", "render_requests2", "render_delivered", "render_advanced", "render_failed", "null_reader", "reader_code", "reader_observed", "unknown_code", "text", "stable", "version0", "version_other", "owner_null", "owner_true", "reader_close", "scope", "owner", "overflow" })
        {
            HostReadRaceRegistration registration = new HostReadRaceRegistration { Registered = true, OpenClosed = true, RegistrationVersion = 7, Code = "host_observed" };
            HostReadRaceRenderEvidence render = new HostReadRaceRenderEvidence { Requests = 1, Delivered = true, Advanced = true, Failed = false };
            HostClipboardValue reader = new HostClipboardValue { Text = null, Code = "host_clipboard_unstable", Stable = false, Version = 7, OwnerMatches = false, ResourcesClosed = true };
            bool scope = true, owner = true, overflow = false;
            switch (mutation)
            {
                case "null_registration": registration = null; break;
                case "registered": registration.Registered = false; break;
                case "open_closed": registration.OpenClosed = false; break;
                case "registration_version": registration.RegistrationVersion = 0; break;
                case "registration_code": registration.Code = "Unknown public code"; break;
                case "null_render": render = null; break;
                case "render_requests0": render.Requests = 0; break;
                case "render_requests2": render.Requests = 2; break;
                case "render_delivered": render.Delivered = false; break;
                case "render_advanced": render.Advanced = false; break;
                case "render_failed": render.Failed = true; break;
                case "null_reader": reader = null; break;
                case "reader_code": reader.Code = "host_clipboard_busy"; break;
                case "reader_observed": reader.Code = "host_observed"; break;
                case "unknown_code": reader.Code = "Unknown public code"; break;
                case "text": reader.Text = "Public metadata"; break;
                case "stable": reader.Stable = true; break;
                case "version0": reader.Version = 0; break;
                case "version_other": reader.Version = 8; break;
                case "owner_null": reader.OwnerMatches = null; break;
                case "owner_true": reader.OwnerMatches = true; break;
                case "reader_close": reader.ResourcesClosed = false; break;
                case "scope": scope = false; break;
                case "owner": owner = false; break;
                case "overflow": overflow = true; break;
            }
            HostClipboardReadRaceResult result = HostClipboardReadRaceCalibration.Classify(registration, render, reader, scope, owner, overflow);
            Assert(result.ReaderRejected == (mutation == "valid") && result.TextReturned == (mutation == "text") && result.Code != "Unknown public code");
            if (mutation == "valid") Assert(result.Code == "host_clipboard_unstable" && result.RegistrationVerified && result.RenderVerified && result.ReadResourcesClosed && !result.Overflow);
        }
        string[] fields = { "ScopeVerified", "RegistrationVerified", "RenderVerified", "OwnerVersionMatched", "ReaderRejected", "TextReturned", "ReadResourcesClosed", "Overflow", "Code" };
        FieldInfo[] actual = typeof(HostClipboardReadRaceResult).GetFields(BindingFlags.Instance | BindingFlags.Public);
        Assert(actual.Length == fields.Length); foreach (FieldInfo field in actual) Assert(Array.IndexOf(fields, field.Name) >= 0);
    }
    // 固定安全斷言，不輸出fixture或未知例外。
    private static void Assert(bool value) { if (!value) throw new InvalidOperationException(); }
    // factory在非Windows必須於所有native／thread前拒絕；Windows不為此guard啟動owner。
    private static void NonWindowsFactoryRejectsBeforeNative()
    {
        if (Environment.OSVersion.Platform == PlatformID.Win32NT) { Console.WriteLine("read_race_native_factory_guard_not_run,windowsNative=false"); return; }
        bool rejected = false;
        try { HostClipboardReadRaceWindows.StartWindows(); } catch (PlatformNotSupportedException) { rejected = true; }
        Assert(rejected);
    }
    // 僅保存原生oracle定義，不由Main／CI呼叫；實際註冊與渲染需另取授權。
    private static void NativeWriterOracleNotInvoked()
    {
        HostClipboardReadRaceWindows fixture = HostClipboardReadRaceWindows.StartWindows();
        try
        {
            Assert(fixture.Ready);
            HostReadRaceRegistration registration = fixture.Register();
            Assert(registration.Registered && registration.OpenClosed && registration.RegistrationVersion != 0);
            Assert(fixture.OwnsClipboard() && !fixture.Register().Registered);
            // 渲染須真requester的GetClipboardData觸發，oracle不自行Post假要求。
            HostReadRaceRenderEvidence evidence = fixture.RenderEvidence();
            Assert(evidence.Requests == 0 && !evidence.Delivered && !evidence.Advanced);
        }
        finally { Assert(fixture.Stop()); }
    }
    // 此Main只跑pure／port，沒有native writer入口。
    private static int Main()
    {
        string stage = "payload";
        try
        {
            FixedPayloadRequiresPublicTextAndZeroPadding(); stage = "prepare";
            PrepareDoesNotRegisterAndConsumesOnce(); stage = "registration";
            RegistrationAndOwnershipFailuresStaySticky(); stage = "stop";
            StopIsStickyAndCrossThreadDoesNotTouchPort(); stage = "render";
            RenderConsumesOnceAndAdvancedIsCheckedAtQuery(); stage = "evidence";
            ReadRaceEvidenceRejectsEveryMissingProof(); stage = "platform_guard";
            NonWindowsFactoryRejectsBeforeNative();
            Console.WriteLine("clipboard_read_race_core_observed,windowsNative=false"); return 0;
        }
        catch { Console.WriteLine("clipboard_read_race_core_unavailable,stage=" + stage + ",windowsNative=false"); return 1; }
    }
}
