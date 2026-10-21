using System;
using System.Threading;

// 固定合法短文字的pure驗證，不提供任意payload的發布入口。
public static class HostReadRacePayload
{
    // 渲染時交付的公開短文字（15碼元）。
    private const string FixedText = "RdWeb read-race";
    // 每次回新UTF-16LE配置（短文字＋NUL共32bytes），不觸原生剪貼簿。
    public static byte[] CreateFixedBytes()
    {
        byte[] bytes = new byte[(FixedText.Length + 1) * 2];
        for (int i = 0; i < FixedText.Length; i++) { bytes[i * 2] = (byte)FixedText[i]; bytes[i * 2 + 1] = (byte)(FixedText[i] >> 8); }
        return bytes;
    }
    // 實際配置可向上取整，但不能越過原reader的偶數上限。
    public static bool AcceptsSize(ulong size) { return size >= 32 && size <= 65538 && size % 2 == 0; }
    // 只驗前32bytes精確匹配及其餘零padding。
    public static bool VerifyFixedBytes(byte[] bytes)
    {
        if (bytes == null || !AcceptsSize((ulong)bytes.Length)) return false;
        byte[] fixedBytes = CreateFixedBytes();
        for (int i = 0; i < fixedBytes.Length; i++) if (bytes[i] != fixedBytes[i]) return false;
        for (int i = fixedBytes.Length; i < bytes.Length; i++) if (bytes[i] != 0) return false;
        return true;
    }
}
// 原生邊界僅提供固定delayed註冊與渲染交付，不接受任意payload或舊內容讀取。
public interface IHostReadRaceClipboardPort
{
    // 建立自有delayed owner，不碰clipboard。
    bool PrepareDelayedOwner();
    // 只嘗試一次Open，非NULL自有窗口。
    bool Open();
    // 清除全部舊格式，另需單次授權。
    bool Empty();
    // delayed註冊SetClipboardData(13,NULL)；返回值不作為成功訊號。
    bool RegisterDelayed();
    // 註冊後格式可用性後驗。
    bool FormatAvailable();
    // 每個成功Open只Close一次。
    bool Close();
    // 僅比自有owner。
    bool OwnsClipboard();
    // 序號只在child RAM。
    uint Sequence();
    // 渲染時配置固定payload、回驗後不Open直接Set。
    bool RenderFixedPayload();
    // 只清理仍自有資源。
    bool Release();
}
// 安全註冊證據不攜帶原生識別。
public sealed class HostReadRaceRegistration
{
    public bool Registered, OpenClosed;
    public uint RegistrationVersion;
    public string Code = "host_capability_unavailable";
}
// 安全渲染證據；Advanced於查詢時判定。
public sealed class HostReadRaceRenderEvidence
{
    public int Requests;
    public bool Delivered, Advanced, Failed;
}
// 一次性producer綁同thread；註冊／渲染證據與對外DTO各自獨立。
public sealed class HostClipboardReadRaceProducer
{
    private readonly IHostReadRaceClipboardPort port;
    private readonly int ownerThread;
    private bool prepareAttempted, prepared, consumed, registered, closed, stopped, cleanupFailed, cleanupResult, proofInvalid;
    private int requests;
    private bool renderAttempted, delivered, renderFailed;
    private uint version;
    private string code = "host_capability_unavailable";
    // 建構不觸port。
    public HostClipboardReadRaceProducer(IHostReadRaceClipboardPort port)
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
        try { prepared = port.PrepareDelayedOwner(); } catch { prepared = false; }
        return prepared;
    }
    // 每次新副本，consumer無法反向改內部所有權。
    private HostReadRaceRegistration Snapshot()
    {
        return new HostReadRaceRegistration { Registered = registered, OpenClosed = closed, RegistrationVersion = version, Code = code };
    }
    // 一次Open／Empty／Set(NULL)／格式後驗；每個成功Open在finally只Close一次。
    public HostReadRaceRegistration Register()
    {
        if (!OnOwnerThread() || stopped || !prepared || consumed) return new HostReadRaceRegistration();
        consumed = true; bool opened = false;
        try
        {
            opened = port.Open();
            if (opened && port.Empty()) registered = port.RegisterDelayed() && port.FormatAvailable();
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
        if (registered && closed)
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
    // 渲染要求每次計數；僅註冊後第一筆可交付一次。
    public void Render()
    {
        if (!OnOwnerThread() || stopped) return;
        requests++;
        if (!registered || renderAttempted) return;
        renderAttempted = true;
        try { delivered = port.RenderFixedPayload(); } catch { delivered = false; }
        if (!delivered) renderFailed = true;
    }
    // 失去一次owner證據即永久拒絕，不以晚回復補票。
    public bool OwnsClipboard()
    {
        if (!OnOwnerThread() || stopped || !registered || proofInvalid || version == 0) return false;
        try { if (port.OwnsClipboard()) return true; } catch { }
        proofInvalid = true; return false;
    }
    // Advanced於查詢時以當下序號≠註冊版本判定，不於Set返回瞬間讀取。
    public HostReadRaceRenderEvidence RenderEvidence()
    {
        HostReadRaceRenderEvidence evidence = new HostReadRaceRenderEvidence { Requests = requests, Delivered = delivered, Failed = renderFailed };
        if (!OnOwnerThread() || stopped || !registered || version == 0) return evidence;
        try { evidence.Advanced = port.Sequence() != version; } catch { evidence.Failed = true; }
        return evidence;
    }
    // Release最多一次，失敗sticky。
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
public sealed class HostClipboardReadRaceResult
{
    public bool ScopeVerified, RegistrationVerified, RenderVerified, OwnerVersionMatched, ReaderRejected, TextReturned, ReadResourcesClosed, Overflow;
    public string Code = "host_capability_unavailable";
}
// 不憑共用unstable碼單獨成功。
public static class HostClipboardReadRaceCalibration
{
    // 全部證據須成立；讀前與讀後同碼，僅完整讀後形態可ReaderRejected。
    public static HostClipboardReadRaceResult Classify(HostReadRaceRegistration registration, HostReadRaceRenderEvidence render, HostClipboardValue reader, bool scopeVerified, bool ownerVersionMatched, bool overflow)
    {
        HostClipboardReadRaceResult result = new HostClipboardReadRaceResult {
            ScopeVerified = scopeVerified,
            RegistrationVerified = registration != null && registration.Registered && registration.OpenClosed && registration.RegistrationVersion != 0 && registration.Code == "host_observed",
            OwnerVersionMatched = ownerVersionMatched,
            TextReturned = reader != null && reader.Text != null,
            ReadResourcesClosed = reader != null && reader.ResourcesClosed,
            Overflow = overflow
        };
        if (registration == null) return result;
        if (registration.Code == "host_cleanup_unavailable") { result.Code = "host_cleanup_unavailable"; return result; }
        if (!result.RegistrationVerified) return result;
        if (render == null) return result;
        result.RenderVerified = render.Requests == 1 && render.Delivered && render.Advanced && !render.Failed;
        if (!result.RenderVerified) return result;
        if (!scopeVerified) { result.Code = "host_scope_changed"; return result; }
        if (overflow) { result.Code = "host_observation_overflow"; return result; }
        if (!ownerVersionMatched) { result.Code = "host_clipboard_unstable"; return result; }
        if (reader == null) return result;
        if (!reader.ResourcesClosed) { result.Code = "host_cleanup_unavailable"; return result; }
        string[] codes = { "host_observed", "host_clipboard_busy", "host_clipboard_format_unavailable", "host_clipboard_unstable", "host_text_too_large", "host_text_invalid", "host_text_unreadable", "host_cleanup_unavailable", "host_capability_unavailable" };
        if (Array.IndexOf(codes, reader.Code) < 0) return result;
        result.Code = reader.Code;
        result.ReaderRejected = reader.Code == "host_clipboard_unstable" && reader.Text == null && !reader.Stable && reader.Version == registration.RegistrationVersion && reader.Version != 0 && reader.OwnerMatches == false;
        return result;
    }
}
