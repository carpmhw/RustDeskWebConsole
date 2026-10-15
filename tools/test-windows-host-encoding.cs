using System;
using System.IO;
using System.Text;

// 真.NET legacy codepage／BOM偵測；不載入PowerShell、不執行腳本、不碰Windows。
class HostEncodingTest
{
    // 缺BOM時中文來源會被950／936誤讀；只用public腳本驗完整文字與換行不被吞。
    static int Main(string[] args)
    {
        try
        {
            if (args.Length!=1) throw new Exception();
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            string[] names={"windows-host-observer.ps1","windows-host-observer-supervisor.ps1","windows-host-observer-fixture.ps1","test-windows-host-observer.ps1","test-windows-host-supervisor.ps1","test-windows-host-lifecycle.ps1","measure-windows-editor-geometry.ps1","windows-host-editor.ps1","windows-host-editor-identity.ps1","calibrate-windows-host-editor.ps1","calibrate-windows-host-watchdog.ps1","calibrate-windows-clipboard.ps1","calibrate-windows-clipboard-notification.ps1","calibrate-windows-clipboard-busy.ps1","calibrate-windows-clipboard-race.ps1","calibrate-windows-clipboard-lease.ps1"};
            foreach (string name in names)
            {
                byte[] bytes=File.ReadAllBytes(Path.Combine(args[0],name));
                if (bytes.Length<3 || bytes[0]!=239 || bytes[1]!=187 || bytes[2]!=191) throw new Exception();
                string expected=new UTF8Encoding(false,true).GetString(bytes,3,bytes.Length-3);
                if (expected.Contains("\r") || !expected.EndsWith("\n",StringComparison.Ordinal)) throw new Exception();
                foreach (int cp in new int[] {950,936,1252})
                {
                    using (MemoryStream stream=new MemoryStream(bytes))
                    using (StreamReader reader=new StreamReader(stream,Encoding.GetEncoding(cp),true))
                    {
                        if (reader.ReadToEnd()!=expected || reader.CurrentEncoding.CodePage!=65001) throw new Exception();
                    }
                }
            }
            Console.WriteLine("host_source_encoding_preserved,windowsParser=false");return 0;
        }
        catch {Console.WriteLine("host_source_encoding_unavailable,windowsParser=false");return 1;}
    }
}
