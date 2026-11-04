import { defineConfig } from 'vitest/config'

// 接收器只跑公開Node測試，不載入真機Playwright入口或啟動server。
export default defineConfig({
  test: { include: ['e2e/receiver/**/*.test.ts'], environment: 'node' },
})
