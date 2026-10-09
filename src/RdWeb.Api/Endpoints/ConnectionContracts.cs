using System.Text.Json.Serialization;

namespace RdWeb.Api.Endpoints;

public sealed record ConnectionTicketRequest;
public sealed record ConnectionTicketResponse(string Ticket, [property: JsonPropertyName("expires_in")] int ExpiresIn);
public sealed record ConnectionGrant(Guid UserId, Guid TargetId);
