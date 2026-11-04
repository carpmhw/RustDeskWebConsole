export class BitReader {
  #bit = 0
  // 只在既有受限header讀取，不依遠端值配置buffer。
  constructor(private readonly bytes: Uint8Array) {}
  // MSB-first literal最多32bits，累加不用有符號bitwise。
  read(count: number): number {
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > 32 ||
      this.#bit + count > this.bytes.length * 8
    )
      throw new Error('protocol_error')
    let value = 0
    for (let index = 0; index < count; index++, this.#bit++)
      value = value * 2 + ((this.bytes[this.#bit >> 3]! >> (7 - (this.#bit & 7))) & 1)
    return value
  }
  // 跳過固定標準欄位，仍逐段驗bounds。
  skip(count: number): void {
    while (count > 0) {
      const size = Math.min(count, 32)
      this.read(size)
      count -= size
    }
  }
  // Exp-Golomb prefix有界，截斷或超長不能造成無限loop。
  ue(): number {
    let zeros = 0
    while (!this.read(1)) if (++zeros > 31) throw new Error('protocol_error')
    return 2 ** zeros - 1 + this.read(zeros)
  }
  // Signed Exp-Golomb由精確unsigned code轉換。
  se(): number {
    const value = this.ue()
    return value & 1 ? (value + 1) / 2 : -value / 2
  }
}
