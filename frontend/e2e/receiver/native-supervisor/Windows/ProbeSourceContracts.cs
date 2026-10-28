namespace RdWeb.Receiver.NativeSupervisor.Windows;

internal sealed record SourceMetadata(string FinalPath, uint Volume, ulong Index, long Length, uint Attributes, uint Links);
internal sealed record SourceAce(string Sid, bool Allow, bool Supported);
internal sealed record SourceSecurity(string Owner, bool DaclPresent, bool Protected, IReadOnlyList<SourceAce> Aces);
internal sealed record SourceIdentity(string Sid, bool MembershipChecked, bool EnabledAdmin);
internal sealed record SourcePin(string RelativePath, int MaxBytes, string Sha256, bool Wrapper = false);

// 只有組件內的來源owner消費此OS邊界；不提供外部路徑／verified轉換。
internal interface IProbeSourceApi
{
    bool Supported { get; }
    string PackageDirectory { get; }
    string SystemDirectory { get; }
    // 查本行程primary token，不切換thread身份。
    bool TryIdentity(out SourceIdentity identity);
    // flags與分享模式由adapter固定，不接受caller自選。
    nint Open(string path, bool directory);
    // 固定CREATE_NEW marker，由lease決定唯一檔名；不開既存目標或寫內容。
    nint CreateClaim(string path);
    // 所有metadata都以同一持有handle取得。
    bool TryMetadata(nint handle, out SourceMetadata metadata);
    // 原生描述元在本邊界轉typed資料，未知ACE不能消失。
    bool TrySecurity(nint handle, out SourceSecurity security);
    // 只接受本機fixed NTFS，不由caller宣告filesystem。
    bool TryVolume(nint handle, out bool fixedNtfs);
    // 單次最多4096 bytes；false與正常EOF分開。
    bool TryRead(nint handle, Span<byte> buffer, out int count);
    // 每筆自有handle由owner最多關閉一次。
    bool Close(nint handle);
    // 描述元／token關閉結果不能由檔案close補成成功。
    bool CloseAuxiliary();
}
