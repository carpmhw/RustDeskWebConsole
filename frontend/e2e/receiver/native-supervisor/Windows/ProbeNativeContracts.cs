namespace RdWeb.Receiver.NativeSupervisor.Windows;

internal enum IoState { Complete, Pending, Eof, Aborted, Failed }
internal readonly record struct IoResult(IoState State, uint Bytes = 0);
internal readonly record struct ProcessResult(bool Success, nint Process, nint Thread);
internal readonly record struct ProcessObservation(bool Valid, bool Signaled, uint ExitCode);

// 只能由未來來源guard於組件內建立；此型別本身不證來源已驗。
internal sealed record ProbeLaunchPlan(string Application, string CommandLine, string Environment, string Directory);

// 單調clock由同輪啟動端持有，不能被session重設或補時。
internal interface IProbeClock
{
    long ElapsedMs { get; }
    bool IsRunning { get; }
}

// 唯一OS邊界；raw值只在friend測試及本組件流動，絕不進公開診斷。
internal interface IProbeNativeApi
{
    bool Supported { get; }
    // 取得SID-only描述元；已取得但後續失敗仍由owner釋放。
    nint CreateDescriptor();
    // 描述元使用LocalFree而非CloseHandle。
    bool FreeDescriptor(nint descriptor);
    // 配置穩定原生記憶體，供非同步I/O跨呼叫存活。
    nint Allocate(int size);
    // 僅在沒有pending參照時釋放配置。
    void Free(nint memory);
    // 建立未命名且不可繼承的job。
    nint CreateJob();
    // 固定只設KILL_ON_JOB_CLOSE，不放行breakaway。
    bool LimitJob(nint job);
    // 建立不可繼承manual-reset event。
    nint CreateEvent();
    // 建立單一、拒絕遠端、overlapped讀端。
    nint CreatePipeServer(string name, nint descriptor);
    // 開啟可繼承的同步寫端，不把名稱傳給child。
    nint OpenPipeWriter(string name);
    // 非阻塞connect，結果不能混用pending與已連接。
    IoResult Connect(nint pipe, nint overlapped);
    // 最多一筆穩定buffer的有界讀取。
    IoResult Read(nint pipe, nint buffer, uint capacity, nint overlapped);
    // 不等待的完成查詢，取消要求不能取代本結果。
    IoResult Complete(nint pipe, nint overlapped);
    // 僅要求取消同一筆I/O，true不代表完成。
    bool Cancel(nint pipe, nint overlapped);
    // 建立stdin兩端；只有成功時輸出才可認領。
    bool CreateStdin(out nint read, out nint write);
    // 顯式標準handle allowlist，失敗out值不可認領。
    ProcessResult CreateSuspended(ProbeLaunchPlan plan, nint stdin, nint stdout, nint stderr);
    // 只指派本輪直接持有的process。
    bool Assign(nint job, nint process);
    // 查詢指定非零job的實際歸屬。
    bool Belongs(nint job, nint process);
    // 回傳先前suspend count；只有1可證一次恢復。
    uint Resume(nint thread);
    // 零等待查詢本輪process的signal及exit。
    ProcessObservation ObserveProcess(nint process);
    // 只查指定本輪job，錯誤與active=0分離。
    bool QueryActive(nint job, out uint active);
    // 指派前只終止本輪暫停process。
    bool TerminateProcess(nint process);
    // 指派後只終止本輪job。
    bool TerminateJob(nint job);
    // 原生關閉回值是owner收尾證據，不以Dispose代替。
    bool Close(nint handle);
    // 收回同步API建立的暫存token／描述元／attribute-list，失敗黏住。
    bool CloseAuxiliary();
}
