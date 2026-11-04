import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 同一份產物使用相對資源，實際掛載路徑由 web 容器啟動時注入。
export default defineConfig({
  plugins: [vue()],
  base: './',
  test: { include: ['src/**/*.test.ts'] },
})
