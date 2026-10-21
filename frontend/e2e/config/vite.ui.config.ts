import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 公開視覺fixture獨立打包，不進入正式app產物或連線真實API。
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: '.cache/ui-harness',
    emptyOutDir: true,
    rolldownOptions: { input: 'e2e/ui/index.html' },
  },
})
