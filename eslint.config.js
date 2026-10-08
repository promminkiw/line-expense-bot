const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'work-memory/**', '.superpowers/**', 'docs/**', 'public/liff/vendor/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // ไฟล์เทสต์ .js ใช้ import แบบ ESM (vitest จัดการให้)
    files: ['**/*.test.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['public/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, liff: 'readonly' } },
  },
  {
    files: ['**/*.test.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
  },
];
