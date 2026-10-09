using RdWeb.Api.Security;
using RdWeb.Api.Targets;

namespace RdWeb.Tests;

public sealed class CsvCodecTests
{
    // RFC4180 commas／escapedquotes／quotedCRLF／BOM都保存內容。
    [Fact]
    public void ParsesQuotedFieldsWithoutLosingLineBreaks()
    {
        var rows = CsvCodec.Parse("\uFEFFa,b\r\n\"one,two\",\"line1\r\nline2 \"\"quoted\"\"\"\r\n");
        Assert.Equal(2, rows.Count); Assert.Equal(new[] { "a", "b" }, rows[0]);
        Assert.Equal(new[] { "one,two", "line1\r\nline2 \"quoted\"" }, rows[1]);
    }
    // Trial spreadsheet執行符號要保護，來源apostrophe不被剝除。
    [Fact]
    public void ExportEscapesFormulasAndQuotes()
    {
        var csv = CsvCodec.Export([["=1+1", " +SUM(A1)", "-formula", "@command", "safe,quoted", "'literal"]]);
        var row = CsvCodec.Parse(csv).Single();
        Assert.Equal("'=1+1", row[0]); Assert.Equal("' +SUM(A1)", row[1]); Assert.Equal("'-formula", row[2]);
        Assert.Equal("'@command", row[3]); Assert.Equal("safe,quoted", row[4]); Assert.Equal("'literal", row[5]);
    }
    //  malformed quotes／多餘字元／資料量不輸出來源內容。
    [Theory]
    [InlineData("\"unterminated")]
    [InlineData("\"quoted\"junk")]
    [InlineData("raw\"quote")]
    public void RejectsInvalidCsvWithSafeErrors(string input)
    {
        var error = Assert.Throws<AuthException>(() => CsvCodec.Parse(input)); Assert.Equal("invalid_csv", error.Code);
        Assert.DoesNotContain(input, error.Message);
    }
    // Parser自行限制資料量，不依賴HTTP層才終止不受控記憶體使用。
    [Fact]
    public void RejectsExcessiveRowsAndInputLength()
    {
        Assert.Throws<AuthException>(() => CsvCodec.Parse(new string('a', 10001)));
        Assert.Throws<AuthException>(() => CsvCodec.Parse(string.Concat(Enumerable.Repeat("a\r\n", 52))));
    }
}
