import { Agent } from 'node:http'
import { Socket, type SocketConstructorOpts } from 'node:net'
import type { DuplexOptions } from 'node:stream'

// 私有測試工具的連線來源固定，顯式指定兩方向HWM；不靠未宣告的RequestOptions。
export class LoopbackAgent extends Agent {
  #port: number
  // 不維持跨request pool，所有native socket仍由proxy owner持有。
  constructor(port: number) {
    super({ keepAlive: false })
    this.#port = port
  }
  // Node Socket亦是Duplex，使用交集型別保留正式stream選項而不cast成any。
  override createConnection(): Socket {
    const options: SocketConstructorOpts & DuplexOptions = {
      readableHighWaterMark: 65536,
      writableHighWaterMark: 65536,
    }
    return new Socket(options).connect({ host: '127.0.0.1', port: this.#port })
  }
}
