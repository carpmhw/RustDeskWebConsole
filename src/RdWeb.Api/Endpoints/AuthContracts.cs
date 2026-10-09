using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace RdWeb.Api.Endpoints;

public sealed record LoginRequest(
    [property: Required, StringLength(128, MinimumLength = 3), RegularExpression("^ *[A-Za-z0-9._-]+ *$")] string Username,
    [property: Required, StringLength(1024, MinimumLength = 12)] string Password);
public sealed record MfaRequest([property: Required, StringLength(43, MinimumLength = 43), JsonPropertyName("mfa_token")] string MfaToken,
    [property: Required, StringLength(64, MinimumLength = 6)] string Code);
public sealed record PasswordRequest([property: Required, StringLength(1024, MinimumLength = 12)] string Password);
public sealed record CodeRequest([property: Required, RegularExpression("^[0-9]{6}$")] string Code);
public sealed record ReauthenticationRequest([property: StringLength(1024, MinimumLength = 12)] string? Password,
    [property: RegularExpression("^[0-9]{6}$")] string? Code);
