import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom ต่อ worker กิน RAM มาก; ค่าเริ่มต้น (ตาม CPU) ทำให้ RAM 5.8 GB หมดแล้ว swap จน timeout
    maxWorkers: 3,
    coverage: {
      provider: 'v8',
      // lcov ให้ SonarQube อ่าน ส่วน text-summary ไว้ดูผลเร็วๆ ใน terminal
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // นับเฉพาะโค้ดจริงของบอทและหน้า LIFF ไม่นับไฟล์เทสต์ ตัวช่วยเทสต์ และ library ที่ copy มา
      include: ['src/**/*.js', 'public/liff/**/*.mjs'],
      exclude: ['**/*.test.js', '**/*.test.mjs', 'public/liff/dom-harness.mjs', 'public/liff/vendor/**'],
    },
  },
});
