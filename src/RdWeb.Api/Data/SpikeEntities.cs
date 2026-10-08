namespace RdWeb.Api.Data;

public sealed class SpikeUser
{
    public Guid Id { get; set; }
    public DateTime CreatedAt { get; set; }
    public int Version { get; set; }
}

public sealed class SpikeAudit
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateTime Timestamp { get; set; }
    public string Detail { get; set; } = "{}";
}
