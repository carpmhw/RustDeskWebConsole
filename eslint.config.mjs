export default [
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly', fetch: 'readonly' },
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'error', eqeqeq: 'error' },
  },
]
