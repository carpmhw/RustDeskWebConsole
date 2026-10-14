using System;
using System.Reflection;

// 真分類與公開DTO測試；不new listener或呼Windows API，不是native adapter PASS。
internal static class ClipboardCalibrationTests
{
    // hand literal fixture檢strict exact／close／scope／overflow／nullable owner，不鏡像被測比較。
    private static int Main()
    {
        try
        {
            string fixture="Public 中文 RdWeb Clipboard calibration";
            HostClipboardValue value=new HostClipboardValue {Text=fixture,Stable=true,Code="host_observed",OwnerMatches=true,Version=19,ResourcesClosed=true};
            HostClipboardCalibrationResult row=HostClipboardCalibration.Classify(value,true,0,false);
            Assert(row.ScopeVerified && row.Readable && row.Stable && row.Exact && row.OwnerMatchesEditor==true && row.ReadResourcesClosed && row.Notifications==0 && !row.Overflow && row.Code=="host_observed");
            foreach (bool? owner in new bool?[] {true,false,null})
            {
                value.OwnerMatches=owner;row=HostClipboardCalibration.Classify(value,true,2,false);
                Assert(row.Exact && row.OwnerMatchesEditor==owner && row.Notifications==2);
            }
            foreach (string text in new[] {fixture+"\r",fixture+"\n",fixture+" ",fixture+" extra","Unknown public text"})
            {
                value.Text=text;row=HostClipboardCalibration.Classify(value,true,1,false);
                Assert(row.Readable && row.Stable && !row.Exact && row.Code=="host_observed");
            }
            value.Text=fixture;value.Stable=false;
            row=HostClipboardCalibration.Classify(value,true,0,false);
            Assert(!row.Readable && !row.Stable && !row.Exact && row.Code=="host_clipboard_unstable");
            value.Stable=true;
            foreach (string code in new[] {"host_clipboard_busy","host_clipboard_format_unavailable","host_clipboard_unstable","host_text_too_large","host_text_invalid","host_text_unreadable"})
            {
                value.Code=code;row=HostClipboardCalibration.Classify(value,true,0,false);
                Assert(!row.Readable && !row.Stable && !row.Exact && row.OwnerMatchesEditor==null && row.Code==code);
            }
            value.Code="Unknown public code";
            row=HostClipboardCalibration.Classify(value,true,0,false);
            Assert(!row.Exact && row.Code=="host_capability_unavailable");
            value.Code="host_observed";value.ResourcesClosed=false;
            row=HostClipboardCalibration.Classify(value,true,0,false);
            Assert(!row.ReadResourcesClosed && !row.Readable && !row.Stable && !row.Exact && row.Code=="host_cleanup_unavailable");
            value.ResourcesClosed=true;
            row=HostClipboardCalibration.Classify(value,false,0,false);
            Assert(!row.ScopeVerified && !row.Readable && !row.Stable && !row.Exact && row.OwnerMatchesEditor==null && row.Code=="host_scope_changed");
            row=HostClipboardCalibration.Classify(value,true,64,true);
            Assert(row.Overflow && row.Notifications==64 && !row.Readable && !row.Exact && row.Code=="host_observation_overflow");
            foreach (string bad in new[] {null,"Public\0text","\ud800",new string('a',32769),new string('中',10923)})
            {
                value.Text=bad;row=HostClipboardCalibration.Classify(value,true,0,false);
                Assert(!row.Readable && !row.Stable && !row.Exact && row.Code=="host_text_invalid");
            }
            row=HostClipboardCalibration.Classify(null,true,0,false);
            Assert(!row.ReadResourcesClosed && !row.Readable && !row.Exact && row.Code=="host_capability_unavailable");
            foreach (int count in new[] {-1,65})
            {
                bool rejected=false;
                try { HostClipboardCalibration.Classify(value,true,count,false); } catch (ArgumentException) { rejected=true; }
                Assert(rejected);
            }
            // 真公開DTO不得保留Text／Version／長度或陌生code欄位，也不使用原生value本體序列化。
            string[] names={"ScopeVerified","Readable","Stable","Exact","OwnerMatchesEditor","Notifications","Overflow","ReadResourcesClosed","Code"};
            FieldInfo[] fields=typeof(HostClipboardCalibrationResult).GetFields(BindingFlags.Public|BindingFlags.Instance);
            Assert(fields.Length==names.Length);
            foreach (FieldInfo field in fields) Assert(Array.IndexOf(names,field.Name)>=0);
            Console.WriteLine("clipboard_calibration_core_observed,windowsNative=false");return 0;
        }
        catch { Console.WriteLine("clipboard_calibration_core_unavailable,windowsNative=false");return 1; }
    }

    // 只失敗固定public marker，未知fixture內容／錯誤值不印stdout。
    private static void Assert(bool condition) { if (!condition) throw new Exception(); }
}
