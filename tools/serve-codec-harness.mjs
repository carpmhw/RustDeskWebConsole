import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
const root = fileURLToPath(new URL('../frontend/.cache/codec-harness/', import.meta.url))
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
}
// 僅提供公開bundled fixture，不代理API、不回顯path或payload。
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    const path = resolve(root, '.' + pathname)
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || !types[extname(path)])
      throw new Error()
    response.setHeader('Content-Type', types[extname(path)])
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    )
    response.end(await readFile(path))
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})
server.listen(18081, '127.0.0.1')
// Playwright結束時清自己的HTTP server。
const stop = () => server.close(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
