namespace RdWeb.Receiver.NativeSupervisor.Windows;

// pin來自核准公開來源；wrapper候選定稿後由真bytes計算，不在執行時學習。
internal static class ProbeSourcePins
{
    internal static IReadOnlyList<SourcePin> All { get; } = Array.AsReadOnly<SourcePin>([
        new("start-windows-test-receiver.ps1", 65536, "b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19"),
        new("windows-host-observer-supervisor.ps1", 65536, "51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2"),
        new("node.exe", 134217728, "d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5"),
        new("PUBLIC 空格 繁體\\receiver-native-case.mjs", 8192, "846af281f23a2c5ab7ebc6c54fd6f6725406f9a4da73036ad4fd9cb3a10c512b"),
        new("receiver-native-child.ps1", 12288, "fd65687dfc382b55481217d8dc14bb5b48ab7b45d721bc57c6797e081e3f5b47", true)
    ]);
}
