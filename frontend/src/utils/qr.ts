import { toDataURL } from 'qrcode'

// QR 始終白底深色，內容僅保留於呼叫者當次RAM。
export async function buildQr(uri: string): Promise<string> {
  if (!uri.startsWith('otpauth://totp/')) throw new Error('invalid_request')
  return toDataURL(uri, { width: 200, margin: 2, color: { dark: '#243a30', light: '#ffffff' } })
}
