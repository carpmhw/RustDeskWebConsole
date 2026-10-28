using System.Runtime.InteropServices;
using RdWeb.Receiver.NativeSupervisor.Windows;

namespace RdWeb.Receiver.NativeSupervisor.Tests;

// 只替換OS邊界；owner／pipe／session／Core皆為被測真實實作。
internal static class NativeSessionCases
{
    private const string UnverifiedJobLine = "receiver_native_supervisor_diagnostic,{\"version\":3,\"phase\":\"failed\",\"reason\":\"io_failed\",\"childStart\":\"unknown\",\"childExit\":\"unknown\",\"childPolicyRestore\":\"unknown\",\"supervisorBoundaryVerify\":\"confirmed\",\"resourcesClose\":\"unknown\",\"jobAssigned\":\"unconfirmed\",\"treeEmpty\":\"unconfirmed\",\"stdoutEof\":\"unknown\",\"stderrEof\":\"unknown\",\"caseSet\":\"unknown\",\"cancelState\":\"unconfirmed\"}\n";
    // close失敗不能重試或被第二次CloseAll洗成成功。
    internal static void HandleOwnership()
    {
        var api = new FakeApi();
        var owner = new OwnedNativeResources(api);
        var handle = api.CreateJob();
        Require(owner.Own(handle) == handle);
        api.CloseFails = true;
        Require(!owner.Close(handle));
        api.CloseFails = false;
        Require(!owner.CloseAll() && api.CloseCalls == 1);
        api.ReleaseFixture();
    }

    // Windows可立即重用已關閉的handle數值，新取得項不能被舊close快取吞掉。
    internal static void HandleReuse()
    {
        var api = new FakeApi();
        var owner = new OwnedNativeResources(api);
        var first = owner.Own(api.CreateJob());
        Require(owner.Close(first));
        api.NextHandle = (long)first;
        Require(owner.Own(api.CreateJob()) == first);
        Require(owner.CloseAll() && api.CloseCalls == 2 && api.Handles.Count == 0);
        api.ReleaseFixture();
    }

    // 預連未完成時仍須保留OVERLAPPED；取消要求後僅完成查詢才能解除引用。
    internal static void PendingConnect()
    {
        var api = new FakeApi { ConnectResult = new(IoState.Pending), CancellationWillComplete = false };
        var pipe = new OwnedPipe(api, RunningBudget);
        Require(pipe.Prepare(900) && pipe.Pending);
        pipe.Cancel();
        Require(!pipe.Close() && api.Memory.Count == 2);
        api.ReadCompletion = new(IoState.Aborted);
        pipe.Poll();
        Require(!pipe.Pending && pipe.Failed && !pipe.Eof);
        Require(pipe.Close() && api.Memory.Count == 0 && api.Handles.Count == 0);
        api.ReleaseFixture();
    }

    // Connect可在writer開妥後仍pending；未完成前不啟child，後續完成不須重建資源。
    internal static void DelayedConnectLaunch()
    {
        var api = new FakeApi { ConnectResult = new(IoState.Pending) };
        var session = Session(api, new FakeClock());
        Require(session.Prepare());
        Require(!session.Launch() && api.CreateCalls == 0);
        api.ReadCompletion = new(IoState.Complete);
        session.Poll();
        Require(session.Launch() && api.CreateCalls == 1);
        session.Cleanup();
        Require(api.Handles.Count == 0 && api.Memory.Count == 0);
        api.ReleaseFixture();
    }

    // connect取消與成功競合仍終止本路，不容許owner以同一操作重新開始read。
    internal static void ConnectCancellationRace()
    {
        var api = new FakeApi { ConnectResult = new(IoState.Pending), CancellationWillComplete = false };
        var pipe = new OwnedPipe(api, RunningBudget);
        Require(pipe.Prepare(900));
        pipe.Cancel();
        api.ReadCompletion = new(IoState.Complete);
        pipe.Poll();
        pipe.Poll();
        Require(pipe.Failed && !pipe.Eof && api.ReadCalls == 0);
        Require(pipe.Close());
        api.ReleaseFixture();
    }

    // 一次同步pipe取得返回已逾時，仍認領資源但不繼續後續建立步驟。
    internal static void LatePipeAcquisition()
    {
        var clock = new FakeClock();
        var api = new FakeApi();
        api.AfterAcquire = step => { if (step == 3) clock.ElapsedMs = 18000; };
        var session = Session(api, clock);
        Require(!session.Prepare() && api.Acquisitions == 3);
        session.Cleanup();
        Require(api.Handles.Count == 0 && api.Memory.Count == 0);
        api.ReleaseFixture();
    }

    // cleanup後不可再用已關閉的標準handles建立程序，即使原生讀取未回錯。
    internal static void CleanupPreventsLaunch()
    {
        var api = new FakeApi { ImmediateReadBytes = 1024 };
        var session = Session(api, new FakeClock());
        Require(session.Prepare());
        session.Cleanup();
        Require(!session.Launch() && api.CreateCalls == 0);
        api.ReleaseFixture();
    }

    // poll同步呼叫耗盡共同收尾預算後，不得用進入cleanup時的舊時間再發取消。
    internal static void LatePollStopsCancellation()
    {
        var clock = new FakeClock();
        var api = new FakeApi();
        var session = Session(api, clock);
        Require(session.Prepare() && session.Launch());
        api.AfterObserve = () => { clock.ElapsedMs = 2000; };
        session.Cleanup();
        Require(api.JobKills == 0 && api.ProcessKills == 0);
        api.ReleaseFixture();
    }

    // 固定cleanup起點必先交Core，不能在poll已提交較新時間後再回送舊時間。
    internal static void CleanupClockProgress()
    {
        var clock = new FakeClock();
        var api = new FakeApi();
        var session = Session(api, clock);
        Require(session.Prepare() && session.Launch());
        api.Signaled = true;
        api.Active = 0;
        api.AfterObserve = () => { clock.ElapsedMs = 1; };
        var end = session.Cleanup();
        Require(end.Reason == ProbeReason.CleanupUnconfirmed);
        api.ReleaseFixture();
    }

    // CancelIoEx成功與not-found皆不能釋放仍pending的buffer／event。
    internal static void PendingLifetime()
    {
        foreach (var cancelResult in new[] { false, true })
        {
            var api = new FakeApi { CancelResult = cancelResult, CancellationWillComplete = false };
            var pipe = new OwnedPipe(api, RunningBudget);
            Require(pipe.Prepare(900));
            pipe.Poll();
            Require(pipe.Pending);
            pipe.Cancel();
            Require(pipe.Pending && !pipe.Close() && api.Memory.Count == 2);
            api.ReadCompletion = new(IoState.Aborted);
            pipe.Poll();
            Require(!pipe.Pending && pipe.Failed && !pipe.Eof);
            Require(pipe.Close() && api.Memory.Count == 0);
            api.ReleaseFixture();
        }
    }

    // 8192可收完但仍需EOF；第8193 byte必sticky overflow，取消完成不補EOF。
    internal static void Capacity()
    {
        var api = new FakeApi { ImmediateReadBytes = 1024 };
        var pipe = new OwnedPipe(api, RunningBudget);
        Require(pipe.Prepare(900));
        for (var index = 0; index < 8; index++) pipe.Poll();
        Require(pipe.Collected == 8192 && !pipe.Overflow && !pipe.Eof);
        Require(pipe.Bytes.Length == 8192 && pipe.Bytes.Span.IndexOfAnyExcept((byte)65) == -1);
        pipe.Poll();
        Require(pipe.Overflow && pipe.Failed && pipe.Collected == 8192);
        Require(pipe.CloseWriter() && pipe.Close());
        api.ReleaseFixture();
    }

    // 每一個取得步驟失敗都由同一owner收回已取得部分，不丟失資源。
    internal static void PartialPrepare()
    {
        for (var fail = 1; fail <= 14; fail++)
        {
            var api = new FakeApi { FailAt = fail };
            var session = Session(api, new FakeClock());
            Require(!session.Prepare());
            var end = session.Cleanup();
            Require(api.Acquisitions == fail);
            Require(session.Failed && end.Phase != ProbePhase.Complete && session.ResourcesClosed && api.Handles.Count == 0 && api.Memory.Count == 0);
            api.ReleaseFixture();
        }
    }

    // 真指派及歸屬核對前不resume，指派成功但核對失敗仍只取消job。
    internal static void Assignment()
    {
        foreach (var mode in new[] { 0, 1, 2 })
        {
            var api = new FakeApi { AssignResult = mode != 0, MembershipResult = mode == 2 };
            var session = Session(api, new FakeClock());
            Require(session.Prepare());
            Require(session.Launch() == (mode == 2));
            Require(api.ResumeCalls == (mode == 2 ? 1 : 0));
            session.Cleanup();
            session.Cleanup();
            Require(api.ProcessKills == (mode == 0 ? 1 : 0));
            Require(api.JobKills == (mode == 0 ? 0 : 1));
            Require(api.Handles.Count == 0 && api.Memory.Count == 0);
            api.ReleaseFixture();
        }
    }

    // 真Assign已成功但membership回驗失敗時，可信證據不可填confirmed，取消卻必須指向job。
    internal static void PhysicalAssignmentGap()
    {
        var model = new ProbeModel();
        model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        model.Observe(ProbeEvent.Suspended, 1, true);
        model.Observe(ProbeEvent.JobOwned, 2, true);
        // 對外僅能回報未完成「指派＋歸屬回驗」；不拿API成功冒充完整證據。
        model.Observe(ProbeEvent.Assigned, 2, false);
        Require(model.Snapshot().JobAssigned == EvidenceState.Unconfirmed);
        // 原生Assign已成功，process已屬本job；這裡不可要求process取消。
        Require(model.Cleanup(3).Target == CancelTarget.OwnedJob);
        model.Observe(ProbeEvent.ProcessSignaled, 4, true);
        model.Observe(ProbeEvent.TreeEmpty, 5, true);
        var terminal = model.Finish(6);
        var line = ProbeWire.Format(terminal);
        Require(line == UnverifiedJobLine);
        var parsed = ProbeWire.Parse(line + "receiver_native_supervisor_result,status=unavailable\n");
        Require(parsed.Status == ProbeStatus.Unavailable && parsed.Diagnostic == terminal);
        Require(model.Snapshot().TreeEmpty == EvidenceState.Unconfirmed);
        Require(model.Snapshot().JobAssigned == EvidenceState.Unconfirmed);
    }

    // 公開查空須保守不代表仍需終止：第一次cleanup前已有實體signal／空job時不再取消。
    internal static void PhysicalEmptyBeforeCleanup()
    {
        var model = new ProbeModel();
        model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        model.Observe(ProbeEvent.Suspended, 1, true);
        model.Observe(ProbeEvent.JobOwned, 2, true);
        model.Observe(ProbeEvent.Assigned, 3, false);
        model.Observe(ProbeEvent.ProcessSignaled, 4, true);
        model.Observe(ProbeEvent.TreeEmpty, 5, true);
        Require(model.Snapshot().TreeEmpty == EvidenceState.Unconfirmed);
        Require(model.Cleanup(6) == new CancelDecision(CancelTarget.None, 2006));
        var terminal = model.Finish(7);
        var line = ProbeWire.Format(terminal);
        Require(line == UnverifiedJobLine.Replace("\"cancelState\":\"unconfirmed\"", "\"cancelState\":\"not_requested\"", StringComparison.Ordinal));
        var parsed = ProbeWire.Parse(line + "receiver_native_supervisor_result,status=unavailable\n");
        Require(parsed.Status == ProbeStatus.Unavailable && parsed.Diagnostic == terminal);
    }

    // 分離實體查空後仍保留negative黏住與期限等號拒絕，不能用晚到true消除取消需求。
    internal static void PhysicalEmptyNegativeAndDeadline()
    {
        foreach (var deadline in new[] { false, true })
        {
            var model = new ProbeModel();
            model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
            model.Observe(ProbeEvent.Suspended, 1, true);
            model.Observe(ProbeEvent.JobOwned, 2, true);
            model.Observe(ProbeEvent.Assigned, 3, true);
            model.Observe(ProbeEvent.Resumed, 4, true);
            model.Observe(ProbeEvent.ProcessSignaled, 5, true);
            if (!deadline) model.Observe(ProbeEvent.TreeEmpty, 6, false);
            model.Observe(ProbeEvent.TreeEmpty, deadline ? 18000 : 7, true);
            Require(model.Snapshot().TreeEmpty != EvidenceState.Confirmed);
            Require(model.Cleanup(deadline ? 18001 : 8).Target == CancelTarget.OwnedJob);
            var terminal = model.Finish(deadline ? 18002 : 9);
            var parsed = ProbeWire.Parse(ProbeWire.Format(terminal) + "receiver_native_supervisor_result,status=unavailable\n");
            Require(parsed.Status == ProbeStatus.Unavailable && parsed.Diagnostic == terminal);
            Require(terminal.Reason == (deadline ? ProbeReason.Deadline : ProbeReason.CleanupUnconfirmed));
        }
    }

    // CreateProcess失敗輸出為毒值，不得誤關；成功但過期仍保留ownership供取消。
    internal static void ProcessBoundary()
    {
        foreach (var late in new[] { false, true })
        {
            var clock = new FakeClock();
            var api = new FakeApi { CreateResult = late };
            api.AfterCreate = () => { clock.ElapsedMs = 18000; };
            var session = Session(api, clock);
            Require(session.Prepare() && !session.Launch());
            Require(api.ResumeCalls == 0);
            var end = session.Cleanup();
            Require(api.ProcessKills == (late ? 1 : 0) && api.JobKills == 0);
            Require(!api.ClosedPoison && end.Phase == ProbePhase.Failed);
            Require(api.Handles.Count == 0);
            api.ReleaseFixture();
        }
    }

    // 兩路每poll各前進一次；沒有child frame時正常exit0／EOF亦不可observed。
    internal static void DrainAndGate()
    {
        var api = new FakeApi();
        var session = Session(api, new FakeClock());
        Require(session.Prepare() && session.Launch());
        session.Poll();
        Require(api.ReadCalls == 2);
        api.Signaled = true;
        api.Active = 0;
        api.ReadCompletion = new(IoState.Eof);
        session.Poll();
        var end = session.Cleanup();
        Require(end.Phase != ProbePhase.Complete && end.CaseSet == ProbeCaseSet.Unknown && end.ChildExit == EvidenceState.Unknown);
        Require(end.ChildPolicyRestore == EvidenceState.Unknown && end.TreeEmpty == EvidenceState.Confirmed);
        // 局部native owners可關妥，但未合併來源／child證據不得宣告全域成功。
        Require(session.ResourcesClosed && end.ResourcesClose != EvidenceState.Confirmed && api.JobKills == 0);
        Require(api.Handles.Count == 0 && api.Memory.Count == 0);
        api.ReleaseFixture();
    }

    // 共用cleanup deadline到期後不再收新證據，不釋放仍供kernel引用的配置。
    internal static void CleanupDeadline()
    {
        var clock = new FakeClock();
        var api = new FakeApi { CompleteOnKill = false, CancellationWillComplete = false };
        var session = Session(api, clock);
        Require(session.Prepare() && session.Launch());
        session.Poll();
        session.Cleanup();
        clock.ElapsedMs = 2000;
        var end = session.Cleanup();
        Require(end.ResourcesClose != EvidenceState.Confirmed && api.JobKills == 1);
        Require(api.Memory.Count == 4 && api.Handles.Count > 0);
        api.ReleaseFixture();
    }

    // 未驗來源或非running clock必須在第一個資源前拒絕。
    internal static void Guard()
    {
        var api = new FakeApi();
        var session = new OwnedProbeSession(api, new FakeClock(), new ProbeModel(), PublicPlan());
        Require(!session.Prepare() && api.Acquisitions == 0);
        var clock = new FakeClock { IsRunning = false };
        Require(!Session(api, clock).Prepare() && api.Acquisitions == 0);
    }

    // 實體所有權不填可信欄、無法重播復活，也不為晚到取得重開cleanup期限。
    internal static void PhysicalOwnershipRules()
    {
        var model = new ProbeModel();
        model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        model.Observe(ProbeEvent.Suspended, 1, true);
        model.Observe(ProbeEvent.JobOwned, 2, true);
        Require(model.Snapshot().JobAssigned == EvidenceState.Unknown);
        Require(model.Cleanup(3) == new CancelDecision(CancelTarget.OwnedJob, 2003));
        model.Observe(ProbeEvent.JobOwned, 4, true);
        Require(model.Cleanup(5).Target == CancelTarget.None);
        Require(model.Finish(6).Phase == ProbePhase.Failed);
        var late = new ProbeModel();
        late.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        late.Observe(ProbeEvent.Suspended, 1, true);
        Require(late.Cleanup(18000).DeadlineMs == 20000);
        late.Observe(ProbeEvent.JobOwned, 18001, true);
        // 已對process發出一次決策不可改目標重殺，physical ownership仍保留不補成功。
        Require(late.Cleanup(18002).Target == CancelTarget.None);
        Require(late.Snapshot().JobAssigned == EvidenceState.Unknown);
    }

    // 此model僅代表公開測試fixture已驗邊界，不是production來源factory。
    private static OwnedProbeSession Session(FakeApi api, FakeClock clock)
    {
        var model = new ProbeModel();
        model.Observe(ProbeEvent.SupervisorBoundaryVerify, 0, true);
        return new(api, clock, model, PublicPlan());
    }

    // 公開fixture不對應真exe，fake不會啟動任何程序。
    private static ProbeLaunchPlan PublicPlan() => new("PUBLIC_PS", "PUBLIC_COMMAND", "PUBLIC=1\0\0", "PUBLIC_DIRECTORY");

    // 單路測試不推進時間；session測試另透過共享clock驗截止。
    private static bool RunningBudget() => true;

    // 固定安全失敗，不印handle／buffer或任意內容。
    private static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException("native_session_assertion_failed");
    }

    private sealed class FakeClock : IProbeClock
    {
        public long ElapsedMs { get; set; }
        public bool IsRunning { get; set; } = true;
    }

    // 每次取得會fault；所有真HGlobal由本fixture掌握，未完成測試只於測試末清理。
    internal sealed class FakeApi : IProbeNativeApi
    {
        internal readonly HashSet<nint> Handles = [];
        internal readonly Dictionary<nint, int> Memory = [];
        private readonly HashSet<nint> _pending = [];
        private readonly HashSet<nint> _cancelRequested = [];
        internal long NextHandle = 10;
        internal int FailAt, Acquisitions, CloseCalls, ResumeCalls, ProcessKills, JobKills, ReadCalls, CreateCalls;
        internal bool CloseFails, ClosedPoison, Signaled;
        internal bool AssignResult = true, MembershipResult = true, CreateResult = true, CancelResult = true, CompleteOnKill = true;
        internal bool CancellationWillComplete = true;
        internal uint Active = 1, ImmediateReadBytes;
        internal IoResult ReadCompletion = new(IoState.Pending);
        internal IoResult ConnectResult = new(IoState.Complete);
        internal Action? AfterCreate;
        internal Action? AfterObserve;
        internal Action<int>? AfterAcquire;
        internal Queue<(IoState State, byte[] Bytes)>[]? Streams;
        private readonly Dictionary<nint, int> _streamIndex = [];
        private readonly Dictionary<nint, (nint Pipe, nint Buffer, uint Capacity)> _reads = [];
        internal uint ExitCode;
        internal bool AuxiliaryResult = true;
        public bool Supported => true;

        // 限定取得步驟失敗，回零不代表先前所有資源都不存在。
        private nint Acquire()
        {
            Acquisitions++;
            if (Acquisitions == FailAt) return 0;
            var handle = (nint)NextHandle++;
            Handles.Add(handle);
            AfterAcquire?.Invoke(Acquisitions);
            return handle;
        }
        // 描述元也受fault與所有權追蹤。
        public nint CreateDescriptor() => Acquire();
        // 與Close分離，模擬LocalFree分類。
        public bool FreeDescriptor(nint descriptor) => Close(descriptor);
        // 真穩定配置允許被測owner初始化OVERLAPPED。
        public nint Allocate(int size)
        {
            Acquisitions++;
            if (Acquisitions == FailAt) return 0;
            var pointer = Marshal.AllocHGlobal(size);
            Marshal.Copy(new byte[size], 0, pointer, size);
            Memory.Add(pointer, size);
            return pointer;
        }
        // 若owner早釋放仍pending OVERLAPPED，測試立即失敗。
        public void Free(nint memory)
        {
            Require(!_pending.Contains(memory));
            Require(Memory.Remove(memory));
            Marshal.FreeHGlobal(memory);
        }
        // 建立唯一job值。
        public nint CreateJob() => Acquire();
        // 拒絕零handle查詢。
        public bool LimitJob(nint job) => Handles.Contains(job);
        // 建立各路獨立event。
        public nint CreateEvent() => Acquire();
        // 固定descriptor必須仍由owner持有。
        public nint CreatePipeServer(string name, nint descriptor)
        {
            var handle = descriptor == 900 || Handles.Contains(descriptor) ? Acquire() : 0;
            if (handle != 0) _streamIndex[handle] = _streamIndex.Count;
            return handle;
        }
        // 不建立本機pipe或listener。
        public nint OpenPipeWriter(string name) => Acquire();
        // fake預連立即完成，read另行pending。
        public IoResult Connect(nint pipe, nint overlapped)
        {
            if (ConnectResult.State == IoState.Pending) _pending.Add(overlapped);
            return ConnectResult;
        }
        // 真owner決定每路公平poll及容量，fake只提供一筆OS完成結果。
        public IoResult Read(nint pipe, nint buffer, uint capacity, nint overlapped)
        {
            Require(!_pending.Contains(overlapped));
            ReadCalls++;
            if (Streams is not null)
            {
                _reads[overlapped] = (pipe, buffer, capacity);
                var queued = NextRead(pipe, buffer, capacity);
                if (queued.State == IoState.Pending) _pending.Add(overlapped);
                return queued;
            }
            if (ImmediateReadBytes != 0)
            {
                var count = (int)Math.Min(ImmediateReadBytes, capacity);
                Marshal.Copy(Enumerable.Repeat((byte)65, count).ToArray(), 0, buffer, count);
                return new(IoState.Complete, (uint)count);
            }
            _pending.Add(overlapped);
            return new(IoState.Pending);
        }
        // Pending不消耗配置，實際完成後才解除kernel引用。
        public IoResult Complete(nint pipe, nint overlapped)
        {
            var result = ReadCompletion;
            if (Streams is not null && _reads.TryGetValue(overlapped, out var read))
                result = NextRead(read.Pipe, read.Buffer, read.Capacity);
            if (result.State == IoState.Pending && CancellationWillComplete && _cancelRequested.Contains(overlapped))
                result = new(IoState.Aborted);
            if (result.State != IoState.Pending) _pending.Remove(overlapped);
            return result;
        }
        // 獨立兩路OS queue只複製bytes入真HGlobal，collector仍由OwnedPipe執行。
        private IoResult NextRead(nint pipe, nint buffer, uint capacity)
        {
            var queue = Streams![_streamIndex[pipe]];
            if (queue.Count == 0) return new(IoState.Pending);
            var next = queue.Dequeue();
            Require(next.Bytes.Length <= capacity);
            if (next.Bytes.Length > 0) Marshal.Copy(next.Bytes, 0, buffer, next.Bytes.Length);
            return new(next.State, (uint)next.Bytes.Length);
        }
        // 絕不在取消要求時自動完成。
        public bool Cancel(nint pipe, nint overlapped) { _cancelRequested.Add(overlapped); return CancelResult; }
        // stdin兩端在成功時才交付，模擬原生out邊界。
        public bool CreateStdin(out nint read, out nint write)
        {
            read = Acquire();
            write = 0;
            if (read == 0) return false;
            write = Acquire();
            if (write != 0) return true;
            Handles.Remove(read);
            read = 0;
            return false;
        }
        // 失敗帶毒值，測試owner不能相信失敗out。
        public ProcessResult CreateSuspended(ProbeLaunchPlan plan, nint stdin, nint stdout, nint stderr)
        {
            CreateCalls++;
            var result = CreateResult ? new ProcessResult(true, Acquire(), Acquire()) : new(false, 777, 778);
            AfterCreate?.Invoke();
            return result;
        }
        // 真session必須按這個分支決定取消process或job。
        public bool Assign(nint job, nint process) => AssignResult;
        // 失敗歸屬不能抹去已成功指派的physical ownership。
        public bool Belongs(nint job, nint process) => MembershipResult;
        // 僅當owner已指派及驗證時才應呼叫。
        public uint Resume(nint thread) { ResumeCalls++; return 1; }
        // 假clock與signal都由公開fixture控制，無真process。
        public ProcessObservation ObserveProcess(nint process) { AfterObserve?.Invoke(); return new(true, Signaled, ExitCode); }
        // NULL job一定拒絕，避免不小心查caller job。
        public bool QueryActive(nint job, out uint active) { Require(job != 0); active = Active; return true; }
        // 只記錄本程式發出的互斥取消要求。
        public bool TerminateProcess(nint process) { ProcessKills++; Kill(); return true; }
        // 不殺真process，只回報模擬OS結果。
        public bool TerminateJob(nint job) { JobKills++; Kill(); return true; }
        // 取消後完成仍為Aborted，不是可信EOF。
        private void Kill()
        {
            if (!CompleteOnKill) return;
            Signaled = true;
            Active = 0;
            ReadCompletion = new(IoState.Aborted);
        }
        // 錯誤handle或早關pending event均不應被正常owner發出。
        public bool Close(nint handle)
        {
            CloseCalls++;
            if (handle is 777 or 778) ClosedPoison = true;
            if (CloseFails) return false;
            return Handles.Remove(handle);
        }
        // fake無OS附屬資源；真adapter需回報自己的同步暫存owner。
        public bool CloseAuxiliary() => AuxiliaryResult;
        // 僅清本測試配置；無kernel pending，保留測試末斷言後才能釋放。
        internal void ReleaseFixture()
        {
            foreach (var pointer in Memory.Keys) Marshal.FreeHGlobal(pointer);
            Memory.Clear();
            Handles.Clear();
        }
    }
}
