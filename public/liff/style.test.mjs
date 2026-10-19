import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

describe('style.css skeleton sizes', () => {
  // jsdom ไม่มี layout จึงตรวจได้แค่ว่าทุก variant มีความสูงตายตัว ส่วนตัวเลขตรงของจริงตรวจในเบราว์เซอร์
  it.each(['totals', 'filters', 'chart', 'trend', 'budget', 'recurring', 'profile-head', 'balance', 'stats', 'tips', 'bill-switch', 'bill-card'])(
    'gives the %s skeleton a fixed pixel height',
    (variant) => {
      const rule = declarations(`.skeleton-${variant}`);

      expect(rule).not.toBeNull();
      expect(rule).toMatch(/(?:^|;)\s*height:\s*\d+px/);
    },
  );
});

describe('style.css trend bars', () => {
  // ความสูงเป็น % ของแท่งต้องอ้างกล่องที่สูงตายตัว WebView รุ่นเก่าคิด % ของกล่องที่ได้ความสูงจาก flex เป็น 0
  it('gives the bar pair a fixed pixel height instead of a flexed one', () => {
    const rule = declarations('.trend-pair');

    expect(rule).toMatch(/(?:^|;)\s*height:\s*\d+px/);
    expect(rule).not.toMatch(/flex:\s*1/);
  });
});

describe('style.css date inputs', () => {
  // Safari บน iOS ให้ช่องวันที่กว้างขั้นต่ำของตัวเองและจัดกลาง ทำให้ล้นกรอบ dialog
  it('lets dialog date inputs shrink to the dialog width and align left', () => {
    const rule = declarations('dialog input[type="date"]');

    expect(rule).not.toBeNull();
    expect(rule).toMatch(/(?:^|;)\s*-webkit-appearance:\s*none/);
    expect(rule).toMatch(/(?:^|;)\s*min-width:\s*0/);
    expect(rule).toMatch(/(?:^|;)\s*min-height:\s*\d+px/);
    expect(declarations('dialog input[type="date"]::-webkit-date-and-time-value')).toMatch(/text-align:\s*left/);
  });
});

describe('style.css friend status', () => {
  // ข้อความสถานะอาจเป็นลิงก์ชวนยาวๆ ที่ไม่มีช่องว่าง ต้องตัดบรรทัดได้ไม่ล้นจอ
  it('wraps a long invite link in the friend status', () => {
    expect(declarations('#friend-status')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe('style.css month balance card', () => {
  it('shows a negative month balance in the danger red', () => {
    expect(declarations('.stat-cards .stat.balance .stat-value.negative')).toMatch(/color:\s*var\(--danger\)/);
  });
});

describe('style.css bill cards', () => {
  it('shows where focus is on a bill card that was jumped to', () => {
    expect(declarations('.bill-card:focus-visible')).toMatch(/outline:/);
  });

  // ผู้ใช้ขอให้ปุ่มในแถวเดียวกันกว้างเท่ากัน ไม่ว่าข้อความยาวแค่ไหน
  it('gives the buttons in a bill action row the same width', () => {
    expect(declarations('.bill-actions button')).toMatch(/flex:\s*1 1 0/);
    expect(declarations('.bill-actions button')).toMatch(/min-width:\s*0/);
  });

  it('colours the calendar head by what the bill needs', () => {
    expect(declarations('.bill-cal small')).toMatch(/background:\s*var\(--primary\)/);
    expect(declarations('.bill-card.is-awaiting .bill-cal small')).toMatch(/background:\s*var\(--cta\)/);
    expect(declarations('.bill-card.is-finished .bill-cal small')).toMatch(/background:\s*var\(--muted\)/);
  });

  it('gives the folded finished section a tap-sized header', () => {
    expect(declarations('.bills-done > summary')).toMatch(/min-height:\s*var\(--tap\)/);
  });

  // ตัว 12px สีเทาอ่านยากบนมือถือ
  it('uses at least 13px for bill summaries and notes', () => {
    for (const selector of ['.bill-summary', '.bill-member-note', '.bills-limit']) {
      expect(declarations(selector), selector).toMatch(/font-size:\s*13px/);
    }
  });
});

describe('style.css bill form', () => {
  // ช่องที่ถูกโฟกัสต้องไม่ไปจมอยู่ใต้แถบปุ่มที่ติดล่าง
  it('keeps focused fields above the sticky footer', () => {
    expect(declarations('.bill-form-dialog')).toMatch(/scroll-padding-bottom:\s*\d+px/);
  });
});

describe('style.css redesign constraints', () => {
  // ปุ่มหลักใช้สีเหลืองของแบรนด์ ตัวหนังสือดำ
  it('paints the primary button with the cta tokens', () => {
    const rule = declarations('.actions .primary');

    expect(rule).toMatch(/background:\s*var\(--cta\)/);
    expect(rule).toMatch(/color:\s*var\(--on-cta\)/);
  });

  // ตัวอักษรเล็กกว่า 13px อ่านยากบนมือถือ
  it('has no font size below 13px', () => {
    expect(css).not.toMatch(/font-size:\s*(?:\d|1[0-2])px/);
  });

  it('gives the category badge a background from its token', () => {
    expect(declarations('.cat-badge')).toMatch(/background:\s*var\(--cat-bg\)/);
  });

  it('keeps the hidden rule first so it always wins', () => {
    expect(css).toMatch(/^\* \{ box-sizing: border-box; \}\r?\n\[hidden\] \{ display: none !important; \}/);
  });

  // กฎ :active ของปุ่มรองต้องไม่มี id ใน :is() เพราะ specificity จะชนะปุ่มลบสีแดงตอนกด
  it('keeps the pressed danger button red instead of the secondary tint', () => {
    const secondaryActive = css.match(/(?:^|\n):is\(([^\n]*)\):active \{ background: var\(--brand-soft\)/);

    expect(secondaryActive).not.toBeNull();
    expect(secondaryActive[1]).not.toContain('#');
    expect(css).toMatch(/\.actions \.danger-solid:active[^{]*\{[^}]*background:\s*var\(--danger\)/);
  });

  // พื้นน้ำเงินของ bar และ hero กลืนวงแหวนสีน้ำเงิน ต้องใช้สีเหลือง
  it('uses the yellow focus ring on the blue bar and bills hero', () => {
    expect(css).toMatch(/\.bills-hero :focus-visible[^{]*\{[^}]*outline:\s*3px solid var\(--cta\)/);
  });

  // ปุ่มสไตล์ V1 ตามภาพอ้างอิง: เหลืองไม่มีขอบเข้ม น้ำเงินทึบสำหรับปุ่มรอง ลูกศรเฉพาะปุ่มไปต่อ ปุ่มปิดใช้ขอบบาง
  describe('button style v1', () => {
    const arrowSelectors = ['.actions .primary', '.bill-new', '#friend-share', '.bill-actions .bill-confirm', '#bill-form-submit', '#bill-form-go-profile'];

    it('draws the yellow primary without a dark border', () => {
      expect(declarations('.actions .primary')).not.toMatch(/brand-dark/);
      expect(css).not.toMatch(/border-color:\s*var\(--brand-dark\)/);
    });

    it('fills the secondary action buttons with solid blue and white text', () => {
      const group = css.match(/(?:^|\n)(#recurring-add, #bill-form-go-profile[^{]*)\{([^}]*)\}/);

      expect(group).not.toBeNull();
      expect(group[2]).toMatch(/background:\s*var\(--primary\)/);
      expect(group[2]).toMatch(/color:\s*var\(--on-primary\)/);
    });

    // ผู้ใช้ขอให้ปุ่มเพิ่มรายการประจำชิดขวา ปุ่มไม่ยืดเต็มแถวแม้เป็น display flex
    it('puts the add recurring button on the right', () => {
      expect(declarations('#recurring-add')).toMatch(/display:\s*flex/);
      expect(declarations('#recurring-add')).toMatch(/margin:\s*16px 0 0 auto/);
    });

    it('adds the arrow only to forward actions', () => {
      const arrow = css.match(/(?:^|\n)([^\n{]*::after)\s*\{[^}]*mask:/);

      expect(arrow).not.toBeNull();
      for (const selector of arrowSelectors) expect(arrow[1]).toContain(`${selector}::after`);
      for (const selector of ['#bill-form-cancel', '#cancel-button', '.bill-cancel', '.bill-decline', '#friend-add-submit', 'retry', 'danger']) {
        expect(arrow[1]).not.toContain(selector);
      }
    });

    it('marks disabled buttons with a dashed border on a grey background', () => {
      expect(css).toMatch(/button:disabled[^{]*\{[^}]*border:\s*2px dashed[^}]*\}/);
      expect(css).toMatch(/button:disabled[^{]*\{[^}]*background:\s*var\(--disabled-bg\)/);
    });
  });

  // ผู้ใช้เลือกแถบล่างแบบ D1: แถบขาวเรียบ แท็บที่เลือกมีขีดน้ำเงินที่ขอบบน ไม่ใช้สีเหลือง
  it('marks the selected tab with a blue top tick and bold blue text, without yellow', () => {
    const nav = declarations('.bottom-nav');
    expect(nav).toMatch(/border-top:\s*1px solid var\(--border\)/);
    expect(nav).not.toMatch(/border-radius:\s*24px/);
    expect(declarations('.nav-button[aria-current="page"]')).toMatch(/color:\s*var\(--primary\)/);
    expect(declarations('.nav-button[aria-current="page"]')).toMatch(/font-weight:\s*800/);
    expect(declarations('.nav-button[aria-current="page"]::after')).toMatch(/background:\s*var\(--primary\)/);
    const navRules = css.match(/\.(?:bottom-nav|nav-button)[^{]*\{[^}]*\}/g).join(' ');
    expect(navRules).not.toMatch(/--cta/);
  });

  it('gives every dialog heading a zero top margin', () => {
    expect(declarations('dialog h2')).toMatch(/margin:\s*0 0 4px/);
  });

  // ชื่อหน้าต้องอยู่บรรทัดเดียวเพื่อให้ความสูงแถบไม่กระโดดระหว่างแท็บ
  it('keeps the page title on one line', () => {
    expect(declarations('.bar h1')).toMatch(/white-space:\s*nowrap/);
    expect(declarations('.bar h1')).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('centers chart row labels with their values', () => {
    expect(declarations('.chart-row')).toMatch(/align-items:\s*center/);
  });
});

describe('style.css Thai line breaks', () => {
  // ตัวตัดคำของ browser ตัด บอทบันทึก เป็น บอทบัน/ทึก
  it('keeps marked word pairs on one line', () => {
    expect(declarations('.nowrap')).toMatch(/white-space:\s*nowrap/);
  });

  it('styles the bills error like the yellow notice', () => {
    expect(declarations('.bills-error')).toMatch(/background:\s*var\(--notice-bg\)/);
    expect(declarations('.bills-error')).toMatch(/border:\s*2px solid var\(--cta\)/);
  });

  // หน้าบิลมีมาสคอตใน hero แล้ว ไม่แสดงซ้ำที่แถบ
  it('hides the bar mascot on the bills page', () => {
    expect(declarations('main#app.bills-page .bar-mascot')).toMatch(/display:\s*none/);
  });

  it('hides the bar mascot and keeps room for the safe area on every sub page', () => {
    expect(declarations('main#app.sub-page .bar-mascot')).toMatch(/display:\s*none/);
    expect(declarations('main#app.sub-page')).toMatch(/padding-bottom:\s*calc\(16px \+ env\(safe-area-inset-bottom\)\)/);
  });

  it('keeps the paid checkbox on the same row as the member amount', () => {
    expect(declarations('.bill-member')).toMatch(/grid-template-columns:[^;]*auto auto auto/);
    expect(declarations('.bill-member-paid')).not.toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('makes the bottom nav 68px tall', () => {
    expect(declarations('.nav-button')).toMatch(/min-height:\s*68px/);
  });

  // วัดจริง 2026-10-19: 6 แท็บที่จอ 320px "รอบเดือน" กว้าง 51.3px แต่ปุ่มเหลือ 49px ถ้ามี padding ข้าง และห้ามย่อตัวอักษรต่ำกว่า 13px
  it('keeps every tab label on one line without side padding', () => {
    expect(declarations('.nav-button')).toMatch(/padding:\s*8px 0;/);
    expect(declarations('.nav-button span')).toMatch(/white-space:\s*nowrap/);
  });
});

describe('style.css bill form spacing', () => {
  // ปุ่มในฟอร์มบิลห่างช่องด้านบนแค่ 8px ดูติดกัน ช่องอื่นห่างกัน 12px จึงให้ปุ่มเว้นมากกว่านั้น
  it('spaces the bill form buttons away from the field above', () => {
    expect(declarations('.bill-form-even')).toMatch(/margin-top:\s*16px/);
  });
});

describe('style.css summary style s5 with s1 trend colors', () => {
  // ผู้ใช้เลือกสรุปตามหมวดแบบ S5: แถบเดียวแบ่งสีตามหมวด แต่ละแถวมีสี่เหลี่ยมสีแทนแท่งยาว
  it('draws one segmented bar and a color swatch per row instead of row bars', () => {
    expect(declarations('.chart-stack')).toMatch(/display:\s*flex/);
    expect(declarations('.chart-row::before')).toMatch(/background:\s*var\(--dot\)/);
    expect(declarations('.chart-track')).toMatch(/display:\s*none/);
  });

  it('shows export as a right-aligned text link', () => {
    expect(declarations('.export')).toMatch(/justify-content:\s*flex-end/);
    expect(declarations('#bill-form-receipt-button, #bill-form-even, #export-button')).toMatch(/text-decoration:\s*underline/);
    expect(css).not.toMatch(/#bill-form-go-profile, \.profile-close, #export-button \{/);
  });

  // กราฟแนวโน้มใช้สีแบบ S1: รายจ่ายน้ำเงินเข้ม รายรับฟ้าอ่อนมีขอบน้ำเงินให้เห็นบนพื้นขาว เดือนปัจจุบันมีป้ายเหลือง
  it('colors the trend like s1', () => {
    expect(declarations('.trend-bar.expense')).toMatch(/background:\s*var\(--primary\);/);
    expect(declarations('.trend-bar.income')).toMatch(/background:\s*var\(--trend-income\)/);
    // ใช้เงาด้านในแทน border เพราะ border ทำให้แท่งที่สูง 0 ยังเห็นเป็นขีด
    expect(declarations('.trend-bar.income')).toMatch(/box-shadow:\s*inset 0 0 0 1\.5px var\(--primary\)/);
    expect(declarations('.trend-col.current .trend-label')).toMatch(/background:\s*var\(--cta\)/);
    expect(declarations('.legend.expense::before')).toMatch(/background:\s*var\(--primary\);/);
  });
});

describe('style.css recurring tab style r2', () => {
  // แถวแบบปฏิทินฉีก: กล่องวันที่ซ้าย ชื่อกับบรรทัดรองกลาง ยอดขวา
  it('lays each rule out as a calendar tile, a name and an amount', () => {
    expect(declarations('.recurring-button')).toMatch(/grid-template-columns:\s*56px minmax\(0,\s*1fr\) auto/);
    expect(declarations('.recurring-cal small')).toMatch(/background:\s*var\(--primary\)/);
    expect(declarations('.recurring-row.income .recurring-cal small')).toMatch(/background:\s*var\(--income\)/);
    expect(declarations('.recurring-row.income .recurring-amount')).toMatch(/color:\s*var\(--income\)/);
  });

  it('dims a paused rule without lowering text contrast and tags it', () => {
    expect(declarations('.recurring-row.paused .recurring-cal small')).toMatch(/background:\s*var\(--muted\)/);
    expect(declarations('.recurring-row.paused .recurring-name, .recurring-row.paused .recurring-amount')).toMatch(/color:\s*var\(--muted\)/);
    expect(declarations('.recurring-paused')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
  });

  // summary ของเงื่อนไขที่พับไว้ต้องกดง่าย
  it('gives the folded timing rules a 44px summary', () => {
    expect(declarations('.recurring-more summary')).toMatch(/min-height:\s*44px/);
  });
});

// selector ร่วมของการ์ดและเลขขั้นแบบ F1 ทุกฟอร์มในหน้าต่าง
const CARD_SELECTOR = '#bill-form > label, .bill-form-card, .bill-form-split, #edit-form > label, #budget-form > label, #recurring-form > label';
const STEP_SELECTOR = '#bill-form > label::before, .bill-form-card > label::before, .bill-form-split legend::before, #edit-form > label::before, #recurring-form > label:not(.check)::before';

describe('style.css bill form style f1', () => {
  // แบบ F1 ที่ผู้ใช้เลือก: แต่ละช่องเป็นการ์ดขาวบนพื้นฟ้าอ่อน มีเลขขั้นนำทาง
  it('lays each field out as a white card on the soft background', () => {
    expect(declarations('.bill-form-dialog')).toMatch(/background:\s*var\(--bg\)/);
    expect(declarations('.bill-form-footer')).toMatch(/background:\s*var\(--bg\)/);
  });

  // footer ที่ sticky และมี margin ล่างติดลบถูกดันขึ้นทับการ์ดสุดท้าย จึงให้ dialog ไม่มี padding ล่างแทน
  it('keeps the sticky footer from covering the last card', () => {
    expect(declarations('.bill-form-dialog')).toMatch(/padding-bottom:\s*0/);
    expect(declarations('.bill-form-footer')).toMatch(/margin:\s*0 -20px;/);
  });

  // ผู้ใช้อยากให้อ่านใบเสร็จและแบ่งเท่ากันเป็นแค่ข้อความชิดขวาใต้ช่องที่กรอก ยังเป็น button เพื่อให้กดได้และ screen reader รู้ว่าเป็นปุ่ม
  it('shows the receipt and even-split buttons as plain right-aligned text', () => {
    const rule = declarations('#bill-form-receipt-button, #bill-form-even, #export-button');

    expect(declarations('.bill-form-receipt')).toMatch(/text-align:\s*right/);
    expect(declarations('#bill-form-even')).toMatch(/margin:\s*2px 0 0 auto/);
    expect(declarations('#bill-form-even')).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/background:\s*none/);
    expect(rule).toMatch(/border-color:\s*transparent/);
    expect(rule).toMatch(/text-decoration:\s*underline/);
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(declarations('#bill-form-receipt-button:disabled, #bill-form-even:disabled, #export-button:disabled')).toMatch(/background:\s*none/);
    expect(css).not.toMatch(/#bill-form-go-profile, #bill-form-receipt-button/);
  });

  it('draws the total and receipt link as one white numbered card', () => {
    expect(declarations(CARD_SELECTOR)).toMatch(/background:\s*var\(--surface\)/);
    expect(declarations(STEP_SELECTOR)).toMatch(/counter-increment:\s*form-step/);
    expect(CARD_SELECTOR).toContain('.bill-form-card');
    expect(STEP_SELECTOR).toContain('.bill-form-card > label::before');
  });

  it('keeps the receipt status text left-aligned', () => {
    expect(declarations('#bill-form-receipt-status')).toMatch(/text-align:\s*left/);
  });
});

// ผู้ใช้ให้ฟอร์มในหน้าต่างอื่นเป็นแบบ F1 ด้วย ฟอร์มตั้งงบมีช่องเดียวจึงมีการ์ดแต่ไม่มีเลขขั้น
describe('style.css other dialog forms style f1', () => {
  it('pins the X close button to the top right with a 44px tap area', () => {
    const rule = declarations('.dialog-close');

    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/top:\s*\d+px/);
    expect(rule).toMatch(/right:\s*\d+px/);
    expect(rule).toMatch(/width:\s*44px/);
    expect(rule).toMatch(/height:\s*44px/);
  });

  it('puts the edit, budget and recurring dialogs on the soft background', () => {
    expect(declarations('#editor, #budget-editor, #recurring-editor')).toMatch(/background:\s*var\(--bg\)/);
  });

  it('draws every field of those forms as a white card', () => {
    for (const form of ['#edit-form', '#budget-form', '#recurring-form']) expect(CARD_SELECTOR).toContain(`${form} > label`);
    expect(declarations(CARD_SELECTOR)).toMatch(/border-radius:\s*18px/);
  });

  it('numbers the edit and recurring fields but not the single budget field or the active toggle', () => {
    expect(declarations('#bill-form, #edit-form, #recurring-form')).toMatch(/counter-reset:\s*form-step/);
    expect(STEP_SELECTOR).not.toContain('#budget-form');
    expect(STEP_SELECTOR).toContain(':not(.check)');
  });
});

describe('style.css balance card style k', () => {
  // แบบ K ที่ผู้ใช้เลือก: มาสคอตพูดยอดคงเหลือในกรอบคำพูด ทำด้วย CSS ล้วนเพื่อไม่แก้ HTML และ JS
  it('puts the mascot in its own column beside the balance', () => {
    expect(declarations('.stat-cards')).toMatch(/grid-template-columns:\s*64px minmax\(0,\s*1fr\)/);
    expect(declarations('.stat-cards::before')).toMatch(/background:\s*url\(assets\/mascot\.webp\)/);
    expect(declarations('.stat-cards .stat-sub')).toMatch(/grid-column:\s*2/);
  });

  it('draws the balance as a white speech bubble with a tail toward the mascot', () => {
    expect(declarations('.stat-cards .stat.balance')).toMatch(/background:\s*var\(--surface\)/);
    expect(declarations('.stat-cards .stat.balance::before')).toMatch(/border-color:\s*transparent var\(--surface\)/);
  });

  it('prefixes the balance label with the mascot speaking', () => {
    expect(declarations('.stat-cards .stat.balance .stat-label::before')).toMatch(/content:\s*"เฮียสมัครบอกว่า "/);
  });

  // ตัวเลขยาวที่จอแคบต้องย่อตามกรอบคำพูดแทนการล้นหรือตัดบรรทัดกลางตัวเลข
  it('shrinks a long balance to the bubble width on one line', () => {
    expect(declarations('.stat-cards .stat.balance')).toMatch(/container-type:\s*inline-size/);
    expect(declarations('.stat-cards .stat.balance .stat-value')).toMatch(/font-size:\s*clamp\([^)]*cqw[^)]*\)/);
    expect(declarations('.stat-cards .stat.balance .stat-value')).toMatch(/white-space:\s*nowrap/);
  });

  // ตัวเลขยาวในกล่องรายรับ/รายจ่ายต้องตัดบรรทัดก่อนคำว่า บาท ไม่ใช่กลางตัวเลข
  it('keeps income and expense numbers whole when they wrap', () => {
    expect(declarations('.stat-cards .stat-sub .stat-value')).toMatch(/overflow-wrap:\s*normal/);
  });

  // จอ 360px ตัวเลขหลักล้านดันช่องรายจ่ายล้นขอบการ์ด จึงล็อกความกว้างช่องและย่อตัวเลขตามช่อง
  it('keeps the income and expense boxes inside the card', () => {
    expect(declarations('.stat-cards .stat-sub')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(declarations('.stat-cards .stat-sub .stat')).toMatch(/container-type:\s*inline-size/);
    expect(declarations('.stat-cards .stat-sub .stat-value')).toMatch(/font-size:\s*clamp\(11px,\s*min\(15cqw,\s*calc\(100cqw \/ \(var\(--amount-chars/);
    expect(declarations('.stat-cards .stat-sub .stat-value')).toMatch(/white-space:\s*nowrap/);
    expect(declarations('.stat-cards .stat-sub.long')).toMatch(/grid-template-columns:\s*1fr/);
  });
});

describe('style.css notification switches', () => {
  // ใช้หน้าตาเดียวกับสวิตช์ซ่อนหมวด ไม่ใช่ checkbox สี่เหลี่ยมของ browser
  it('draws the notification checkbox as a pill switch', () => {
    const rule = declarations('.notify-switch input[type="checkbox"]');

    expect(rule).toMatch(/(?:^|;)\s*appearance:\s*none/);
    expect(rule).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(declarations('.notify-switch input[type="checkbox"]:checked')).toMatch(/background:\s*var\(--primary\)/);
  });

  it('gives the notification card the same frame as the friends card', () => {
    expect(declarations('.notify-settings')).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
  });
});

describe('style.css list filters', () => {
  // คอลัมน์ 1fr ขยายตามตัวเลือกที่ยาวที่สุดของ select ทำให้ทั้งแถวล้นจอแคบ
  it('keeps the two filter columns inside the screen width', () => {
    expect(declarations('.filters')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('lets filter selects shrink and cut long option text', () => {
    const rule = declarations('.filters select');

    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('gives the wallet filter a full row', () => {
    expect(declarations('#filter-wallet')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });
});
