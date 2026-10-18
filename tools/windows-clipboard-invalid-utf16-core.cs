using System;
using System.Threading;

// 固定非法容器的pure驗證，不提供任意payload的發布入口。
public static class HostInvalidUtf16Buffer
{
    // 每次回新配置，不觸原生剪貼簿。
    public static byte[] CreateFixedBytes() { return new byte[] { 0, 216, 0, 0 }; }
    // 容器可向上取整，但不能越過原reader的偶數上限。
    public static bool AcceptsSize(ulong size) { return size >= 4 && size <= 65538 && size % 2 == 0; }
    // 只驗仍自有記憶體的固定surrogate／NUL及零padding。
    public static bool VerifyFixedBytes(byte[] bytes)
    {
        if (bytes == null || !AcceptsSize((ulong)bytes.Length) || bytes[0] != 0 || bytes[1] != 216) return false;
        for (int i = 2; i < bytes.Length; i++) if (bytes[i] != 0) return false;
        return true;
    }
}
// 原生邊界僅提供固定容器操作，不接受任意payload。
public interface IHostInvalidUtf16ClipboardPort
{
    // 準備自有配置，不發布。
    bool PrepareFixedContainer();
    // 只嘗試一次Open。
    bool Open();
    // 清除全部舊格式，另需單次授權。
    bool Empty();
    // 成功後交出HGLOBAL所有權。
    bool PublishFixedContainer();
    // 每個成功Open只Close一次。
    bool Close();
    // 僅比自有owner。
    bool OwnsClipboard();
    // 版本只在child RAM。
    uint Sequence();
    // 只清理仍自有資源。
    bool Release();
}
// 安全發布證據不攜帶bytes或原生識別。
public sealed class HostInvalidUtf16Publication
{
    public bool Published, FixtureVerified, WriterOpenClosed;
    public string Code = "host_capability_unavailable";
}
// 一次性producer綁同thread，發布／配置證據與對外DTO各自獨立。
public sealed class HostClipboardInvalidUtf16Producer
{
    private readonly IHostInvalidUtf16ClipboardPort port;
    private readonly int ownerThread;
    private bool prepareAttempted, prepared, consumed, published, closed, stopped, cleanupFailed, cleanupResult, proofInvalid;
    private uint version;
    private string code = "host_capability_unavailable";
    // 建構不觸port。
    public HostClipboardInvalidUtf16Producer(IHostInvalidUtf16ClipboardPort port)
    {
        if (port == null) throw new ArgumentNullException("port");
        this.port = port; ownerThread = Thread.CurrentThread.ManagedThreadId;
    }
    // 外來thread不能觸port或污染owner gate。
    private bool OnOwnerThread() { return Thread.CurrentThread.ManagedThreadId == ownerThread; }
    // Prepare在觸port前消耗，失敗亦不可再試。
    public bool Prepare()
    {
        if (!OnOwnerThread() || stopped || prepareAttempted) return false;
        prepareAttempted = true;
        try { prepared = port.PrepareFixedContainer(); } catch { prepared = false; }
        return prepared;
    }
    // 每次新副本，consumer無法反向改內部所有權。
    private HostInvalidUtf16Publication Snapshot()
    {
        return new HostInvalidUtf16Publication { Published = published, FixtureVerified = prepared, WriterOpenClosed = closed, Code = code };
    }
    // 一次Open／Empty／Set；每個成功Open在finally只Close一次。
    public HostInvalidUtf16Publication Publish()
    {
        if (!OnOwnerThread() || stopped || !prepared || consumed) return new HostInvalidUtf16Publication();
        consumed = true; bool opened = false;
        try { opened = port.Open(); if (opened && port.Empty()) published = port.PublishFixedContainer(); }
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
    // 失去一次owner／版本證據即永久拒絕，不以晚回復補票。
    public bool MatchesPublished()
    {
        if (!OnOwnerThread() || stopped || !published || !closed || proofInvalid || version == 0) return false;
        try { if (port.OwnsClipboard() && port.Sequence() == version) return true; } catch { }
        proofInvalid = true; return false;
    }
    // 僅回已保存版本，不加query也不輸出raw值。
    public uint PublishedVersion() { return OnOwnerThread() && !stopped && published && closed && !proofInvalid ? version : 0; }
    // Release最多一次，失敗sticky，不藉Stop重做Close或Set。
    public bool Stop()
    {
        if (!OnOwnerThread()) return false;
        if (stopped) return cleanupResult;
        stopped = true;
        try { cleanupResult = port.Release(); } catch { cleanupResult = false; }
        cleanupResult = cleanupResult && !cleanupFailed; return cleanupResult;
    }
}
// 固定安全結果型別。
public sealed class HostClipboardInvalidUtf16Result
{
    public bool ScopeVerified, ProducerPublished, FixtureVerified, OwnerVersionMatched, ReaderRejected, TextReturned, ReadResourcesClosed, Overflow;
    public string Code = "host_capability_unavailable";
}
// 不憑共用invalid碼單獨成功。
public static class HostClipboardInvalidUtf16Calibration
{
    // 全部來源／reader型態須成立；invalid共用碼不代表精確decoder例外來源。
    public static HostClipboardInvalidUtf16Result Classify(HostInvalidUtf16Publication publication, HostClipboardValue reader, bool scopeVerified, bool ownerVersionMatched, bool overflow)
    {
        HostClipboardInvalidUtf16Result result = new HostClipboardInvalidUtf16Result {
            ScopeVerified = scopeVerified, ProducerPublished = publication != null && publication.Published,
            FixtureVerified = publication != null && publication.FixtureVerified, OwnerVersionMatched = ownerVersionMatched,
            TextReturned = reader != null && reader.Text != null, ReadResourcesClosed = reader != null && reader.ResourcesClosed, Overflow = overflow
        };
        if (publication == null) return result;
        if (publication.Code == "host_cleanup_unavailable") { result.Code = "host_cleanup_unavailable"; return result; }
        if (!publication.Published || !publication.FixtureVerified || !publication.WriterOpenClosed || publication.Code != "host_observed") return result;
        if (!scopeVerified) { result.Code = "host_scope_changed"; return result; }
        if (overflow) { result.Code = "host_observation_overflow"; return result; }
        if (!ownerVersionMatched) { result.Code = "host_clipboard_unstable"; return result; }
        if (reader == null) return result;
        if (!reader.ResourcesClosed) { result.Code = "host_cleanup_unavailable"; return result; }
        string[] codes = { "host_observed", "host_clipboard_busy", "host_clipboard_format_unavailable", "host_clipboard_unstable", "host_text_too_large", "host_text_invalid", "host_text_unreadable", "host_cleanup_unavailable", "host_capability_unavailable" };
        if (Array.IndexOf(codes, reader.Code) < 0) return result;
        result.Code = reader.Code;
        result.ReaderRejected = reader.Code == "host_text_invalid" && reader.Text == null && !reader.Stable && reader.Version == 0 && reader.OwnerMatches == null;
        return result;
    }
}
