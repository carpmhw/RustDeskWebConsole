using System.Runtime.InteropServices;
using System.Text;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 來源API的明確W宣告；DWORD／BOOL／pointer維持不同回值型別。
internal static class SourceNativeAbi
{
    [StructLayout(LayoutKind.Sequential)]
    internal struct FileInformation
    {
        internal uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        internal uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct AclSize { internal uint Count, Used, Free; }

    // 不可繼承且固定分享模式由來源adapter指定。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern nint CreateFileW(string path, uint access, uint share, nint security, uint disposition, uint flags, nint template);
    // 同一handle取得file ID與link數，不另按路徑重新查詢。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetFileInformationByHandle(nint handle, out FileInformation information);
    // FILE_NAME_NORMALIZED／VOLUME_NAME_DOS；返回字元數不含結束NUL。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern uint GetFinalPathNameByHandleW(nint handle, StringBuilder path, uint capacity, uint flags);
    // 只接受FILE_TYPE_DISK。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern uint GetFileType(nint handle);
    // 以同handle驗檔案系統，不相信環境中的volume名稱。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int GetVolumeInformationByHandleW(nint handle, nint name, uint nameCapacity, out uint serial, out uint maximum, out uint flags, StringBuilder filesystem, uint capacity);
    // 固定磁碟類型以正規化DOS root查詢，不接受UNC。
    [DllImport("kernel32.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    internal static extern uint GetDriveTypeW(string root);
    // 只同步讀取自有來源檔，不讀任意stdin或device。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int ReadFile(nint handle, nint buffer, uint capacity, out uint read, nint overlapped);
    // 系統目錄由OS取得，不取SystemRoot或PATH環境。
    [DllImport("kernel32.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    internal static extern uint GetSystemDirectoryW(StringBuilder path, uint capacity);
    // 只取得本行程pseudo handle，絕不OpenProcess掃外部程序。
    [DllImport("kernel32.dll", ExactSpelling = true)]
    internal static extern nint GetCurrentProcess();
    // token與file handle均需明確檢close回值。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int CloseHandle(nint handle);
    // LocalFree成功回NULL，不當BOOL。
    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern nint LocalFree(nint memory);
    // primary token僅需QUERY與DUPLICATE，不調整權限。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int OpenProcessToken(nint process, uint access, out nint token);
    // CheckTokenMembership需要impersonation token，但不對thread設impersonation。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int DuplicateToken(nint token, int level, out nint duplicate);
    // TokenUser=1，先查長度後以有界配置讀取。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetTokenInformation(nint token, int informationClass, nint buffer, uint capacity, out uint returned);
    // API回值與out membership必須分開檢查。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int CheckTokenMembership(nint token, nint sid, out int member);
    // typed字串只在此OS邊界建立，返回buffer用LocalFree。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int ConvertSidToStringSidW(nint sid, out nint text);
    // Administrators SID為固定公開S-1-5-32-544，不接受caller指定。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern int ConvertStringSidToSidW(string text, out nint sid);
    // 成功為ERROR_SUCCESS=0；owner／DACL pointers隸屬同一descriptor。
    [DllImport("advapi32.dll", ExactSpelling = true)]
    internal static extern uint GetSecurityInfo(nint handle, int type, uint information, out nint owner, out nint group, out nint dacl, out nint sacl, out nint descriptor);
    // 先驗描述元，再依其有界長度處理ACE。
    [DllImport("advapi32.dll", ExactSpelling = true)]
    internal static extern int IsValidSecurityDescriptor(nint descriptor);
    // 返回DWORD bytes，拒絕超過本邊界容量。
    [DllImport("advapi32.dll", ExactSpelling = true)]
    internal static extern uint GetSecurityDescriptorLength(nint descriptor);
    // control含SE_DACL_PROTECTED，不能由ACL內容反推繼承已關閉。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetSecurityDescriptorControl(nint descriptor, out ushort control, out uint revision);
    // null DACL與空DACL不同，前者一律拒絕。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetSecurityDescriptorDacl(nint descriptor, out int present, out nint dacl, out int defaulted);
    // AclSizeInformation=2，用固定12byte結構查數量及實際容量。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetAclInformation(nint acl, out AclSize information, uint capacity, int informationClass);
    // ACE pointer仍需按descriptor與ACL容量檢界。
    [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
    internal static extern int GetAce(nint acl, uint index, out nint ace);
    // SID語法由Windows驗證，不將未知pointer當字串。
    [DllImport("advapi32.dll", ExactSpelling = true)]
    internal static extern int IsValidSid(nint sid);
}
