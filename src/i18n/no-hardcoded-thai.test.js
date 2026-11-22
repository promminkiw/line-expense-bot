import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import th from '../../public/liff/i18n/messages/th.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// ไม่นับ U+0E3F (฿) เพราะ en ใช้เป็นสัญลักษณ์เงินได้ ไม่ใช่ข้อความไทย
const THAI = /[฀-฾เ-๿]/;

// คำหลักที่ตามด้วย / แล้วเป็น regex ไม่ใช่การหาร
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await']);

// แทนคอมเมนต์ด้วยช่องว่าง (เก็บขึ้นบรรทัดไว้ให้เลขบรรทัดตรง) ต้องอ่าน string/template/regex
// ด้วย เพราะ '//' ใน URL หรือ '/*' ใน regex ไม่ใช่คอมเมนต์ ตัดสิน regex จากอักขระก่อนหน้าแบบที่ทำกันทั่วไป
function stripComments(source) {
  const out = [];
  // แต่ละชั้นของ template ที่เปิด ${ ไว้ จำจำนวนวงเล็บปีกกาเพื่อรู้ว่า } ตัวไหนปิด ${
  const templateBraces = [];
  let i = 0;
  let lastSignificant = '';
  let lastWord = '';

  const blank = (text) => text.replace(/[^\n]/g, ' ');

  const readQuoted = (quote) => {
    let j = i + 1;
    while (j < source.length && source[j] !== quote && source[j] !== '\n') {
      j += source[j] === '\\' ? 2 : 1;
    }
    return j + 1;
  };

  // อ่าน template จาก i จนจบ ` หรือเจอ ${ คืนตำแหน่งถัดไปและบอกว่าเปิด ${ หรือไม่
  const readTemplate = (start) => {
    let j = start;
    while (j < source.length) {
      if (source[j] === '\\') j += 2;
      else if (source[j] === '`') return { end: j + 1, opened: false };
      else if (source[j] === '$' && source[j + 1] === '{') return { end: j + 2, opened: true };
      else j += 1;
    }
    return { end: j, opened: false };
  };

  const readRegex = () => {
    let j = i + 1;
    let inClass = false;
    while (j < source.length && source[j] !== '\n') {
      const ch = source[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) break;
      j += 1;
    }
    j += 1;
    while (j < source.length && /[a-z]/i.test(source[j])) j += 1;
    return j;
  };

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out.push(blank(source.slice(i, stop)));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out.push(blank(source.slice(i, stop)));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = readQuoted(ch);
      out.push(source.slice(i, end));
      i = end;
      lastSignificant = ch;
      lastWord = '';
      continue;
    }
    if (ch === '`') {
      const { end, opened } = readTemplate(i + 1);
      out.push(source.slice(i, end));
      i = end;
      if (opened) templateBraces.push(0);
      lastSignificant = opened ? '{' : '`';
      lastWord = '';
      continue;
    }
    if (ch === '}' && templateBraces.length && templateBraces[templateBraces.length - 1] === 0) {
      templateBraces.pop();
      const { end, opened } = readTemplate(i + 1);
      out.push(source.slice(i, end));
      i = end;
      if (opened) templateBraces.push(0);
      lastSignificant = opened ? '{' : '`';
      lastWord = '';
      continue;
    }
    if (ch === '/') {
      const regexAllowed = lastSignificant === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant) || REGEX_AFTER_WORD.has(lastWord);
      if (regexAllowed) {
        const end = readRegex();
        out.push(source.slice(i, end));
        i = end;
        lastSignificant = '/';
        lastWord = '';
        continue;
      }
    }

    if (templateBraces.length) {
      if (ch === '{') templateBraces[templateBraces.length - 1] += 1;
      else if (ch === '}') templateBraces[templateBraces.length - 1] -= 1;
    }
    if (/[\w$]/.test(ch)) {
      let j = i;
      while (j < source.length && /[\w$]/.test(source[j])) j += 1;
      lastWord = source.slice(i, j);
      lastSignificant = source[j - 1];
      out.push(lastWord);
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) {
      lastSignificant = ch;
      lastWord = '';
    }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

function listFiles(dir, extension) {
  const files = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') files.push(...listFiles(path, extension));
    } else if (entry.name.endsWith(extension) && !/\.test\.m?js$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const EXCLUDED = new Set(['public/liff/i18n/messages/th.mjs', 'public/liff/dom-harness.mjs']);

function scannedFiles() {
  return [...listFiles('src', '.js'), ...listFiles('public/liff', '.mjs')]
    .filter((file) => !EXCLUDED.has(file) && !file.startsWith('public/liff/vendor/'));
}

function thaiLines(file) {
  const code = stripComments(readFileSync(join(ROOT, file), 'utf8'));
  return code
    .split(/\r?\n/)
    .map((text, index) => ({ file, line: index + 1, text: text.trim() }))
    .filter(({ text }) => THAI.test(text));
}

// ทุกบรรทัดต้องมีเหตุผล เทสต์ล้มถ้าบรรทัดนั้นหายไปแล้ว เพื่อไม่ให้ allowlist บวมค้าง
// text คือบรรทัดหลังตัดคอมเมนต์และช่องว่างหัวท้าย ใช้ pattern เมื่อบรรทัดยาวหรือมีหลายบรรทัดหน้าตาเหมือนกัน
const COMMAND = 'Thai chat command the user types (input, not output)';
const DB_KEY = 'default/system name stored in the DB and used as a key in SQL; translated at display time';
const PROMPT = 'Claude prompt or example in it; th prompt must stay byte-identical';

const ALLOWLIST = [
  { file: 'src/chat/language.js', text: "const MENU_COMMANDS = new Set(['ภาษา', 'language', 'เปลี่ยนภาษา', 'change language']);", reason: COMMAND },
  { file: 'src/chat/language.js', text: "['ภาษาไทย', 'th'],", reason: COMMAND },
  { file: 'src/chat/text.js', text: "return getFixedReply('เปิดเว็บ', { liffUrl }, lang);", reason: 'fixed-reply lookup key, not shown' },
  { file: 'src/chat/text.js', text: "return getHelpReply('ช่วยเหลือ', lang);", reason: 'help command key, not shown' },
  { file: 'src/friends/service.js', text: "const FALLBACK_DISPLAY_NAME = 'ผู้ใช้ LINE';", reason: 'returned in API data to the other user; LIFF maps it to "LINE user" for en' },
  { file: 'src/goals/chat.js', text: "const SAVING_PREFIX = 'ออม';", reason: COMMAND },
  { file: 'src/goals/chat.js', text: "const BAHT_SUFFIX = 'บาท';", reason: COMMAND },
  { file: 'src/goals/chat.js', pattern: /^const NAMELESS_SAVING_PATTERN = /, reason: COMMAND },
  { file: 'src/menu/fixed-replies.js', text: "const HELP_KEYS = { th: 'ช่วยเหลือ', en: 'help' };", reason: COMMAND },
  { file: 'src/menu/fixed-replies.js', text: "เปิดเว็บ: 'menu.webComingSoon',", reason: 'rich menu command mapped to a catalog key' },
  { file: 'src/menu/fixed-replies.js', text: "เสนอแนะ: 'menu.feedback',", reason: 'rich menu command mapped to a catalog key' },
  { file: 'src/menu/fixed-replies.js', text: "if (key === 'เปิดเว็บ' && liffUrl) {", reason: 'rich menu command key, not shown' },
  { file: 'src/parser/amount-expression.js', text: ".replace(/√|รูท/g, 'sqrt')", reason: COMMAND },
  { file: 'src/parser/categories.js', text: "const FALLBACK_CATEGORY = 'อื่นๆ';", reason: DB_KEY },
  { file: 'src/parser/categories.js', text: "const SLIP_CATEGORY = 'ใบเสร็จ/สลิปโอนเงิน';", reason: DB_KEY },
  { file: 'src/parser/categories.js', pattern: /^expense: \['อาหาร'/, reason: DB_KEY },
  { file: 'src/parser/categories.js', pattern: /^income: \['เงินเดือน'/, reason: DB_KEY },
  { file: 'src/parser/parse-message.js', text: "const FOOD_CATEGORY = 'อาหาร';", reason: DB_KEY },
  { file: 'src/parser/parse-message.js', pattern: /^walletExample: '/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^walletCategoryExample: `/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^note: '- note is a short Thai description/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- intent says what the user wants:/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- One message may contain several entries/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /amount is written as arithmetic, put it in amount_expression/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- Several items each with its own amount/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- When one item is followed by several amounts/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- date is YYYY-MM-DD\. Resolve relative words/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- A message that names an item and an amount/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- "ออมสิน" is a bank name/, reason: PROMPT },
  { file: 'src/parser/parse-message.js', pattern: /^'- saving_amount is only a plain number/, reason: PROMPT },
  { file: 'src/persona.js', pattern: /^'Write as a Thai man who calls himself "เฮีย"/, reason: PROMPT },
  { file: 'src/query/parse-question.js', pattern: /^const QUESTION_PATTERN = /, reason: COMMAND },
  { file: 'src/query/parse-question.js', pattern: /^(walletExample|question|record|budget|keyword): '/, reason: PROMPT },
  { file: 'src/query/parse-question.js', pattern: /^'- from and to are YYYY-MM-DD\./, reason: PROMPT },
  { file: 'src/slip/parse-slip.js', pattern: /^note: '- note is a short Thai description/, reason: PROMPT },
  { file: 'src/slip/parse-slip.js', text: "request: 'อ่านสลิปนี้',", reason: PROMPT },
  { file: 'src/slip/parse-slip.js', pattern: /^'- amount is the final total the user actually paid/, reason: PROMPT },
  { file: 'src/summary/comment.js', pattern: /^(period|income|expense|net|byCategory|otherCategories|currency): '/, reason: 'th summary labels sent to Claude, not shown to the user' },
  { file: 'src/wallets/wallets.js', text: "const DEFAULT_WALLET_NAME = 'เงินสด';", reason: DB_KEY },
  { file: 'public/liff/categories/categories-format.mjs', pattern: /displayCategoryName\(lang, category\.type, 'อื่นๆ'\)/, reason: DB_KEY },
  { file: 'public/liff/categories/categories.mjs', pattern: /^\['[^']+', '\w+'\],$/, reason: 'icon lookup by default category name (DB key)' },
  { file: 'public/liff/i18n/messages/en.mjs', text: "'common.language.th': 'ภาษาไทย',", reason: 'language names are written in their own language' },
  { file: 'public/liff/i18n/names.mjs', pattern: /^'?[฀-๿/]+'?: '\w+',$/, reason: 'maps DB default names to catalog keys' },
  { file: 'public/liff/i18n/names.mjs', text: "const WALLET_IDS = { เงินสด: 'cash' };", reason: 'maps DB default names to catalog keys' },
];

// บรรทัดในไฟล์ที่ Task 16 กำลังถูก review อยู่ รอแก้รอบถัดไป แล้วลบออกจากตรงนี้
const PENDING_TASK16 = [
  { file: 'public/liff/bills/bill-form.mjs', text: "const DEFAULT_CATEGORY = 'อาหาร';", reason: 'to be fixed after Task 16 review' },
  { file: 'public/liff/friends/friends-format.mjs', text: "const SERVER_FALLBACK_NAME = 'ผู้ใช้ LINE';", reason: 'to be fixed after Task 16 review' },
];

function allowedBy(entry, finding) {
  if (entry.file !== finding.file) return false;
  return entry.pattern ? entry.pattern.test(finding.text) : entry.text === finding.text;
}

describe('stripComments', () => {
  it('removes line and block comments but keeps line numbers', () => {
    const code = stripComments("a(); // ไทย\n/* ไทย\nไทย */ b();\n");
    expect(code.split('\n')).toHaveLength(4);
    expect(THAI.test(code)).toBe(false);
    expect(code).toContain('a();');
    expect(code).toContain('b();');
  });

  it('keeps // and /* inside strings, templates and regex literals', () => {
    const source = [
      "const url = 'https://example.com/ไทย';",
      'const tpl = `http://x/${a + "ไทย"} // ยังเป็น template`;',
      'const re = /ไทย\\/\\/[/*]x/u;',
      'const half = total / 2; // ไทย',
    ].join('\n');
    const lines = stripComments(source).split('\n');
    expect(lines[0]).toBe("const url = 'https://example.com/ไทย';");
    expect(lines[1]).toBe('const tpl = `http://x/${a + "ไทย"} // ยังเป็น template`;');
    expect(lines[2]).toBe('const re = /ไทย\\/\\/[/*]x/u;');
    expect(lines[3].trim()).toBe('const half = total / 2;');
  });

  it('resumes the template after a nested ${} with braces', () => {
    const code = stripComments('x = `a${f({ k: 1 })}ไทย`; // ไทย');
    expect(code.trim()).toBe('x = `a${f({ k: 1 })}ไทย`;');
  });
});

describe('hard-coded Thai in source', () => {
  const findings = scannedFiles().flatMap(thaiLines);
  const entries = [...ALLOWLIST, ...PENDING_TASK16];

  it('only appears on allowlisted lines', () => {
    const unexpected = findings
      .filter((finding) => !entries.some((entry) => allowedBy(entry, finding)))
      .map(({ file, line, text }) => `${file}:${line}  ${text}`);
    expect(unexpected).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const stale = entries
      .filter((entry) => !findings.some((finding) => allowedBy(entry, finding)))
      .map((entry) => `${entry.file}  ${entry.text ?? entry.pattern}`);
    expect(stale).toEqual([]);
  });

  it('gives every allowlist entry a reason', () => {
    for (const entry of entries) {
      expect(entry.reason, `${entry.file} ${entry.text ?? entry.pattern}`).toMatch(/\S/);
    }
  });
});

function parseDocument(html) {
  return new JSDOM(html).window.document;
}

// comment ใน HTML เป็น Comment node ไม่ใช่ text node จึงหลุดจากการไล่ SHOW_TEXT เอง
function thaiTextProblems(document) {
  const problems = [];
  const walker = document.createTreeWalker(document, document.defaultView.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!THAI.test(node.data)) continue;
    const owner = node.parentElement?.closest('[data-i18n]');
    if (!owner) problems.push(`no data-i18n: ${node.data.trim()}`);
    else if (th[owner.dataset.i18n] !== owner.textContent.trim()) {
      problems.push(`${owner.dataset.i18n} != ${owner.textContent.trim()}`);
    }
  }
  return problems;
}

function thaiAttributeProblems(document) {
  const problems = [];
  for (const el of document.querySelectorAll('*')) {
    const spec = Object.fromEntries((el.dataset.i18nAttr ?? '')
      .split(';')
      .map((pair) => pair.split(':').map((part) => part.trim()))
      .filter(([attr, key]) => attr && key));
    for (const { name, value } of el.attributes) {
      if (!THAI.test(value) || name === 'data-i18n' || name === 'data-i18n-attr') continue;
      if (!spec[name]) problems.push(`<${el.tagName.toLowerCase()} ${name}="${value}"> no data-i18n-attr`);
      else if (th[spec[name]] !== value) problems.push(`${spec[name]} != ${value}`);
    }
  }
  return problems;
}

describe('index.html checks', () => {
  it('ignore HTML comments and accept text that matches the th catalog', () => {
    const document = parseDocument('<!-- ไทย --><p><span data-i18n="web.common.cancel">ยกเลิก</span></p><b title="ปิด" data-i18n-attr="title:web.common.close">x</b>');
    expect(thaiTextProblems(document)).toEqual([]);
    expect(thaiAttributeProblems(document)).toEqual([]);
  });

  it('flag Thai without a key or with a value that differs from th', () => {
    const document = parseDocument('<p>ไทย</p><p data-i18n="web.common.cancel">ปิด</p><b aria-label="ปิด">x</b><b title="ไทย" data-i18n-attr="title:web.common.close">x</b>');
    expect(thaiTextProblems(document)).toEqual(['no data-i18n: ไทย', 'web.common.cancel != ปิด']);
    expect(thaiAttributeProblems(document)).toEqual(['<b aria-label="ปิด"> no data-i18n-attr', 'web.common.close != ไทย']);
  });
});

describe('hard-coded Thai in index.html', () => {
  const document = parseDocument(readFileSync(join(ROOT, 'public/liff/index.html'), 'utf8'));

  it('keeps Thai text inside data-i18n elements that match the th catalog', () => {
    expect(thaiTextProblems(document)).toEqual([]);
  });

  it('covers every Thai attribute with data-i18n-attr that matches the th catalog', () => {
    expect(thaiAttributeProblems(document)).toEqual([]);
  });
});
