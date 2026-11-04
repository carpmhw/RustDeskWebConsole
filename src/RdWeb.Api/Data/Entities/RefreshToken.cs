namespace RdWeb.Api.Data.Entities;

public sealed class RefreshToken : Entity
{
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public Guid FamilyId { get; set; }
    public int AuthVersion { get; set; }
    public bool MfaVerified { get; set; }
    public DateTime AuthenticatedAt { get; set; }
    public Guid? ReplacedById { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? UserAgent { get; set; }
    public string? Ip { get; set; }
}
