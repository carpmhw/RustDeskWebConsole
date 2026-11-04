namespace RdWeb.Api.Security;

public sealed class AuthException(string code, int status = StatusCodes.Status401Unauthorized) : Exception(code)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}
