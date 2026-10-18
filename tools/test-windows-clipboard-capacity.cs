using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using System.Threading;

// 僅替換OS邊界，發布狀態／所有權／一次性策略都由真正producer執行。
internal static class CapacityCoreTests
{
    private sealed class Port : IHostCapacityClipboardPort
    {
        public string Failure = "";
        public bool Throw = false;
        public bool Owner = true;
        public uint Version = 7;
        public int Prepares = 0, Opens = 0, Empties = 0, Sets = 0, Closes = 0, Releases = 0, Frees = 0;
        public bool Transferred = false;
        public readonly List<string> Calls = new List<string>();
        // 失敗只在指定邊界，不能以測試替身直接製造成功DTO。
        private bool Step(string name)
        {
            Calls.Add(name);
            if (Failure != name) return true;
            if (Throw) throw new InvalidOperationException();
            return false;
        }
        // 公開fixture只宣告固定配置準備，不碰Windows。
        public bool PrepareFixedContainer() { Prepares++; return Step("prepare"); }
        // 真producer決定是否及何時開啟。
        public bool Open() { Opens++; return Step("open"); }
        // 模擬不可還原的邊界，不實際清剪貼簿。
        public bool Empty() { Empties++; return Step("empty"); }
        // 成功後記錄配置已轉移，供真正Stop策略驗不能再free。
        public bool PublishFixedContainer() { Sets++; bool ok = Step("set"); if (ok) Transferred = true; return ok; }
        // 讓finally關閉的行為可獨立查核。
        public bool Close() { Closes++; return Step("close"); }
        // 測試同owner與版本變動，不傳PID／HWND。
        public bool OwnsClipboard() { return Owner; }
        // 同一query只比較版本相等。
        public uint Sequence() { return Version; }
        // port依自己的真實轉移狀態釋放，不由回傳DTO決定。
        public bool Release() { Releases++; if (!Transferred) Frees++; return Step("release"); }
    }

    // 正式ObserveClipboard仍使用真正decoder／容量策略，此port只供公開bytes。
    private sealed class ReadPort : IHostClipboardAccess
    {
        public byte[] Bytes;
        public int Reads = 0, Closes = 0;
        // 固定同版本，不製造通知。
        public uint Sequence() { return 7; }
        // 本案不是busy測試。
        public bool Open() { return true; }
        // 固定CF_UNICODETEXT。
        public bool HasUnicode() { return true; }
        // 與實際提供的buffer完全一致，不鏡像容量判斷。
        public ulong ContainerSize() { return (ulong)Bytes.Length; }
        // 只在正式策略真的要求時才計次。
        public byte[] ReadContainer(int count) { Reads++; Assert(count == Bytes.Length); return Bytes; }
        // 公開測試不輸出原生身分。
        public bool? OwnerMatches(int pid) { return null; }
        // 一次Open的正常收尾由consumer驅動。
        public bool Close() { Closes++; return true; }
    }

    // 準備不能發生Open／Empty／Set，且prepare自身不可重播。
    private static void PrepareDoesNotPublish()
    {
        Port port = new Port();
        HostClipboardCapacityProducer producer = new HostClipboardCapacityProducer(port);
        Assert(producer.Prepare());
        Assert(!producer.Prepare());
        Assert(port.Prepares == 1 && port.Opens == 0 && port.Empties == 0 && port.Sets == 0);
        Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
        Assert(producer.Stop() && producer.Stop() && port.Releases == 1);
    }

    // 各階段false／throw都只能嘗試一次，Open成功才Close，沒有復原動作。
    private static void PublishConsumesOnceBeforeFailure()
    {
        foreach (string failure in new[] { "open", "empty", "set", "close" })
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port { Failure = failure, Throw = throws };
            HostClipboardCapacityProducer producer = new HostClipboardCapacityProducer(port);
            Assert(producer.Prepare());
            HostCapacityPublication publication = producer.Publish();
            Assert(publication.Code != "host_observed");
            Assert(publication.Published == (failure == "close"));
            Assert(publication.WriterOpenClosed == (failure != "open" && failure != "close"));
            Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
            Assert(!producer.Publish().Published);
            Assert(port.Opens == 1 && port.Empties == (failure == "open" ? 0 : 1));
            Assert(port.Sets == (failure == "open" || failure == "empty" ? 0 : 1));
            Assert(port.Closes == (failure == "open" ? 0 : 1));
            bool closed = producer.Stop();
            Assert(closed == (failure != "close"));
            Assert(producer.Stop() == closed && port.Releases == 1);
            Assert(port.Frees == (port.Transferred ? 0 : 1));
        }
    }

    // Set成功後即便consumer改DTO也不能改內部所有權，失去證據後不可恢復。
    private static void OwnershipTransfersAtSuccessfulSet()
    {
        Port port = new Port();
        HostClipboardCapacityProducer producer = new HostClipboardCapacityProducer(port);
        Assert(producer.Prepare());
        HostCapacityPublication publication = producer.Publish();
        Assert(publication.Published && publication.ContainerOversizeVerified && publication.WriterOpenClosed && publication.Code == "host_observed");
        Assert(producer.MatchesPublished() && producer.PublishedVersion() == 7);
        publication.Published = false; publication.Code = "Unknown public code";
        Assert(producer.MatchesPublished() && producer.PublishedVersion() == 7);
        port.Version = 8;
        Assert(!producer.MatchesPublished() && producer.PublishedVersion() == 0);
        port.Version = 7;
        Assert(!producer.MatchesPublished());
        Assert(producer.Stop() && port.Releases == 1 && port.Frees == 0);
        Port switched = new Port();
        HostClipboardCapacityProducer ownerChanged = new HostClipboardCapacityProducer(switched);
        Assert(ownerChanged.Prepare() && ownerChanged.Publish().Published && ownerChanged.MatchesPublished());
        switched.Owner = false;
        Assert(!ownerChanged.MatchesPublished() && ownerChanged.PublishedVersion() == 0);
        switched.Owner = true;
        Assert(!ownerChanged.MatchesPublished() && ownerChanged.Stop());
        foreach (bool zero in new[] { false, true })
        {
            Port changed = new Port { Owner = zero, Version = zero ? 0u : 7u };
            HostClipboardCapacityProducer other = new HostClipboardCapacityProducer(changed);
            Assert(other.Prepare());
            Assert(other.Publish().Published);
            Assert(!other.MatchesPublished() && other.PublishedVersion() == 0);
            Assert(other.Stop());
        }
    }

    // Cleanup結果sticky；prepare失敗與跨thread呼叫都不准重試或污染原owner。
    private static void StopIsStickyAndIdempotent()
    {
        foreach (bool throws in new[] { false, true })
        {
            Port port = new Port { Failure = "release", Throw = throws };
            HostClipboardCapacityProducer producer = new HostClipboardCapacityProducer(port);
            Assert(producer.Prepare());
            Assert(!producer.Stop() && !producer.Stop() && port.Releases == 1);
            Assert(!producer.Prepare() && !producer.Publish().Published);
        }
        Port bad = new Port { Failure = "prepare" };
        HostClipboardCapacityProducer failed = new HostClipboardCapacityProducer(bad);
        Assert(!failed.Prepare() && !failed.Prepare());
        Assert(!failed.Publish().Published && bad.Prepares == 1 && bad.Opens == 0);
        Assert(failed.Stop());
        Port owned = new Port();
        HostClipboardCapacityProducer sameThread = new HostClipboardCapacityProducer(owned);
        bool foreignDenied = false;
        // 真managed thread呼叫同producer；只驗策略，不建立native window。
        Thread thread = new Thread(delegate() {
            foreignDenied = !sameThread.Prepare() && !sameThread.Publish().Published && !sameThread.MatchesPublished() && sameThread.PublishedVersion() == 0 && !sameThread.Stop();
        });
        thread.Start(); Assert(thread.Join(1000));
        Assert(foreignDenied && owned.Prepares == 0 && owned.Opens == 0 && owned.Releases == 0);
        Assert(sameThread.Prepare() && sameThread.Stop());
    }

    // 每份正向證據皆為手寫literal，任一來源／reader旗標改變即不得成功。
    private static void CapacityEvidenceRejectsContradictions()
    {
        foreach (string mutation in new[] { "valid", "null_publication", "null_reader", "published", "container", "writer_close", "publication_code", "scope", "owner", "overflow", "reader_code", "unknown_code", "text", "stable", "version", "reader_owner", "reader_close" })
        {
            HostCapacityPublication publication = new HostCapacityPublication { Published = true, ContainerOversizeVerified = true, WriterOpenClosed = true, Code = "host_observed" };
            HostClipboardValue reader = new HostClipboardValue { Code = "host_text_too_large", Text = null, Stable = false, Version = 0, OwnerMatches = null, ResourcesClosed = true };
            bool scope = true, owner = true, overflow = false;
            switch (mutation)
            {
                case "null_publication": publication = null; break;
                case "null_reader": reader = null; break;
                case "published": publication.Published = false; break;
                case "container": publication.ContainerOversizeVerified = false; break;
                case "writer_close": publication.WriterOpenClosed = false; break;
                case "publication_code": publication.Code = "Unknown public code"; break;
                case "scope": scope = false; break;
                case "owner": owner = false; break;
                case "overflow": overflow = true; break;
                case "reader_code": reader.Code = "host_clipboard_busy"; break;
                case "unknown_code": reader.Code = "Unknown public code"; break;
                case "text": reader.Text = "Unknown public text"; break;
                case "stable": reader.Stable = true; break;
                case "version": reader.Version = 7; break;
                case "reader_owner": reader.OwnerMatches = false; break;
                case "reader_close": reader.ResourcesClosed = false; break;
            }
            HostClipboardCapacityResult result = HostClipboardCapacityCalibration.Classify(publication, reader, scope, owner, overflow);
            Assert(result.ReaderRejected == (mutation == "valid"));
            Assert(result.TextReturned == (mutation == "text"));
            Assert(result.Code != "Unknown public code");
            if (mutation == "valid") Assert(result.Code == "host_text_too_large" && result.ReadResourcesClosed && !result.Overflow);
        }
        string[] fields = { "ScopeVerified", "ProducerPublished", "ContainerOversizeVerified", "OwnerVersionMatched", "ReaderRejected", "TextReturned", "ReadResourcesClosed", "Overflow", "Code" };
        FieldInfo[] actual = typeof(HostClipboardCapacityResult).GetFields(BindingFlags.Public | BindingFlags.Instance);
        Assert(actual.Length == fields.Length);
        foreach (FieldInfo field in actual) Assert(Array.IndexOf(fields, field.Name) >= 0);
    }

    // 真正式容量策略必在超額時零Read；剛好上限的合法bytes不得被當超額。
    private static void FormalReaderKeepsTheOriginalBoundary()
    {
        ReadPort large = new ReadPort { Bytes = Encoding.Unicode.GetBytes(new string('A', 32769) + "\0") };
        HostClipboardValue result = HostObserverNative.ObserveClipboard(large, 7, 1);
        Assert(result.Code == "host_text_too_large" && result.Text == null && result.ResourcesClosed);
        Assert(large.Reads == 0 && large.Closes == 1);
        ReadPort exact = new ReadPort { Bytes = Encoding.Unicode.GetBytes(new string('A', 32768) + "\0") };
        result = HostObserverNative.ObserveClipboard(exact, 7, 1);
        Assert(result.Code == "host_observed" && result.Text == new string('A', 32768) && result.ResourcesClosed);
        Assert(exact.Reads == 1 && exact.Closes == 1);
    }

    // 非Windows先拒絕factory；Windows只報not run，不為測guard建立window。
    private static void NonWindowsFactoryDoesNotStart()
    {
        if (Environment.OSVersion.Platform == PlatformID.Win32NT)
        {
            Console.WriteLine("capacity_native_factory_guard_not_run,windowsNative=false"); return;
        }
        bool rejected = false;
        try { HostClipboardCapacityWindows.StartWindows(); }
        catch (PlatformNotSupportedException) { rejected = true; }
        Assert(rejected);
    }

    // 原生oracle僅保存定義，不由測試Main／CI呼叫；將來執行須另外授權。
    private static void NativeWriterOracleNotInvoked()
    {
        HostClipboardCapacityWindows fixture = HostClipboardCapacityWindows.StartWindows();
        try
        {
            Assert(fixture.Ready);
            HostCapacityPublication publication = fixture.Publish();
            Assert(publication.Published && publication.WriterOpenClosed && publication.ContainerOversizeVerified);
            Assert(fixture.MatchesPublished() && fixture.PublishedVersion() != 0);
            Assert(!fixture.Publish().Published);
        }
        finally { Assert(fixture.Stop()); }
    }

    // 只執行pure策略／公開port；任何平台都不啟原生writer。
    private static int Main()
    {
        string stage = "prepare";
        try
        {
            PrepareDoesNotPublish();
            stage = "failures"; PublishConsumesOnceBeforeFailure();
            stage = "ownership"; OwnershipTransfersAtSuccessfulSet();
            stage = "cleanup"; StopIsStickyAndIdempotent();
            stage = "classification"; CapacityEvidenceRejectsContradictions();
            stage = "reader_boundary"; FormalReaderKeepsTheOriginalBoundary();
            stage = "platform_guard"; NonWindowsFactoryDoesNotStart();
            Console.WriteLine("clipboard_capacity_core_observed,windowsNative=false"); return 0;
        }
        catch { Console.WriteLine("clipboard_capacity_core_unavailable,stage=" + stage + ",windowsNative=false"); return 1; }
    }

    // 斷言只印固定stage，不反射未知資料或例外原文。
    private static void Assert(bool value) { if (!value) throw new InvalidOperationException(); }
}
