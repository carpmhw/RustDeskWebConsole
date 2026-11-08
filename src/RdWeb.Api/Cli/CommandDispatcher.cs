using RdWeb.Api.Configuration;

namespace RdWeb.Api.Cli;

public static class CommandDispatcher
{
    // null 代表繼續啟動 Web；未知 CLI 只回固定用法，不回顯輸入。
    public static async Task<int?> ExecuteAsync(string[] args)
    {
        if (args.Any(argument => argument.TrimStart('-', '/').Split('=', 2)[0].ToUpperInvariant() is "BOOTSTRAP_ADMIN_PASSWORD" or "SECRET_KEY" or "VAULT_KEY" or "ROTATE_OLD_KEY" or "ROTATE_NEW_KEY" or "RECOVER_ADMIN_PASSWORD"))
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
            return await BootstrapCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().AddSecretFiles(Environment.GetEnvironmentVariables()).Build());
        if (args is ["rotate-key"])
            return await RotateKeyCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().AddSecretFiles(Environment.GetEnvironmentVariables()).Build());
        if (args is ["backup", var backupPath])
            return await BackupCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().Build(), backupPath, Console.Out, Console.Error);
        if (args is ["restore", var restorePath])
            return await RestoreCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().Build(), restorePath, Console.Out, Console.Error);
        if (args is ["recover-admin", _] or ["recover-admin", _, "--reset-totp"] && !args[1].StartsWith('-'))
            return await RecoverAdminCommand.RunAsync(new ConfigurationBuilder().AddEnvironmentVariables().AddSecretFiles(Environment.GetEnvironmentVariables()).Build(),
                args[1], args.Length == 3, Console.Out, Console.Error);
        Console.Error.WriteLine("用法：spikes | healthcheck | bootstrap create-admin | rotate-key | backup <輸出檔> | restore <備份檔> | recover-admin <帳號> [--reset-totp] | --urls <listen-url>");
        return 2;
    }
}
