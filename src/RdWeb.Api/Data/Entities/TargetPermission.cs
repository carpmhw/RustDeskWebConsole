namespace RdWeb.Api.Data.Entities;

public sealed class TargetPermission : Entity
{
    public Guid TargetId { get; set; }
    public Guid? UserId { get; set; }
    public string? Role { get; set; }
    public bool CanConnect { get; set; }
    public bool CanViewPassword { get; set; }
    public bool CanEdit { get; set; }
}
