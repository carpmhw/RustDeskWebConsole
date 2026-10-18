using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// 可在非Windows執行的共享策略契約，不呼叫原生視窗或剪貼簿API。
internal static class HostReadOpenGapCoreTest
{
    // 固定模擬只用規格公開payload，不從受測payload helper產生期望。
    private static byte[] ExpectedBytes()
    {
        return Encoding.Unicode.GetBytes("RdWeb open-gap!\0");
    }

    // 只使用固定測試標籤回報斷言失敗，不列例外或資料內容。
    private static void Require(bool condition, string failure)
    {
        if (!condition) throw new InvalidOperationException(failure);
    }

    // 只確認測試owned buffer是否已清零，不輸出任何位元組。
    private static bool AllZero(byte[] values)
    {
        foreach (byte value in values) if (value != 0) return false;
        return true;
    }

    // 固定payload、實際邊界及零padding須符合獨立手寫期望。
    private static void PayloadHasFixedPublicBytesAndBounds()
    {
        byte[] expected = ExpectedBytes();
        byte[] actual = HostReadOpenGapPayload.CreateFixedBytes();
        Require(expected.Length == 32 && actual.Length == 32, "payload_length");
        for (int index = 0; index < expected.Length; index++) Require(actual[index] == expected[index], "payload_literal");
        Require(HostReadOpenGapPayload.AcceptsSize(32) && HostReadOpenGapPayload.AcceptsSize(65538), "payload_size_endpoints");
        Require(!HostReadOpenGapPayload.AcceptsSize(0) && !HostReadOpenGapPayload.AcceptsSize(31), "payload_size_lower_bound");
        Require(!HostReadOpenGapPayload.AcceptsSize(33) && !HostReadOpenGapPayload.AcceptsSize(65540), "payload_size_even_upper_bound");
        Require(HostReadOpenGapPayload.Matches(expected), "payload_match");
        byte[] padded = new byte[34];
        Array.Copy(expected, padded, expected.Length);
        Require(HostReadOpenGapPayload.Matches(padded), "payload_zero_padding");
        padded[33] = 1;
        Require(!HostReadOpenGapPayload.Matches(padded), "payload_nonzero_padding");
        Require(!HostReadOpenGapPayload.Matches(null), "payload_null");
    }

    // 以可控制的fake I/O記錄共享策略邊界的呼叫順序與次數。
    private sealed class GapFakeIo : IHostReadOpenGapIo
    {
        public readonly List<string> Calls = new List<string>();
        public uint[] Versions = { 7, 8, 8, 8 };
        public readonly List<int> ThrowSequenceCalls = new List<int>();
        public List<bool> Owners = new List<bool> { true, true };
        public readonly List<int> ThrowOwnerCalls = new List<int>();
        public Action PrepareHook;
        public Action SequenceHook;
        public Action OpenWriterHook;
        public Action OpenReaderHook;
        public Action FormatHook;
        public HostReadOpenGapStage PrepareResult = HostReadOpenGapStage.Succeeded;
        public bool PrepareThrows;
        public bool WriterOpenResult = true;
        public bool EmptyResult = true;
        public HostReadOpenGapStage PublishResult = HostReadOpenGapStage.Succeeded;
        public HostReadOpenGapStage WriterCloseResult = HostReadOpenGapStage.Succeeded;
        public bool ReaderOpenResult = true;
        public bool FormatResult = true;
        public ulong SizeResult = 32;
        public HostReadOpenGapCopy CopyResult;
        public bool? OwnerMatchesResult = false;
        public HostReadOpenGapStage ReaderCloseResult = HostReadOpenGapStage.Succeeded;
        public bool ReleaseResult = true;
        public int SequenceCalls, WriterOpenCalls, EmptyCalls, PublishCalls, WriterCloseCalls;
        public int OwnerCalls, ReaderOpenCalls, FormatCalls, SizeCalls, CopyCalls, OwnerMatchesCalls, ReaderCloseCalls, ReleaseCalls;

        // 建立固定成功路徑的published bytes副本。
        public GapFakeIo()
        {
            CopyResult = new HostReadOpenGapCopy(HostReadOpenGapStage.Succeeded, ExpectedBytes());
        }

        // 回傳可被Session清除的owned公開測試容器。
        public HostReadOpenGapStage Prepare()
        {
            Calls.Add("prepare");
            if (PrepareHook != null) PrepareHook();
            if (PrepareThrows) throw new IOException();
            return PrepareResult;
        }

        // 依序提供四個真實版本取樣的純測試替身。
        public uint Sequence()
        {
            Calls.Add("sequence");
            int call = ++SequenceCalls;
            if (SequenceHook != null) SequenceHook();
            if (ThrowSequenceCalls.Contains(call)) throw new IOException();
            return call <= Versions.Length ? Versions[call - 1] : 0;
        }

        // 只記錄writer Open，不做任何OS操作。
        public bool OpenWriter()
        {
            Calls.Add("writer_open");
            WriterOpenCalls++;
            if (OpenWriterHook != null) OpenWriterHook();
            return WriterOpenResult;
        }

        // 只記錄單次清空步驟。
        public bool Empty()
        {
            Calls.Add("empty");
            EmptyCalls++;
            return EmptyResult;
        }

        // 回傳預設的固定容器轉交狀態。
        public HostReadOpenGapStage PublishFixed()
        {
            Calls.Add("publish");
            PublishCalls++;
            return PublishResult;
        }

        // 回傳writer唯一Close及其結果。
        public HostReadOpenGapStage CloseWriter()
        {
            Calls.Add("writer_close");
            WriterCloseCalls++;
            return WriterCloseResult;
        }

        // 依呼叫序號回報writer是否仍持有本輪發布物。
        public bool OwnsPublication()
        {
            Calls.Add("owns");
            int call = ++OwnerCalls;
            if (ThrowOwnerCalls.Contains(call)) throw new IOException();
            return call <= Owners.Count && Owners[call - 1];
        }

        // 只記錄reader Open並回報可控busy結果。
        public bool OpenReader()
        {
            Calls.Add("reader_open");
            ReaderOpenCalls++;
            if (OpenReaderHook != null) OpenReaderHook();
            return ReaderOpenResult;
        }

        // 只記錄持鎖guard之後的格式查詢。
        public bool HasUnicode()
        {
            Calls.Add("format");
            FormatCalls++;
            if (FormatHook != null) FormatHook();
            return FormatResult;
        }

        // 回傳reader策略要先驗的固定容器大小。
        public ulong ContainerSize()
        {
            Calls.Add("size");
            SizeCalls++;
            return SizeResult;
        }

        // 交出當次owned copy結果，供真正ObserveClipboard處理。
        public HostReadOpenGapCopy ReadContainer(int count)
        {
            Calls.Add("copy");
            CopyCalls++;
            return CopyResult;
        }

        // 僅回記事本與固定owner的布林比較結果。
        public bool? OwnerMatches(int editorPid)
        {
            Calls.Add("owner_match");
            OwnerMatchesCalls++;
            return OwnerMatchesResult;
        }

        // 結合reader Close／Unlock的抽象收尾結果。
        public HostReadOpenGapStage CloseReader()
        {
            Calls.Add("reader_close");
            ReaderCloseCalls++;
            return ReaderCloseResult;
        }

        // 只記錄一次釋放，避免fake暗中重試。
        public bool Release()
        {
            Calls.Add("release");
            ReleaseCalls++;
            return ReleaseResult;
        }
    }

    // 以行程內記憶體代替所有Win32呼叫，並記錄fixture可觀察的邊界。
    private sealed class GapFakeNativeCalls : IHostReadOpenGapNativeCalls, IDisposable
    {
        public readonly List<string> Calls = new List<string>();
        public readonly IntPtr AllocationHandle = new IntPtr(7001);
        public readonly IntPtr WriterWindow = new IntPtr(7101);
        public readonly IntPtr ReaderWindow = new IntPtr(7102);
        public uint[] Versions = { 7, 8, 8, 8 };
        public bool[] OwnerIsWriter = { true, true, true };
        public int GlobalSizeOverride;
        public int FailCreateWindowAt;
        public int ThrowCreateWindowAt;
        public int FailGlobalLockAt;
        public int ThrowGlobalLockAt;
        public int FailGlobalUnlockAt;
        public int ThrowGlobalUnlockAt;
        public int ThrowSequenceAt;
        public int CorruptCopyFromAt;
        public int ThrowCopyFromAt;
        public int FailDestroyWindowHandle;
        public bool ThrowRegisterAfterSuccess;
        public bool ThrowGlobalAllocAfterAlloc;
        public bool FailRegisterClass;
        public bool FailGlobalAlloc;
        public bool FailUnregisterClass;
        public bool SetReturnsNull;
        public bool ThrowSetAfterTransfer;
        public bool WriterCloseResult = true;
        public bool ReaderCloseResult = true;
        public bool FormatResult = true;
        public bool Transferred;
        public int GlobalAllocCalls, GlobalFreeCalls, GlobalLockCalls, GlobalUnlockCalls;
        public int CopyToCalls, CopyFromCalls, RegisterClassCalls, CreateWindowCalls, DestroyWindowCalls, UnregisterClassCalls;
        public int OpenClipboardCalls, EmptyClipboardCalls, SetClipboardDataCalls, CloseClipboardCalls;
        public int GetClipboardOwnerCalls, SequenceCalls, FormatCalls, GetClipboardDataCalls, ProcessIdCalls;
        public byte[] LastCopyFromBuffer;
        private IntPtr allocationMemory;
        private int allocationBytes;
        private int lastError;
        private bool clipboardOpen, emptied;
        private bool fakeMemoryLocked;
        private IntPtr openedBy, clipboardOwner;
        private uint writerProcessId = 902, editorProcessId = 101;

        // 回傳尚未轉交容器的安全快照，只供pure assertions使用。
        public byte[] SnapshotAllocation()
        {
            if (allocationMemory == IntPtr.Zero) return null;
            byte[] bytes = new byte[allocationBytes];
            Marshal.Copy(allocationMemory, bytes, 0, bytes.Length);
            return bytes;
        }

        // 回傳fake目前使用的module handle。
        public IntPtr GetModuleHandle()
        {
            Calls.Add("module");
            return new IntPtr(1);
        }

        // 記錄固定class註冊並回報測試設定結果。
        public ushort RegisterWindowClass(ref HostReadOpenGapWindowClass value)
        {
            Calls.Add("register_class");
            RegisterClassCalls++;
            if (FailRegisterClass) return 0;
            if (ThrowRegisterAfterSuccess) throw new IOException();
            return 1;
        }

        // 以兩個固定假HWND代表writer與reader message-only視窗。
        public IntPtr CreateWindow(uint ex, string className, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr data)
        {
            Calls.Add("create_window");
            int call = ++CreateWindowCalls;
            if (call == FailCreateWindowAt) return IntPtr.Zero;
            IntPtr window = call == 1 ? WriterWindow : ReaderWindow;
            if (call == ThrowCreateWindowAt) throw new IOException();
            return window;
        }

        // 保留callback預設處理的純fake回傳值。
        public IntPtr DefWindowProc(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
        {
            Calls.Add("def_window_proc");
            return IntPtr.Zero;
        }

        // 記錄每個自有視窗的獨立銷毀結果。
        public bool DestroyWindow(IntPtr hwnd)
        {
            Calls.Add("destroy_window");
            DestroyWindowCalls++;
            return hwnd.ToInt32() != FailDestroyWindowHandle;
        }

        // 記錄隨機class唯一解除嘗試。
        public bool UnregisterClass(string className, IntPtr instance)
        {
            Calls.Add("unregister_class");
            UnregisterClassCalls++;
            return !FailUnregisterClass;
        }

        // 配置本行程私有HGLOBAL替身，不涉及系統剪貼簿。
        public IntPtr GlobalAlloc(uint flags, uint bytes)
        {
            Calls.Add("global_alloc");
            GlobalAllocCalls++;
            if (FailGlobalAlloc) return IntPtr.Zero;
            allocationBytes = GlobalSizeOverride == 0 ? (int)bytes : GlobalSizeOverride;
            allocationMemory = Marshal.AllocHGlobal(Math.Max((int)bytes, allocationBytes));
            for (int index = 0; index < Math.Max((int)bytes, allocationBytes); index++) Marshal.WriteByte(allocationMemory, index, 0);
            if (ThrowGlobalAllocAfterAlloc) throw new IOException();
            return AllocationHandle;
        }

        // 回傳配置前已固定的大小，不依賴剪貼簿內容。
        public ulong GlobalSize(IntPtr handle)
        {
            Calls.Add("global_size");
            return handle == AllocationHandle ? (ulong)allocationBytes : 0;
        }

        // 只鎖本fake配置並支援明確的lock失敗案例。
        public IntPtr GlobalLock(IntPtr handle)
        {
            Calls.Add("global_lock");
            int call = ++GlobalLockCalls;
            if (handle != AllocationHandle || call == FailGlobalLockAt) return IntPtr.Zero;
            fakeMemoryLocked = true;
            if (call == ThrowGlobalLockAt) throw new IOException();
            return allocationMemory;
        }

        // 模擬GlobalUnlock的正常zero、明確失敗及例外結果。
        public bool GlobalUnlock(IntPtr handle)
        {
            Calls.Add("global_unlock");
            int call = ++GlobalUnlockCalls;
            if (call == ThrowGlobalUnlockAt) throw new IOException();
            if (call == FailGlobalUnlockAt)
            {
                lastError = 5;
                return false;
            }
            fakeMemoryLocked = false;
            lastError = 0;
            return false;
        }

        // 回傳fake保存的last-error碼供UnlockSuccessful策略判定。
        public int GetLastErrorCode()
        {
            Calls.Add("last_error");
            return lastError;
        }

        // 設定fake thread error狀態，不碰行程外資源。
        public void SetLastErrorCode(uint error)
        {
            Calls.Add("set_last_error");
            lastError = (int)error;
        }

        // 只free仍未轉交的假配置，記錄錯誤所有權嘗試。
        public IntPtr GlobalFree(IntPtr handle)
        {
            Calls.Add("global_free");
            GlobalFreeCalls++;
            if (handle != AllocationHandle || Transferred || allocationMemory == IntPtr.Zero || fakeMemoryLocked) return handle;
            Marshal.FreeHGlobal(allocationMemory);
            allocationMemory = IntPtr.Zero;
            return IntPtr.Zero;
        }

        // 模擬clipboard獨佔鎖，記錄是哪個自有視窗開啟。
        public bool OpenClipboard(IntPtr owner)
        {
            Calls.Add("open_clipboard");
            OpenClipboardCalls++;
            if (clipboardOpen) return false;
            clipboardOpen = true;
            openedBy = owner;
            return true;
        }

        // 僅在fake writer持鎖時清除本fake內容。
        public bool EmptyClipboard()
        {
            Calls.Add("empty_clipboard");
            EmptyClipboardCalls++;
            if (!clipboardOpen || openedBy != WriterWindow) return false;
            emptied = true;
            clipboardOwner = WriterWindow;
            return true;
        }

        // 模擬固定格式Set的成功、明確失敗及結果未知。
        public IntPtr SetClipboardData(uint format, IntPtr handle)
        {
            Calls.Add("set_clipboard_data");
            SetClipboardDataCalls++;
            if (ThrowSetAfterTransfer)
            {
                Transferred = true;
                clipboardOwner = WriterWindow;
                throw new IOException();
            }
            if (SetReturnsNull || !clipboardOpen || openedBy != WriterWindow || !emptied || format != 13 || handle != AllocationHandle) return IntPtr.Zero;
            Transferred = true;
            clipboardOwner = WriterWindow;
            return handle;
        }

        // 模擬writer與reader各自唯一的clipboard Close。
        public bool CloseClipboard()
        {
            Calls.Add("close_clipboard");
            CloseClipboardCalls++;
            if (!clipboardOpen) return false;
            bool result = openedBy == WriterWindow ? WriterCloseResult : ReaderCloseResult;
            if (result)
            {
                clipboardOpen = false;
                openedBy = IntPtr.Zero;
            }
            return result;
        }

        // 依次提供已發布owner或受控的外來owner。
        public IntPtr GetClipboardOwner()
        {
            Calls.Add("get_clipboard_owner");
            int call = ++GetClipboardOwnerCalls;
            if (call <= OwnerIsWriter.Length && !OwnerIsWriter[call - 1]) return new IntPtr(9999);
            return clipboardOwner;
        }

        // 只提供測試設定的四個真實序號樣本。
        public uint GetClipboardSequenceNumber()
        {
            Calls.Add("sequence");
            int call = ++SequenceCalls;
            if (call == ThrowSequenceAt) throw new IOException();
            return call <= Versions.Length ? Versions[call - 1] : 0;
        }

        // 僅在固定格式及已轉交資料存在時回報格式可用。
        public bool IsClipboardFormatAvailable(uint format)
        {
            Calls.Add("format_available");
            FormatCalls++;
            return format == 13 && FormatResult && Transferred;
        }

        // 模擬reader持鎖後取得clipboard借用handle。
        public IntPtr GetClipboardData(uint format)
        {
            Calls.Add("get_clipboard_data");
            GetClipboardDataCalls++;
            return clipboardOpen && openedBy == ReaderWindow && format == 13 && Transferred ? AllocationHandle : IntPtr.Zero;
        }

        // 只回本fake兩個window的測試process id。
        public uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId)
        {
            Calls.Add("window_process_id");
            ProcessIdCalls++;
            processId = hwnd == WriterWindow ? writerProcessId : editorProcessId;
            return 1;
        }

        // production透過此seam使用Marshal.Copy寫固定bytes。
        public void CopyToNativeMemory(IntPtr destination, byte[] source)
        {
            Calls.Add("copy_to_memory");
            CopyToCalls++;
            Marshal.Copy(source, 0, destination, source.Length);
        }

        // production透過此seam有界複製，測試可模擬回驗錯誤或Copy例外。
        public void CopyFromNativeMemory(IntPtr source, byte[] destination)
        {
            Calls.Add("copy_from_memory");
            int call = ++CopyFromCalls;
            LastCopyFromBuffer = destination;
            Marshal.Copy(source, destination, 0, destination.Length);
            if (call == CorruptCopyFromAt) destination[0] ^= 1;
            if (call == ThrowCopyFromAt) throw new IOException();
        }

        // 釋放測試fake仍持有的private unmanaged allocation。
        public void Dispose()
        {
            if (allocationMemory == IntPtr.Zero) return;
            Marshal.FreeHGlobal(allocationMemory);
            allocationMemory = IntPtr.Zero;
        }
    }

    // setup失敗後仍依Io.Release的獨立證據判斷清理結果。
    private static void PrepareFailureDoesNotMasqueradeAsCleanupFailure()
    {
        GapFakeIo knownFailure = new GapFakeIo { PrepareResult = HostReadOpenGapStage.Failed };
        HostReadOpenGapSession failedSession = new HostReadOpenGapSession(knownFailure);
        Require(!failedSession.Prepare(), "prepare_known_failure");
        Require(failedSession.Stop() && knownFailure.ReleaseCalls == 1, "prepare_known_failure_cleanup_proven");
        Require(!failedSession.GetFinalTrace().TraceFinalized, "prepare_failure_has_no_sample");

        GapFakeIo thrown = new GapFakeIo { PrepareThrows = true };
        HostReadOpenGapSession thrownSession = new HostReadOpenGapSession(thrown);
        Require(!thrownSession.Prepare(), "prepare_unknown_failure");
        Require(thrownSession.Stop() && thrown.ReleaseCalls == 1, "prepare_exception_cleanup_proven_by_release");
        Require(!thrownSession.GetFinalTrace().TraceFinalized, "prepare_exception_has_no_sample");
    }

    // 檢查共享策略在受控Open間隙改寫後執行真正讀後拒絕。
    private static void SharedStrategyRejectsControlledGap()
    {
        GapFakeIo io = new GapFakeIo();
        HostReadOpenGapSession session = new HostReadOpenGapSession(io);
        Require(session.Prepare(), "prepare");
        HostClipboardValue raw = session.Observe(1);
        HostReadOpenGapCapture capture = session.CaptureSample();
        HostReadOpenGapResult result = HostReadOpenGapCalibration.Classify(capture, raw, true, false);
        Require(raw.Code == "host_clipboard_unstable" && raw.Text == null && !raw.Stable, "raw_unstable");
        Require(raw.Version == 7 && raw.OwnerMatches == false && raw.ResourcesClosed, "raw_read_after_shape");
        Require(result.ReaderRejected && result.Code == "host_clipboard_unstable", "classified_read_after");
        Require(io.ReleaseResult && session.Stop(), "normal_stop");
    }

    // 驗證共享策略與受控port各自只讀取規格列出的四個版本點。
    private static void GapOrdersRealCallsExactlyOnce()
    {
        GapFakeIo io = new GapFakeIo();
        HostReadOpenGapSession session = new HostReadOpenGapSession(io);
        Require(session.Prepare(), "prepare");
        HostClipboardValue raw = session.Observe(1);
        HostReadOpenGapCapture capture = session.CaptureSample();
        Require(raw.Code == "host_clipboard_unstable" && capture.BeforeVersion == 7, "strategy_result");
        Require(capture.PublicationVersion == 8 && capture.GuardVersion == 8 && capture.AfterVersion == 8, "four_versions");
        Require(io.SequenceCalls == 4 && io.WriterOpenCalls == 1 && io.EmptyCalls == 1, "writer_once");
        Require(io.PublishCalls == 1 && io.WriterCloseCalls == 1 && io.ReaderOpenCalls == 1, "publish_and_open_once");
        Require(io.CopyCalls == 1 && io.ReaderCloseCalls == 1, "read_and_close_once");
        string[] expected = { "prepare", "sequence", "writer_open", "empty", "publish", "writer_close", "owns", "sequence", "reader_open", "owns", "sequence", "format", "size", "copy", "owner_match", "sequence", "reader_close" };
        Require(io.Calls.Count == expected.Length, "call_count");
        for (int index = 0; index < expected.Length; index++) Require(io.Calls[index] == expected[index], "call_order");
        Require(session.Stop(), "stop");
    }

    // 確認缺少真實初始版本或發布後版本時不會繼續碰reader。
    private static void PublicationWithoutKnownVersionStopsReader()
    {
        uint[][] versions = { new uint[] { 0, 8, 8, 8 }, new uint[] { 7, 0, 8, 8 }, new uint[] { 7, 7, 7, 7 } };
        for (int index = 0; index < versions.Length; index++)
        {
            GapFakeIo io = new GapFakeIo { Versions = versions[index] };
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "prepare");
            HostClipboardValue raw = session.Observe(1);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(!capture.Evidence.TraceValid || capture.Evidence.PublicationSequenceStatus != "changed", "version_not_changed");
            Require(io.ReaderOpenCalls == 0 && io.CopyCalls == 0, "reader_not_opened");
            Require(!HostReadOpenGapCalibration.Classify(capture, raw, true, false).ReaderRejected, "no_false_rejection");
            Require(session.Stop(), "stop");
        }

        GapFakeIo firstThrows = new GapFakeIo();
        firstThrows.ThrowSequenceCalls.Add(1);
        HostReadOpenGapSession firstSession = new HostReadOpenGapSession(firstThrows);
        Require(firstSession.Prepare(), "first_throw_prepare");
        HostClipboardValue firstRaw = firstSession.Observe(1);
        HostReadOpenGapCapture firstCapture = firstSession.CaptureSample();
        Require(firstRaw.Code == "host_text_invalid" && firstThrows.WriterOpenCalls == 0, "first_sequence_throw");
        Require(firstCapture.Evidence.FirstSequenceStatus == "unknown" && firstSession.Stop(), "first_sequence_unknown");

        foreach (int sequenceCall in new int[] { 2 })
        {
            GapFakeIo publicationThrows = new GapFakeIo();
            publicationThrows.ThrowSequenceCalls.Add(sequenceCall);
            HostReadOpenGapSession publicationSession = new HostReadOpenGapSession(publicationThrows);
            Require(publicationSession.Prepare(), "publication_throw_prepare");
            HostClipboardValue publicationRaw = publicationSession.Observe(1);
            HostReadOpenGapCapture publicationCapture = publicationSession.CaptureSample();
            Require(publicationThrows.ReaderOpenCalls == 0 && publicationThrows.CopyCalls == 0, "publication_unknown_blocks_reader");
            Require(publicationCapture.Evidence.PublicationSequenceStatus == "unknown", "publication_unknown_version");
            Require(!HostReadOpenGapCalibration.Classify(publicationCapture, publicationRaw, true, false).ReaderRejected, "publication_throw_not_rejected");
            Require(publicationSession.Stop(), "publication_throw_stop");
        }

        GapFakeIo writerOpenFails = new GapFakeIo { WriterOpenResult = false };
        HostReadOpenGapSession writerOpenSession = new HostReadOpenGapSession(writerOpenFails);
        Require(writerOpenSession.Prepare(), "writer_open_prepare");
        HostClipboardValue writerOpenRaw = writerOpenSession.Observe(1);
        HostReadOpenGapCapture writerOpenCapture = writerOpenSession.CaptureSample();
        Require(writerOpenFails.WriterOpenCalls == 1 && writerOpenFails.WriterCloseCalls == 0, "writer_open_failed");
        Require(!HostReadOpenGapCalibration.Classify(writerOpenCapture, writerOpenRaw, true, false).ReaderRejected, "writer_open_not_rejected");
        Require(writerOpenSession.Stop(), "writer_open_stop");

        GapFakeIo emptyFails = new GapFakeIo { EmptyResult = false };
        HostReadOpenGapSession emptySession = new HostReadOpenGapSession(emptyFails);
        Require(emptySession.Prepare(), "empty_prepare");
        HostClipboardValue emptyRaw = emptySession.Observe(1);
        HostReadOpenGapCapture emptyCapture = emptySession.CaptureSample();
        Require(emptyFails.WriterCloseCalls == 1 && emptyFails.PublishCalls == 0, "empty_failed_closes_writer");
        Require(!HostReadOpenGapCalibration.Classify(emptyCapture, emptyRaw, true, false).ReaderRejected, "empty_not_rejected");
        Require(emptySession.Stop(), "empty_stop");

        GapFakeIo publishFails = new GapFakeIo { PublishResult = HostReadOpenGapStage.Failed };
        HostReadOpenGapSession publishSession = new HostReadOpenGapSession(publishFails);
        Require(publishSession.Prepare(), "publish_prepare");
        HostClipboardValue publishRaw = publishSession.Observe(1);
        HostReadOpenGapCapture publishCapture = publishSession.CaptureSample();
        Require(publishFails.WriterCloseCalls == 1 && publishFails.ReaderOpenCalls == 0, "publish_failed_closes_writer");
        Require(!HostReadOpenGapCalibration.Classify(publishCapture, publishRaw, true, false).ReaderRejected, "publish_not_rejected");
        Require(publishSession.Stop(), "publish_stop");

        GapFakeIo publishNotAttempted = new GapFakeIo { PublishResult = HostReadOpenGapStage.NotAttempted };
        HostReadOpenGapSession notAttemptedSession = new HostReadOpenGapSession(publishNotAttempted);
        Require(notAttemptedSession.Prepare(), "not_attempted_prepare");
        HostClipboardValue notAttemptedRaw = notAttemptedSession.Observe(1);
        HostReadOpenGapCapture notAttemptedCapture = notAttemptedSession.CaptureSample();
        Require(!notAttemptedCapture.Evidence.TraceValid && notAttemptedCapture.Evidence.PublicationStatus == "unknown", "called_publish_cannot_be_not_attempted");
        Require(publishNotAttempted.ReaderOpenCalls == 0 && !HostReadOpenGapCalibration.Classify(notAttemptedCapture, notAttemptedRaw, true, false).ReaderRejected, "not_attempted_publish_not_rejected");
        Require(notAttemptedSession.Stop(), "not_attempted_stop");

        GapFakeIo writerCloseNotAttempted = new GapFakeIo { WriterCloseResult = HostReadOpenGapStage.NotAttempted };
        HostReadOpenGapSession writerCloseNotAttemptedSession = new HostReadOpenGapSession(writerCloseNotAttempted);
        Require(writerCloseNotAttemptedSession.Prepare(), "close_not_attempted_prepare");
        HostClipboardValue writerCloseNotAttemptedRaw = writerCloseNotAttemptedSession.Observe(1);
        HostReadOpenGapCapture writerCloseNotAttemptedCapture = writerCloseNotAttemptedSession.CaptureSample();
        Require(!writerCloseNotAttemptedCapture.Evidence.TraceValid && writerCloseNotAttemptedCapture.WriterCloseStatus == HostReadOpenGapStage.NotAttempted, "opened_writer_must_attempt_close");
        Require(writerCloseNotAttempted.ReaderOpenCalls == 0 && !HostReadOpenGapCalibration.Classify(writerCloseNotAttemptedCapture, writerCloseNotAttemptedRaw, true, false).ReaderRejected, "not_attempted_close_not_rejected");
        Require(!writerCloseNotAttemptedSession.Stop(), "not_attempted_close_cleanup_unknown");

        GapFakeIo writerCloseFails = new GapFakeIo { WriterCloseResult = HostReadOpenGapStage.Failed };
        HostReadOpenGapSession writerCloseSession = new HostReadOpenGapSession(writerCloseFails);
        Require(writerCloseSession.Prepare(), "writer_close_prepare");
        HostClipboardValue writerCloseRaw = writerCloseSession.Observe(1);
        HostReadOpenGapCapture writerCloseCapture = writerCloseSession.CaptureSample();
        HostReadOpenGapResult writerCloseResult = HostReadOpenGapCalibration.Classify(writerCloseCapture, writerCloseRaw, false, true);
        Require(writerCloseFails.WriterCloseCalls == 1 && writerCloseFails.ReaderOpenCalls == 0, "writer_close_failed");
        Require(writerCloseResult.Code == "host_cleanup_unavailable" && !writerCloseResult.ReaderRejected, "writer_close_priority");
        Require(!writerCloseSession.Stop(), "writer_close_stop_failed");

        GapFakeIo ownerMismatch = new GapFakeIo { Owners = new List<bool> { false } };
        HostReadOpenGapSession ownerSession = new HostReadOpenGapSession(ownerMismatch);
        Require(ownerSession.Prepare(), "owner_prepare");
        HostClipboardValue ownerRaw = ownerSession.Observe(1);
        HostReadOpenGapCapture ownerCapture = ownerSession.CaptureSample();
        Require(ownerMismatch.ReaderOpenCalls == 0 && ownerMismatch.CopyCalls == 0, "publication_owner_mismatch");
        Require(!HostReadOpenGapCalibration.Classify(ownerCapture, ownerRaw, true, false).ReaderRejected, "owner_mismatch_not_rejected");
        Require(ownerSession.Stop(), "owner_stop");

        GapFakeIo readerBusy = new GapFakeIo { ReaderOpenResult = false };
        HostReadOpenGapSession busySession = new HostReadOpenGapSession(readerBusy);
        Require(busySession.Prepare(), "reader_busy_prepare");
        HostClipboardValue busyRaw = busySession.Observe(1);
        HostReadOpenGapCapture busyCapture = busySession.CaptureSample();
        Require(busyRaw.Code == "host_clipboard_busy" && readerBusy.ReaderCloseCalls == 0, "reader_busy_no_close");
        Require(!HostReadOpenGapCalibration.Classify(busyCapture, busyRaw, true, false).ReaderRejected, "reader_busy_not_rejected");
        Require(busySession.Stop(), "reader_busy_stop");
    }

    // 確認鎖內owner／版本、內容複製及讀後版本任一不足都不能假稱拒絕。
    private static void GuardAndCopyFailuresCannotRejectAsSuccess()
    {
        GapFakeIo ownerMismatch = new GapFakeIo { Owners = new List<bool> { true, false } };
        HostReadOpenGapSession ownerSession = new HostReadOpenGapSession(ownerMismatch);
        Require(ownerSession.Prepare(), "guard_owner_prepare");
        HostClipboardValue ownerRaw = ownerSession.Observe(1);
        HostReadOpenGapCapture ownerCapture = ownerSession.CaptureSample();
        Require(ownerMismatch.CopyCalls == 0 && ownerMismatch.ReaderCloseCalls == 1, "guard_owner_no_read");
        Require(!HostReadOpenGapCalibration.Classify(ownerCapture, ownerRaw, true, false).ReaderRejected, "guard_owner_not_rejected");
        Require(ownerSession.Stop(), "guard_owner_stop");

        foreach (uint[] versions in new uint[][] { new uint[] { 7, 8, 0, 8 }, new uint[] { 7, 8, 8, 0 }, new uint[] { 7, 8, 8, 7 } })
        {
            GapFakeIo io = new GapFakeIo { Versions = versions };
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "guard_sequence_prepare");
            HostClipboardValue raw = session.Observe(1);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(io.CopyCalls == (versions[2] == 8 ? 1 : 0), "guard_sequence_query_count");
            Require(!HostReadOpenGapCalibration.Classify(capture, raw, true, false).ReaderRejected, "guard_sequence_not_rejected");
            Require(session.Stop(), "guard_sequence_stop");
        }

        GapFakeIo guardSequenceThrows = new GapFakeIo();
        guardSequenceThrows.ThrowSequenceCalls.Add(3);
        HostReadOpenGapSession guardSequenceSession = new HostReadOpenGapSession(guardSequenceThrows);
        Require(guardSequenceSession.Prepare(), "guard_throw_prepare");
        HostClipboardValue guardSequenceRaw = guardSequenceSession.Observe(1);
        HostReadOpenGapCapture guardSequenceCapture = guardSequenceSession.CaptureSample();
        Require(guardSequenceThrows.CopyCalls == 0 && guardSequenceThrows.ReaderCloseCalls == 1, "guard_throw_no_read");
        Require(guardSequenceCapture.Evidence.LockedPublicationStatus == "unknown", "guard_throw_unknown");
        Require(!HostReadOpenGapCalibration.Classify(guardSequenceCapture, guardSequenceRaw, true, false).ReaderRejected, "guard_throw_not_rejected");
        Require(guardSequenceSession.Stop(), "guard_throw_stop");

        GapFakeIo formatMismatch = new GapFakeIo { FormatResult = false };
        HostReadOpenGapSession formatSession = new HostReadOpenGapSession(formatMismatch);
        Require(formatSession.Prepare(), "format_prepare");
        HostClipboardValue formatRaw = formatSession.Observe(1);
        HostReadOpenGapCapture formatCapture = formatSession.CaptureSample();
        Require(formatMismatch.SizeCalls == 0 && formatMismatch.CopyCalls == 0 && formatMismatch.ReaderCloseCalls == 1, "format_rejected_before_get");
        Require(!HostReadOpenGapCalibration.Classify(formatCapture, formatRaw, true, false).ReaderRejected, "format_not_rejected");
        Require(formatSession.Stop(), "format_stop");

        GapFakeIo invalidCopy = new GapFakeIo { CopyResult = new HostReadOpenGapCopy(HostReadOpenGapStage.Failed, ExpectedBytes()) };
        HostReadOpenGapSession invalidCopySession = new HostReadOpenGapSession(invalidCopy);
        Require(invalidCopySession.Prepare(), "copy_prepare");
        HostClipboardValue invalidCopyRaw = invalidCopySession.Observe(1);
        HostReadOpenGapCapture invalidCopyCapture = invalidCopySession.CaptureSample();
        Require(invalidCopyRaw.Code != "host_clipboard_unstable" || invalidCopyRaw.Text != null, "copy_failure_not_reader_race");
        Require(!HostReadOpenGapCalibration.Classify(invalidCopyCapture, invalidCopyRaw, true, false).ReaderRejected, "copy_failure_not_rejected");
        Require(AllZero(invalidCopy.CopyResult.Bytes), "failed_copy_buffer_cleared");
        Require(invalidCopySession.Stop(), "copy_stop");

        byte[] wrongBytes = ExpectedBytes();
        wrongBytes[0] ^= 1;
        GapFakeIo wrongPayload = new GapFakeIo { CopyResult = new HostReadOpenGapCopy(HostReadOpenGapStage.Succeeded, wrongBytes) };
        HostReadOpenGapSession payloadSession = new HostReadOpenGapSession(wrongPayload);
        Require(payloadSession.Prepare(), "payload_prepare");
        HostClipboardValue payloadRaw = payloadSession.Observe(1);
        HostReadOpenGapCapture payloadCapture = payloadSession.CaptureSample();
        Require(!HostReadOpenGapCalibration.Classify(payloadCapture, payloadRaw, true, false).ReaderRejected, "payload_mismatch_not_rejected");
        Require(AllZero(wrongBytes), "successful_copy_buffer_cleared_by_strategy");
        Require(payloadSession.Stop(), "payload_stop");

        GapFakeIo readerCloseFails = new GapFakeIo { ReaderCloseResult = HostReadOpenGapStage.Failed };
        HostReadOpenGapSession readerCloseSession = new HostReadOpenGapSession(readerCloseFails);
        Require(readerCloseSession.Prepare(), "reader_close_prepare");
        HostClipboardValue readerCloseRaw = readerCloseSession.Observe(1);
        HostReadOpenGapCapture readerCloseCapture = readerCloseSession.CaptureSample();
        HostReadOpenGapResult readerCloseResult = HostReadOpenGapCalibration.Classify(readerCloseCapture, readerCloseRaw, true, false);
        Require(readerCloseRaw.Code == "host_cleanup_unavailable" && !readerCloseResult.ReaderRejected, "reader_close_cleanup");
        Require(readerCloseResult.Code == "host_cleanup_unavailable" && !readerCloseSession.Stop(), "reader_close_cleanup_priority");

        GapFakeIo readback = new GapFakeIo { Versions = new uint[] { 7, 8, 8, 9 } };
        HostReadOpenGapSession readbackSession = new HostReadOpenGapSession(readback);
        Require(readbackSession.Prepare(), "readback_prepare");
        HostClipboardValue readbackRaw = readbackSession.Observe(1);
        HostReadOpenGapCapture readbackCapture = readbackSession.CaptureSample();
        Require(readbackRaw.Code == "host_clipboard_unstable" && !HostReadOpenGapCalibration.Classify(readbackCapture, readbackRaw, true, false).ReaderRejected, "readback_version_mismatch");
        Require(readbackSession.Stop(), "readback_stop");

        HostClipboardValue beforeRead = new HostClipboardValue { Code = "host_clipboard_unstable", Version = 0, OwnerMatches = null, ResourcesClosed = true };
        HostReadOpenGapCapture beforeCapture = new HostReadOpenGapCapture(0, 0, 0, 0, HostReadOpenGapStage.NotAttempted, true, null);
        Require(!HostReadOpenGapCalibration.Classify(beforeCapture, beforeRead, true, false).ReaderRejected, "read_before_not_rejected");
    }

    // 確認cleanup、scope、overflow與reader錯誤碼遵守獨立優先序。
    private static void CodePrecedenceKeepsReaderSeparate()
    {
        GapFakeIo io = new GapFakeIo { WriterCloseResult = HostReadOpenGapStage.Failed };
        HostReadOpenGapSession session = new HostReadOpenGapSession(io);
        Require(session.Prepare(), "precedence_prepare");
        HostClipboardValue raw = session.Observe(1);
        HostReadOpenGapCapture capture = session.CaptureSample();
        HostReadOpenGapResult cleanup = HostReadOpenGapCalibration.Classify(capture, raw, false, true);
        Require(cleanup.Code == "host_cleanup_unavailable" && !cleanup.ReaderRejected, "cleanup_first");
        Require(!session.Stop(), "cleanup_stop");

        GapFakeIo normalIo = new GapFakeIo();
        HostReadOpenGapSession normal = new HostReadOpenGapSession(normalIo);
        Require(normal.Prepare(), "scope_prepare");
        HostClipboardValue normalRaw = normal.Observe(1);
        HostReadOpenGapCapture normalCapture = normal.CaptureSample();
        HostReadOpenGapResult scope = HostReadOpenGapCalibration.Classify(normalCapture, normalRaw, false, true);
        Require(scope.Code == "host_scope_changed" && !scope.ReaderRejected, "scope_before_overflow");
        Require(normal.Stop(), "scope_stop");

        GapFakeIo publishIo = new GapFakeIo { EmptyResult = false };
        HostReadOpenGapSession publish = new HostReadOpenGapSession(publishIo);
        Require(publish.Prepare(), "publish_code_prepare");
        HostClipboardValue publishRaw = publish.Observe(1);
        HostReadOpenGapCapture publishCapture = publish.CaptureSample();
        HostReadOpenGapResult publication = HostReadOpenGapCalibration.Classify(publishCapture, publishRaw, true, false);
        Require(publication.Code == "host_capability_unavailable" && publication.ReaderCode == "host_clipboard_busy", "primary_separate_from_reader");
        Require(publish.Stop(), "publish_code_stop");

        GapFakeIo busyIo = new GapFakeIo { ReaderOpenResult = false };
        HostReadOpenGapSession busy = new HostReadOpenGapSession(busyIo);
        Require(busy.Prepare(), "busy_prepare");
        HostClipboardValue busyRaw = busy.Observe(1);
        HostReadOpenGapCapture busyCapture = busy.CaptureSample();
        HostReadOpenGapResult busyResult = HostReadOpenGapCalibration.Classify(busyCapture, busyRaw, true, false);
        Require(busyResult.Code == "host_clipboard_busy" && busyResult.ReaderCode == "host_clipboard_busy", "valid_reader_busy_code");
        Require(busy.Stop(), "busy_stop");
    }

    // 確認錯thread、重入、重複封存與失敗Stop均不能恢復一次性狀態。
    private static void ThreadReentryAndSealsNeverRecover()
    {
        GapFakeIo prepareDuringIo = new GapFakeIo();
        HostReadOpenGapSession prepareSession = new HostReadOpenGapSession(prepareDuringIo);
        bool prepareStopRejected = false;
        // 同thread重入只用於驗證prepare期間禁止cleanup。
        prepareDuringIo.PrepareHook = delegate { prepareStopRejected = !prepareSession.Stop(); };
        Require(!prepareSession.Prepare() && prepareStopRejected && prepareDuringIo.ReleaseCalls == 0, "prepare_stop_reentry_has_no_io");
        HostClipboardValue invalidPrepareObserve = prepareSession.Observe(1);
        Require(invalidPrepareObserve.Code == "host_capability_unavailable" && prepareDuringIo.SequenceCalls == 0, "invalid_prepare_never_invokes_shared_reader");
        Require(prepareSession.Stop() && prepareDuringIo.ReleaseCalls == 1, "prepare_stop_reentry_later_cleanup");

        GapFakeIo reentrantIo = new GapFakeIo();
        HostReadOpenGapSession reentrant = new HostReadOpenGapSession(reentrantIo);
        Require(reentrant.Prepare(), "reentrant_prepare");
        bool reentryRejected = false;
        // 模擬native呼叫期間的重入，確認不會啟動第二輪reader。
        reentrantIo.SequenceHook = delegate
        {
            HostClipboardValue nested = reentrant.Observe(1);
            reentryRejected = nested.Code == "host_capability_unavailable";
        };
        HostClipboardValue reentrantRaw = reentrant.Observe(1);
        Require(reentryRejected && reentrantRaw.Code == "host_text_invalid", "reentry_rejected");
        Require(reentrantIo.SequenceCalls == 1 && reentrantIo.WriterOpenCalls == 0, "reentry_no_io");
        HostReadOpenGapCapture reentrantCapture = reentrant.CaptureSample();
        Require(!reentrantCapture.Evidence.TraceValid && reentrant.Stop(), "reentry_sticky");
        Require(!reentrant.GetFinalTrace().TraceValid, "reentry_final_sticky");

        GapFakeIo writerOpenReentryIo = new GapFakeIo();
        HostReadOpenGapSession writerOpenReentry = new HostReadOpenGapSession(writerOpenReentryIo);
        Require(writerOpenReentry.Prepare(), "writer_open_reentry_prepare");
        bool writerOpenStopRejected = false;
        // 模擬writer Open返回前的同thread cleanup重入。
        writerOpenReentryIo.OpenWriterHook = delegate { writerOpenStopRejected = !writerOpenReentry.Stop(); };
        HostClipboardValue writerOpenReentryRaw = writerOpenReentry.Observe(1);
        Require(writerOpenStopRejected && writerOpenReentryIo.WriterCloseCalls == 1, "writer_open_reentry_closes_successful_open");
        Require(writerOpenReentryIo.EmptyCalls == 0 && writerOpenReentryIo.ReaderOpenCalls == 0, "writer_open_reentry_stops_followup");
        Require(writerOpenReentryRaw.Code == "host_clipboard_busy" && writerOpenReentry.Stop(), "writer_open_reentry_cleanup");

        GapFakeIo readerOpenReentryIo = new GapFakeIo();
        HostReadOpenGapSession readerOpenReentry = new HostReadOpenGapSession(readerOpenReentryIo);
        Require(readerOpenReentry.Prepare(), "reader_open_reentry_prepare");
        bool readerOpenStopRejected = false;
        // 模擬reader Open已成功但呼叫尚未返回時的cleanup重入。
        readerOpenReentryIo.OpenReaderHook = delegate { readerOpenStopRejected = !readerOpenReentry.Stop(); };
        HostClipboardValue readerOpenReentryRaw = readerOpenReentry.Observe(1);
        Require(readerOpenStopRejected && readerOpenReentryIo.ReaderCloseCalls == 1, "reader_open_reentry_closes_successful_open");
        Require(readerOpenReentryIo.CopyCalls == 0 && readerOpenReentryRaw.ResourcesClosed, "reader_open_reentry_no_read");
        Require(readerOpenReentry.Stop() && !readerOpenReentry.GetFinalTrace().TraceValid, "reader_open_reentry_cleanup");

        GapFakeIo formatReentryIo = new GapFakeIo();
        HostReadOpenGapSession formatReentry = new HostReadOpenGapSession(formatReentryIo);
        Require(formatReentry.Prepare(), "format_reentry_prepare");
        bool formatStopRejected = false;
        // 模擬持鎖格式查詢中的重入，後續不得讀資料但須關閉reader。
        formatReentryIo.FormatHook = delegate { formatStopRejected = !formatReentry.Stop(); };
        HostClipboardValue formatReentryRaw = formatReentry.Observe(1);
        Require(formatStopRejected && formatReentryIo.ReaderCloseCalls == 1, "format_reentry_closes_reader");
        Require(formatReentryIo.SizeCalls == 0 && formatReentryIo.CopyCalls == 0 && formatReentryRaw.ResourcesClosed, "format_reentry_no_read");
        Require(formatReentry.Stop() && !formatReentry.GetFinalTrace().TraceValid, "format_reentry_cleanup");

        GapFakeIo stopDuringIo = new GapFakeIo();
        HostReadOpenGapSession stopSession = new HostReadOpenGapSession(stopDuringIo);
        Require(stopSession.Prepare(), "stop_reentry_prepare");
        bool stopWasRejected = false;
        // 模擬序號native呼叫內重入cleanup。
        stopDuringIo.SequenceHook = delegate { stopWasRejected = !stopSession.Stop(); };
        HostClipboardValue stoppedRaw = stopSession.Observe(1);
        Require(stopWasRejected && stopDuringIo.ReleaseCalls == 0, "stop_reentry_has_no_io");
        Require(stoppedRaw.Code == "host_text_invalid" && stopDuringIo.WriterOpenCalls == 0, "stop_reentry_stops_publication");
        Require(!stopSession.CaptureSample().Evidence.TraceValid, "stop_reentry_invalid_trace");
        Require(stopSession.Stop() && stopDuringIo.ReleaseCalls == 1, "stop_reentry_later_cleanup");

        GapFakeIo wrongThreadIo = new GapFakeIo();
        HostReadOpenGapSession wrongThread = new HostReadOpenGapSession(wrongThreadIo);
        Require(wrongThread.Prepare(), "thread_prepare");
        HostClipboardValue wrongThreadValue = null;
        // 只以pure fake驗錯thread不會呼叫任何port。
        Thread thread = new Thread(new ThreadStart(delegate
        {
            wrongThreadValue = wrongThread.Observe(1);
        }));
        thread.Start();
        Require(thread.Join(2000), "thread_join");
        Require(wrongThreadValue != null && wrongThreadValue.Code == "host_capability_unavailable", "wrong_thread_rejected");
        Require(wrongThreadIo.SequenceCalls == 0 && wrongThreadIo.WriterOpenCalls == 0, "wrong_thread_no_io");
        HostClipboardValue invalidThreadObserve = wrongThread.Observe(1);
        Require(invalidThreadObserve.Code == "host_capability_unavailable" && wrongThreadIo.SequenceCalls == 0, "invalid_thread_never_invokes_shared_reader");
        Require(wrongThread.Stop() && !wrongThread.GetFinalTrace().TraceValid, "wrong_thread_sticky_stop");

        GapFakeIo duplicateIo = new GapFakeIo();
        HostReadOpenGapSession duplicate = new HostReadOpenGapSession(duplicateIo);
        Require(duplicate.Prepare(), "duplicate_prepare");
        HostClipboardValue duplicateRaw = duplicate.Observe(1);
        HostReadOpenGapCapture firstCapture = duplicate.CaptureSample();
        HostReadOpenGapCapture secondCapture = duplicate.CaptureSample();
        Require(duplicateRaw.Code == "host_clipboard_unstable" && firstCapture.Evidence.TraceValid, "first_seal_valid");
        Require(!secondCapture.Evidence.TraceValid && duplicateIo.SequenceCalls == 4, "second_seal_invalid");
        Require(duplicate.Stop() && !duplicate.GetFinalTrace().TraceValid, "duplicate_stop_invalid");

        GapFakeIo invalidAfterCalls = new GapFakeIo();
        HostReadOpenGapSession invalidAfter = new HostReadOpenGapSession(invalidAfterCalls);
        Require(invalidAfter.Prepare(), "invalid_after_prepare");
        HostClipboardValue invalidAfterRaw = invalidAfter.Observe(1);
        try { invalidAfter.Sequence(); } catch { }
        HostReadOpenGapCapture invalidAfterCapture = invalidAfter.CaptureSample();
        Require(invalidAfterRaw.Code == "host_clipboard_unstable" && !invalidAfterCapture.Evidence.TraceValid, "invalid_after_sticky");
        Require(invalidAfterCapture.Evidence.PublicationStatus == "unknown" && invalidAfterCapture.Evidence.PublicationSequenceStatus == "unknown", "invalid_trace_hides_positive_comparisons");
        Require(invalidAfterCapture.Evidence.LockedPublicationStatus == "unknown" && invalidAfterCapture.Evidence.ReadCloseStatus == "unknown", "invalid_trace_hides_positive_stages");
        Require(invalidAfterCalls.SequenceCalls == 4 && invalidAfter.Stop(), "invalid_after_no_probe");

        GapFakeIo finalWrongThreadIo = new GapFakeIo();
        HostReadOpenGapSession finalWrongThread = new HostReadOpenGapSession(finalWrongThreadIo);
        Require(finalWrongThread.Prepare(), "final_thread_prepare");
        Require(finalWrongThread.Observe(1).Code == "host_clipboard_unstable", "final_thread_observe");
        Require(finalWrongThread.CaptureSample().Evidence.TraceValid && finalWrongThread.Stop(), "final_thread_close");
        HostReadOpenGapFinal foreignFinal = null;
        // 錯thread讀final會令owner稍後讀到sticky invalid副本。
        Thread finalThread = new Thread(new ThreadStart(delegate { foreignFinal = finalWrongThread.GetFinalTrace(); }));
        finalThread.Start();
        Require(finalThread.Join(2000), "final_thread_join");
        Require(foreignFinal != null && !foreignFinal.TraceValid, "foreign_final_unknown");
        Require(finalWrongThread.GetFinalTrace().TraceFinalized && !finalWrongThread.GetFinalTrace().TraceValid, "foreign_final_invalidates_cached_trace");

        GapFakeIo releaseFails = new GapFakeIo { ReleaseResult = false };
        HostReadOpenGapSession failedStop = new HostReadOpenGapSession(releaseFails);
        Require(failedStop.Prepare(), "failed_stop_prepare");
        HostClipboardValue releaseRaw = failedStop.Observe(1);
        Require(releaseRaw.Code == "host_clipboard_unstable", "failed_stop_observe");
        Require(failedStop.CaptureSample().Evidence.TraceValid, "failed_stop_sample");
        Require(!failedStop.Stop() && !failedStop.Stop() && releaseFails.ReleaseCalls == 1, "release_failure_sticky");
        Require(!failedStop.GetFinalTrace().TraceFinalized, "release_failure_not_finalized");
    }

    // 驗證native adapter固定配置、回驗、轉交與清理所有權。
    private static void NativeIoTransfersOnlyAfterVerifiedPreparation()
    {
        using (GapFakeNativeCalls native = new GapFakeNativeCalls { GlobalSizeOverride = 34 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Succeeded, "native_prepare");
            Require(native.CreateWindowCalls == 2 && native.GlobalAllocCalls == 1, "native_two_windows_and_fixed_alloc");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0 && native.SetClipboardDataCalls == 0, "prepare_has_no_clipboard_side_effect");
            byte[] allocation = native.SnapshotAllocation();
            byte[] expected = ExpectedBytes();
            Require(allocation.Length == 34 && HostReadOpenGapPayload.Matches(allocation), "prepared_payload_and_padding");
            for (int index = 0; index < expected.Length; index++) Require(allocation[index] == expected[index], "prepared_payload_literal");
            for (int index = expected.Length; index < allocation.Length; index++) Require(allocation[index] == 0, "prepared_zero_padding");
            Array.Clear(allocation, 0, allocation.Length);
            Array.Clear(expected, 0, expected.Length);

            Require(io.OpenWriter() && io.Empty(), "writer_open_and_empty");
            Require(io.PublishFixed() == HostReadOpenGapStage.Succeeded && native.Transferred, "fixed_set_transfers_owner");
            Require(io.CloseWriter() == HostReadOpenGapStage.Succeeded && io.OwnsPublication(), "writer_close_and_owner");
            Require(io.Sequence() == 7 && io.OpenReader() && io.OwnsPublication(), "reader_open_and_locked_owner");
            Require(io.Sequence() == 8 && io.HasUnicode(), "reader_guard_sequence_and_format");
            Require(io.ContainerSize() == 34 && native.GetClipboardDataCalls == 1, "bounded_get_data_size");
            HostReadOpenGapCopy copy = io.ReadContainer(34);
            Require(copy != null && copy.Status == HostReadOpenGapStage.Succeeded && HostReadOpenGapPayload.Matches(copy.Bytes), "reader_copy_payload");
            Require(io.OwnerMatches(101) == false && io.Sequence() == 8, "reader_owner_and_post_sequence");
            Require(io.CloseReader() == HostReadOpenGapStage.Succeeded && io.Release(), "reader_and_fixture_cleanup");
            Require(native.GlobalFreeCalls == 0 && native.CloseClipboardCalls == 2, "transferred_memory_not_freed");
            Array.Clear(copy.Bytes, 0, copy.Bytes.Length);
        }

        foreach (int invalidSize in new int[] { 31, 33, 65540 })
        {
            using (GapFakeNativeCalls native = new GapFakeNativeCalls { GlobalSizeOverride = invalidSize })
            {
                HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
                Require(io.Prepare() == HostReadOpenGapStage.Failed, "invalid_actual_size_rejected");
                Require(native.EmptyClipboardCalls == 0 && native.SetClipboardDataCalls == 0, "invalid_size_not_published");
                Require(io.Release() && native.GlobalFreeCalls == 1, "invalid_size_owned_alloc_freed");
            }
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { CorruptCopyFromAt = 1 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Failed, "payload_readback_mismatch_rejected");
            Require(native.EmptyClipboardCalls == 0 && native.SetClipboardDataCalls == 0, "payload_mismatch_not_published");
            Require(io.Release() && native.GlobalFreeCalls == 1, "payload_mismatch_releases_owned_alloc");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { SetReturnsNull = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Succeeded && io.OpenWriter() && io.Empty(), "set_failure_prepare");
            Require(io.PublishFixed() == HostReadOpenGapStage.Failed && io.CloseWriter() == HostReadOpenGapStage.Succeeded, "set_failure_is_known_and_closed");
            Require(io.Release() && native.SetClipboardDataCalls == 1 && native.GlobalFreeCalls == 1, "failed_set_retains_owned_alloc");
        }
    }

    // 驗證持鎖owner或Vg不符時不讀取容器而仍關閉reader。
    private static void LockedGuardRejectsForeignPublicationWithoutRead()
    {
        VerifyLockedGuard(new GapFakeNativeCalls { OwnerIsWriter = new bool[] { true, false } }, "mismatched");
        VerifyLockedGuard(new GapFakeNativeCalls { Versions = new uint[] { 7, 8, 9, 8 } }, "mismatched");
        VerifyLockedGuard(new GapFakeNativeCalls { Versions = new uint[] { 7, 8, 0, 8 } }, "unknown");
        VerifyLockedGuard(new GapFakeNativeCalls { ThrowSequenceAt = 3 }, "unknown");
    }

    // 以單輪shared reader驗證持鎖guard與資料讀取的先後關係。
    private static void VerifyLockedGuard(GapFakeNativeCalls native, string expectedGuardStatus)
    {
        using (native)
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "guard_fixture_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(capture.Evidence.LockedPublicationStatus == expectedGuardStatus, "locked_guard_classification");
            Require(raw.ResourcesClosed && native.CloseClipboardCalls == 2, "reader_still_closes_after_guard_reject");
            Require(native.OpenClipboardCalls == 2 && native.GetClipboardDataCalls == 0, "guard_reject_before_getclipboarddata");
            Require(native.CopyFromCalls == 1 && native.GetClipboardDataCalls == 0, "guard_reject_before_reader_copy");
            Require(!HostReadOpenGapCalibration.Classify(capture, raw, true, false).ReaderRejected, "guard_reject_not_success");
            Require(session.Stop(), "guard_fixture_cleanup");
        }
    }

    // 驗證copy／Unlock失敗與payload不符都不會洩漏未交付buffer。
    private static void UnreturnedBufferIsClearedOnEveryFailure()
    {
        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowCopyFromAt = 2 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "copy_throw_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(raw.Code == "host_text_invalid" && raw.ResourcesClosed, "copy_throw_shared_reader_cleanup");
            Require(native.LastCopyFromBuffer != null && AllZero(native.LastCopyFromBuffer), "throwing_copy_buffer_cleared");
            Require(capture.Evidence.ReaderCopyStatus == "unknown" && native.CloseClipboardCalls == 2, "copy_throw_unknown_and_closed");
            Require(session.Stop(), "copy_throw_stop");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailGlobalUnlockAt = 2 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "unlock_fail_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(raw.Code == "host_cleanup_unavailable" && !raw.ResourcesClosed, "unlock_fail_cleanup_code");
            Require(native.LastCopyFromBuffer != null && AllZero(native.LastCopyFromBuffer), "unlock_failed_copy_buffer_cleared");
            Require(capture.Evidence.ReadCloseStatus == "failed" && !session.Stop(), "unlock_fail_sticky_cleanup");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowGlobalUnlockAt = 2 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "unlock_unknown_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(raw.Code == "host_cleanup_unavailable" && !raw.ResourcesClosed, "unlock_unknown_cleanup_code");
            Require(native.LastCopyFromBuffer != null && AllZero(native.LastCopyFromBuffer), "unlock_unknown_copy_buffer_cleared");
            Require(capture.Evidence.ReadCloseStatus == "unknown" && !session.Stop(), "unlock_unknown_not_closed_successfully");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowGlobalLockAt = 2 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "lock_unknown_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(native.GetClipboardDataCalls == 1 && native.CloseClipboardCalls == 2, "lock_unknown_closes_clipboard");
            Require(raw.Code == "host_cleanup_unavailable" && !raw.ResourcesClosed, "lock_unknown_cleanup_code");
            Require(capture.Evidence.ReadCloseStatus == "unknown" && !session.Stop(), "lock_unknown_not_released");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { CorruptCopyFromAt = 2 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "payload_mismatch_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(raw.Code == "host_clipboard_unstable" && raw.Text == null, "mismatched_bytes_still_use_shared_reader");
            Require(capture.Evidence.PayloadStatus == "mismatched" && !HostReadOpenGapCalibration.Classify(capture, raw, true, false).ReaderRejected, "mismatched_payload_not_success");
            Require(native.LastCopyFromBuffer != null && AllZero(native.LastCopyFromBuffer), "shared_reader_clears_returned_buffer");
            Require(session.Stop(), "payload_mismatch_cleanup");
        }
    }

    // Set結果未知時不能free已可能轉交系統的handle或再次Set。
    private static void UnknownTransferIsQuarantined()
    {
        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowSetAfterTransfer = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            HostReadOpenGapSession session = new HostReadOpenGapSession(io);
            Require(session.Prepare(), "unknown_transfer_prepare");
            HostClipboardValue raw = session.Observe(101);
            HostReadOpenGapCapture capture = session.CaptureSample();
            Require(raw.Code == "host_clipboard_busy" && capture.Evidence.PublicationStatus == "unknown", "unknown_transfer_partial_result");
            Require(native.SetClipboardDataCalls == 1 && native.CloseClipboardCalls == 1 && native.OpenClipboardCalls == 1, "unknown_transfer_once");
            Require(!session.Stop() && !session.Stop(), "unknown_transfer_cleanup_unknown");
            Require(native.GlobalFreeCalls == 0 && native.SetClipboardDataCalls == 1, "unknown_transfer_not_freed_or_retried");
        }
    }

    // 部分初始化與native cleanup失敗必須分項嘗試且保留所有權。
    private static void PartialPreparationAndCleanupKeepOwnership()
    {
        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailRegisterClass = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Failed, "class_registration_failed");
            Require(io.Release() && native.CreateWindowCalls == 0 && native.UnregisterClassCalls == 0, "class_registration_cleanup");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "class_registration_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailCreateWindowAt = 2 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Failed, "reader_window_creation_failed");
            Require(io.Release() && native.DestroyWindowCalls == 1 && native.UnregisterClassCalls == 1, "partial_window_cleanup");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "partial_setup_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowCreateWindowAt = 1 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Unknown, "window_creation_unknown");
            Require(!io.Release() && native.DestroyWindowCalls == 0 && native.UnregisterClassCalls == 1, "unknown_window_not_guessed_owned");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "unknown_window_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowRegisterAfterSuccess = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Unknown, "class_registration_unknown");
            Require(io.Release() && native.UnregisterClassCalls == 1, "unknown_class_registration_cleaned_by_unique_name");
            Require(native.CreateWindowCalls == 0 && native.OpenClipboardCalls == 0, "unknown_class_no_window_or_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailGlobalLockAt = 1 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Failed, "prepare_lock_failed");
            Require(io.Release() && native.GlobalFreeCalls == 1 && native.DestroyWindowCalls == 2, "unlocked_allocation_released");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "lock_failure_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowGlobalLockAt = 1 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Unknown, "lock_result_unknown");
            Require(!io.Release() && native.GlobalFreeCalls == 0 && native.GlobalUnlockCalls == 0, "unknown_lock_not_unlocked_or_freed");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "unknown_lock_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailGlobalAlloc = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Failed, "allocation_failed");
            Require(io.Release() && native.GlobalFreeCalls == 0 && native.DestroyWindowCalls == 2, "allocation_failure_partial_cleanup");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "allocation_failure_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailGlobalUnlockAt = 1 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Failed, "prepare_unlock_failed");
            Require(!io.Release() && native.GlobalFreeCalls == 0, "locked_allocation_not_freed");
            Require(native.DestroyWindowCalls == 2 && native.UnregisterClassCalls == 1, "unlock_failure_other_cleanup_attempted");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { ThrowGlobalAllocAfterAlloc = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Unknown, "allocation_result_unknown");
            Require(!io.Release() && native.GlobalFreeCalls == 0, "unknown_allocation_not_freed");
            Require(native.OpenClipboardCalls == 0 && native.EmptyClipboardCalls == 0, "unknown_alloc_no_clipboard");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailDestroyWindowHandle = 7101 })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Succeeded, "destroy_failure_prepare");
            Require(!io.Release(), "destroy_failure_cleanup_failed");
            Require(native.DestroyWindowCalls == 2 && native.UnregisterClassCalls == 1, "destroy_failure_does_not_short_circuit");
        }

        using (GapFakeNativeCalls native = new GapFakeNativeCalls { FailUnregisterClass = true })
        {
            HostReadOpenGapWindowsIo io = new HostReadOpenGapWindowsIo(native);
            Require(io.Prepare() == HostReadOpenGapStage.Succeeded, "unregister_failure_prepare");
            Require(!io.Release() && native.DestroyWindowCalls == 2 && native.UnregisterClassCalls == 1, "unregister_failure_recorded");
        }
    }

    // Linux只驗factory在建立任何原生物件前拒絕，Windows不呼叫factory。
    private static void NonWindowsFactoryRejectsBeforeNative()
    {
#if NETCOREAPP
        if (OperatingSystem.IsWindows())
        {
            Console.WriteLine("read_open_gap_native_factory_guard_not_run,windowsNative=false");
            return;
        }
#else
        if (Environment.OSVersion.Platform == PlatformID.Win32NT)
        {
            Console.WriteLine("read_open_gap_native_factory_guard_not_run,windowsNative=false");
            return;
        }
#endif
        bool rejected = false;
        try { HostReadOpenGapWindows.StartWindows(); }
        catch (PlatformNotSupportedException) { rejected = true; }
        Require(rejected, "non_windows_factory_guard");
    }

    // Main與CI刻意不呼叫真正的Windows原生oracle。
    private static void WindowsReadOpenGapOracleNotInvoked()
    {
        HostReadOpenGapWindows fixture = HostReadOpenGapWindows.StartWindows();
        HostClipboardValue raw = null;
        try
        {
            if (!fixture.Ready) throw new InvalidOperationException("native_setup");
            raw = fixture.Observe(0);
            HostReadOpenGapCapture capture = fixture.CaptureSample();
            if (raw.Code != "host_clipboard_unstable" || raw.Text != null || raw.Stable || raw.Version == 0
                || raw.OwnerMatches != false || !raw.ResourcesClosed || capture.Evidence == null || !capture.Evidence.TraceValid)
                throw new InvalidOperationException("native_predicate");
        }
        finally
        {
            if (raw != null) raw.Text = null;
            if (!fixture.Stop()) throw new InvalidOperationException("native_cleanup");
        }
    }

    // 純主程式只執行fake策略契約，絕不建立Windows fixture或原生owner。
    public static int Main()
    {
        try
        {
            SharedStrategyRejectsControlledGap();
            GapOrdersRealCallsExactlyOnce();
            PublicationWithoutKnownVersionStopsReader();
            GuardAndCopyFailuresCannotRejectAsSuccess();
            CodePrecedenceKeepsReaderSeparate();
            ThreadReentryAndSealsNeverRecover();
            PrepareFailureDoesNotMasqueradeAsCleanupFailure();
            PayloadHasFixedPublicBytesAndBounds();
            NativeIoTransfersOnlyAfterVerifiedPreparation();
            LockedGuardRejectsForeignPublicationWithoutRead();
            UnreturnedBufferIsClearedOnEveryFailure();
            UnknownTransferIsQuarantined();
            PartialPreparationAndCleanupKeepOwnership();
            NonWindowsFactoryRejectsBeforeNative();
            Console.WriteLine("clipboard_read_open_gap_core_observed,windowsNative=false");
            Console.WriteLine("clipboard_read_open_gap_fixture_contracts_observed,windowsNative=false");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("read_open_gap_core_contract_failed," + error.Message);
            return 1;
        }
    }
}
