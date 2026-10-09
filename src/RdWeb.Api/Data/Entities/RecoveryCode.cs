namespace RdWeb.Api.Data.Entities;

public sealed class RecoveryCode : Entity
{
    public Guid UserId { get; set; }
    public string CodeHash { get; set; } = "";
    public DateTime? UsedAt { get; set; }
}
