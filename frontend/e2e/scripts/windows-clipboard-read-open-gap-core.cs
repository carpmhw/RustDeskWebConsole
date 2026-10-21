using System;
using System.Threading;

// 固定資料及狹義native port之間的純策略型別。
public enum HostReadOpenGapStage { NotAttempted, Succeeded, Failed, Unknown }

// reader owned buffer的單次交接結果，不攜帶額外metadata。
public sealed class HostReadOpenGapCopy
{
    public readonly HostReadOpenGapStage Status;
    public readonly byte[] Bytes;

    // 讓當前持有者明確接收狀態與owned bytes。
    public HostReadOpenGapCopy(HostReadOpenGapStage status, byte[] bytes)
    {
        Status = status;
        Bytes = bytes;
    }
}

// 固定校準需要的native能力，不提供任意格式或payload入口。
public interface IHostReadOpenGapIo
{
    // 準備本輪自有窗口與固定容器，不碰既有剪貼簿。
    HostReadOpenGapStage Prepare();
    // 取得一次真實Windows剪貼簿序號。
    uint Sequence();
    // 以writer自有非NULL窗口嘗試一次Open。
    bool OpenWriter();
    // 清除writer Open時的全部舊格式。
    bool Empty();
    // 只發布固定CF_UNICODETEXT容器一次。
    HostReadOpenGapStage PublishFixed();
    // 關閉本輪成功開啟的writer clipboard。
    HostReadOpenGapStage CloseWriter();
    // 只回報clipboard owner是否仍屬本輪writer。
    bool OwnsPublication();
    // 以reader自有窗口嘗試一次Open。
    bool OpenReader();
    // 在reader持鎖後檢查CF_UNICODETEXT可用性。
    bool HasUnicode();
    // 取得借用容器大小供共享策略先驗。
    ulong ContainerSize();
    // 有界複製reader容器並明確回報bytes所有權。
    HostReadOpenGapCopy ReadContainer(int count);
    // 回報clipboard owner是否符合已驗證記事本。
    bool? OwnerMatches(int editorPid);
    // 關閉reader clipboard並合併其Unlock狀態。
    HostReadOpenGapStage CloseReader();
    // 釋放本輪仍由fixture擁有的資源一次。
    bool Release();
}

// 只含十一個白名單證據欄位的immutable snapshot。
public sealed class HostReadOpenGapEvidence
{
    public readonly string FirstSequenceStatus;
    public readonly string PublicationStatus;
    public readonly string GapOrderStatus;
    public readonly string PublicationSequenceStatus;
    public readonly string ReaderOpenStatus;
    public readonly string LockedPublicationStatus;
    public readonly string PayloadStatus;
    public readonly string ReaderCopyStatus;
    public readonly string PostSequenceStatus;
    public readonly string ReadCloseStatus;
    public readonly bool TraceValid;

    // 以欄位各自的固定enum白名單建構安全snapshot。
    public HostReadOpenGapEvidence(string firstSequenceStatus, string publicationStatus, string gapOrderStatus, string publicationSequenceStatus, string readerOpenStatus, string lockedPublicationStatus, string payloadStatus, string readerCopyStatus, string postSequenceStatus, string readCloseStatus, bool traceValid)
    {
        FirstSequenceStatus = Allow(firstSequenceStatus, "available", "unavailable", "not_attempted", "unknown");
        PublicationStatus = Allow(publicationStatus, "succeeded", "failed", "not_attempted", "unknown");
        GapOrderStatus = Allow(gapOrderStatus, "verified", "violated", "not_attempted", "unknown");
        PublicationSequenceStatus = Allow(publicationSequenceStatus, "changed", "unchanged", "not_attempted", "unknown");
        ReaderOpenStatus = Allow(readerOpenStatus, "succeeded", "failed", "not_attempted", "unknown");
        LockedPublicationStatus = Allow(lockedPublicationStatus, "matched", "mismatched", "not_attempted", "unknown");
        PayloadStatus = Allow(payloadStatus, "matched", "mismatched", "not_attempted", "unknown");
        ReaderCopyStatus = Allow(readerCopyStatus, "succeeded", "failed", "not_attempted", "unknown");
        PostSequenceStatus = Allow(postSequenceStatus, "matched", "mismatched", "not_attempted", "unknown");
        ReadCloseStatus = Allow(readCloseStatus, "succeeded", "failed", "not_attempted", "unknown");
        TraceValid = traceValid;
    }

    // 未知enum只投影固定unknown，不保存呼叫端原字串。
    private static string Allow(string value, params string[] accepted)
    {
        return Array.IndexOf(accepted, value) >= 0 ? value : "unknown";
    }
}

// 保留四個raw版本供child RAM classifier比對，不可序列化。
public sealed class HostReadOpenGapCapture
{
    public readonly uint BeforeVersion;
    public readonly uint PublicationVersion;
    public readonly uint GuardVersion;
    public readonly uint AfterVersion;
    public readonly HostReadOpenGapStage WriterCloseStatus;
    public readonly bool ReaderInvoked;
    public readonly HostReadOpenGapEvidence Evidence;

    // 建立單輪封存副本，不提供改寫版本或證據的setter。
    public HostReadOpenGapCapture(uint beforeVersion, uint publicationVersion, uint guardVersion, uint afterVersion, HostReadOpenGapStage writerCloseStatus, bool readerInvoked, HostReadOpenGapEvidence evidence)
    {
        BeforeVersion = beforeVersion;
        PublicationVersion = publicationVersion;
        GuardVersion = guardVersion;
        AfterVersion = afterVersion;
        WriterCloseStatus = writerCloseStatus;
        ReaderInvoked = readerInvoked;
        Evidence = evidence;
    }
}

// owner thread正常停止後才封存的final狀態。
public sealed class HostReadOpenGapFinal
{
    public readonly bool TraceFinalized;
    public readonly bool TraceValid;

    // 將cleanup與trace可信度分別封存。
    public HostReadOpenGapFinal(bool traceFinalized, bool traceValid)
    {
        TraceFinalized = traceFinalized;
        TraceValid = traceValid;
    }
}

// pure分類器的安全結果，沒有raw reader內容。
public sealed class HostReadOpenGapResult
{
    public readonly bool ScopeVerified;
    public readonly bool ReaderInvoked;
    public readonly bool ReaderRejected;
    public readonly bool TextReturned;
    public readonly bool Overflow;
    public readonly string Code;
    public readonly string ReaderCode;
    public readonly HostReadOpenGapEvidence Evidence;

    // 建立不攜帶raw reader內容的immutable分類結果。
    public HostReadOpenGapResult(bool scopeVerified, bool readerInvoked, bool readerRejected, bool textReturned, bool overflow, string code, string readerCode, HostReadOpenGapEvidence evidence)
    {
        ScopeVerified = scopeVerified;
        ReaderInvoked = readerInvoked;
        ReaderRejected = readerRejected;
        TextReturned = textReturned;
        Overflow = overflow;
        Code = code;
        ReaderCode = readerCode;
        Evidence = evidence;
    }
}

// 固定公開payload的建構與界限驗證，不呼叫OS。
public static class HostReadOpenGapPayload
{
    private const string FixedText = "RdWeb open-gap!";

    // 每次回傳UTF-16LE文字與NUL的新owned陣列。
    public static byte[] CreateFixedBytes()
    {
        return System.Text.Encoding.Unicode.GetBytes(FixedText + "\0");
    }

    // 只接受reader允許範圍內的偶數容器大小。
    public static bool AcceptsSize(ulong size)
    {
        return size >= 32 && size <= 65538 && size % 2 == 0;
    }

    // 比對固定前綴及全零padding，不保留臨時期望陣列。
    public static bool Matches(byte[] bytes)
    {
        if (bytes == null || !AcceptsSize((ulong)bytes.Length)) return false;
        byte[] expected = CreateFixedBytes();
        try
        {
            for (int index = 0; index < expected.Length; index++) if (bytes[index] != expected[index]) return false;
            for (int index = expected.Length; index < bytes.Length; index++) if (bytes[index] != 0) return false;
            return true;
        }
        finally { Array.Clear(expected, 0, expected.Length); }
    }
}

// 繼承共享reader策略，只在I/O邊界同步執行一次受控Open間隙發布。
public sealed class HostReadOpenGapSession : IHostClipboardAccess
{
    private readonly IHostReadOpenGapIo io;
    private readonly int ownerThread;
    private int invalid;
    private bool prepareAttempted, prepareInProgress, prepared, observeAttempted, observeFinished, readerInvoked, sampleSealed, stopped;
    private bool releaseResult, cleanupFailed, cleanupUnknown, writerOpenAttempted, writerOpenSucceeded, writerCloseAttempted;
    private bool readerOpenAttempted, readerOpened, formatAttempted, formatAvailable, sizeAttempted;
    private bool copyAttempted, copyDelivered, ownerMatchAttempted, readerClosed;
    private int policySequenceCalls, nativeSequenceCalls, publicationOwnerChecks;
    private uint beforeVersion, publicationVersion, guardVersion, afterVersion;
    private bool beforeVersionKnown, publicationVersionKnown, afterVersionKnown;
    private HostReadOpenGapStage writerCloseStatus = HostReadOpenGapStage.NotAttempted;
    private string firstSequenceStatus = "not_attempted";
    private string publicationStatus = "not_attempted";
    private string gapOrderStatus = "not_attempted";
    private string publicationSequenceStatus = "not_attempted";
    private string readerOpenStatus = "not_attempted";
    private string lockedPublicationStatus = "not_attempted";
    private string payloadStatus = "not_attempted";
    private string readerCopyStatus = "not_attempted";
    private string postSequenceStatus = "not_attempted";
    private string readCloseStatus = "not_attempted";
    private HostReadOpenGapCapture sampleCapture;
    private HostReadOpenGapFinal finalTrace;

    // 綁定目前owner thread，不在建構時執行任何I/O。
    public HostReadOpenGapSession(IHostReadOpenGapIo io)
    {
        if (io == null) throw new ArgumentNullException("io");
        this.io = io;
        ownerThread = Thread.CurrentThread.ManagedThreadId;
    }

    // 錯thread只會設sticky invalid，不會呼叫native port。
    private bool OnOwner()
    {
        if (Thread.CurrentThread.ManagedThreadId == ownerThread) return true;
        Invalidate();
        return false;
    }

    // trace一旦失效只能保持失效，供跨thread守衛使用。
    private void Invalidate()
    {
        Interlocked.Exchange(ref invalid, 1);
    }

    // 讀取owner thread專屬的sticky trace狀態。
    private bool TraceValid()
    {
        return Interlocked.CompareExchange(ref invalid, 0, 0) == 0;
    }

    // 建立一次自有fixture資源，失敗亦消耗prepare gate。
    public bool Prepare()
    {
        if (!OnOwner()) return false;
        if (prepareAttempted || stopped || observeAttempted)
        {
            Invalidate();
            return false;
        }
        prepareAttempted = true;
        prepareInProgress = true;
        HostReadOpenGapStage status;
        try { status = io.Prepare(); }
        catch { return false; }
        finally { prepareInProgress = false; }
        prepared = status == HostReadOpenGapStage.Succeeded;
        return prepared && TraceValid();
    }

    // 呼叫原共享策略恰一次，所有native呼叫由本session的窄port執行。
    public HostClipboardValue Observe(int editorPid)
    {
        if (!OnOwner()) return FailureValue("host_capability_unavailable");
        if (!prepared || stopped || observeAttempted || sampleSealed || !TraceValid())
        {
            Invalidate();
            return FailureValue("host_capability_unavailable");
        }
        observeAttempted = true;
        readerInvoked = true;
        HostClipboardValue value;
        try { value = HostObserverNative.ObserveClipboard(this, 0, editorPid); }
        catch
        {
            Invalidate();
            value = FailureValue("host_capability_unavailable");
        }
        finally { observeFinished = true; }
        return value;
    }

    // 建立不含文字或序號的固定失敗value。
    private static HostClipboardValue FailureValue(string code)
    {
        return new HostClipboardValue { Code = code, Stable = false, ResourcesClosed = true };
    }

    // 建構全未知snapshot供任何非法呼叫路徑保守返回。
    private static HostReadOpenGapEvidence UnknownEvidence()
    {
        return new HostReadOpenGapEvidence("unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown", false);
    }

    // 取得真API序號並維持全session四次上限與固定呼叫順序。
    private uint ReadNativeSequence(int expectedCall)
    {
        if (!CanCallPort() || nativeSequenceCalls + 1 != expectedCall || nativeSequenceCalls >= 4)
        {
            Invalidate();
            throw new InvalidOperationException("host_capability_unavailable");
        }
        nativeSequenceCalls++;
        uint value = io.Sequence();
        if (!TraceValid()) throw new InvalidOperationException("host_capability_unavailable");
        return value;
    }

    // 將native版本例外保留為unknown，不進行補查。
    private bool TryReadNativeSequence(int expectedCall, out uint value)
    {
        value = 0;
        try
        {
            value = ReadNativeSequence(expectedCall);
            return TraceValid();
        }
        catch { value = 0; return false; }
    }

    // 限制所有原策略I/O在唯一observe與封存以前執行。
    private bool CanCallPort()
    {
        if (!OnOwner()) return false;
        if (!prepared || !observeAttempted || sampleSealed || stopped || !TraceValid())
        {
            Invalidate();
            return false;
        }
        return true;
    }

    // 原策略第一次與最後一次Sequence均沿用同一真API回傳值。
    public uint Sequence()
    {
        if (!CanCallPort()) throw new InvalidOperationException("host_capability_unavailable");
        policySequenceCalls++;
        if (policySequenceCalls == 1)
        {
            try
            {
                beforeVersion = ReadNativeSequence(1);
                beforeVersionKnown = beforeVersion != 0;
                firstSequenceStatus = beforeVersionKnown ? "available" : "unavailable";
                return beforeVersion;
            }
            catch { firstSequenceStatus = "unknown"; throw; }
        }
        if (policySequenceCalls != 2 || !readerOpened || !copyDelivered || !ownerMatchAttempted || nativeSequenceCalls != 3)
        {
            Invalidate();
            postSequenceStatus = "unknown";
            throw new InvalidOperationException("host_capability_unavailable");
        }
        try
        {
            afterVersion = ReadNativeSequence(4);
            afterVersionKnown = afterVersion != 0;
            postSequenceStatus = afterVersionKnown && publicationVersionKnown
                ? (afterVersion == publicationVersion ? "matched" : "mismatched")
                : "unknown";
            return afterVersion;
        }
        catch { postSequenceStatus = "unknown"; throw; }
    }

    // 在原策略Open邊界同步完成唯一發布再嘗試reader Open。
    public bool Open()
    {
        if (!CanCallPort() || policySequenceCalls != 1 || !beforeVersionKnown || beforeVersion == 0 || writerOpenAttempted || readerOpenAttempted)
        {
            Invalidate();
            return false;
        }
        writerOpenAttempted = true;
        gapOrderStatus = "verified";
        publicationStatus = "unknown";

        bool writerOpen;
        try { writerOpen = io.OpenWriter(); }
        catch { cleanupUnknown = true; return false; }
        writerOpenSucceeded = writerOpen;
        if (!TraceValid())
        {
            if (writerOpenSucceeded) CloseWriterOnce();
            publicationStatus = "unknown";
            return false;
        }
        if (!writerOpen)
        {
            publicationStatus = "failed";
            return false;
        }
        bool emptied = false;
        HostReadOpenGapStage publishStatus = HostReadOpenGapStage.Unknown;
        try
        {
            emptied = io.Empty();
            if (!TraceValid()) return false;
            if (!emptied)
            {
                publicationStatus = "failed";
                return false;
            }
            publishStatus = io.PublishFixed();
            publicationStatus = StageName(publishStatus);
            if (publishStatus == HostReadOpenGapStage.NotAttempted)
            {
                Invalidate();
                publicationStatus = "unknown";
            }
            if (!TraceValid()) publicationStatus = "unknown";
        }
        catch { publicationStatus = "unknown"; }
        finally { CloseWriterOnce(); }

        if (writerCloseStatus != HostReadOpenGapStage.Succeeded)
        {
            publicationStatus = writerCloseStatus == HostReadOpenGapStage.Failed ? "failed" : "unknown";
            return false;
        }
        if (!emptied || publishStatus != HostReadOpenGapStage.Succeeded || !TraceValid())
        {
            if (publishStatus == HostReadOpenGapStage.Failed) publicationStatus = "failed";
            return false;
        }

        publicationOwnerChecks++;
        if (publicationOwnerChecks != 1)
        {
            Invalidate();
            publicationStatus = "unknown";
            return false;
        }
        bool owns;
        try { owns = io.OwnsPublication(); }
        catch { publicationStatus = "unknown"; return false; }
        if (!TraceValid()) { publicationStatus = "unknown"; return false; }
        if (!owns) { publicationStatus = "failed"; return false; }
        if (!TryReadNativeSequence(2, out publicationVersion))
        {
            publicationStatus = "unknown";
            publicationSequenceStatus = "unknown";
            return false;
        }
        publicationVersionKnown = publicationVersion != 0;
        if (!publicationVersionKnown)
        {
            publicationStatus = "unknown";
            publicationSequenceStatus = "unknown";
            return false;
        }

        publicationSequenceStatus = publicationVersion == beforeVersion ? "unchanged" : "changed";
        publicationStatus = "succeeded";
        if (publicationVersion == beforeVersion) return false;

        readerOpenAttempted = true;
        try
        {
            bool opened = io.OpenReader();
            readerOpened = opened;
            if (!TraceValid())
            {
                readerOpenStatus = "unknown";
                return opened;
            }
            readerOpenStatus = opened ? "succeeded" : "failed";
            return opened;
        }
        catch
        {
            readerOpenStatus = "unknown";
            cleanupUnknown = true;
            return false;
        }
    }

    // 只在reader持鎖後核對自有owner與Vp，成功才查格式。
    public bool HasUnicode()
    {
        if (!CanCallPort() || !readerOpened || formatAttempted || nativeSequenceCalls != 2)
        {
            Invalidate();
            lockedPublicationStatus = "unknown";
            return false;
        }
        publicationOwnerChecks++;
        if (publicationOwnerChecks != 2)
        {
            Invalidate();
            lockedPublicationStatus = "unknown";
            return false;
        }
        bool owns;
        try { owns = io.OwnsPublication(); }
        catch { lockedPublicationStatus = "unknown"; return false; }
        if (!TraceValid()) { lockedPublicationStatus = "unknown"; return false; }
        if (!owns)
        {
            lockedPublicationStatus = "mismatched";
            return false;
        }
        if (!TryReadNativeSequence(3, out guardVersion) || guardVersion == 0)
        {
            lockedPublicationStatus = "unknown";
            return false;
        }
        if (!publicationVersionKnown || guardVersion != publicationVersion)
        {
            lockedPublicationStatus = "mismatched";
            return false;
        }
        lockedPublicationStatus = "matched";
        formatAttempted = true;
        formatAvailable = io.HasUnicode();
        if (!TraceValid()) return false;
        return formatAvailable;
    }

    // 只在持鎖關聯與固定格式通過後取得借用容器大小。
    public ulong ContainerSize()
    {
        if (!CanCallPort() || !readerOpened || lockedPublicationStatus != "matched" || !formatAttempted || !formatAvailable || sizeAttempted)
        {
            Invalidate();
            throw new InvalidOperationException("host_capability_unavailable");
        }
        sizeAttempted = true;
        return io.ContainerSize();
    }

    // 有界複製後驗固定payload；交出策略前的失敗buffer由本session清除。
    public byte[] ReadContainer(int count)
    {
        if (!CanCallPort() || !readerOpened || lockedPublicationStatus != "matched" || !sizeAttempted || copyAttempted || count < 2 || count > 65538)
        {
            Invalidate();
            throw new InvalidOperationException("host_capability_unavailable");
        }
        copyAttempted = true;
        HostReadOpenGapCopy copy;
        try { copy = io.ReadContainer(count); }
        catch { readerCopyStatus = "unknown"; payloadStatus = "unknown"; throw; }
        if (!TraceValid())
        {
            ClearOwned(copy == null ? null : copy.Bytes);
            readerCopyStatus = "unknown";
            payloadStatus = "unknown";
            throw new InvalidOperationException("host_capability_unavailable");
        }
        if (copy == null)
        {
            readerCopyStatus = "unknown";
            payloadStatus = "unknown";
            return null;
        }
        if (copy.Status != HostReadOpenGapStage.Succeeded)
        {
            ClearOwned(copy.Bytes);
            readerCopyStatus = StageName(copy.Status);
            payloadStatus = copy.Status == HostReadOpenGapStage.Failed ? "not_attempted" : "unknown";
            if (copy.Status == HostReadOpenGapStage.NotAttempted) Invalidate();
            if (copy.Status == HostReadOpenGapStage.Unknown) throw new InvalidOperationException("host_capability_unavailable");
            return null;
        }
        if (copy.Bytes == null)
        {
            readerCopyStatus = "unknown";
            payloadStatus = "unknown";
            Invalidate();
            return null;
        }
        try { payloadStatus = HostReadOpenGapPayload.Matches(copy.Bytes) ? "matched" : "mismatched"; }
        catch
        {
            ClearOwned(copy.Bytes);
            readerCopyStatus = "unknown";
            payloadStatus = "unknown";
            throw;
        }
        readerCopyStatus = "succeeded";
        copyDelivered = true;
        return copy.Bytes;
    }

    // 清除尚未交給原策略的owned buffer。
    private static void ClearOwned(byte[] bytes)
    {
        if (bytes != null) Array.Clear(bytes, 0, bytes.Length);
    }

    // 每次成功writer Open都恰好嘗試一次Close，包括trace失效路徑。
    private void CloseWriterOnce()
    {
        if (!writerOpenSucceeded || writerCloseAttempted) return;
        writerCloseAttempted = true;
        try
        {
            writerCloseStatus = io.CloseWriter();
            if (writerCloseStatus == HostReadOpenGapStage.Failed) cleanupFailed = true;
            if (writerCloseStatus == HostReadOpenGapStage.NotAttempted) Invalidate();
            if (writerCloseStatus == HostReadOpenGapStage.Unknown || writerCloseStatus == HostReadOpenGapStage.NotAttempted) cleanupUnknown = true;
        }
        catch { writerCloseStatus = HostReadOpenGapStage.Unknown; cleanupUnknown = true; }
    }

    // 保留正式reader的owner布林，不輸出任何window識別。
    public bool? OwnerMatches(int editorPid)
    {
        if (!CanCallPort() || !readerOpened || !copyDelivered || ownerMatchAttempted)
        {
            Invalidate();
            return null;
        }
        ownerMatchAttempted = true;
        return io.OwnerMatches(editorPid);
    }

    // 原策略finally只能關閉已成功開啟的一次reader。
    public bool Close()
    {
        if (!OnOwner() || stopped || !readerOpened || readerClosed)
        {
            Invalidate();
            readCloseStatus = "unknown";
            return false;
        }
        readerClosed = true;
        try
        {
            HostReadOpenGapStage status = io.CloseReader();
            readCloseStatus = StageName(status);
            if (status == HostReadOpenGapStage.Failed) cleanupFailed = true;
            if (status == HostReadOpenGapStage.NotAttempted) Invalidate();
            if (status == HostReadOpenGapStage.Unknown || status == HostReadOpenGapStage.NotAttempted) cleanupUnknown = true;
            return status == HostReadOpenGapStage.Succeeded;
        }
        catch
        {
            readCloseStatus = "unknown";
            cleanupUnknown = true;
            return false;
        }
    }

    // 將固定stage enum映射成安全字串。
    private static string StageName(HostReadOpenGapStage stage)
    {
        switch (stage)
        {
            case HostReadOpenGapStage.NotAttempted: return "not_attempted";
            case HostReadOpenGapStage.Succeeded: return "succeeded";
            case HostReadOpenGapStage.Failed: return "failed";
            case HostReadOpenGapStage.Unknown: return "unknown";
            default: return "unknown";
        }
    }

    // 封存唯一sample evidence與仍僅child RAM的版本值。
    public HostReadOpenGapCapture CaptureSample()
    {
        if (!OnOwner() || !observeAttempted || !observeFinished || sampleSealed || stopped)
        {
            Invalidate();
            return UnknownCapture();
        }
        sampleSealed = true;
        bool traceValid = TraceValid();
        HostReadOpenGapEvidence evidence = new HostReadOpenGapEvidence(
            SnapshotStatus(firstSequenceStatus, traceValid),
            SnapshotStatus(publicationStatus, traceValid),
            SnapshotStatus(gapOrderStatus, traceValid),
            SnapshotStatus(publicationSequenceStatus, traceValid),
            SnapshotStatus(readerOpenStatus, traceValid),
            SnapshotStatus(lockedPublicationStatus, traceValid),
            SnapshotStatus(payloadStatus, traceValid),
            SnapshotStatus(readerCopyStatus, traceValid),
            SnapshotStatus(postSequenceStatus, traceValid),
            SnapshotStatus(readCloseStatus, traceValid),
            traceValid);
        sampleCapture = new HostReadOpenGapCapture(beforeVersion, publicationVersion, guardVersion, afterVersion, writerCloseStatus, readerInvoked, evidence);
        return sampleCapture;
    }

    // trace失效後不再輸出肯定或比較型證據。
    private static string SnapshotStatus(string status, bool traceValid)
    {
        if (traceValid || status == "failed" || status == "not_attempted" || status == "unavailable") return status;
        return "unknown";
    }

    // 對非法取樣時機只回全未知副本。
    private static HostReadOpenGapCapture UnknownCapture()
    {
        return new HostReadOpenGapCapture(0, 0, 0, 0, HostReadOpenGapStage.Unknown, false, UnknownEvidence());
    }

    // 釋放一次自有資源並把final cleanup與traceValid分開封存。
    public bool Stop()
    {
        if (!OnOwner()) return false;
        if (prepareInProgress || (observeAttempted && !observeFinished))
        {
            Invalidate();
            return false;
        }
        if (stopped) return releaseResult && !cleanupFailed && !cleanupUnknown;
        stopped = true;
        bool released = false;
        try { released = io.Release(); }
        catch { cleanupUnknown = true; }
        releaseResult = released;
        if (!released) cleanupFailed = true;
        bool cleanupSucceeded = released && !cleanupFailed && !cleanupUnknown;
        bool finalized = sampleSealed && cleanupSucceeded;
        finalTrace = new HostReadOpenGapFinal(finalized, TraceValid());
        return cleanupSucceeded;
    }

    // 只讀取正常Stop後已封存的final，不新增native探測。
    public HostReadOpenGapFinal GetFinalTrace()
    {
        if (!OnOwner()) return new HostReadOpenGapFinal(false, false);
        if (!stopped || finalTrace == null)
        {
            Invalidate();
            return new HostReadOpenGapFinal(false, false);
        }
        if (!TraceValid()) return new HostReadOpenGapFinal(finalTrace.TraceFinalized, false);
        return finalTrace;
    }
}

// 依原reader形態與全部獨立證據判定本次負向校準。
public static class HostReadOpenGapCalibration
{
    private static readonly string[] ReaderCodes =
    {
        "host_observed", "host_capability_unavailable", "host_cleanup_unavailable", "host_clipboard_unstable",
        "host_clipboard_busy", "host_clipboard_format_unavailable", "host_text_too_large", "host_text_invalid", "host_text_unreadable"
    };

    // 將未知reader碼收斂為unknown，不保存外來文字。
    private static string SafeReaderCode(HostClipboardValue reader)
    {
        if (reader == null || Array.IndexOf(ReaderCodes, reader.Code) < 0) return "unknown";
        return reader.Code;
    }

    // 要求完整同輪時序、關聯、讀後拒絕及正常Close證據。
    private static bool FullRejectedShape(HostReadOpenGapCapture capture, HostClipboardValue reader, bool scopeVerified, bool overflow)
    {
        if (capture == null || capture.Evidence == null || reader == null) return false;
        HostReadOpenGapEvidence evidence = capture.Evidence;
        return scopeVerified && !overflow && capture.ReaderInvoked && evidence.TraceValid
            && evidence.FirstSequenceStatus == "available" && evidence.PublicationStatus == "succeeded"
            && evidence.GapOrderStatus == "verified" && evidence.PublicationSequenceStatus == "changed"
            && evidence.ReaderOpenStatus == "succeeded" && evidence.LockedPublicationStatus == "matched"
            && evidence.PayloadStatus == "matched" && evidence.ReaderCopyStatus == "succeeded"
            && evidence.PostSequenceStatus == "matched" && evidence.ReadCloseStatus == "succeeded"
            && capture.WriterCloseStatus == HostReadOpenGapStage.Succeeded
            && capture.BeforeVersion != 0 && capture.PublicationVersion != 0
            && capture.PublicationVersion != capture.BeforeVersion
            && capture.GuardVersion == capture.PublicationVersion
            && capture.AfterVersion == capture.PublicationVersion
            && reader.Code == "host_clipboard_unstable" && reader.Text == null && !reader.Stable
            && reader.Version == capture.BeforeVersion && reader.Version != 0
            && reader.OwnerMatches == false && reader.ResourcesClosed;
    }

    // 從輸入投影一份新的安全結果，不暴露可變raw DTO。
    private static HostReadOpenGapResult CreateResult(HostReadOpenGapCapture capture, HostClipboardValue reader, bool scopeVerified, bool overflow, string code, bool readerRejected)
    {
        return new HostReadOpenGapResult(scopeVerified, capture != null && capture.ReaderInvoked, readerRejected,
            reader != null && reader.Text != null, overflow, code, SafeReaderCode(reader), capture == null ? null : capture.Evidence);
    }

    // 套用cleanup、scope、overflow、構造及reader錯誤的固定優先序。
    public static HostReadOpenGapResult Classify(HostReadOpenGapCapture capture, HostClipboardValue reader, bool scopeVerified, bool overflow)
    {
        HostReadOpenGapEvidence evidence = capture == null ? null : capture.Evidence;
        if (capture != null && (capture.WriterCloseStatus == HostReadOpenGapStage.Failed
            || (evidence != null && evidence.ReadCloseStatus == "failed")
            || (reader != null && !reader.ResourcesClosed)))
        {
            return CreateResult(capture, reader, scopeVerified, overflow, "host_cleanup_unavailable", false);
        }
        if (!scopeVerified)
        {
            return CreateResult(capture, reader, scopeVerified, overflow, "host_scope_changed", false);
        }
        if (overflow)
        {
            return CreateResult(capture, reader, scopeVerified, overflow, "host_observation_overflow", false);
        }
        if (capture == null || evidence == null || !evidence.TraceValid)
            return CreateResult(capture, reader, scopeVerified, overflow, "host_capability_unavailable", false);
        if (reader == null || !capture.ReaderInvoked)
            return CreateResult(capture, reader, scopeVerified, overflow, "host_capability_unavailable", false);
        if (FullRejectedShape(capture, reader, scopeVerified, overflow))
        {
            return CreateResult(capture, reader, scopeVerified, overflow, "host_clipboard_unstable", true);
        }
        bool readerPathProven = evidence.PublicationStatus == "succeeded"
            && evidence.GapOrderStatus == "verified"
            && evidence.PublicationSequenceStatus == "changed"
            && (evidence.ReaderOpenStatus == "failed"
                || (evidence.ReaderOpenStatus == "succeeded" && evidence.LockedPublicationStatus == "matched"));
        if (!readerPathProven || reader.Code == "host_clipboard_unstable")
            return CreateResult(capture, reader, scopeVerified, overflow, "host_capability_unavailable", false);
        string code = reader.Code != "host_observed" && Array.IndexOf(ReaderCodes, reader.Code) >= 0
            ? reader.Code
            : "host_capability_unavailable";
        return CreateResult(capture, reader, scopeVerified, overflow, code, false);
    }
}
