using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Reflection;
using System.Threading;

// 可在Linux執行的真C# core契約；不能替代Windows PowerShell／UIA／Win32。
class HostObserverCoreTest
{
    // 只替換Win32邊界，真正容量／分類／清buffer／close策略仍由ObserveClipboard執行。
    sealed class ClipboardFixture : IHostClipboardAccess
    {
        public uint Before=7,After=7;
        public bool Busy,Format=true,CloseSuccess=true,ReadThrows,CloseThrows,ReturnNull;
        public ulong Size=24;
        public byte[] Bytes=Encoding.Unicode.GetBytes("Public same\0");
        public int Opens,Reads,Closes;
        private int sequences;
        // 模擬同query前後版本，沒有真正輪詢Windows。
        public uint Sequence() { return sequences++ == 0 ? Before : After; }
        // busy本次必只嘗試一次。
        public bool Open() { Opens++;return !Busy; }
        // 固定格式可用性。
        public bool HasUnicode() { return Format; }
        // 容量負向需要在ReadContainer前拒絕。
        public ulong ContainerSize() { return Size; }
        // 本案只交公開owned bytes，不自行實作decoder或分類。
        public byte[] ReadContainer(int count) { Reads++;if (ReadThrows) throw new IOException();return ReturnNull ? null : Bytes; }
        // 不傳真程序metadata。
        public bool? OwnerMatches(int editorPid) { return true; }
        // 模擬正常及API拒絕關閉，策略由真正consumer判定。
        public bool Close() { Closes++;if (CloseThrows) throw new IOException();return CloseSuccess; }
    }
    // 公開文字與自有blocking child驗相等語意／有界pipe，不呼Windows native API。
    static int Main(string[] args)
    {
        if (args.Length != 0) { Thread.Sleep(10000); return 0; }
        try
        {
            if (!HostObserverNative.UnlockSuccessful(true,5) || !HostObserverNative.UnlockSuccessful(false,0) || HostObserverNative.UnlockSuccessful(false,158)) throw new Exception();
            ClipboardFixture read=new ClipboardFixture();HostClipboardValue snapshot=HostObserverNative.ObserveClipboard(read,7,1);
            if (snapshot.Text!="Public same" || !snapshot.Stable || snapshot.Code!="host_observed" || read.Reads!=1 || read.Closes!=1 || Array.Exists(read.Bytes,delegate(byte b) {return b!=0;})) throw new Exception();
            ClipboardFixture busy=new ClipboardFixture {Busy=true};snapshot=HostObserverNative.ObserveClipboard(busy,7,1);
            if (snapshot.Code!="host_clipboard_busy" || snapshot.Text!=null || busy.Opens!=1 || busy.Reads!=0 || busy.Closes!=0) throw new Exception();
            ClipboardFixture missing=new ClipboardFixture {Format=false};snapshot=HostObserverNative.ObserveClipboard(missing,7,1);
            if (snapshot.Code!="host_clipboard_format_unavailable" || missing.Reads!=0 || missing.Closes!=1) throw new Exception();
            ClipboardFixture huge=new ClipboardFixture {Size=65540};snapshot=HostObserverNative.ObserveClipboard(huge,7,1);
            if (snapshot.Code!="host_text_too_large" || huge.Reads!=0 || huge.Closes!=1) throw new Exception();
            ClipboardFixture replaced=new ClipboardFixture {Before=8,After=8};snapshot=HostObserverNative.ObserveClipboard(replaced,7,1);
            if (snapshot.Code!="host_clipboard_unstable" || replaced.Opens!=0) throw new Exception();
            ClipboardFixture race=new ClipboardFixture {After=8};snapshot=HostObserverNative.ObserveClipboard(race,7,1);
            if (snapshot.Code!="host_clipboard_unstable" || snapshot.Text!=null || race.Closes!=1) throw new Exception();
            ClipboardFixture closeFailure=new ClipboardFixture {CloseSuccess=false};snapshot=HostObserverNative.ObserveClipboard(closeFailure,7,1);
            if (snapshot.Code!="host_cleanup_unavailable" || snapshot.ResourcesClosed || snapshot.Text!=null || snapshot.Stable) throw new Exception();
            ClipboardFixture fault=new ClipboardFixture {ReadThrows=true};snapshot=HostObserverNative.ObserveClipboard(fault,7,1);
            if (snapshot.Text!=null || fault.Closes!=1 || snapshot.Code!="host_text_invalid") throw new Exception();
            ClipboardFixture closeThrows=new ClipboardFixture {CloseThrows=true};snapshot=HostObserverNative.ObserveClipboard(closeThrows,7,1);
            if (snapshot.ResourcesClosed || snapshot.Code!="host_cleanup_unavailable" || closeThrows.Closes!=1) throw new Exception();
            ClipboardFixture missingPointer=new ClipboardFixture {ReturnNull=true};snapshot=HostObserverNative.ObserveClipboard(missingPointer,7,1);
            if (snapshot.Text!=null || snapshot.Code!="host_text_unreadable" || missingPointer.Closes!=1) throw new Exception();
            if (!HostObserverNative.CleanupSuccessful(true,true,true,true) || HostObserverNative.CleanupSuccessful(false,true,true,true) || HostObserverNative.CleanupSuccessful(true,false,true,true) || HostObserverNative.CleanupSuccessful(true,true,false,true) || HostObserverNative.CleanupSuccessful(true,true,true,false)) throw new Exception();
            if (!HostObserverNative.SameClipboardVersion(7,7,7) || HostObserverNative.SameClipboardVersion(7,8,8) || HostObserverNative.SameClipboardVersion(7,7,8) || HostObserverNative.SameClipboardVersion(0,0,0)) throw new Exception();
            byte[] container=Encoding.Unicode.GetBytes("Public 中文\0");
            if (HostObserverNative.DecodeClipboardContainer(container)!="Public 中文") throw new Exception();
            foreach (byte[] bad in new byte[][] {new byte[0],new byte[]{65},new byte[]{65,0},new byte[]{0,216,0,0},new byte[65540],Encoding.Unicode.GetBytes(new string('中',10923)+"\0")})
            {
                bool rejected=false;
                try { HostObserverNative.DecodeClipboardContainer(bad); } catch (InvalidDataException) {rejected=true;}
                if (!rejected) throw new Exception();
            }
            if (!HostObserverNative.IsSafeText("Public 中文",32768) || HostObserverNative.IsSafeText("Public\0bad",32768) || HostObserverNative.IsSafeText("\uD800",32768) || HostObserverNative.IsSafeText(new string('中',10923),32768)) throw new Exception();
            HostTextComparison equal = HostObserverNative.CompareText("Public same","Public same","Public same","Public expected",true,true);
            if (!equal.EditorStable || equal.EditorExact || equal.ClipboardExact || equal.ClipboardMatchesEditor != true) throw new Exception();
            HostTextComparison different = HostObserverNative.CompareText("Public other","Public other","Public different","Public expected",true,true);
            if (different.ClipboardMatchesEditor != false) throw new Exception();
            if (HostObserverNative.CompareText("Public same","Public same","Public same","Public expected",true,false).ClipboardMatchesEditor != null || HostObserverNative.CompareText("Public before","Public after","Public after","Public expected",true,true).ClipboardMatchesEditor != null || HostObserverNative.CompareText("Public same","Public same","Public same","Public expected",false,true).ClipboardMatchesEditor != null) throw new Exception();
            if (HostObserverNative.ReadFrame(new MemoryStream(Encoding.UTF8.GetBytes("public_frame\n")),1000) != "public_frame") throw new Exception();
            bool oversized=false;
            try { HostObserverNative.ReadFrame(new MemoryStream(Encoding.UTF8.GetBytes(new string('A',8193)+"\n")),1000); } catch (InvalidDataException) { oversized=true; }
            if (!oversized) throw new Exception();
            bool invalid=false;
            try { HostObserverNative.ReadFrame(new MemoryStream(new byte[] {255,10}),1000); } catch (DecoderFallbackException) { invalid=true; }
            if (!invalid) throw new Exception();
            using (Process child=Process.Start(new ProcessStartInfo("dotnet","\""+Assembly.GetExecutingAssembly().Location+"\" --block") {RedirectStandardOutput=true,UseShellExecute=false}))
            {
                bool timeout=false; Stopwatch clock=Stopwatch.StartNew();
                try { HostObserverNative.ReadFrame(child.StandardOutput.BaseStream,100); } catch (TimeoutException) { timeout=true; }
                finally { if (!child.HasExited) child.Kill(); child.WaitForExit(2000); }
                if (!timeout || clock.ElapsedMilliseconds>2500 || !child.HasExited) throw new Exception();
            }
            Console.WriteLine("public_pipe_contracts=4,public_text_contracts=4,windowsNative=false"); return 0;
        }
        catch { Console.WriteLine("public_core_contracts_failed,windowsNative=false"); return 1; }
    }
}
