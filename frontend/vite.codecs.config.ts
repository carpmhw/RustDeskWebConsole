import { defineConfig } from 'vite'
// 公開fixture另建獨立入口，正式app不發布測試harness。
export default defineConfig({
  base: './',
  build: {
    outDir: '.cache/codec-harness',
    emptyOutDir: true,
    rolldownOptions: { input: 'e2e-codecs/index.html' },
  },
})
