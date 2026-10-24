import { vi } from 'vitest';

// จำลอง query builder ของ supabase-js: ทุก method คืนตัวเอง และ await ได้ผล result
// ส่งผลเพิ่มได้ ใช้กับ repository method ที่ await หลายครั้ง ครั้งที่เกินใช้ผลสุดท้าย
export function fakeSupabase(result, ...laterResults) {
  const queue = [result, ...laterResults];
  const nextResult = () => (queue.length > 1 ? queue.shift() : queue[0]);
  const calls = [];
  const builder = {};
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete', 'update', 'gte', 'lte', 'order', 'range', 'is', 'gt', 'or', 'limit', 'in']) {
    builder[method] = vi.fn((...args) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  for (const method of ['single', 'maybeSingle']) {
    builder[method] = vi.fn(() => {
      calls.push([method]);
      return Promise.resolve(result);
    });
  }
  builder.then = (resolve, reject) => Promise.resolve(nextResult()).then(resolve, reject);
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
    rpc: vi.fn((name, params) => {
      calls.push(['rpc', name, params]);
      return builder;
    }),
  };
  return { supabase, calls };
}

// เหมือน fakeSupabase แต่ await แต่ละครั้งได้ผลลัพธ์ถัดไป ใช้กับ query ที่อ่านทีละหน้า
export function fakeSupabasePages(results) {
  const calls = [];
  let index = 0;
  const builder = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'gt', 'order', 'limit']) {
    builder[method] = vi.fn((...args) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.then = (resolve, reject) => Promise.resolve(results[index++]).then(resolve, reject);
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
  };
  return { supabase, calls };
}
