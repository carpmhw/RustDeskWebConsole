using System.Text;
using RdWeb.Api.Security;

namespace RdWeb.Api.Targets;

public static class CsvCodec
{
    // 有限RFC4180 parser，錯誤只回固定分類，不回原始欄位內容。
    public static List<string[]> Parse(string csv)
    {
        if (csv.Length > 10000 || csv.Contains('\0')) throw Invalid();
        if (csv.StartsWith('\uFEFF')) csv = csv[1..];
        var rows = new List<string[]>(); var fields = new List<string>(); var field = new StringBuilder();
        var quoted = false; var afterQuote = false;
        for (var index = 0; index < csv.Length; index++)
        {
            var character = csv[index];
            if (quoted)
            {
                if (character == '"')
                {
                    if (index + 1 < csv.Length && csv[index + 1] == '"') { field.Append('"'); index++; }
                    else { quoted = false; afterQuote = true; }
                }
                else field.Append(character);
            }
            else if (character == ',' || character is '\r' or '\n')
            {
                fields.Add(field.ToString()); field.Clear(); afterQuote = false;
                if (fields.Count > 32) throw Invalid();
                if (character != ',')
                {
                    rows.Add(fields.ToArray()); fields.Clear();
                    if (rows.Count > 51) throw Invalid();
                    if (character == '\r' && index + 1 < csv.Length && csv[index + 1] == '\n') index++;
                }
            }
            else if (afterQuote) throw Invalid();
            else if (character == '"') { if (field.Length != 0) throw Invalid(); quoted = true; }
            else field.Append(character);
            if (field.Length > 4096) throw Invalid();
        }
        if (quoted) throw Invalid();
        if (field.Length > 0 || afterQuote || fields.Count > 0)
        {
            fields.Add(field.ToString()); rows.Add(fields.ToArray());
            if (rows.Count > 51 || fields.Count > 32) throw Invalid();
        }
        return rows;
    }
    // 逐格保護試算表formula並quote，輸出不含任何密碼欄位。
    public static string Export(IEnumerable<string[]> rows) => string.Join("\r\n", rows.Select(row => string.Join(',', row.Select(Escape)))) + "\r\n";
    // Apostrophe只新增安全防護，不模糊移除來源的literal字元。
    private static string Escape(string value)
    {
        var trimmed = value.TrimStart();
        if (value.TakeWhile(char.IsWhiteSpace).Any(character => character is '\t' or '\r' or '\n')
            || trimmed.Length > 0 && trimmed[0] is '=' or '+' or '-' or '@') value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }
    // Parser不把csv／field或行內容帶入例外。
    private static AuthException Invalid() => new("invalid_csv", 400);
}
