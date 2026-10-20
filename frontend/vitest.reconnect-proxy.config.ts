import { defineConfig } from 'vitest/config'

// 公開Node工具測試不載產品suite、不連Docker或操作者runtime。
export default defineConfig({
  test: {
    include: ['e2e-proxy/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 10000,
  },
})
