using System;
using System.Reflection;

// 真production通知分類／版本契約，不啟動listener、Win32或UIA，不是Windows通知PASS。
internal static class ClipboardNotificationCalibrationTests
{
    // 固定stage方便定位assert；只印public marker，未知內容與native識別不外洩。
    private static int Main()
    {
        string stage="first";
        try
        {
            TestFirstNotice();stage="bounds";TestNoticeBounds();
            stage="eligibility";TestReadEligibility();stage="classification";TestClassification();
            stage="negative";TestNegativeResults();
            Console.WriteLine("clipboard_notification_core_observed,windowsNative=false");return 0;
        }
        catch { Console.WriteLine("clipboard_notification_core_unavailable,windowsNative=false,stage="+stage);return 1; }
    }

    // 若production挑最後一筆、直接持有可變input或清掉overflow，本測試必失敗。
    private static void TestFirstNotice()
    {
        var state=new HostClipboardNotificationCalibration();
        var first=new HostClipboardNotice {Ordinal=1,Us=200,Version=7};
        state.Capture(new[] {first,new HostClipboardNotice {Ordinal=2,Us=210,Version=8}},false);
        first.Ordinal=9;first.Us=900;first.Version=99;
        var saved=state.First();Assert(saved.Ordinal==1 && saved.Us==200 && saved.Version==7 && state.Notifications==2);
        saved.Ordinal=88;saved.Version=88;
        state.Capture(new[] {new HostClipboardNotice {Ordinal=3,Us=220,Version=9}},true);
        state.Capture(new HostClipboardNotice[0],false);
        Assert(state.First().Ordinal==1 && state.First().Version==7 && state.Notifications==3 && state.Overflow);
    }

    // 真64個跨Drain累計界限及序號／時間拒絕，不能以清queue後重新計數冒稱完整。
    private static void TestNoticeBounds()
    {
        var state=new HostClipboardNotificationCalibration();
        for (int i=1;i<=64;i++) state.Capture(new[] {new HostClipboardNotice {Ordinal=i,Us=i,Version=7}},false);
        Assert(state.Notifications==64 && !state.Overflow && state.First().Ordinal==1);
        Reject(delegate { state.Capture(new[] {new HostClipboardNotice {Ordinal=65,Us=65,Version=7}},false); });
        state.Capture(new HostClipboardNotice[0],true);Assert(state.Notifications==64 && state.Overflow);
        foreach (HostClipboardNotice bad in new[] {
            new HostClipboardNotice {Ordinal=0,Us=1,Version=7},new HostClipboardNotice {Ordinal=2,Us=1,Version=7},
            new HostClipboardNotice {Ordinal=1,Us=-1,Version=7},new HostClipboardNotice {Ordinal=1,Us=120000001,Version=7},null})
        {
            Reject(delegate { new HostClipboardNotificationCalibration().Capture(new[] {bad},false); });
        }
        Reject(delegate { new HostClipboardNotificationCalibration().Capture(null,false); });
        Reject(delegate { new HostClipboardNotificationCalibration().Capture(new[] {
            new HostClipboardNotice {Ordinal=1,Us=200,Version=7},new HostClipboardNotice {Ordinal=2,Us=199,Version=7}},false); });
        Reject(delegate { new HostClipboardNotificationCalibration().Capture(new[] {
            new HostClipboardNotice {Ordinal=1,Us=200,Version=7},new HostClipboardNotice {Ordinal=1,Us=200,Version=7}},false); });
    }

    // 未通知／pre-arm／零sequence／讀取區間前通知都不可觸發read，不忽略第一筆改用後來通知。
    private static void TestReadEligibility()
    {
        var state=new HostClipboardNotificationCalibration();
        Assert(state.First()==null && !state.CanRead(100,300));
        var pending=state.Classify(null,true,100,300,300,0);
        Assert(!pending.NotificationObserved && !pending.Readable && !pending.Exact && pending.ReadResourcesClosed && pending.Code=="host_notification_unavailable");
        state.Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=90,Version=7},new HostClipboardNotice {Ordinal=2,Us=200,Version=7}},false);
        Assert(!state.CanRead(100,300));
        var early=state.Classify(null,true,100,300,400,0);
        Assert(early.NotificationObserved && !early.NotificationAfterArm && !early.NotificationOrderVerified && !early.NotificationVersionMatched && !early.Exact && early.Code=="host_clipboard_unstable");
        var zero=new HostClipboardNotificationCalibration();zero.Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=200,Version=0}},false);
        Assert(!zero.CanRead(100,300));
        var normal=NoticeState();Assert(normal.CanRead(100,300) && !normal.CanRead(100,199));
        Reject(delegate { normal.CanRead(-1,300); });
        Reject(delegate { normal.Classify(Value(),true,100,300,120000001,7); });
    }

    // hand literal同版本／同全文正向，若忽略notice Version或尾race、本測試會失敗。
    private static void TestClassification()
    {
        var state=NoticeState();var value=Value();
        var row=state.Classify(value,true,100,300,400,7);
        Assert(row.ScopeVerified && row.Readable && row.Stable && row.Exact && row.ReadResourcesClosed && row.Notifications==1 && !row.Overflow && row.Code=="host_observed");
        Assert(row.NotificationObserved && row.NotificationAfterArm && row.NotificationOrderVerified && row.NotificationVersionMatched && row.OwnerMatchesEditor==true);
        foreach (bool? owner in new bool?[] {true,false,null}) {
            value.OwnerMatches=owner;row=state.Classify(value,true,100,300,400,7);Assert(row.Exact && row.OwnerMatchesEditor==owner);
        }
        foreach (string text in new[] {"Public 中文 RdWeb Clipboard calibration\r","Public 中文 RdWeb Clipboard calibration extra","Unknown public text"}) {
            value.Text=text;row=state.Classify(value,true,100,300,400,7);Assert(row.Readable && row.Stable && !row.Exact && row.NotificationVersionMatched);
        }
        value=Value();value.Version=8;
        row=state.Classify(value,true,100,300,400,8);Assert(!row.Exact && !row.Readable && !row.NotificationVersionMatched && row.Code=="host_clipboard_unstable");
        value=Value();row=state.Classify(value,true,100,300,400,8);
        Assert(!row.Exact && !row.Stable && !row.NotificationVersionMatched && row.Code=="host_clipboard_unstable");
        // 同fixture即使後來version相等，原首通知仍不得被較晚版本替代。
        state.Capture(new[] {new HostClipboardNotice {Ordinal=2,Us=250,Version=8}},false);value.Version=8;
        row=state.Classify(value,true,100,300,400,8);Assert(row.Notifications==2 && !row.Exact && !row.NotificationVersionMatched);
        string[] fields={"ScopeVerified","Readable","Stable","Exact","OwnerMatchesEditor","Notifications","Overflow","ReadResourcesClosed","Code","NotificationObserved","NotificationAfterArm","NotificationOrderVerified","NotificationVersionMatched"};
        var actual=typeof(HostClipboardNotificationCalibrationResult).GetFields(BindingFlags.Public|BindingFlags.Instance);
        Assert(actual.Length==fields.Length);foreach (FieldInfo field in actual) Assert(Array.IndexOf(fields,field.Name)>=0);
    }

    // cleanup／scope／overflow／busy／未知code／invalid text不能被「有通知」成功捷徑覆蓋。
    private static void TestNegativeResults()
    {
        foreach (string code in new[] {"host_clipboard_busy","host_clipboard_format_unavailable","host_clipboard_unstable","host_text_too_large","host_text_invalid","host_text_unreadable","Unknown public code"}) {
            var value=Value();value.Code=code;
            var row=NoticeState().Classify(value,true,100,300,400,7);
            Assert(!row.Readable && !row.Exact && !row.NotificationVersionMatched && row.OwnerMatchesEditor==null);
            Assert(row.Code==(code=="Unknown public code" ? "host_capability_unavailable" : code));
        }
        var state=NoticeState();var input=Value();input.ResourcesClosed=false;
        var result=state.Classify(input,true,100,300,400,7);
        Assert(!result.Exact && !result.ReadResourcesClosed && result.Code=="host_cleanup_unavailable");
        result=state.Classify(Value(),false,100,300,400,7);Assert(!result.Exact && !result.ScopeVerified && result.Code=="host_scope_changed");
        state.Capture(new HostClipboardNotice[0],true);
        result=state.Classify(Value(),true,100,300,400,7);Assert(result.Overflow && !result.Exact && result.Code=="host_observation_overflow");
        foreach (string text in new[] {null,"\ud800","Public\0text",new string('中',10923)}) {
            input=Value();input.Text=text;result=NoticeState().Classify(input,true,100,300,400,7);
            Assert(!result.Exact && !result.Readable && result.Code=="host_text_invalid");
        }
        input=Value();input.Stable=false;result=NoticeState().Classify(input,true,100,300,400,7);
        Assert(!result.Stable && !result.Exact && !result.NotificationVersionMatched);
        result=NoticeState().Classify(Value(),true,100,300,299,7);
        Assert(!result.Exact && !result.NotificationOrderVerified && result.Code=="host_clipboard_unstable");
    }

    // 公開fixture資料由測試獨立手寫，不由production factory生成expected。
    private static HostClipboardValue Value() { return new HostClipboardValue {Text="Public 中文 RdWeb Clipboard calibration",Code="host_observed",Stable=true,Version=7,OwnerMatches=true,ResourcesClosed=true}; }
    // 真state只替換Windows通知來源，不mock其ordinal／version／clock策略。
    private static HostClipboardNotificationCalibration NoticeState() { var state=new HostClipboardNotificationCalibration();state.Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=200,Version=7}},false);return state; }
    // 只回固定assert失敗，不印未知原文／metadata。
    private static void Assert(bool condition) { if (!condition) throw new Exception(); }
    // malformed metadata只允許固定ArgumentException，不接受任意runtime崩潰冒稱拒絕成功。
    private static void Reject(Action action) { bool rejected=false;try {action();} catch (ArgumentException) {rejected=true;}Assert(rejected); }
}
