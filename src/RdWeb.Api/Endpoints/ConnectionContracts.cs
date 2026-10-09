using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json.Serialization;

namespace RdWeb.Api.Endpoints;

public sealed record ConnectionTicketRequest;
public sealed record ConnectionTicketResponse(string Ticket, [property: JsonPropertyName("expires_in")] int ExpiresIn);
public sealed record ConnectionGrant(Guid UserId, Guid TargetId, ConnectionSessionBinding? Session = null);
public sealed record VerifiedPeerIdentity(string RustDeskId, string SigningKey);
public sealed record RelayReady(Guid ConnectionId, Guid TargetId, VerifiedPeerIdentity Peer);
public sealed record LoginAssistRequest([property: JsonPropertyName("connection_id")] Guid ConnectionId,
    [property: Required, StringLength(128, MinimumLength = 1)] string Salt,
    [property: Required, StringLength(128, MinimumLength = 1)] string Challenge);
public sealed record LoginAssistResponse(string Proof);
public sealed record ConnectionSessionBinding(Guid FamilyId, int AuthVersion, string Role, bool MfaVerified)
{
    // 只從server先前驗證並存KV的snapshot重建principal，不接受client supplied claims。
    public ClaimsPrincipal ToPrincipal(Guid userId) => new(new ClaimsIdentity(new[]
    {
        new Claim("sub", userId.ToString()), new Claim("sid", FamilyId.ToString()),
        new Claim("av", AuthVersion.ToString(System.Globalization.CultureInfo.InvariantCulture)),
        new Claim("role", Role), new Claim("mfa", MfaVerified ? "1" : "0")
    }, "ticket-snapshot"));
}
