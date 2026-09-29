import { describe, it, expect } from 'vitest';
import { getFixedReply, HELP_REPLY, WEB_COMING_SOON_REPLY } from './fixed-replies.js';

describe('getFixedReply', () => {
  it('returns the help text for the help button', () => {
    expect(getFixedReply('ช่วยเหลือ')).toBe(HELP_REPLY);
  });

  it('returns the coming soon text for the web button', () => {
    expect(getFixedReply('เปิดเว็บ')).toBe(WEB_COMING_SOON_REPLY);
  });

  it('ignores spaces anywhere in the text', () => {
    expect(getFixedReply(' ช่วย เหลือ ')).toBe(HELP_REPLY);
  });

  it('returns null for other messages', () => {
    expect(getFixedReply('กินข้าว 60')).toBeNull();
    expect(getFixedReply('สรุป')).toBeNull();
    expect(getFixedReply('toString')).toBeNull();
  });

  it('uses the agreed wording', () => {
    expect(WEB_COMING_SOON_REPLY).toBe('หน้าเว็บสำหรับดูและแก้ไขรายการกำลังพัฒนา จะเปิดใช้ได้เร็วๆ นี้');
    expect(HELP_REPLY).toBe(
      [
        'วิธีใช้บอทบันทึกรายรับรายจ่าย',
        '- พิมพ์รายการได้เลย เช่น "กินข้าว 60 กาแฟ 45"',
        '- รายรับ เช่น "เงินเดือนเข้า 25000"',
        '- ย้อนวันได้ เช่น "เมื่อวานค่าแท็กซี่ 120"',
        '- บันทึกแล้วกดปุ่ม "ยกเลิก" ใต้ข้อความเพื่อลบรายการชุดนั้น',
        '- พิมพ์ "สรุป" หรือกดปุ่มสรุปในเมนู เพื่อดูยอดวันนี้ สัปดาห์นี้ หรือเดือนนี้',
        '- จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
      ].join('\n')
    );
  });
});
