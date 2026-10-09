using System.Text;
using RdWeb.Api.RustDesk;
namespace RdWeb.Tests;

public sealed class RustDeskLoginProofTests
{
    // 公開Node/SHA256 fixture驗最終proof，不使用同一函數當oracle。
    [Fact]
    public void ProofMatchesIndependentPublicFixture()
    {
        var bytes = RustDeskLoginProof.Compute(Encoding.UTF8.GetBytes("public-login-fixture"),
            Encoding.UTF8.GetBytes("public-salt"), Encoding.UTF8.GetBytes("public-challenge"));
        Assert.Equal("1df9c40098b58d8bc98c7281d6607521d84925b756fb67f81a9dac1624338f44", Convert.ToHexString(bytes).ToLowerInvariant());
    }

    // 公開UTF8向量含多位元組及emoji，獨立Node計算可抓出字元／位元組拼接差異。
    [Fact]
    public void Utf8ProofMatchesIndependentPublicFixture()
    {
        var bytes = RustDeskLoginProof.Compute(Encoding.UTF8.GetBytes("公開密碼🔐"),
            Encoding.UTF8.GetBytes("鹽值"), Encoding.UTF8.GetBytes("公開挑戰"));
        Assert.Equal("8671d349cf80e05db0467061f362cf42b0ddf025fa1bfe82725008fc796e1ff5", Convert.ToHexString(bytes).ToLowerInvariant());
    }
}
