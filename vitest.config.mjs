import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom ต่อ worker กิน RAM มาก; ค่าเริ่มต้น (ตาม CPU) ทำให้ RAM 5.8 GB หมดแล้ว swap จน timeout
    maxWorkers: 3,
  },
});
