using System;

// 真public classifier／bounds策略測試；不呼UIA、clipboard或Windows API。
internal static class UiaCalibrationTests
{
    // 手寫公開expected及表示oracle，未知suffix／不穩定不能變成校準成功。
    private static int Main()
    {
        try
        {
            string single="Public 中文 RdWeb UIA calibration";
            string negative="Public 中文 RdWeb UIA mismatch";
            string[] suffixes={"","\r","\n","\r\n"};
            string[] names={"exact","suffix_cr","suffix_lf","suffix_crlf"};
            for (int i=0;i<suffixes.Length;i++)
            {
                Check(single+suffixes[i],single+suffixes[i],"SingleLine",true,true,i==0,true,"single_"+names[i]);
                Check(negative+suffixes[i],negative+suffixes[i],"Mismatch",true,true,false,true,"negative_"+names[i]);
            }
            string[] separators={"\r\n","\n","\r"};
            string[] endings={"crlf","lf","cr"};
            for (int line=0;line<separators.Length;line++)
            {
                for (int suffix=0;suffix<suffixes.Length;suffix++)
                {
                    string text=single+separators[line]+"second line"+suffixes[suffix];
                    Check(text,text,"Multiline",true,true,line==0 && suffix==0,true,"multiline_"+endings[line]+"_"+names[suffix]);
                }
            }
            Check(single,single,"Mismatch",true,true,true,false,"unknown");
            Check(negative,negative,"SingleLine",true,true,false,false,"unknown");
            foreach (string extra in new[] {" ","\n\n","\r\n\r\n"," Public metadata"})
                Check(single+extra,single+extra,"SingleLine",true,true,false,false,"unknown");
            Check("Unknown public text","Unknown public text","Mismatch",true,true,false,false,"unknown");
            Check(single,single+"\r","SingleLine",true,false,false,false,"unknown");
            foreach (string bad in new[] {null,"Public\0text","\ud800",new string('a',32769),new string('中',10923)})
                Check(bad,bad,"SingleLine",false,false,false,false,"unknown");
            bool rejected=false;
            try { HostEditorCalibration.ClassifySnapshot(single,single,"ScopeDenied"); }
            catch (ArgumentException) { rejected=true; }
            if (!rejected) throw new Exception();
            HostEditorCalibration.ValidateScope(0,152,1075,508,0,152,1075,508);
            HostEditorCalibration.ValidateScope(0.25,152.25,1074.5,507.5,0,152,1075,508);
            Reject(-0.1,152,1075,508,0,152,1075,508);
            Reject(0,151.9,1075,508,0,152,1075,508);
            Reject(0,152,1075.1,508,0,152,1075,508);
            Reject(0,152,1075,508.1,0,152,1075,508);
            Reject(0,152,0,508,0,152,1075,508);
            Reject(0,152,1075,-1,0,152,1075,508);
            Reject(0,152,1075,508,0,152,21,31);
            Reject(0,152,1075,508,-1,152,1075,508);
            Reject(0,152,1075,508,0,152,20,508);
            Reject(0,152,1075,508,0,152,1075,30);
            Reject(0,152,1075,508,0,152,4097,508);
            foreach (double bad in new[] {double.NaN,double.PositiveInfinity,double.NegativeInfinity})
            {
                Reject(bad,152,1075,508,0,152,1075,508);
                Reject(0,bad,1075,508,0,152,1075,508);
                Reject(0,152,bad,508,0,152,1075,508);
                Reject(0,152,1075,bad,0,152,1075,508);
            }
            Console.WriteLine("uia_calibration_core_observed,windowsNative=false");return 0;
        }
        catch { Console.WriteLine("uia_calibration_core_unavailable,windowsNative=false");return 1; }
    }

    // 比對真安全DTO全部欄位；不能只檢單一true而漏不一致的exact／representation。
    private static void Check(string before,string after,string mode,bool readable,bool stable,bool exact,bool recognized,string representation)
    {
        HostUiaClassification value=HostEditorCalibration.ClassifySnapshot(before,after,mode);
        if (value.Readable!=readable || value.Stable!=stable || value.Exact!=exact || value.FixtureRecognized!=recognized || value.Representation!=representation) throw new Exception();
    }

    // 只接受真正bounds例外；native錯誤或無拒絕不能冒充scope安全PASS。
    private static void Reject(double x,double y,double w,double h,int ax,int ay,int aw,int ah)
    {
        bool rejected=false;
        try { HostEditorCalibration.ValidateScope(x,y,w,h,ax,ay,aw,ah); }
        catch (HostEditorBoundsException) { rejected=true; }
        if (!rejected) throw new Exception();
    }
}
