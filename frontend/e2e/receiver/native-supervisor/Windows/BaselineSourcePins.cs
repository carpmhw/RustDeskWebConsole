namespace RdWeb.Receiver.NativeSupervisor.Windows;

// 原四份受測來源沿舊pins，新wrapper以實際UTF8 bytes固定，不從現場學習。
internal static class BaselineSourcePins
{
    internal static IReadOnlyList<SourcePin> All { get; } = Array.AsReadOnly<SourcePin>([
        new("start-windows-test-receiver.ps1", 65536, "b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19"),
        new("windows-host-observer-supervisor.ps1", 65536, "51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2"),
        new("node.exe", 134217728, "d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5"),
        new("PUBLIC 空格 繁體\\receiver-native-case.mjs", 8192, "846af281f23a2c5ab7ebc6c54fd6f6725406f9a4da73036ad4fd9cb3a10c512b"),
        new("receiver-native-baseline-child.ps1", 12288, "6e60d5841db2d647540ba7ee2ba778c689b7aa95ead22f7a91c37a143975b33e", true)
    ]);
}
