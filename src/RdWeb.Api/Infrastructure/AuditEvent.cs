namespace RdWeb.Api.Infrastructure;

public enum AuditAction { Login, Mfa, UserChanged, SettingsChanged, TargetChanged, PasswordViewed, ConnectionStarted, ConnectionEnded, ServerChanged, ServerTested, VaultRotated }
public enum AuditResult { Success, Failure }
public enum AuditReason { InvalidCredentials, Locked, Denied, Expired, Disconnected, Completed }
public sealed record AuditDetail(AuditReason? ReasonCode = null, long? DurationMilliseconds = null, long? BytesSent = null, long? BytesReceived = null);
public sealed record AuditEvent(AuditAction Action, AuditResult Result, Guid? UserId = null, AuditDetail? Detail = null,
    string? ObjectType = null, Guid? ObjectId = null, string? SourceIp = null, string? UserAgent = null);
