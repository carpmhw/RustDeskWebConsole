using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace RdWeb.Api.Endpoints;

public sealed record CreateUserRequest(
    [property: Required, StringLength(128, MinimumLength = 3), RegularExpression("^[A-Za-z0-9._-]+$")] string Username,
    [property: Required, StringLength(1024, MinimumLength = 12)] string Password,
    [property: Required, RegularExpression("^(admin|operator|viewer)$")] string Role,
    [property: StringLength(320), EmailAddress] string? Email);
public sealed record UpdateUserRequest(
    [property: JsonPropertyName("is_active")] bool? IsActive,
    [property: RegularExpression("^(admin|operator|viewer)$")] string? Role,
    [property: StringLength(320), EmailAddress] string? Email);
public sealed record ResetPasswordRequest(
    [property: Required, StringLength(1024, MinimumLength = 12), JsonPropertyName("new_password")] string NewPassword,
    [property: StringLength(1024, MinimumLength = 12)] string? Password,
    [property: RegularExpression("^[0-9]{6}$")] string? Code);
public sealed record SecuritySettingRequest(
    [property: Required, RegularExpression("^(off|admins|all)$"), JsonPropertyName("require_mfa")] string RequireMfa,
    [property: StringLength(1024, MinimumLength = 12)] string? Password,
    [property: RegularExpression("^[0-9]{6}$")] string? Code);
