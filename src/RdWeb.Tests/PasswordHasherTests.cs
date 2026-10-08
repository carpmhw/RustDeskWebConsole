using RdWeb.Api.Security;

namespace RdWeb.Tests;

public sealed class PasswordHasherTests
{
    // 驗證 Argon2id 正確密碼、錯誤密碼、隨機鹽與可攜 PHC 格式。
    [Fact]
    public async Task HashIsSaltedAndVerifiable()
    {
        var hasher = new PasswordHasher();
        var first = await hasher.HashAsync("only-a-public-test-value");
        var second = await hasher.HashAsync("only-a-public-test-value");
        Assert.StartsWith("$argon2id$v=19$m=65536,t=3,p=1$", first);
        Assert.NotEqual(first, second);
        Assert.True(await hasher.VerifyAsync("only-a-public-test-value", first));
        Assert.False(await hasher.VerifyAsync("incorrect-public-test-value", first));
    }

    // 拒絕無效與過大參數，不能讓落庫字串觸發無界資源配置。
    [Theory]
    [InlineData("")]
    [InlineData("$argon2id$v=19$m=2147483647,t=99,p=999$invalid$invalid")]
    [InlineData("$argon2id$v=19$m=65536,t=3,p=1$invalid$invalid")]
    public async Task CorruptHashesAreRejected(string encoded)
    {
        Assert.False(await new PasswordHasher().VerifyAsync("only-a-public-test-value", encoded));
    }
}
