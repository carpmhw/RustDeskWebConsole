using System;
using System.Runtime.InteropServices;

// 只有實體pixel位置，不保存任何文字／窗標題或native識別值。
[StructLayout(LayoutKind.Sequential)]
public struct HostEditorPoint
{
    public int X;
    public int Y;
}

// 同helper契約的非負整數授權外包矩形。
public sealed class HostEditorRectangle
{
    public int X;
    public int Y;
    public int Width;
    public int Height;
}

// 純幾何與單一實體cursor讀取；不移動cursor，不呼文字／clipboard API。
public static class HostEditorGeometry
{
    // 明確要求實體座標，避免PVE縮放或DPI虛擬化座標混入UIA。
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetPhysicalCursorPos(out HostEditorPoint point);

    // 只查此量測child的DPI awareness，不變更全系統顯示設定。
    [DllImport("user32.dll")]
    private static extern bool IsProcessDPIAware();

    // 只為無視窗量測child建立實體座標環境，不觸碰parent／Notepad視窗。
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    // 已aware則保留；否則在child載入UIA前設定，失敗不猜測座標比例。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    public static void InitializeChildCoordinates()
    {
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException("host_geometry_unavailable");
        if (!IsProcessDPIAware() && (!SetProcessDPIAware() || !IsProcessDPIAware())) throw new InvalidOperationException("host_geometry_unavailable");
    }

    // 只在child內讀取操作者指定位置，不輸出原生exception或last error。
#if NETCOREAPP
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    public static HostEditorPoint ReadCursor()
    {
        if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException("host_geometry_unavailable");
        HostEditorPoint point;
        if (!GetPhysicalCursorPos(out point)) throw new InvalidOperationException("host_geometry_unavailable");
        return point;
    }

    // 來源rect完整外包且固定anchor仍在來源內；不clamp越界或擴為全桌面。
    public static HostEditorRectangle Enclose(double x, double y, double width, double height)
    {
        foreach (double number in new[] {x,y,width,height})
        {
            if (double.IsNaN(number) || double.IsInfinity(number)) throw new ArgumentException("host_geometry_unavailable");
        }
        if (x<0 || y<0 || width<=0 || height<=0 || x+width>4096 || y+height>4096) throw new ArgumentException("host_geometry_unavailable");
        int left=(int)Math.Floor(x), top=(int)Math.Floor(y);
        int right=(int)Math.Ceiling(x+width), bottom=(int)Math.Ceiling(y+height);
        if (right-left<21 || bottom-top<31 || left+20<x || left+20>=x+width || top+30<y || top+30>=y+height) throw new ArgumentException("host_geometry_unavailable");
        return new HostEditorRectangle {X=left,Y=top,Width=right-left,Height=bottom-top};
    }
}
