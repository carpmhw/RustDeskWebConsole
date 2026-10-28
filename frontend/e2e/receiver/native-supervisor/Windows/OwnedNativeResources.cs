namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 一個owner僅認領一次；關閉失敗保留原handle，不能重用數值重試。
internal sealed class OwnedNativeResources
{
    private readonly IProbeNativeApi _api;
    private readonly List<nint> _handles = [];
    private readonly Dictionary<nint, bool> _closed = [];
    private bool _failed;

    // 同一session使用同一OS邊界，raw handle不向公開caller流出。
    internal OwnedNativeResources(IProbeNativeApi api) { _api = api; }

    // 僅在成功取得時呼叫，invalid handle不轉成已取得資源。
    internal nint Own(nint handle)
    {
        if (handle == 0 || handle == -1) return 0;
        if (_closed.TryGetValue(handle, out var closed) && closed)
        {
            _handles.Remove(handle);
            _closed.Remove(handle);
        }
        _handles.Add(handle);
        return handle;
    }

    // 同一owner的同一筆handle最多關閉一次，失敗也不重試可能已回收的數值。
    internal bool Close(nint handle)
    {
        if (handle == 0) return true;
        if (_closed.TryGetValue(handle, out var previous)) return previous;
        if (!_handles.Contains(handle)) return false;
        var result = _api.Close(handle);
        _closed.Add(handle, result);
        if (!result) _failed = true;
        return result;
    }

    // 反向關閉所有取得項，任何失敗黏住，不由重複呼叫補confirmed。
    internal bool CloseAll()
    {
        for (var index = _handles.Count - 1; index >= 0; index--) Close(_handles[index]);
        return !_failed;
    }
}
