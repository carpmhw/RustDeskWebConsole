using System.Runtime.InteropServices;

namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 每路各持一個pending操作與固定容量，不對外公開任意內容。
internal sealed class OwnedPipe
{
    private readonly IProbeNativeApi _api;
    private readonly Func<bool> _budget;
    private readonly OwnedNativeResources _handles;
    private nint _read, _event, _buffer, _overlapped;
    private bool _connecting, _connected, _prepared, _cancelled;
    private bool _writerClosed;
    private readonly byte[] _data = new byte[8192];
    internal ReadOnlyMemory<byte> Bytes => _data.AsMemory(0, Collected);

    // 每路獨立的owner及配置，呼叫端依共用clock排程，不自行等待。
    internal OwnedPipe(IProbeNativeApi api, Func<bool> budget) { _api = api; _handles = new(api); _budget = budget; }
    internal bool Eof { get; private set; }
    internal bool Failed { get; private set; }
    internal bool Overflow { get; private set; }
    internal bool Pending { get; private set; }
    internal nint Writer { get; private set; }
    internal int Collected { get; private set; }
    internal bool Connected => _connected && !Failed && _overlapped != 0;

    // 先開始overlapped connect再由parent開寫端，失敗仍保留全部已取得項供唯一收尾。
    internal bool Prepare(nint descriptor)
    {
        if (_prepared || !_budget()) return false;
        _prepared = true;
        var name = @"\\.\pipe\rdweb-native-" + Guid.NewGuid().ToString("N");
        _read = _handles.Own(_api.CreatePipeServer(name, descriptor));
        if (_read == 0 || !_budget()) { Failed = true; return false; }
        _event = _handles.Own(_api.CreateEvent());
        if (_event == 0 || !_budget()) { Failed = true; return false; }
        _buffer = _api.Allocate(1024);
        if (_buffer == 0 || !_budget()) { Failed = true; return false; }
        _overlapped = _api.Allocate(32);
        if (_overlapped == 0 || !_budget()) { Failed = true; return false; }
        Marshal.StructureToPtr(new NativeAbi.Overlapped { Event = _event }, _overlapped, false);
        var connect = _api.Connect(_read, _overlapped);
        Pending = connect.State == IoState.Pending;
        _connecting = Pending;
        _connected = connect.State == IoState.Complete;
        if (!_budget()) { Failed = true; return false; }
        if (!Pending && !_connected) { Failed = true; return false; }
        Writer = _handles.Own(_api.OpenPipeWriter(name));
        if (Writer == 0 || !_budget()) { Failed = true; return false; }
        if (Pending)
        {
            var completion = _api.Complete(_read, _overlapped);
            if (completion.State != IoState.Pending)
            {
                Pending = false;
                _connecting = false;
                _connected = completion.State == IoState.Complete;
            }
        }
        if (!_connected && !Pending) { Failed = true; return false; }
        return true;
    }

    // 每次最多完成或啟動一次read，兩路由session各呼一次，恰上限後讀一byte探測超額。
    internal void Poll()
    {
        if (_read == 0 || _overlapped == 0) return;
        if (!Pending && (Failed || Eof || !_connected)) return;
        if (!Pending)
            Marshal.StructureToPtr(new NativeAbi.Overlapped { Event = _event }, _overlapped, false);
        var result = Pending ? _api.Complete(_read, _overlapped) :
            _api.Read(_read, _buffer, (uint)Math.Min(1024, 8193 - Collected), _overlapped);
        Pending = result.State == IoState.Pending;
        if (Pending) return;
        if (_connecting)
        {
            _connecting = false;
            _connected = result.State == IoState.Complete && !_cancelled;
            if (!_connected) Failed = true;
            return;
        }
        if (result.State == IoState.Eof)
        {
            if (!_cancelled && !Failed && _writerClosed) Eof = true;
            else Failed = true;
            return;
        }
        if (result.State != IoState.Complete) { Failed = true; return; }
        if (_cancelled) { Failed = true; return; }
        if (result.Bytes > Math.Min(1024u, (uint)(8193 - Collected)) || result.Bytes > 8192 - Collected)
        {
            Overflow = true;
            Failed = true;
            return;
        }
        Marshal.Copy(_buffer, _data, Collected, (int)result.Bytes);
        Collected += (int)result.Bytes;
    }

    // parent寫端必明確關閉，重複呼叫不再次CloseHandle。
    internal bool CloseWriter()
    {
        _writerClosed = _handles.Close(Writer);
        return _writerClosed;
    }

    // 每筆pending至多要求一次取消，任何回值均仍需Complete。
    internal void Cancel()
    {
        if (!Pending || _cancelled) return;
        _cancelled = true;
        _api.Cancel(_read, _overlapped);
    }

    // 未完成時保留buffer／OVERLAPPED／event／handle；不靠GC終結器破壞kernel引用。
    internal bool Close()
    {
        if (Pending) return false;
        if (_buffer != 0) { _api.Free(_buffer); _buffer = 0; }
        if (_overlapped != 0) { _api.Free(_overlapped); _overlapped = 0; }
        return _handles.CloseAll();
    }
}
