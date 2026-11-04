import { hbb } from './codec'
import { Decompress } from 'fzstd'
import { admitZstd } from './zstd-admission'
import { textFromBytes, INTERACTION_LIMITS as L } from './interaction-limits'
export { clipboardError } from './clipboard-errors'
// 先確認恰好一筆 Text 再解壓，非文字格式不配置 decoder。
export function decodeTextClipboard(message: hbb.Message): Uint8Array | null {
  const clips = message.clipboard
    ? [message.clipboard]
    : (message.multiClipboards?.clipboards ?? [])
  if (clips.length > L.clipboardEntries) throw new Error('protocol_error')
  const text = clips.filter(
    /* Text 的 proto default 是零。 */ (c) =>
      (c.format ?? hbb.ClipboardFormat.Text) === hbb.ClipboardFormat.Text,
  )
  if (text.length > 1) throw new Error('clipboard_invalid')
  if (!text.length) return null
  const entry = text[0]!,
    data = entry.content ?? new Uint8Array()
  if ((entry.width ?? 0) !== 0 || (entry.height ?? 0) !== 0 || entry.specialName)
    throw new Error('clipboard_invalid')
  let output: Uint8Array
  if (entry.compress) {
    const header = admitZstd(data),
      owned = new Uint8Array(L.clipboard)
    let used = 0,
      ended = false
    try {
      // 每個輸出 chunk 先驗實際總長，不保留無界 chunk array。
      const decoder = new Decompress((chunk, final) => {
        if (used + chunk.length > L.clipboard) throw new Error('clipboard_too_large')
        owned.set(chunk, used)
        used += chunk.length
        if (final) ended = true
      })
      decoder.push(data, true)
      if (!ended || (header.size !== null && used !== header.size))
        throw new Error('clipboard_invalid')
      output = owned.slice(0, used)
    } catch (error) {
      if (
        error instanceof Error &&
        ['clipboard_too_large', 'clipboard_unsupported', 'clipboard_invalid'].includes(
          error.message,
        )
      )
        throw error
      throw new Error('clipboard_invalid')
    } finally {
      owned.fill(0)
    }
  } else {
    if (data.length > L.clipboard) throw new Error('clipboard_too_large')
    output = new Uint8Array(data)
  }
  try {
    textFromBytes(output)
    return output
  } catch (error) {
    output.fill(0)
    throw error
  }
}
// outbound 僅發未壓縮 Text，沒有 remote 寫入 ACK 或隱含訂閱。
export function encodeTextClipboard(bytes: Uint8Array): hbb.IMessage {
  textFromBytes(bytes)
  return {
    multiClipboards: {
      clipboards: [{ compress: false, format: hbb.ClipboardFormat.Text, content: bytes }],
    },
  }
}
