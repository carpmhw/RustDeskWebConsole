using System;
using System.IO;
using System.Reflection;
using System.Threading;

// 測試只替OS port，不替producer／原decoder，所有fixture均公開。
internal static class InvalidUtf16Tests
{
    private sealed class Port : IHostInvalidUtf16ClipboardPort
    {
        public string Failure = "";
        public bool Throws, Transferred;
        public bool Owner = true;
        public uint Version = 7;
        public int Prepares, Opens, Empties, Sets, Closes, Releases, Frees;
        // 固定失敗邊界驗consumer分支，不回預製成功DTO。
        private bool Step(string name) { if (Failure != name) return true; if (Throws) throw new IOException(); return false; }
        // 模擬固定自有配置，不碰Windows。
        public bool PrepareFixedContainer() { Prepares++; return Step("prepare"); }
        // Open由真producer調度。
        public bool Open() { Opens++; return Step("open"); }
        // 僅記不可還原邊界是否被呼叫。
        public bool Empty() { Empties++; return Step("empty"); }
        // 模擬Set成功即轉交所有權。
        public bool PublishFixedContainer() { Sets++; bool ok = Step("set"); if (ok) Transferred = true; return ok; }
        // 每個成功Open的finally可被查核。
        public bool Close() { Closes++; return Step("close"); }
        // 模擬真正owner查詢例外或失效。
        public bool OwnsClipboard() { if (!Step("owner")) return false; return Owner; }
        // 只比較同一版本，不作排序。
        public uint Sequence() { if (!Step("sequence")) return 0; return Version; }
        // 真正轉交後不能free，Stop不得重播。
        public bool Release() { Releases++; if (!Transferred) Frees++; return Step("release"); }
    }
    private sealed class ReadPort : IHostClipboardAccess
    {
        public byte[] Bytes;
        public string Failure = "";
        public int Reads, Closes;
        // fixture保持由手寫literal供應，不由受測builder生成。
        public ReadPort(byte[] bytes) { Bytes = bytes; }
        // 固定同版本以驗真正decoder分支。
        public uint Sequence() { return 7; }
        // busy不可偽裝invalid。
        public bool Open() { return Failure != "busy"; }
        // 只供CF_UNICODETEXT。
        public bool HasUnicode() { return Failure != "format"; }
        // 大小與實際fixture一致。
        public ulong ContainerSize() { return (ulong)Bytes.Length; }
        // 計數只發生在consumer真要求複製時。
        public byte[] ReadContainer(int count) { Reads++; Assert(count == Bytes.Length); if (Failure == "throw") throw new IOException(); return Failure == "null" ? null : Bytes; }
        // decoder拒絕前不應取owner。
        public bool? OwnerMatches(int pid) { return null; }
        // 真Close false／throw不能正常收尾。
        public bool Close() { Closes++; if (Failure == "close_throw") throw new IOException(); return Failure != "close"; }
    }
    // 固定bytes／padding／真邊界被放寬或用替換字元都會失敗。
    private static void FixedBufferRequiresUnpairedHighSurrogateAndZeroPadding()
    {
        foreach (int size in new[] { 4, 8, 65538 })
        {
            byte[] bytes = new byte[size]; bytes[1] = 216;
            Assert(HostInvalidUtf16Buffer.AcceptsSize((ulong)size) && HostInvalidUtf16Buffer.VerifyFixedBytes(bytes));
        }
        foreach (ulong size in new ulong[] { 0, 2, 3, 65539, 65540, ulong.MaxValue }) Assert(!HostInvalidUtf16Buffer.AcceptsSize(size));
        foreach (byte[] bad in new byte[][] { null, new byte[3], new byte[] { 65, 0, 0, 0 }, new byte[] { 253, 255, 0, 0 }, new byte[] { 0, 216, 0, 220, 0, 0 }, new byte[] { 0, 216, 1, 0 }, new byte[] { 0, 216, 0, 0, 1, 0 } }) Assert(!HostInvalidUtf16Buffer.VerifyFixedBytes(bad));
        byte[] first = HostInvalidUtf16Buffer.CreateFixedBytes(), second = HostInvalidUtf16Buffer.CreateFixedBytes();
        Assert(first.Length == 4 && first[0] == 0 && first[1] == 216 && first[2] == 0 && first[3] == 0);
        first[1] = 0; Assert(second[1] == 216 && !Object.ReferenceEquals(first, second));
    }
    // Prepare不能發布或重播，正常Stop只一次Release。
    private static void PrepareDoesNotPublish()
    {
        Port port = new Port(); HostClipboardInvalidUtf16Producer producer = new HostClipboardInvalidUtf16Producer(port);
        Assert(producer.Prepare() && !producer.Prepare());
        Assert(port.Prepares == 1 && port.Opens == 0 && port.Empties == 0 && port.Sets == 0);
        Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
        Assert(producer.Stop() && producer.Stop() && port.Releases == 1);
    }
    // 移除once gate、漏finally或錯判Set所有權都會被故障表抓到。
    private static void PublishConsumesOnceBeforeFailure()
    {
        foreach (string failure in new[] { "open", "empty", "set", "close" })
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port { Failure = failure, Throws = throws };
            HostClipboardInvalidUtf16Producer producer = new HostClipboardInvalidUtf16Producer(port); Assert(producer.Prepare());
            HostInvalidUtf16Publication value = producer.Publish();
            Assert(value.Code != "host_observed" && value.Published == (failure == "close"));
            Assert(value.WriterOpenClosed == (failure != "open" && failure != "close"));
            Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0 && !producer.Publish().Published);
            Assert(port.Opens == 1 && port.Empties == (failure == "open" ? 0 : 1));
            Assert(port.Sets == (failure == "open" || failure == "empty" ? 0 : 1) && port.Closes == (failure == "open" ? 0 : 1));
            bool stopped = producer.Stop(); Assert(stopped == (failure != "close") && producer.Stop() == stopped && port.Releases == 1);
            Assert(port.Frees == (port.Transferred ? 0 : 1));
        }
    }
    // metadata失效不能被之後的恢復補票，DTO不能改內部所有權。
    private static void OwnershipAndVersionFailureStaySticky()
    {
        foreach (string failure in new[] { "version", "owner", "owner_throw", "sequence_throw" })
        {
            Port port = new Port(); HostClipboardInvalidUtf16Producer producer = new HostClipboardInvalidUtf16Producer(port);
            Assert(producer.Prepare()); HostInvalidUtf16Publication value = producer.Publish();
            Assert(value.Published && value.FixtureVerified && value.WriterOpenClosed && value.Code == "host_observed");
            value.Published = false; value.Code = "Unknown public code";
            Assert(producer.MatchesPublished() && producer.PublishedVersion() == 7);
            if (failure == "version") port.Version = 8;
            else if (failure == "owner") port.Owner = false;
            else { port.Failure = failure == "owner_throw" ? "owner" : "sequence"; port.Throws = true; }
            Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
            port.Owner = true; port.Version = 7; port.Failure = "";
            Assert(!producer.MatchesPublished() && producer.Stop() && port.Frees == 0 && port.Releases == 1);
        }
        foreach (string failure in new[] { "owner", "sequence" })
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port { Failure = failure, Throws = throws };
            HostClipboardInvalidUtf16Producer producer = new HostClipboardInvalidUtf16Producer(port);
            Assert(producer.Prepare() && producer.Publish().Published);
            port.Failure = "";
            Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0 && producer.Stop());
        }
    }
    // Stop／Prepare失敗sticky，真外來thread不能觸port或消耗owner gate。
    private static void StopIsStickyAndCrossThreadDoesNotTouchPort()
    {
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port { Failure = "release", Throws = throws };
            HostClipboardInvalidUtf16Producer producer = new HostClipboardInvalidUtf16Producer(port);
            Assert(producer.Prepare() && !producer.Stop() && !producer.Stop() && port.Releases == 1);
            Assert(!producer.Prepare() && !producer.Publish().Published);
            Port failed = new Port { Failure = "prepare", Throws = throws }; producer = new HostClipboardInvalidUtf16Producer(failed);
            Assert(!producer.Prepare() && !producer.Prepare() && !producer.Publish().Published && failed.Prepares == 1 && failed.Opens == 0 && producer.Stop());
        }
        Port owned = new Port(); HostClipboardInvalidUtf16Producer same = new HostClipboardInvalidUtf16Producer(owned); bool denied = false;
        // managed thread只驗策略，絕不建立原生window。
        Thread thread = new Thread(delegate() { denied = !same.Prepare() && !same.Publish().Published && !same.MatchesPublished() && same.PublishedVersion() == 0 && !same.Stop(); });
        thread.Start(); Assert(thread.Join(1000));
        Assert(denied && owned.Prepares == 0 && owned.Opens == 0 && owned.Releases == 0 && same.Prepare() && same.Stop());
    }
    // 完整證據每項獨立缺失均拒絕，不鏡像classifier邏輯。
    private static void InvalidEvidenceRejectsEveryMissingProof()
    {
        foreach (string mutation in new[] { "valid", "null_publication", "published", "fixture", "writer_close", "publication_code", "null_reader", "reader_code", "unknown_code", "text", "stable", "version", "reader_owner", "reader_close", "scope", "owner", "overflow" })
        {
            HostInvalidUtf16Publication publication = new HostInvalidUtf16Publication { Published = true, FixtureVerified = true, WriterOpenClosed = true, Code = "host_observed" };
            HostClipboardValue reader = new HostClipboardValue { Text = null, Code = "host_text_invalid", Stable = false, Version = 0, OwnerMatches = null, ResourcesClosed = true };
            bool scope = true, owner = true, overflow = false;
            switch (mutation)
            {
                case "null_publication": publication = null; break;
                case "published": publication.Published = false; break;
                case "fixture": publication.FixtureVerified = false; break;
                case "writer_close": publication.WriterOpenClosed = false; break;
                case "publication_code": publication.Code = "Unknown public code"; break;
                case "null_reader": reader = null; break;
                case "reader_code": reader.Code = "host_clipboard_busy"; break;
                case "unknown_code": reader.Code = "Unknown public code"; break;
                case "text": reader.Text = "Public metadata"; break;
                case "stable": reader.Stable = true; break;
                case "version": reader.Version = 7; break;
                case "reader_owner": reader.OwnerMatches = false; break;
                case "reader_close": reader.ResourcesClosed = false; break;
                case "scope": scope = false; break;
                case "owner": owner = false; break;
                case "overflow": overflow = true; break;
            }
            HostClipboardInvalidUtf16Result result = HostClipboardInvalidUtf16Calibration.Classify(publication, reader, scope, owner, overflow);
            Assert(result.ReaderRejected == (mutation == "valid") && result.TextReturned == (mutation == "text") && result.Code != "Unknown public code");
            if (mutation == "valid") Assert(result.Code == "host_text_invalid" && result.ReadResourcesClosed && !result.Overflow);
        }
        string[] fields = { "ScopeVerified", "ProducerPublished", "FixtureVerified", "OwnerVersionMatched", "ReaderRejected", "TextReturned", "ReadResourcesClosed", "Overflow", "Code" };
        FieldInfo[] actual = typeof(HostClipboardInvalidUtf16Result).GetFields(BindingFlags.Instance | BindingFlags.Public);
        Assert(actual.Length == fields.Length); foreach (FieldInfo field in actual) Assert(Array.IndexOf(fields, field.Name) >= 0);
    }
    // byte清零漏掉、decoder改replacement或Close失敗被忽略都會失敗；同碼read throw明示native限制。
    private static void FormalReaderRejectsLiteralInvalidBytesButCodeIsAmbiguous()
    {
        foreach (int size in new[] { 4, 8 })
        {
            byte[] bytes = new byte[size]; bytes[1] = 216; ReadPort port = new ReadPort(bytes);
            HostClipboardValue value = HostObserverNative.ObserveClipboard(port, 7, 1);
            Assert(value.Code == "host_text_invalid" && value.Text == null && !value.Stable && value.Version == 0 && value.OwnerMatches == null && value.ResourcesClosed);
            Assert(port.Reads == 1 && port.Closes == 1); foreach (byte b in bytes) Assert(b == 0);
        }
        foreach (string failure in new[] { "valid", "throw", "busy", "format", "null", "odd", "large", "close", "close_throw" })
        {
            byte[] bytes = failure == "valid" ? new byte[] { 65, 0, 0, 0 } : failure == "odd" ? new byte[3] : failure == "large" ? new byte[65540] : new byte[] { 0, 216, 0, 0 };
            ReadPort port = new ReadPort(bytes) { Failure = failure }; HostClipboardValue value = HostObserverNative.ObserveClipboard(port, 7, 1);
            string expected = failure == "valid" ? "host_observed" : failure == "throw" ? "host_text_invalid" : failure == "busy" ? "host_clipboard_busy" : failure == "format" ? "host_clipboard_format_unavailable" : failure == "null" ? "host_text_unreadable" : failure == "odd" || failure == "large" ? "host_text_too_large" : "host_cleanup_unavailable";
            Assert(value.Code == expected && port.Closes == (failure == "busy" ? 0 : 1));
            Assert(port.Reads == (failure == "busy" || failure == "format" || failure == "odd" || failure == "large" ? 0 : 1));
            if (failure == "valid") Assert(value.Text == "A");
            if (failure == "close" || failure == "close_throw") Assert(!value.ResourcesClosed && value.Text == null);
        }
    }
    // 固定安全斷言，不輸出fixture或未知例外。
    private static void Assert(bool value) { if (!value) throw new InvalidOperationException(); }
    // factory在非Windows必須於所有native／thread前拒絕；Windows不為此guard啟動writer。
    private static void NonWindowsFactoryRejectsBeforeNative()
    {
        if (Environment.OSVersion.Platform == PlatformID.Win32NT) { Console.WriteLine("invalid_utf16_native_factory_guard_not_run,windowsNative=false"); return; }
        bool rejected = false;
        try { HostClipboardInvalidUtf16Windows.StartWindows(); } catch (PlatformNotSupportedException) { rejected = true; }
        Assert(rejected);
    }
    // 僅保存原生oracle定義，不由Main／CI呼叫；實際發布需另取授權。
    private static void NativeWriterOracleNotInvoked()
    {
        HostClipboardInvalidUtf16Windows fixture = HostClipboardInvalidUtf16Windows.StartWindows();
        try
        {
            Assert(fixture.Ready);
            HostInvalidUtf16Publication publication = fixture.Publish();
            Assert(publication.Published && publication.FixtureVerified && publication.WriterOpenClosed);
            Assert(fixture.MatchesPublished() && fixture.PublishedVersion() != 0 && !fixture.Publish().Published);
        }
        finally { Assert(fixture.Stop()); }
    }
    // 此Main只跑pure／port，沒有native writer入口。
    private static int Main()
    {
        string stage = "buffer";
        try
        {
            FixedBufferRequiresUnpairedHighSurrogateAndZeroPadding(); stage = "prepare";
            PrepareDoesNotPublish(); stage = "once"; PublishConsumesOnceBeforeFailure();
            stage = "ownership"; OwnershipAndVersionFailureStaySticky();
            stage = "stop"; StopIsStickyAndCrossThreadDoesNotTouchPort();
            stage = "evidence"; InvalidEvidenceRejectsEveryMissingProof();
            stage = "reader"; FormalReaderRejectsLiteralInvalidBytesButCodeIsAmbiguous();
            stage = "platform_guard"; NonWindowsFactoryRejectsBeforeNative();
            Console.WriteLine("clipboard_invalid_utf16_core_observed,windowsNative=false"); return 0;
        }
        catch { Console.WriteLine("clipboard_invalid_utf16_core_unavailable,stage=" + stage + ",windowsNative=false"); return 1; }
    }
}
