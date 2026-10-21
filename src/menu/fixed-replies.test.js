import { describe, it, expect } from 'vitest';
import {
  getFixedReply,
  getHelpReply,
  buildWebReply,
  HELP_SECTIONS,
  HELP_MENU_REPLY,
  WEB_COMING_SOON_REPLY,
  FEEDBACK_REPLY,
} from './fixed-replies.js';

const sectionText = (label) => HELP_SECTIONS.find((section) => section.label === label).text;
const sectionLines = (label) => sectionText(label).split('\n');

describe('getFixedReply', () => {
  it('leaves the help button to getHelpReply', () => {
    expect(getFixedReply('ช่วยเหลือ')).toBeNull();
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
      'ขอบคุณที่ช่วยให้เฮียสมัครดีขึ้น บอกเฮียได้ที่ฟอร์มนี้: https://forms.gle/byku7LUs8qsXWaP18'
    );
    // ลิงก์ /edit เปิดได้เฉพาะเจ้าของฟอร์ม
    expect(FEEDBACK_REPLY).not.toContain('/edit');
  });

  it('returns null for other messages', () => {
    expect(getFixedReply('กินข้าว 60')).toBeNull();
    expect(getFixedReply('สรุป')).toBeNull();
    expect(getFixedReply('toString')).toBeNull();
  });

  it('uses the agreed wording', () => {
    expect(WEB_COMING_SOON_REPLY).toBe('เฮียกำลังทำหน้าเว็บสำหรับดูและแก้ไขรายการ จะเปิดใช้ได้เร็วๆ นี้');
  });
});

describe('getHelpReply', () => {
  it('asks which topic to explain with one quick reply button per help section', () => {
    const reply = getHelpReply('ช่วยเหลือ');

    expect(reply.text).toBe(HELP_MENU_REPLY);
    expect(HELP_MENU_REPLY).toBe('อยากให้เฮียอธิบายเรื่องไหน');
    expect(reply.quickReply).toEqual(
      HELP_SECTIONS.map((section) => ({
        type: 'action',
        action: { type: 'message', label: section.label, text: `ช่วยเหลือ ${section.label}` },
      }))
    );
  });

  it('ignores spaces anywhere in the text', () => {
    expect(getHelpReply(' ช่วย เหลือ ')).toEqual(getHelpReply('ช่วยเหลือ'));
  });

  it('answers each button with only its section', () => {
    for (const section of HELP_SECTIONS) {
      expect(getHelpReply(`ช่วยเหลือ ${section.label}`)).toEqual({ text: section.text });
    }
  });

  it('returns null for other messages', () => {
    expect(getHelpReply('กินข้าว 60')).toBeNull();
    expect(getHelpReply('ช่วยเหลือเรื่องอื่น')).toBeNull();
    expect(getHelpReply('toString')).toBeNull();
  });

  // LINE จำกัดป้ายปุ่มลอย 20 ตัวอักษร ปุ่มลอย 13 ปุ่ม และข้อความ 5000 ตัวอักษร
  it('stays within the LINE limits', () => {
    expect(HELP_SECTIONS).toHaveLength(5);
    for (const section of HELP_SECTIONS) {
      expect(section.label.length).toBeLessThanOrEqual(20);
      expect(section.text.length).toBeLessThanOrEqual(5000);
    }
  });
});

describe('help sections', () => {
  it('groups the topics in five buttons in order', () => {
    expect(HELP_SECTIONS.map((section) => section.label)).toEqual([
      'จดรายการ',
      'สลิปและรายการประจำ',
      'สรุปและถามยอด',
      'ออม กระเป๋า งบ หมวด',
      'เพื่อนและแจ้งเตือน',
    ]);
  });

  it('keeps every topic exactly once', () => {
    const titles = (label) => sectionLines(label).filter((line) => /^\p{Extended_Pictographic}/u.test(line));
    expect(titles('จดรายการ')).toEqual([
      '✏️ บันทึกรายจ่าย',
      '💰 บันทึกรายรับ',
      '📅 บันทึกย้อนหลัง',
      '↩️ บันทึกผิด?',
      '⚠️ จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
    ]);
    expect(titles('สลิปและรายการประจำ')).toEqual(['🧾 ส่งรูปสลิป/ใบเสร็จ', '🔁 รายการประจำ']);
    expect(titles('สรุปและถามยอด')).toEqual(['📊 ดูสรุปยอด', '🔎 ถามยอด']);
    expect(titles('ออม กระเป๋า งบ หมวด')).toEqual(['🎯 ออมเงินเข้าเป้า', '👛 กระเป๋าเงิน', '🧮 งบประมาณ', '🗂️ หมวดของฉัน']);
    expect(titles('เพื่อนและแจ้งเตือน')).toEqual(['👥 หารบิลกับเพื่อน', '🔔 การแจ้งเตือน']);
  });

  it('documents the slip section before the recurring section', () => {
    const lines = sectionLines('สลิปและรายการประจำ');
    const title = lines.indexOf('🧾 ส่งรูปสลิป/ใบเสร็จ');
    expect(lines.slice(title + 1, title + 4)).toEqual([
      'ส่งรูปสลิปโอนเงินหรือใบเสร็จได้ เฮียอ่านยอดและวันที่',
      'แล้วแสดงรายการให้กด "บันทึก" หรือ "ยกเลิก"',
      'ใบเสร็จหลายสินค้าบันทึกเป็นยอดรวมที่จ่ายจริงรายการเดียว (กดภายใน 10 นาที)',
    ]);
    // ตั้งแต่ 2026-10-08 บอทอ่านแค่ยอดรวม ไม่แยกสินค้าแล้ว
    expect(sectionText('สลิปและรายการประจำ')).not.toContain('แยกราคาทีละอย่าง');
    const recurring = lines.indexOf('🔁 รายการประจำ');
    expect(recurring).toBeGreaterThan(title);
    expect(lines.slice(recurring + 1, recurring + 3)).toEqual([
      'ตั้งในหน้าเว็บ แท็บ ฉัน ปุ่ม "รายการประจำ" (เปิดเว็บจากปุ่ม "เว็บไซต์" ในเมนูด้านล่าง) เช่น ค่าเน็ตทุกวันที่ 5',
      'เฮียบันทึกให้เดือนละครั้งและแจ้งในแชต กด "ยกเลิก" ได้',
    ]);
  });

  it('documents the undo button under the saved message', () => {
    expect(sectionLines('จดรายการ')).toContain('กดปุ่ม "ยกเลิก" ใต้ข้อความ "เฮียบันทึกแล้ว" ได้ทันที');
  });

  it('documents asking for totals after the summary', () => {
    const lines = sectionLines('สรุปและถามยอด');
    const title = lines.indexOf('🔎 ถามยอด');
    expect(title).toBeGreaterThan(lines.indexOf('📊 ดูสรุปยอด'));
    expect(lines.slice(title + 1, title + 3)).toEqual([
      'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
      'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
    ]);
  });

  it('documents the saving command', () => {
    const lines = sectionLines('ออม กระเป๋า งบ หมวด');
    const title = lines.indexOf('🎯 ออมเงินเข้าเป้า');
    expect(lines.slice(title + 1, title + 4)).toEqual([
      'สร้างเป้าในหน้าเว็บ แท็บ ออม',
      'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)',
      'ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ',
    ]);
  });

  it('names only buttons that exist in the rich menu', () => {
    const all = HELP_SECTIONS.map((section) => section.text).join('\n');
    // Rich Menu มีปุ่ม เว็บไซต์ ที่เปิดเว็บตรง ไม่มีปุ่ม เปิดเว็บ
    expect(all).not.toContain('"เปิดเว็บ"');
    expect(all).toContain('ปุ่ม "เว็บไซต์"');
    expect(all).toContain('ปุ่ม "หารบิล"');
  });

  it('does not repeat the old single message title', () => {
    expect(HELP_SECTIONS.map((section) => section.text).join('\n')).not.toContain('📒');
  });
});
