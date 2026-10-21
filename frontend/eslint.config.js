import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import nodeToolConfigs from '../eslint.config.mjs'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'src/rdweb/generated/**',
      '.cache/**',
    ],
  },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  // 搬入 frontend 的 Node 工具沿用根目錄同一份規則與 globals，避免 CI 防護隨位置改變。
  { ...nodeToolConfigs[0], files: ['e2e/scripts/**/*.mjs'] },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':matches(CallExpression, NewExpression)[callee.name=/^(fetch|WebSocket|URL)$/] > Literal.arguments[value=/^\\//]',
          message: 'URL 必須透過 basePath 工具產生，禁止直接使用根路徑網址。',
        },
      ],
    },
  },
]
