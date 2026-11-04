declare module 'qrcode' {
  // 只宣告本專案使用的 QR 介面，不新增額外型別相依。
  export function toDataURL(
    text: string,
    options?: { width?: number; margin?: number; color?: { dark?: string; light?: string } },
  ): Promise<string>
}
