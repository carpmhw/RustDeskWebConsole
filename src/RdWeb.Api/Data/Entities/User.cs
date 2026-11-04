namespace RdWeb.Api.Data.Entities;

public sealed class User : Entity
{
    public string Username { get; set; } = "";
    public string NormalizedUsername { get; set; } = "";
    public string? Email { get; set; }
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "viewer";
    public bool IsActive { get; set; } = true;
    public int AuthVersion { get; set; } = 1;
    public byte[]? TotpSecretEnc { get; set; }
    public byte[]? TotpNonce { get; set; }
    public int? TotpKeyVersion { get; set; }
    public DateTime? TotpEnabledAt { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }
}
