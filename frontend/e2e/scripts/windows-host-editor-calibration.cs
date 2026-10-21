using System;

// 唯有真正矩形guard拒絕才拋此型別；scope負向不能以任意native錯誤充數。
public sealed class HostEditorBoundsException : Exception
{
    // 固定訊息不含座標／原文；呼叫者只依型別判定，不讀Message。
    public HostEditorBoundsException() : base("scope") { }
}

// 只保存安全布林與固定表示code，不持有觀察文字／長度／hash。
public sealed class HostUiaClassification
{
    public bool Readable;
    public bool Stable;
    public bool Exact;
    public bool FixtureRecognized;
    public string Representation = "unknown";
}

// 公開校準策略；UIA在PS reader，這裡只做scope guard及raw Ordinal比較。
public static class HostEditorCalibration
{
    public const string SingleFixture = "Public 中文 RdWeb UIA calibration";
    public const string NegativeFixture = "Public 中文 RdWeb UIA mismatch";

    // 原授權box及actual rect均有限合法且完全包含；失敗必在GetText之前拒絕。
    public static void ValidateScope(double x,double y,double width,double height,int ax,int ay,int aw,int ah)
    {
        foreach (double number in new[] {x,y,width,height})
            if (double.IsNaN(number) || double.IsInfinity(number)) throw new HostEditorBoundsException();
        if (ax<0 || ay<0 || ax>4096 || ay>4096 || aw<21 || ah<31 || aw>4096 || ah>4096 || ax+aw>4096 || ay+ah>4096 || width<=0 || height<=0 || x<ax || y<ay || x+width>ax+aw || y+height>ay+ah) throw new HostEditorBoundsException();
    }

    // 全值等於已知fixture表示才認得；不trim／replace／normalize或把兩個false判相等。
    public static HostUiaClassification ClassifySnapshot(string before,string after,string mode)
    {
        if (mode!="SingleLine" && mode!="Multiline" && mode!="Mismatch") throw new ArgumentException("host_uia_unavailable");
        HostUiaClassification value=new HostUiaClassification();
        value.Readable=HostObserverNative.IsSafeText(before,32768) && HostObserverNative.IsSafeText(after,32768);
        if (!value.Readable) return value;
        value.Stable=string.Equals(before,after,StringComparison.Ordinal);
        if (!value.Stable) return value;
        string expected=mode=="Multiline" ? SingleFixture+"\r\nsecond line" : SingleFixture;
        value.Exact=string.Equals(after,expected,StringComparison.Ordinal);
        string[] suffixes={"","\r","\n","\r\n"};
        string[] names={"exact","suffix_cr","suffix_lf","suffix_crlf"};
        if (mode=="Multiline")
        {
            string[] separators={"\r\n","\n","\r"};
            string[] endings={"crlf","lf","cr"};
            for (int line=0;line<separators.Length;line++)
                for (int suffix=0;suffix<suffixes.Length;suffix++)
                    if (string.Equals(after,SingleFixture+separators[line]+"second line"+suffixes[suffix],StringComparison.Ordinal))
                    {
                        value.FixtureRecognized=true;
                        value.Representation="multiline_"+endings[line]+"_"+names[suffix];
                        return value;
                    }
        }
        else
        {
            string fixture=mode=="Mismatch" ? NegativeFixture : SingleFixture;
            for (int suffix=0;suffix<suffixes.Length;suffix++)
                if (string.Equals(after,fixture+suffixes[suffix],StringComparison.Ordinal))
                {
                    value.FixtureRecognized=true;
                    value.Representation=(mode=="Mismatch" ? "negative_" : "single_")+names[suffix];
                    return value;
                }
        }
        return value;
    }
}
