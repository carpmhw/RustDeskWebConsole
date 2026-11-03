using Google.Protobuf;
using Hbb;

namespace RdWeb.Tests;

public sealed class RustDeskInteractionWireTests
{
    // 獨立 encoder 核對 signed 座標及左鍵 mask。
    [Fact]
    public void MouseEnvelopeMatchesPublicFixture()
    {
        var value = new Message { MouseEvent = new MouseEvent { Mask = 9, X = -2, Y = 3 } };
        Assert.Equal(new byte[] { 0x52, 6, 8, 9, 16, 3, 24, 6 }, value.ToByteArray());
    }

    // SAS 只送一筆 down，不展開 press 或 synthetic up。
    [Fact]
    public void SasEnvelopeMatchesPublicFixture()
    {
        var value = new Message { KeyEvent = new KeyEvent { Down = true, ControlKey = ControlKey.CtrlAltDel } };
        Assert.Equal(new byte[] { 0x7a, 4, 8, 1, 24, 100 }, value.ToByteArray());
    }

    // UTF-8 語意由獨立 Google.Protobuf 核對。
    [Fact]
    public void SequenceEnvelopeMatchesPublicFixture()
    {
        var value = new Message { KeyEvent = new KeyEvent { Down = true, Seq = "中" } };
        Assert.Equal(new byte[] { 0x7a, 7, 8, 1, 50, 3, 228, 184, 173 }, value.ToByteArray());
    }

    // Text 格式的預設零不應強迫 TS encoder 顯式填入。
    [Fact]
    public void MultiClipboardEnvelopeMatchesPublicFixture()
    {
        var clips = new MultiClipboards();
        clips.Clipboards.Add(new Clipboard { Content = ByteString.CopyFromUtf8("A") });
        var value = new Message { MultiClipboards = clips };
        Assert.Equal(new byte[] { 0xe2, 1, 5, 10, 3, 18, 1, 65 }, value.ToByteArray());
    }

    // pinned Misc.option 是 field 7，keyboard option 是 field 12。
    [Fact]
    public void KeyboardOptionEnvelopeMatchesPublicFixture()
    {
        var value = new Message { Misc = new Misc { Option = new OptionMessage { DisableKeyboard = OptionMessage.Types.BoolOption.No } } };
        Assert.Equal(new byte[] { 0x9a, 1, 4, 58, 2, 96, 1 }, value.ToByteArray());
    }
    // Windows extended 鍵：Translate＋帶 E0 前綴掃描碼（0xE04B），手算 bytes 為跨語言 oracle。
    [Fact]
    public void TranslateExtendedKeyEnvelopeMatchesPublicFixture()
    {
        var key = new KeyEvent { Down = true, Chr = 0xE04B, Mode = KeyboardMode.Translate };
        key.Modifiers.Add(ControlKey.Shift);
        var value = new Message { KeyEvent = key };
        Assert.Equal(new byte[] { 0x7a, 0x0b, 8, 1, 0x20, 0xcb, 0xc0, 3, 0x42, 1, 0x1d, 0x48, 2 }, value.ToByteArray());
    }

    // Windows ASCII 快捷鍵：Translate＋高 word 虛擬 VK（'A' = 0x41 << 16）。
    [Fact]
    public void TranslateShortcutEnvelopeMatchesPublicFixture()
    {
        var value = new Message { KeyEvent = new KeyEvent { Down = true, Chr = 0x41u << 16, Mode = KeyboardMode.Translate } };
        Assert.Equal(new byte[] { 0x7a, 9, 8, 1, 0x20, 0x80, 0x80, 0x84, 2, 0x48, 2 }, value.ToByteArray());
    }
}
