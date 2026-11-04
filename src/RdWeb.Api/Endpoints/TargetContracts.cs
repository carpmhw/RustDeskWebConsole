using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace RdWeb.Api.Endpoints;

public sealed record TargetRequest(
    [property: Required, StringLength(128)] string Name,
    [property: JsonPropertyName("server_id")] Guid ServerId,
    [property: Required, StringLength(64), RegularExpression("^[A-Za-z0-9_-]+$"), JsonPropertyName("rustdesk_id")] string RustDeskId,
    [property: StringLength(64), JsonPropertyName("group_name")] string? GroupName,
    [property: MaxLength(20)] string[]? Tags,
    [property: StringLength(2000)] string? Notes,
    [property: StringLength(1024)] string? Password,
    int Version);
public sealed record TargetGrantRequest(
    [property: JsonPropertyName("user_id")] Guid? UserId, [property: RegularExpression("^(operator|viewer)$")] string? Role,
    [property: JsonPropertyName("can_connect")] bool CanConnect, [property: JsonPropertyName("can_view_password")] bool CanViewPassword,
    [property: JsonPropertyName("can_edit")] bool CanEdit);
public sealed record TargetPermissionsRequest([property: Range(1, int.MaxValue)] int Version, [property: Required, MaxLength(50)] TargetGrantRequest[] Grants);
public sealed record TargetDeleteItem(Guid Id, [property: Range(1, int.MaxValue)] int Version);
public sealed record TargetBulkRequest([property: Required, MinLength(1), MaxLength(100)] TargetDeleteItem[] Items);
public sealed record TargetImportRequest([property: Required, StringLength(10000)] string Csv);
