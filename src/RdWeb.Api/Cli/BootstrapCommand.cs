using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Api.Cli;

public static class BootstrapCommand
{
    // 密碼只從設定來源讀取，已有任何 admin 時不覆寫既有認證。
    public static async Task<int> RunAsync(IConfiguration configuration)
    {
        var username = configuration["BOOTSTRAP_ADMIN_USERNAME"];
        var password = configuration["BOOTSTRAP_ADMIN_PASSWORD"];
        var email = configuration["BOOTSTRAP_ADMIN_EMAIL"];
        if (username == null || password == null || !Regex.IsMatch(username, "^[A-Za-z0-9._-]{3,128}$") || password.Length is < 12 or > 1024
            || email?.Length > 320 || email != null && !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email)) return 1;
        try
        {
            var options = DatabaseOptions.FromConfiguration(configuration);
            await DatabaseInitializer.InitializeAsync(options);
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(options.Path));
            if (await database.Users.AnyAsync(user => user.Role == "admin")) return 0;
            var hash = await new PasswordHasher().HashAsync(password);
            await using var transaction = await database.Database.BeginTransactionAsync();
            if (await database.Users.AnyAsync(user => user.Role == "admin")) return 0;
            var user = new User { Username = username, NormalizedUsername = username.ToUpperInvariant(), Email = email, Role = "admin", PasswordHash = hash };
            database.Users.Add(user);
            database.AuditLogs.Add(new AuditLog { UserId = user.Id, Action = "UserChanged", Result = "Success", ObjectType = "user", ObjectId = user.Id });
            await database.SaveChangesAsync(); await transaction.CommitAsync();
            return 0;
        }
        catch { return 1; }
    }

    // 首次 web 啟動有完整環境設定才建立，半套設定拒絕而不默默略過。
    public static async Task RunIfConfiguredAsync(IConfiguration configuration)
    {
        if (string.IsNullOrEmpty(configuration["BOOTSTRAP_ADMIN_USERNAME"]) && string.IsNullOrEmpty(configuration["BOOTSTRAP_ADMIN_PASSWORD"])) return;
        if (await RunAsync(configuration) != 0) throw new InvalidOperationException("初始管理員建立失敗，請檢查 bootstrap 設定。");
    }
}
