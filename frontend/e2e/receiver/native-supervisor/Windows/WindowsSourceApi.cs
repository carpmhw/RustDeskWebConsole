using System.Runtime.InteropServices;
using System.Text;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 真OS邊界僅供internal來源owner；所有原生temporary都有明確配對釋放。
internal sealed class WindowsSourceApi : IProbeSourceApi
{
    private bool _auxiliaryFailed;
    private bool _auxiliaryClosed;
    private string _ownerSid = "";

    // 拒絕須早於任何Win32呼叫，不以DLL載入失敗當平台gate。
    internal WindowsSourceApi()
    {
        if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
            throw new PlatformNotSupportedException("native_supervisor_platform_unavailable");
    }
    public bool Supported => !_auxiliaryClosed && !_auxiliaryFailed;
    public string PackageDirectory => AppContext.BaseDirectory;
    public string SystemDirectory
    {
        // 系統目錄容量固定，未知／超長即回不可用，不fallback至環境。
        get
        {
            var path = new StringBuilder(32768);
            var length = SourceNativeAbi.GetSystemDirectoryW(path, 32768);
            return length > 0 && length < 32768 ? path.ToString() : "";
        }
    }

    // SID轉字串的LocalFree結果也屬本owner的資源證據。
    private bool TrySid(nint sid, out string text)
    {
        text = "";
        if (sid == 0 || SourceNativeAbi.IsValidSid(sid) == 0 || SourceNativeAbi.ConvertSidToStringSidW(sid, out var buffer) == 0) return false;
        try { text = Marshal.PtrToStringUni(buffer) ?? ""; }
        finally { if (SourceNativeAbi.LocalFree(buffer) != 0) _auxiliaryFailed = true; }
        return text.Length > 0 && !_auxiliaryFailed;
    }

    // 本行程token由API成功後認領，所有中間失敗均走同一finally且只close一次。
    public bool TryIdentity(out SourceIdentity identity)
    {
        identity = new("", false, false);
        if (!Supported) return false;
        nint token = 0, duplicate = 0, data = 0, administrators = 0;
        var success = false;
        try
        {
            if (SourceNativeAbi.OpenProcessToken(SourceNativeAbi.GetCurrentProcess(), 10, out var opened) != 0 && opened != 0)
            {
                token = opened;
                if (SourceNativeAbi.DuplicateToken(token, 2, out var copied) == 0 || copied == 0) return false;
                duplicate = copied;
                SourceNativeAbi.GetTokenInformation(token, 1, 0, 0, out var length);
                if (length >= 16 && length <= 65536)
                {
                    data = Marshal.AllocHGlobal((int)length);
                    if (SourceNativeAbi.GetTokenInformation(token, 1, data, length, out var returned) != 0 && returned >= 16 && returned <= length &&
                        TrySid(Marshal.ReadIntPtr(data), out var sid) &&
                        SourceNativeAbi.ConvertStringSidToSidW("S-1-5-32-544", out var adminSid) != 0 && adminSid != 0)
                    {
                        administrators = adminSid;
                        if (SourceNativeAbi.CheckTokenMembership(duplicate, administrators, out var member) != 0)
                        {
                            identity = new(sid, true, member != 0);
                            success = true;
                        }
                    }
                }
            }
        }
        finally
        {
            if (data != 0) Marshal.FreeHGlobal(data);
            if (administrators != 0 && SourceNativeAbi.LocalFree(administrators) != 0) _auxiliaryFailed = true;
            if (duplicate != 0 && SourceNativeAbi.CloseHandle(duplicate) == 0) _auxiliaryFailed = true;
            if (token != 0 && SourceNativeAbi.CloseHandle(token) == 0) _auxiliaryFailed = true;
        }
        var valid = success && !_auxiliaryFailed;
        _ownerSid = valid ? identity.Sid : "";
        return valid;
    }

    // FILE_SHARE_READ、OPEN_EXISTING、不可繼承；不放寬ACL或啟privilege。
    public nint Open(string path, bool directory) => !Supported ? 0 : SourceNativeAbi.CreateFileW(path,
        directory ? 0x20080u : 0x80020000u, 1, 0, 3, 0x00200000u | (directory ? 0x02000000u : 0u), 0);

    // 只建立全新零長marker；不開／讀／改既存目標，成功handle即使LocalFree失敗仍交回owner。
    public nint CreateClaim(string path)
    {
        if (!Supported || _ownerSid.Length == 0) return 0;
        nint descriptor = 0;
        nint handle = 0;
        try
        {
            if (NativeAbi.ConvertStringSecurityDescriptorToSecurityDescriptorW(
                "O:" + _ownerSid + "D:P(A;;FA;;;" + _ownerSid + ")", 1, out var acquired, out _) == 0 || acquired == 0) return 0;
            descriptor = acquired;
            // 同步P/Invoke的ref結構由marshaler持有，沒有另外配置待釋放的SECURITY_ATTRIBUTES。
            var attributes = new NativeAbi.SecurityAttributes { Length = (uint)Marshal.SizeOf<NativeAbi.SecurityAttributes>(), Descriptor = descriptor, Inherit = 0 };
            handle = NativeAbi.CreateFileW(path, 0x40020080, 0, ref attributes, 1, 0x00200080, 0);
        }
        finally { if (descriptor != 0 && NativeAbi.LocalFree(descriptor) != 0) _auxiliaryFailed = true; }
        return handle;
    }

    // 只有DOS final path與FILE_TYPE_DISK可向內流動，拒絕UNC／device。
    public bool TryMetadata(nint handle, out SourceMetadata metadata)
    {
        metadata = new("", 0, 0, 0, 0, 0);
        if (!Supported || SourceNativeAbi.GetFileType(handle) != 1 || SourceNativeAbi.GetFileInformationByHandle(handle, out var value) == 0) return false;
        var path = new StringBuilder(32768);
        var length = SourceNativeAbi.GetFinalPathNameByHandleW(handle, path, 32768, 0);
        var final = path.ToString();
        if (length == 0 || length >= 32768 || !final.StartsWith("\\\\?\\", StringComparison.Ordinal) ||
            final.Length < 7 || final[5] != ':' || final[6] != '\\') return false;
        var size = ((ulong)value.SizeHigh << 32) | value.SizeLow;
        if (size > long.MaxValue) return false;
        metadata = new(final[4..].TrimEnd('\\'), value.Volume, ((ulong)value.IndexHigh << 32) | value.IndexLow,
            (long)size, value.Attributes, value.Links);
        if (metadata.FinalPath.Length == 2) metadata = metadata with { FinalPath = metadata.FinalPath + "\\" };
        return true;
    }

    // filesystem由handle取得，drive type由該handle的已驗DOS root取得。
    public bool TryVolume(nint handle, out bool fixedNtfs)
    {
        fixedNtfs = false;
        if (!TryMetadata(handle, out var metadata)) return false;
        var filesystem = new StringBuilder(32);
        if (SourceNativeAbi.GetVolumeInformationByHandleW(handle, 0, 0, out _, out _, out _, filesystem, 32) == 0) return false;
        fixedNtfs = filesystem.ToString() == "NTFS" && SourceNativeAbi.GetDriveTypeW(metadata.FinalPath[..3]) == 3;
        return true;
    }

    // 安全描述元先界定容量，未知ACE保留unsupported，不在此層決定owner-only。
    public bool TrySecurity(nint handle, out SourceSecurity security)
    {
        security = new("", false, false, []);
        if (!Supported) return false;
        nint descriptor = 0;
        var success = false;
        try
        {
            if (SourceNativeAbi.GetSecurityInfo(handle, 1, 5, out var owner, out _, out _, out _, out var acquired) != 0 || acquired == 0) return false;
            descriptor = acquired;
            if (SourceNativeAbi.IsValidSecurityDescriptor(descriptor) == 0) return false;
            var length = SourceNativeAbi.GetSecurityDescriptorLength(descriptor);
            if (length < 20 || length > 131072 || !TrySid(owner, out var sid) ||
                SourceNativeAbi.GetSecurityDescriptorControl(descriptor, out var control, out _) == 0 ||
                SourceNativeAbi.GetSecurityDescriptorDacl(descriptor, out var present, out var dacl, out _) == 0) return false;
            var aces = new List<SourceAce>();
            if (present != 0 && dacl != 0)
            {
                if (SourceNativeAbi.GetAclInformation(dacl, out var size, 12, 2) == 0 || size.Count > 4096 || size.Used < 8 || size.Used > 65536) return false;
                for (uint index = 0; index < size.Count; index++)
                {
                    if (SourceNativeAbi.GetAce(dacl, index, out var ace) == 0 || ace < dacl + 8 || ace > dacl + (int)size.Used - 4) return false;
                    var bytes = (ushort)Marshal.ReadInt16(ace, 2);
                    if (bytes < 4 || ace + bytes > dacl + (int)size.Used) return false;
                    var type = Marshal.ReadByte(ace);
                    if (type is not (0 or 1)) { aces.Add(new("", false, false)); continue; }
                    if (bytes < 16 || 8 + 8 + 4 * Marshal.ReadByte(ace, 9) > bytes || !TrySid(ace + 8, out var aceSid)) return false;
                    aces.Add(new(aceSid, type == 0, true));
                }
            }
            security = new(sid, present != 0 && dacl != 0, (control & 0x1000) != 0, aces.AsReadOnly());
            success = true;
        }
        finally { if (descriptor != 0 && SourceNativeAbi.LocalFree(descriptor) != 0) _auxiliaryFailed = true; }
        return success && !_auxiliaryFailed;
    }

    // 有界同步來源read；只配置本次最多4096bytes並在返回前釋放。
    public bool TryRead(nint handle, Span<byte> buffer, out int count)
    {
        count = 0;
        if (!Supported || buffer.Length is <= 0 or > 4096) return false;
        var memory = Marshal.AllocHGlobal(buffer.Length);
        try
        {
            if (SourceNativeAbi.ReadFile(handle, memory, (uint)buffer.Length, out var read, 0) == 0 || read > buffer.Length) return false;
            count = (int)read;
            var bytes = new byte[count];
            Marshal.Copy(memory, bytes, 0, count);
            bytes.CopyTo(buffer);
            return true;
        }
        finally { Marshal.FreeHGlobal(memory); }
    }

    // file handle由lease持有，一次close的規則由該owner實施。
    public bool Close(nint handle) => SourceNativeAbi.CloseHandle(handle) != 0;
    // temporary已在取得呼叫的finally處理；失敗sticky且不重試可能重用的數值。
    public bool CloseAuxiliary() { _auxiliaryClosed = true; return !_auxiliaryFailed; }
}
