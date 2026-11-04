using System;

// 只驗真幾何core；不呼cursor／UIA／Windows原生API。
internal static class GeometryTests
{
    // 公開矩形oracle獨立手寫；所有不合法輸入必須拒絕而非clamp或擴大範圍。
    private static int Main()
    {
        try
        {
            AssertRectangle(0,61,1398,894,0,61,1398,894);
            AssertRectangle(0.25,61.25,1397.5,893.5,0,61,1398,894);
            AssertRectangle(4075,4065,21,31,4075,4065,21,31);
            Reject(-0.1,61,100,100);Reject(0,-0.1,100,100);
            Reject(0,0,20,100);Reject(0,0,100,30);
            Reject(0,0,0,100);Reject(0,0,100,-1);
            Reject(4000,0,97,100);Reject(0,4000,100,97);
            foreach (double bad in new[] {double.NaN,double.PositiveInfinity,double.NegativeInfinity})
            {
                Reject(bad,61,100,100);Reject(0,bad,100,100);
                Reject(0,61,bad,100);Reject(0,61,100,bad);
            }
            Console.WriteLine("geometry_core_observed,windowsNative=false");return 0;
        }
        catch { Console.WriteLine("geometry_core_unavailable,windowsNative=false");return 1; }
    }

    // 外包為整數後仍須完全包含來源rect且固定anchor在原rect內，不修改文字表示。
    private static void AssertRectangle(double x,double y,double w,double h,int ex,int ey,int ew,int eh)
    {
        HostEditorRectangle result=HostEditorGeometry.Enclose(x,y,w,h);
        if (result.X!=ex || result.Y!=ey || result.Width!=ew || result.Height!=eh || result.X>x || result.Y>y || result.X+result.Width<x+w || result.Y+result.Height<y+h || result.X+20<x || result.X+20>=x+w || result.Y+30<y || result.Y+30>=y+h) throw new Exception();
    }

    // 不接受無例外或其他native失效替代輸入拒絕；只需core固定ArgumentException。
    private static void Reject(double x,double y,double w,double h)
    {
        bool rejected=false;
        try { HostEditorGeometry.Enclose(x,y,w,h); } catch (ArgumentException) { rejected=true; }
        if (!rejected) throw new Exception();
    }
}
