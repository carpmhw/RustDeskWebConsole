namespace RdWeb.Api.Data.Entities;

public sealed class SystemSetting : Entity
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "{}";
}
