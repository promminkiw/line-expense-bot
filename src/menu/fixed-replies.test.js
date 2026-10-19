import { describe, it, expect } from 'vitest';
import {
  getFixedReply,
  buildWebReply,
  HELP_REPLY,
  WEB_COMING_SOON_REPLY,
  FEEDBACK_REPLY,
} from './fixed-replies.js';

describe('getFixedReply', () => {
  it('returns the help text for the help button', () => {
    expect(getFixedReply('ช่วยเหลือ')).toBe(HELP_REPLY);
  });

  it('returns the coming soon text for the web button', () => {
    expect(getFixedReply('เปิดเว็บ')).toBe(WEB_COMING_SOON_REPLY);
  });

  it('returns the LIFF link for the web button when a link is configured', () => {
    const liffUrl = 'https://liff.line.me/1234567890-AbCdEfGh';

    expect(getFixedReply('เปิดเว็บ', { liffUrl })).toBe(buildWebReply(liffUrl));
    expect(buildWebReply(liffUrl)).toBe('เปิดหน้าเว็บดูและแก้ไขรายการ: https://liff.line.me/1234567890-AbCdEfGh');
  });

  it('links the feedback button to the Google Form for respondents', () => {
    expect(getFixedReply('เสนอแนะ')).toBe(FEEDBACK_REPLY);
    expect(FEEDBACK_REPLY).toBe(
      'ขอบคุณที่ช่วยให้เฮียสมัครดีขึ้น บอกเราได้ที่ฟอร์มนี้: https://forms.gle/byku7LUs8qsXWaP18'
    );
    // ลิงก์ /edit เปิดได้เฉพาะเจ้าของฟอร์ม
    expect(FEEDBACK_REPLY).not.toContain('/edit');
  });

  it('ignores spaces anywhere in the text', () => {
    expect(getFixedReply(' ช่วย เหลือ ')).toBe(HELP_REPLY);
  });

  it('returns null for other messages', () => {
    expect(getFixedReply('กินข้าว 60')).toBeNull();
    expect(getFixedReply('สรุป')).toBeNull();
    expect(getFixedReply('toString')).toBeNull();
  });

  it('documents the slip section in order before the undo section', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🧾 ส่งรูปสลิป/ใบเสร็จ');
    expect(title).toBeGreaterThan(-1);
    expect(lines.slice(title + 1, title + 4)).toEqual([
      'ส่งรูปสลิปโอนเงินหรือใบเสร็จได้ บอทอ่านยอดและวันที่',
      'แล้วแสดงรายการให้กด "บันทึก" หรือ "ยกเลิก"',
      'ใบเสร็จหลายสินค้าบันทึกเป็นยอดรวมที่จ่ายจริงรายการเดียว (กดภายใน 10 นาที)',
    ]);
    // ตั้งแต่ 2026-10-08 บอทอ่านแค่ยอดรวม ไม่แยกสินค้าแล้ว
    expect(HELP_REPLY).not.toContain('แยกราคาทีละอย่าง');
    expect(title).toBeLessThan(lines.indexOf('↩️ บันทึกผิด?'));
  });

  it('documents the recurring section between the slip and undo sections', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🔁 รายการประจำ');
    expect(title).toBeGreaterThan(lines.indexOf('🧾 ส่งรูปสลิป/ใบเสร็จ'));
    expect(lines.slice(title + 1, title + 3)).toEqual([
      'ตั้งในหน้าเว็บ (ปุ่ม "เว็บไซต์" ในเมนูด้านล่าง) เช่น ค่าเน็ตทุกวันที่ 5',
      'บอทบันทึกให้เดือนละครั้งและแจ้งในแชต กด "ยกเลิก" ได้',
    ]);
    expect(title).toBeLessThan(lines.indexOf('↩️ บันทึกผิด?'));
  });

  it('documents asking for totals after the summary section', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🔎 ถามยอด');
    expect(title).toBeGreaterThan(lines.indexOf('📊 ดูสรุปยอด'));
    expect(lines.slice(title + 1, title + 3)).toEqual([
      'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
      'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
    ]);
  });

  it('documents the saving command after the totals section', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🎯 ออมเงินเข้าเป้า');
    expect(title).toBeGreaterThan(lines.indexOf('🔎 ถามยอด'));
    expect(lines.slice(title + 1, title + 4)).toEqual([
      'สร้างเป้าในหน้าเว็บ แท็บ ออม',
      'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)',
      'ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ',
    ]);
  });

  it('names only buttons that exist in the rich menu', () => {
    // Rich Menu มีปุ่ม เว็บไซต์ ที่เปิดเว็บตรง ไม่มีปุ่ม เปิดเว็บ
    expect(HELP_REPLY).not.toContain('"เปิดเว็บ"');
    expect(HELP_REPLY).toContain('ปุ่ม "เว็บไซต์"');
    expect(HELP_REPLY).toContain('ปุ่ม "หารบิล"');
  });

  it('documents wallets, budgets, categories, bills and notifications before the amount limit', () => {
    const lines = HELP_REPLY.split('\n');
    const titles = ['👛 กระเป๋าเงิน', '🧮 งบประมาณ', '🗂️ หมวดของฉัน', '👥 หารบิลกับเพื่อน', '🔔 การแจ้งเตือน'].map((title) => lines.indexOf(title));
    expect(titles.every((index) => index > lines.indexOf('🎯 ออมเงินเข้าเป้า'))).toBe(true);
    expect([...titles].sort((a, b) => a - b)).toEqual(titles);
    expect(titles.at(-1)).toBeLessThan(lines.indexOf('⚠️ จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท'));
  });

  it('uses the agreed wording', () => {
    expect(WEB_COMING_SOON_REPLY).toBe('หน้าเว็บสำหรับดูและแก้ไขรายการกำลังพัฒนา จะเปิดใช้ได้เร็วๆ นี้');
    expect(HELP_REPLY).toBe(
      [
        '📒 วิธีใช้บอทบันทึกรายรับรายจ่าย',
        '',
        '✏️ บันทึกรายจ่าย',
        'พิมพ์ชื่อรายการตามด้วยจำนวนเงิน',
        'ตัวอย่าง: กินข้าว 60',
        'หลายรายการในข้อความเดียวได้: กินข้าว 60 กาแฟ 45',
        '',
        '💰 บันทึกรายรับ',
        'ตัวอย่าง: เงินเดือนเข้า 25000',
        '',
        '📅 บันทึกย้อนหลัง',
        'ใส่คำบอกวันไว้ข้างหน้า',
        'ตัวอย่าง: เมื่อวานค่าแท็กซี่ 120',
        '',
        '🧾 ส่งรูปสลิป/ใบเสร็จ',
        'ส่งรูปสลิปโอนเงินหรือใบเสร็จได้ บอทอ่านยอดและวันที่',
        'แล้วแสดงรายการให้กด "บันทึก" หรือ "ยกเลิก"',
        'ใบเสร็จหลายสินค้าบันทึกเป็นยอดรวมที่จ่ายจริงรายการเดียว (กดภายใน 10 นาที)',
        '',
        '🔁 รายการประจำ',
        'ตั้งในหน้าเว็บ (ปุ่ม "เว็บไซต์" ในเมนูด้านล่าง) เช่น ค่าเน็ตทุกวันที่ 5',
        'บอทบันทึกให้เดือนละครั้งและแจ้งในแชต กด "ยกเลิก" ได้',
        '',
        '↩️ บันทึกผิด?',
        'กดปุ่ม "ยกเลิก" ใต้ข้อความ "บันทึกแล้ว" ได้ทันที',
        '(ปุ่มจะหายไปเมื่อส่งข้อความถัดไป)',
        '',
        '📊 ดูสรุปยอด',
        'กดปุ่ม "สรุป" ในเมนูด้านล่าง หรือพิมพ์ สรุป',
        'แล้วเลือก วันนี้ / สัปดาห์นี้ / เดือนนี้',
        '',
        '🔎 ถามยอด',
        'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
        'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
        '',
        '🎯 ออมเงินเข้าเป้า',
        'สร้างเป้าในหน้าเว็บ แท็บ ออม',
        'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)',
        'ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ',
        '',
        '👛 กระเป๋าเงิน',
        'เพิ่มกระเป๋าในหน้าเว็บ เช่น บัตรเครดิต',
        'แล้วพิมพ์ชื่อกระเป๋าต่อท้าย เช่น กาแฟ 60 บัตรเครดิต (ไม่ระบุ = เงินสด)',
        '',
        '🧮 งบประมาณ',
        'ตั้งงบรายเดือนต่อหมวดในหน้าเว็บ แท็บ งบ',
        'บอทเตือนในข้อความตอบกลับเมื่อใช้ถึง 80% และเมื่อเกินงบ',
        '',
        '🗂️ หมวดของฉัน',
        'เพิ่ม เปลี่ยนชื่อ เลือกไอคอน ซ่อน หรือลบหมวดได้ในหน้าเว็บ',
        '',
        '👥 หารบิลกับเพื่อน',
        'กดปุ่ม "หารบิล" ในเมนูด้านล่าง เพิ่มเพื่อนแล้วสร้างบิล',
        'เพื่อนกดยืนยันจากการ์ดในแชตหรือในหน้าเว็บ',
        '',
        '🔔 การแจ้งเตือน',
        'เปิดสรุปทุกวันอาทิตย์ และเตือนถ้าวันนี้ยังไม่ได้จด ได้ในหน้าเว็บ',
        '',
        '⚠️ จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
      ].join('\n')
    );
  });
});
