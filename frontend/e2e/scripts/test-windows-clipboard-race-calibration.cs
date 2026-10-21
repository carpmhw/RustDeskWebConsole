using System;
using System.Reflection;

// 真state與ObserveClipboard讀前過期拒絕，不呼Windows listener或Clipboard API。
internal static class ClipboardRaceCalibrationTests
{
    private sealed class StalePort : IHostClipboardAccess
    {
        public uint Current=8;
        public int Opens,Reads,Closes,Sequences;
        // 僅替代原生current版本，正式early guard仍由production策略執行。
        public uint Sequence() { Sequences++;return Current; }
        // 舊通知被拒絕時不得Open或重試。
        public bool Open() { Opens++;throw new Exception(); }
        // 不得因版本不符去讀格式或資料。
        public bool HasUnicode() { throw new Exception(); }
        // 不得配置borrowed container。
        public ulong ContainerSize() { throw new Exception(); }
        // 若跳過early version guard，本測試必失敗。
        public byte[] ReadContainer(int count) { Reads++;throw new Exception(); }
        // 拒絕前沒有owner證據。
        public bool? OwnerMatches(int pid) { throw new Exception(); }
        // 未Open成功不Close任何lock。
        public bool Close() { Closes++;return true; }
    }
    // 每組測試固定stage，不輸出任何未知文字／native識別或exception。
    private static int Main()
    {
        string stage="state";
        try {
            TestState();stage="early";TestEarlyRejection();stage="negative";TestNegative();
            Console.WriteLine("clipboard_race_core_observed,windowsNative=false");return 0;
        } catch { Console.WriteLine("clipboard_race_core_unavailable,windowsNative=false,stage="+stage);return 1; }
    }
    // 換首筆／換第一次replacement／忽略同版本通知或持有mutable input都會被此case抓到。
    private static void TestState()
    {
        var state=new HostClipboardRaceCalibration();Assert(state.First()==null && state.Replacement()==null && !state.CanProbe(100,400));
        var first=new HostClipboardNotice {Ordinal=1,Us=200,Version=7};
        state.Capture(new[] {first,new HostClipboardNotice {Ordinal=2,Us=210,Version=7}},false);
        first.Version=99;Assert(state.First().Version==7 && state.Notifications==2 && state.FirstEligible(100,400) && !state.CanProbe(100,400));
        var replacement=new HostClipboardNotice {Ordinal=3,Us=300,Version=8};state.Capture(new[] {replacement},false);replacement.Version=99;
        Assert(state.CanProbe(100,400) && state.Replacement().Version==8);
        var copy=state.Replacement();copy.Version=88;
        state.Capture(new[] {new HostClipboardNotice {Ordinal=4,Us=350,Version=9}},false);
        Assert(state.First().Version==7 && state.Replacement().Version==8 && state.Notifications==4);
        state.Capture(new HostClipboardNotice[0],true);state.Capture(new HostClipboardNotice[0],false);Assert(state.Overflow && !state.CanProbe(100,400));
        var zero=new HostClipboardRaceCalibration();zero.Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=200,Version=7},new HostClipboardNotice {Ordinal=2,Us=300,Version=0}},false);
        Assert(!zero.CanProbe(100,400));
        var early=new HostClipboardRaceCalibration();early.Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=99,Version=7},new HostClipboardNotice {Ordinal=2,Us=300,Version=8}},false);Assert(!early.FirstEligible(100,400));
        Reject(delegate { new HostClipboardRaceCalibration().Capture(new[] {new HostClipboardNotice {Ordinal=2,Us=300,Version=8}},false); });
        Reject(delegate { new HostClipboardRaceCalibration().Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=300,Version=7},new HostClipboardNotice {Ordinal=2,Us=200,Version=8}},false); });
        var full=new HostClipboardRaceCalibration();for (int i=1;i<=64;i++) full.Capture(new[] {new HostClipboardNotice {Ordinal=i,Us=i+100,Version=(uint)i}},false);
        Reject(delegate { full.Capture(new[] {new HostClipboardNotice {Ordinal=65,Us=400,Version=65}},false); });
    }
    // 真早拒絕：只Sequence1／Open0／Read0／Close0，不用fake code代替ObserveClipboard。
    private static void TestEarlyRejection()
    {
        var state=State(7,8);var port=new StalePort();
        var value=HostObserverNative.ObserveClipboard(port,state.First().Version,41);
        var row=state.Classify(value,true,100,400,500,8,8);
        Assert(row.ScopeVerified && row.FirstNotificationObserved && row.FirstAfterArm && row.ReplacementObserved && row.DifferentVersions && row.OrderVerified && row.CurrentVersionMatched && row.StaleRejected && row.ReadAttempted && row.ContentWasRead==false && row.ReadResourcesClosed && !row.Overflow && row.Notifications==2 && row.Code=="host_clipboard_unstable");
        Assert(port.Sequences==1 && port.Opens==0 && port.Reads==0 && port.Closes==0);
        // uint回繞只比較不同，不以數值大於當作新版本。
        state=State(uint.MaxValue,1);port=new StalePort {Current=1};value=HostObserverNative.ObserveClipboard(port,state.First().Version,41);
        Assert(state.Classify(value,true,100,400,500,1,1).StaleRejected);
        string[] names={"ScopeVerified","FirstNotificationObserved","FirstAfterArm","ReplacementObserved","DifferentVersions","OrderVerified","CurrentVersionMatched","StaleRejected","ReadAttempted","ContentWasRead","ReadResourcesClosed","Notifications","Overflow","Code"};
        var fields=typeof(HostClipboardRaceCalibrationResult).GetFields(BindingFlags.Public|BindingFlags.Instance);Assert(fields.Length==names.Length);foreach (FieldInfo f in fields) Assert(Array.IndexOf(names,f.Name)>=0);
    }
    // 缺第二版本、before／tail變動、clock、scope、cleanup或可能讀過內容不能成功。
    private static void TestNegative()
    {
        var state=State(7,8);var value=new HostClipboardValue {Code="host_clipboard_unstable"};
        foreach (uint current in new uint[] {0,7,9}) {
            Assert(!state.Classify(value,true,100,400,500,current,8).StaleRejected);
            Assert(!state.Classify(value,true,100,400,500,8,current).StaleRejected);
        }
        Assert(!state.Classify(value,true,100,299,500,8,8).StaleRejected);
        Assert(!state.Classify(value,true,100,400,399,8,8).StaleRejected);
        Assert(state.Classify(value,false,100,400,500,8,8).Code=="host_scope_changed");
        value.ResourcesClosed=false;Assert(state.Classify(value,true,100,400,500,8,8).Code=="host_cleanup_unavailable");
        foreach (int kind in new[] {0,1,2,3,4}) {
            value=new HostClipboardValue {Code="host_clipboard_unstable"};
            if (kind==0) value.Text="Public text";if (kind==1) value.Stable=true;if (kind==2) value.Version=7;if (kind==3) value.OwnerMatches=true;if (kind==4) value.Code="Unknown public code";
            var row=state.Classify(value,true,100,400,500,8,8);Assert(!row.StaleRejected);
            if (kind==0) Assert(row.ContentWasRead==true);if (kind==4) Assert(row.Code=="host_capability_unavailable");
        }
        state.Capture(new HostClipboardNotice[0],true);Assert(state.Classify(null,true,100,400,500,8,8).Code=="host_observation_overflow");
        var pending=new HostClipboardRaceCalibration();var waiting=pending.Classify(null,true,100,400,500,0,0);
        Assert(!waiting.ReadAttempted && waiting.ContentWasRead==false && waiting.ReadResourcesClosed && !waiting.StaleRejected && waiting.Code=="host_notification_unavailable");
        Reject(delegate { pending.Classify(null,true,100,400,120000001,0,0); });
    }
    // literal版本及時序fixtures，不由production生成expected。
    private static HostClipboardRaceCalibration State(uint before,uint after) { var state=new HostClipboardRaceCalibration();state.Capture(new[] {new HostClipboardNotice {Ordinal=1,Us=200,Version=before},new HostClipboardNotice {Ordinal=2,Us=300,Version=after}},false);return state; }
    // 只固定assert失敗，不曝露輸入值。
    private static void Assert(bool value) { if (!value) throw new Exception(); }
    // invalid metadata不能用任意crash冒稱正常拒絕。
    private static void Reject(Action action) { bool rejected=false;try {action();} catch (ArgumentException) {rejected=true;}Assert(rejected); }
}
