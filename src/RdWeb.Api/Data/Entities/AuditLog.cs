namespace RdWeb.Api.Data.Entities;

public sealed class AuditLog : Entity
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public Guid? UserId { get; set; }
    public string Action { get; set; } = "";
    public string? ObjectType { get; set; }
    public Guid? ObjectId { get; set; }
    public string? SourceIp { get; set; }
    public string? UserAgent { get; set; }
    public string Result { get; set; } = "";
    public string Detail { get; set; } = "{}";
}
