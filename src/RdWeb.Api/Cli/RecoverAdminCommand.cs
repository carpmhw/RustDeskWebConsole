using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Configuration;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Security;

namespace RdWeb.Api.Cli;

public static class RecoverAdminCommand
{
    // 主機端救援管理員：密碼只由 RECOVER_ADMIN_PASSWORD（或 _FILE）提供；重新啟用、要求下次改密碼並撤銷全部工作階段。
    // 錯誤輸出只含固定分類，不回顯帳號、路徑或密碼。
    public static async Task<int> RunAsync(IConfiguration configuration, string username, bool resetTotp, TextWriter output, TextWriter error)
    {
        var password = configuration["RECOVER_ADMIN_PASSWORD"];
        if (password is null || password.Length is < 12 or > 1024)
        {
            await SqliteSnapshotFile.WriteFailureAsync(error, "invalid_password");
            return 1;
        }
        try
        {
            var options = DatabaseOptions.FromConfiguration(configuration);
            await DatabaseInitializer.InitializeAsync(options);
            await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(options.Path));
            var normalized = username.Trim().ToUpperInvariant();
            var user = await database.Users.SingleOrDefaultAsync(item => item.NormalizedUsername == normalized);
            if (user is not { Role: "admin" })
            {
                await SqliteSnapshotFile.WriteFailureAsync(error, "not_admin");
                return 1;
            }
            var hash = await new PasswordHasher().HashAsync(password);
            var now = DateTime.UtcNow;
            await using var transaction = await database.Database.BeginTransactionAsync();
            user.PasswordHash = hash; user.PasswordChangeRequired = true; user.IsActive = true;
            user.FailedLoginCount = 0; user.LockedUntil = null; user.AuthVersion++;
            if (resetTotp)
            {
                user.TotpSecretEnc = null; user.TotpNonce = null; user.TotpKeyVersion = null; user.TotpEnabledAt = null;
                await database.RecoveryCodes.Where(item => item.UserId == user.Id).ExecuteDeleteAsync();
            }
            await database.RefreshTokens.Where(token => token.UserId == user.Id && token.RevokedAt == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.RevokedAt, now).SetProperty(token => token.Version, token => token.Version + 1).SetProperty(token => token.UpdatedAt, now));
            // CLI 沒有登入的操作者，比照 bootstrap create-admin 記為被救援的管理員本人。
            database.AuditLogs.Add(new AuditLog { UserId = user.Id, Action = "UserChanged", Result = "Success", ObjectType = "user", ObjectId = user.Id });
            await database.SaveChangesAsync();
            await transaction.CommitAsync();
            await output.WriteLineAsync(JsonSerializer.Serialize(new { status = "ok", totp_reset = resetTotp }));
            return 0;
        }
        catch (Exception exception)
        {
            await SqliteSnapshotFile.WriteFailureAsync(error, SqliteSnapshotFile.Classify(exception));
            return 1;
        }
    }
}
