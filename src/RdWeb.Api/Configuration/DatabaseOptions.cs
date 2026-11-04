namespace RdWeb.Api.Configuration;

public sealed record DatabaseOptions(string Path)
{
    // 僅接受檔案位置，不將任意連線字串或特殊記憶體資料庫帶入正式設定。
    public static DatabaseOptions FromConfiguration(IConfiguration configuration)
    {
        var value = configuration["DATA_PATH"] ?? "data/app.db";
        if (string.IsNullOrWhiteSpace(value) || value.Contains('\0') || value == ":memory:")
            throw new InvalidOperationException("DATA_PATH 必須是資料庫檔案路徑。");
        return new(System.IO.Path.GetFullPath(value));
    }
}
