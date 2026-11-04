using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace RdWeb.Api.Endpoints;

public sealed record ServerRequest(
    [property: Required, StringLength(128)] string Name,
    [property: Required, StringLength(320), JsonPropertyName("id_server")] string IdServer,
    [property: Required, StringLength(320), JsonPropertyName("relay_server")] string RelayServer,
    [property: Required, StringLength(44), JsonPropertyName("public_key")] string PublicKey,
    [property: Required, RegularExpression("^(tcp|ws)$")] string Transport,
    bool Enabled,
    [property: JsonPropertyName("allow_private_network")] bool AllowPrivateNetwork,
    int Version,
    [property: StringLength(2000)] string? Notes);
