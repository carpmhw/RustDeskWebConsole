namespace RdWeb.Api.Data.Entities;

public sealed class EncryptedSecret : Entity
{
    public string ObjectType { get; set; } = "target";
    public Guid ObjectId { get; set; }
    public byte[] Ciphertext { get; set; } = [];
    public byte[] Nonce { get; set; } = [];
    public int KeyVersion { get; set; }
}
