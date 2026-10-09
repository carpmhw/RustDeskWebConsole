namespace RdWeb.Api.Cli;

public static class CommandDispatcher
{
    // null 代表繼續啟動 Web；未知 CLI 只回固定用法，不回顯輸入。
    public static async Task<int?> ExecuteAsync(string[] args)
    {
        if (args.Any(argument => argument.TrimStart('-', '/').Split('=', 2)[0].ToUpperInvariant() is "BOOTSTRAP_ADMIN_PASSWORD" or "SECRET_KEY" or "VAULT_KEY" or "ROTATE_OLD_KEY" or "ROTATE_NEW_KEY"))
        {
            Console.Error.WriteLine("敏感設定只能由環境提供，不能放在命令列。");
            return 2;
        }
        if (args.Length == 0 || args[0].StartsWith("--", StringComparison.Ordinal)) return null;
        if (args is ["spikes"])
        {
            await SpikeCommand.RunAsync();
            return 0;
        }
        if (args is ["healthcheck"])
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            return await HealthcheckCommand.RunAsync(client);
        }
        if (args is ["bootstrap", "create-admin"])
            return await BootstrapCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().Build());
        if (args is ["rotate-key"])
            return await RotateKeyCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().Build());
        Console.Error.WriteLine("用法：spikes | healthcheck | bootstrap create-admin | rotate-key | --urls <listen-url>");
        return 2;
    }
}
