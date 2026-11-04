namespace RdWeb.Api.Configuration;

public sealed record AppOptions(string BasePath, Uri PublicUrl)
{
    // 正規化執行期掛載路徑並拒絕有歧義的路徑與對外網址。
    public static AppOptions FromConfiguration(IConfiguration configuration)
    {
        var rawPath = (configuration["APP_BASE_PATH"] ?? "/").Trim();
        if (rawPath.Contains("//", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("APP_BASE_PATH 不接受重複斜線。");
        }
        var path = rawPath.TrimEnd('/');
        if (path.Length > 0 && (!path.StartsWith('/') || path.Contains("//", StringComparison.Ordinal)
            || path.Split('/').Any(segment => segment is "." or "..")
            || path.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '/' or '-' or '_'))))
        {
            throw new InvalidOperationException("APP_BASE_PATH 必須是無歧義的絕對掛載路徑。");
        }

        var rawUrl = configuration["APP_PUBLIC_URL"] ?? "http://localhost" + path;
        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var url) || url.Scheme is not ("https" or "http")
            || url.UserInfo.Length > 0 || url.Query.Length > 0 || url.Fragment.Length > 0
            || url.AbsolutePath.TrimEnd('/') != path)
        {
            throw new InvalidOperationException("APP_PUBLIC_URL 必須是與 APP_BASE_PATH 相符的 HTTP(S) 網址。");
        }

        return new AppOptions(path, url);
    }
}
