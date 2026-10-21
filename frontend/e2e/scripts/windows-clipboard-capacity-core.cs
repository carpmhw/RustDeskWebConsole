using System;
using System.Threading;

// 僅隔離原生發布邊界；payload與容量固定，沒有讀取舊內容或還原操作。
public interface IHostCapacityClipboardPort
{
    // 只準備固定自有容器，不開啟剪貼簿。
    bool PrepareFixedContainer();
    // 一次開啟，不重試。
    bool Open();
    // 清除是需額外授權的獨立fixture能力，不屬正式reader。
    bool Empty();
    // 只發布既有固定容器，成功後由系統持有。
    bool PublishFixedContainer();
    // 每次成功Open必嘗試關閉。
    bool Close();
    // 只確認自有window，不輸出handle。
    bool OwnsClipboard();
    // 版本只留child RAM作同一發布物檢查。
    uint Sequence();
    // 僅釋放仍自有的配置／window，不清除已發布內容。
    bool Release();
}

// 安全發布副本不包含文字、大小或原生識別。
public sealed class HostCapacityPublication
{
    public bool Published;
    public bool ContainerOversizeVerified;
    public bool WriterOpenClosed;
    public string Code = "host_capability_unavailable";
}

// 一次性發布策略綁自有thread；不提供復原、重播或任意payload入口。
public sealed class HostClipboardCapacityProducer
{
    private readonly IHostCapacityClipboardPort port;
    private readonly int ownerThread;
    private bool prepareAttempted, prepared, consumed, published, closed, stopped, cleanupFailed, cleanupResult, proofInvalid;
    private uint version;
    private string code = "host_capability_unavailable";

    // 不在建構時準備或讀寫剪貼簿，僅記錄同thread邊界。
    public HostClipboardCapacityProducer(IHostCapacityClipboardPort port)
    {
        if (port == null) throw new ArgumentNullException("port");
        this.port = port;
        ownerThread = Thread.CurrentThread.ManagedThreadId;
    }
    // 跨thread呼叫不能觸及port或污染原owner的once gate。
    private bool OnOwnerThread() { return Thread.CurrentThread.ManagedThreadId == ownerThread; }
    // 只準備一次固定自有配置，失敗亦不可再次嘗試。
    public bool Prepare()
    {
        if (!OnOwnerThread() || stopped || prepareAttempted) return false;
        prepareAttempted = true;
        try { prepared = port.PrepareFixedContainer(); } catch { prepared = false; }
        return prepared;
    }
    // 每次建立安全副本，consumer不能反向改動發布物的所有權證據。
    private HostCapacityPublication Snapshot()
    {
        return new HostCapacityPublication { Published = published, ContainerOversizeVerified = prepared, WriterOpenClosed = closed, Code = code };
    }
    // 在Open之前即消耗gate；每個成功Open在finally僅Close一次。
    public HostCapacityPublication Publish()
    {
        if (!OnOwnerThread() || stopped || !prepared || consumed) return new HostCapacityPublication();
        consumed = true;
        bool opened = false;
        try
        {
            opened = port.Open();
            if (opened && port.Empty()) published = port.PublishFixedContainer();
        }
        catch { code = "host_capability_unavailable"; }
        finally
        {
            if (opened)
            {
                try { closed = port.Close(); } catch { closed = false; }
                if (!closed) { cleanupFailed = true; code = "host_cleanup_unavailable"; }
            }
        }
        if (published && closed)
        {
            try
            {
                if (port.OwnsClipboard()) version = port.Sequence();
                if (version != 0) code = "host_observed";
                else proofInvalid = true;
            }
            catch { proofInvalid = true; }
        }
        return Snapshot();
    }
    // 版本／owner曾不符即永久失效，不允許較晚回復的狀態補票。
    public bool MatchesPublished()
    {
        if (!OnOwnerThread() || stopped || !published || !closed || proofInvalid || version == 0) return false;
        try
        {
            if (port.OwnsClipboard() && port.Sequence() == version) return true;
        }
        catch { }
        proofInvalid = true;
        return false;
    }
    // 只回已記錄的本輪版本，不增加原生query或輸出至父程序。
    public uint PublishedVersion()
    {
        return OnOwnerThread() && !stopped && published && closed && !proofInvalid ? version : 0;
    }
    // 收尾最多一次；Close或Release失敗皆sticky，不藉重試隱藏故障。
    public bool Stop()
    {
        if (!OnOwnerThread()) return false;
        if (stopped) return cleanupResult;
        stopped = true;
        try { cleanupResult = port.Release(); } catch { cleanupResult = false; }
        cleanupResult = cleanupResult && !cleanupFailed;
        return cleanupResult;
    }
}

// 父程序可見的純布林結果，不持有native value或文字。
public sealed class HostClipboardCapacityResult
{
    public bool ScopeVerified;
    public bool ProducerPublished;
    public bool ContainerOversizeVerified;
    public bool OwnerVersionMatched;
    public bool ReaderRejected;
    public bool TextReturned;
    public bool ReadResourcesClosed;
    public bool Overflow;
    public string Code = "host_capability_unavailable";
}

// 只接受完整的同發布物與原reader早拒絕型態，不輸出原生value。
public static class HostClipboardCapacityCalibration
{
    // 每項來源／收尾證據獨立成立才成功，未知code固定分類不反射。
    public static HostClipboardCapacityResult Classify(HostCapacityPublication publication, HostClipboardValue reader, bool scopeVerified, bool ownerVersionMatched, bool overflow)
    {
        HostClipboardCapacityResult result = new HostClipboardCapacityResult {
            ScopeVerified = scopeVerified,
            ProducerPublished = publication != null && publication.Published,
            ContainerOversizeVerified = publication != null && publication.ContainerOversizeVerified,
            OwnerVersionMatched = ownerVersionMatched,
            TextReturned = reader != null && reader.Text != null,
            ReadResourcesClosed = reader != null && reader.ResourcesClosed,
            Overflow = overflow
        };
        if (publication == null) return result;
        if (publication.Code == "host_cleanup_unavailable") { result.Code = "host_cleanup_unavailable"; return result; }
        if (!publication.Published || !publication.ContainerOversizeVerified || !publication.WriterOpenClosed || publication.Code != "host_observed") return result;
        if (!scopeVerified) { result.Code = "host_scope_changed"; return result; }
        if (overflow) { result.Code = "host_observation_overflow"; return result; }
        if (!ownerVersionMatched) { result.Code = "host_clipboard_unstable"; return result; }
        if (reader == null) return result;
        if (!reader.ResourcesClosed) { result.Code = "host_cleanup_unavailable"; return result; }
        string[] codes = { "host_observed", "host_clipboard_busy", "host_clipboard_format_unavailable", "host_clipboard_unstable", "host_text_too_large", "host_text_invalid", "host_text_unreadable", "host_cleanup_unavailable", "host_capability_unavailable" };
        if (Array.IndexOf(codes, reader.Code) < 0) return result;
        result.Code = reader.Code;
        result.ReaderRejected = reader.Code == "host_text_too_large" && reader.Text == null && !reader.Stable && reader.Version == 0 && reader.OwnerMatches == null;
        return result;
    }
}
