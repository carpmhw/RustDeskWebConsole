namespace RdWeb.Api.Data.Entities;

public sealed class Target : Entity
{
    public Guid ServerId { get; set; }
    public string Name { get; set; } = "";
    public string RustDeskId { get; set; } = "";
    public Guid? PasswordSecretId { get; set; }
    public string? GroupName { get; set; }
    public string Tags { get; set; } = "[]";
    public string? Notes { get; set; }
    public Guid CreatedBy { get; set; }
}
