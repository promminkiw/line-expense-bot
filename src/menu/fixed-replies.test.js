import { describe, it, expect } from 'vitest';
import { getFixedReply, buildWebReply, HELP_REPLY, WEB_COMING_SOON_REPLY } from './fixed-replies.js';

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
      'ใบเสร็จที่มีหลายสินค้าจะแสดงแยกราคาทีละอย่าง (กดภายใน 10 นาที)',
    ]);
    expect(title).toBeLessThan(lines.indexOf('↩️ บันทึกผิด?'));
  });

  it('documents the recurring section between the slip and undo sections', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🔁 รายการประจำ');
    expect(title).toBeGreaterThan(lines.indexOf('🧾 ส่งรูปสลิป/ใบเสร็จ'));
    expect(lines.slice(title + 1, title + 3)).toEqual([
      'ตั้งในหน้าเว็บ (ปุ่ม "เปิดเว็บ") เช่น ค่าเน็ตทุกวันที่ 5',
      'บอทบันทึกให้เดือนละครั้งและแจ้งในแชต กด "ยกเลิก" ได้',
    ]);
    expect(title).toBeLessThan(lines.indexOf('↩️ บันทึกผิด?'));
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
        'ใบเสร็จที่มีหลายสินค้าจะแสดงแยกราคาทีละอย่าง (กดภายใน 10 นาที)',
        '',
        '🔁 รายการประจำ',
        'ตั้งในหน้าเว็บ (ปุ่ม "เปิดเว็บ") เช่น ค่าเน็ตทุกวันที่ 5',
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
        '⚠️ จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
      ].join('\n')
    );
  });
});
