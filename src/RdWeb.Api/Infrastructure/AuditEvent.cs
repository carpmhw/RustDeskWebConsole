namespace RdWeb.Api.Infrastructure;

public enum AuditAction { Login, Mfa, UserChanged, SettingsChanged, TargetChanged, PasswordViewed, ConnectionStarted, ConnectionEnded, ServerChanged, ServerTested, VaultRotated, AuditExported, AuditPurged, ConnectionTerminated, SessionRevoked }
public enum AuditResult { Success, Failure }
public enum AuditReason { InvalidCredentials, Locked, Denied, Expired, Disconnected, Completed, ConnectionFailed, Revoked, Idle, Terminated }
public sealed record AuditDetail(AuditReason? ReasonCode = null, long? DurationMilliseconds = null, long? BytesSent = null, long? BytesReceived = null,
    long? Count = null, AuditExportFilter? Filter = null);
// 稽核匯出時使用的篩選條件；只含已驗證的固定欄位，不含任何匯出內容。
public sealed record AuditExportFilter(DateTime From, DateTime To, Guid? UserId, string? Action, string? Result, string TimeZone);
public sealed record AuditEvent(AuditAction Action, AuditResult Result, Guid? UserId = null, AuditDetail? Detail = null,
    string? ObjectType = null, Guid? ObjectId = null, string? SourceIp = null, string? UserAgent = null);
