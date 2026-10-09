import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
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
