using Google.Protobuf;
using Hbb;

namespace RdWeb.Tests;

public sealed class RustDeskVideoWireTests
{
    // 固定schema的Google.Protobuf獨立產生公開影像，browser不用自身encoder作唯一oracle。
    [Fact]
    public void VideoEnvelopeMatchesIndependentFixture()
    {
        var frames = new EncodedVideoFrames();
        frames.Frames.Add(new EncodedVideoFrame { Data = ByteString.CopyFrom(new byte[] { 1, 2 }), Key = true, Pts = 1 });
        var video = new VideoFrame();
        VideoFrame.Descriptor.FindFieldByNumber(6).Accessor.SetValue(video, frames);
        var message = new Message { VideoFrame = video };
        Assert.Equal(new byte[] { 0x32, 12, 0x32, 10, 0x0a, 8, 0x0a, 2, 1, 2, 0x10, 1, 0x18, 1 }, message.ToByteArray());
    }

    // VP9能力與偏好分別是field1／field4，不能因手寫欄位表漂移。
    [Fact]
    public void SupportedDecodingMatchesIndependentFixture()
    {
        var value = new SupportedDecoding { AbilityVp9 = 1, Prefer = SupportedDecoding.Types.PreferCodec.Vp9 };
        Assert.Equal(new byte[] { 8, 1, 32, 1 }, value.ToByteArray());
    }

    // VideoReceived是Misc的bool field12，沒有frame序號或timestamp。
    [Fact]
    public void VideoAckMatchesIndependentFixture()
    {
        var value = new Misc { VideoReceived = true };
        Assert.Equal(new byte[] { 96, 1 }, value.ToByteArray());
    }

    // 畫質沿固定ImageQuality enum，Balanced是3且在Option field1。
    [Fact]
    public void QualityOptionMatchesIndependentFixture()
    {
        var value = new OptionMessage { ImageQuality = ImageQuality.Balanced };
        Assert.Equal(new byte[] { 8, 3 }, value.ToByteArray());
    }
}
