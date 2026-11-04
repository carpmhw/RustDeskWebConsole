namespace RdWeb.Api.Data.Entities;

public sealed class RustDeskServer : Entity
{
    public string Name { get; set; } = "";
    public string IdServer { get; set; } = "";
    public string RelayServer { get; set; } = "";
    public string PublicKey { get; set; } = "";
    public string Transport { get; set; } = "tcp";
    public bool Enabled { get; set; } = true;
    public bool AllowPrivateNetwork { get; set; }
    public string? Notes { get; set; }
}
