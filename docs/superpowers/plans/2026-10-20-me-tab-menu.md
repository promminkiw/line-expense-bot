# แท็บ ฉัน แบบเมนูจัดกลุ่ม (ดีไซน์ A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แท็บ ฉัน เปลี่ยนจากหน้ายาวที่เรียงกระเป๋า/แจ้งเตือน/เพื่อน/วิธีใช้บอทต่อกัน เป็นการ์ดโปรไฟล์ปัจจุบันตามด้วยเมนู 3 กลุ่ม แต่ละแถวเปิดเป็นหน้าย่อยของตัวเอง

**Architecture:** ใช้กลไกหน้าย่อย `enterSubPage`/`leaveSubPage` ใน `app.mjs` ที่มีอยู่ (หน้าหมวดของฉัน, หน้ารายการประจำ) ไม่เขียนกลไกใหม่ ส่วนกระเป๋าเงิน การแจ้งเตือน เพื่อน และวิธีใช้บอท ย้าย element เดิมทั้งก้อน (id เดิมทุกตัว) ไปอยู่ใน `.panel` ใหม่ที่ซ่อนไว้ จึงไม่แตะโค้ดโหลดข้อมูลของแต่ละส่วน (`wallets-panel.mjs`, `friends-panel.mjs`, `settings-panel.mjs`) แถวเมนูเป็น `<button class="menu-row">` ชุดเดียวกันทั้งหมด

**Tech Stack:** LIFF แบบ HTML + ES module ไม่มี build step, vitest + jsdom (`public/liff/app.dom.test.mjs`, `style.test.mjs`)

## Global Constraints

- เขียน test ก่อนโค้ด ทุก task (CLAUDE.md ของโปรเจกต์) และอัปเดต `work-memory/STATE.md` เมื่อจบ (Task 4 Step 9)
- ทำบน branch `feat/me-menu` ที่แตกจาก `main` (Task 1 Step 0)
- ห้ามเปลี่ยนหรือลบ element id เดิม เพิ่มได้อย่างเดียว ห้ามแตะ `src/`, API, DB, `.env` และห้ามแก้โค้ดโหลดข้อมูลของ `wallets-panel.mjs`, `friends-panel.mjs`, `settings-panel.mjs`
- คอมเมนต์สั้นบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น ศัพท์เทคนิคคงเป็นอังกฤษ ชื่อตัวแปร/function เป็นอังกฤษ ห้าม emoji ในโค้ด คอมเมนต์ และ commit message
- commit message ภาษาอังกฤษแบบ imperative ลงท้ายด้วยบรรทัดว่าง แล้ว `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` และ `Claude-Session: https://claude.ai/code/session_01U4ZkrWzSDkVzuwonx7BGhW`
- ทุก task แก้ `public/liff/index.html`, `public/liff/app.mjs` และ `public/liff/app.dom.test.mjs` จึงต้องทำทีละ task ตามลำดับ ห้ามทำขนาน
- ผู้ใช้ตัดสินแล้ว (2026-10-20): ใช้ดีไซน์ A (ภาพจำลองที่ https://claude.ai/artifact/HaWYtPxKoawTg8CxCxWj7Y ไฟล์ `Main.dc.html`) การ์ดด้านบนคงแบบปัจจุบันของแอป (หัวน้ำเงิน ยอดสะสม การ์ดขาว 3 ช่องสถิติ ห้ามแก้) เมนู 3 กลุ่มตามภาพ ปุ่ม "กลับไปแชต" อยู่ท้ายหน้า
- ค่าตั้งต้นที่ผู้ใช้ยังไม่ได้ตอบ (ใช้คำแนะนำของ Claude): ปุ่ม "จัดการหมวดหมู่" ท้ายแท็บ งบ คงไว้ ไม่ลบ และแท็บ ฉัน มีทางเข้าหน้าหมวดเดียวกันเพิ่ม โดยกดย้อนกลับแล้วกลับมาแท็บที่เปิดมา
- ชื่อหัวข้อและข้อความของแถว (ใช้ตรงตัว): กลุ่ม "การจัดการข้อมูล": กระเป๋าเงิน (จัดการกระเป๋าและดูยอดแยก), จัดการหมวดหมู่ (เพิ่ม แก้ไข ซ่อน และลบหมวด) กลุ่ม "ระบบอัตโนมัติและการตั้งค่า": รายการประจำ (รายรับรายจ่ายที่เกิดทุกเดือน บอทจดให้เอง), การแจ้งเตือน (สรุปรายสัปดาห์และเตือนลืมจด) กลุ่ม "ความช่วยเหลือและการใช้งานร่วมกัน": เพื่อนและหารบิล (จัดการเพื่อนและไปหารบิล), วิธีใช้งาน (วิธีใช้บอทและคำสั่งในแชต)
- ปุ่มย้อนกลับของหน้าย่อยทุกหน้าที่เปิดจากแท็บ ฉัน: `aria-label` "กลับไปหน้าฉัน" และกลับมาที่แท็บ ฉัน โดยโฟกัสกลับที่แถวที่กดเข้า
- LIFF ต้องล็อกอิน LINE จึงตรวจ UI อัตโนมัติด้วย jsdom และตรวจจริงด้วยมือในแอป LINE ตามตาราง LINE check หลัง push และ Render deploy (ผู้ใช้เป็นคนเปิดแอป ไม่ต้องเปิด server ในเครื่อง)
- gate เริ่มต้นของ SDD ไม่รันเทสต์ของไฟล์ `.mjs` ให้รันตรง: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs` (เพิ่มไฟล์ที่ task แตะ) และ `npm run lint`
- ก่อนจบทั้งแผน: `npm test` (ฐาน 2130 ที่ `69b82d7`), `npm run lint`, `node --check index.js`, `node --check public/liff/app.mjs` ผ่านทั้งหมด (`scripts/try-parse.test.js` อาจ timeout ตอนรันพร้อมกัน ให้รันไฟล์นั้นเดี่ยวซ้ำก่อนสรุปว่าพัง)
- anchor ในแผนนี้ตรวจกับ `main` ที่ `69b82d7` เลขบรรทัดอาจเลื่อน ให้หาจากข้อความ anchor

---

## File Structure

| ไฟล์ | เปลี่ยนอะไร | Task |
|---|---|---|
| `public/liff/index.html` | symbol ไอคอนใหม่ 4 ตัว, `.menu-groups` ใน `#panel-profile`, panel ใหม่ `panel-wallets`/`panel-notify`/`panel-friends`/`panel-tips` | 1-4 |
| `public/liff/style.css` | `.menu-groups`, `.menu-row` และลูก, ระยะห่างของส่วนที่ย้ายมาอยู่ในหน้าย่อย | 1, 4 |
| `public/liff/app.mjs` | `mePage()`, หน้าย่อยใหม่, ทางเข้าหน้าหมวดจากแท็บ ฉัน, ปุ่มเมนูเปิดใช้เมื่อมี api, ลิงก์ชวนเพื่อนเปิดหน้าเพื่อน | 1-3 |
| `public/liff/app.dom.test.mjs`, `style.test.mjs` | เทสต์ใหม่และแก้เทสต์ที่อ้างตำแหน่งเดิม | 1-4 |
| `README.md`, `SPEC.md`, `work-memory/STATE.md` | อธิบายโครงใหม่ของแท็บ ฉัน | 4 |

---

### Task 1: โครงเมนู + แถวจัดการหมวดหมู่ + แถวรายการประจำแบบใหม่

**Depends on:** none

เพิ่ม CSS ของแถวเมนู ไอคอนใหม่ และกลุ่มเมนู 2 กลุ่มแรก (ยังมีแค่แถวหมวดหมู่กับรายการประจำ) โดยปุ่มรายการประจำเดิม `#recurring-open` เปลี่ยนเป็นแถวเมนู (id เดิม) ทำให้หน้าหมวดเปิดจากสองที่ได้โดยกลับไปที่เดิมที่เปิดมา

**Files:**
- Modify: `public/liff/index.html` (symbol ใหม่ต่อจาก `icon-categories`; แทนบล็อก `<div class="categories-entry">` ที่มี `#recurring-open` ใน `#panel-profile`)
- Modify: `public/liff/style.css` (ต่อท้าย rule `.categories-entry-hint`)
- Modify: `public/liff/app.mjs` (`els`, บล็อกหน้าย่อยของหมวด/รายการประจำ, `setCategories`)
- Test: `public/liff/app.dom.test.mjs`, `public/liff/style.test.mjs`

**Interfaces:**
- Consumes: `enterSubPage`, `CATEGORIES_PAGE`, `RECURRING_PAGE`, `els.recurringOpen` เดิม
- Produces: `mePage(panelId, title, returnFocus)` คืน `{ panelId, title, backLabel: 'กลับไปหน้าฉัน', ownerTab: 'profile', returnFocus }`, `ME_CATEGORIES_PAGE`, element `#me-categories-open` (`<button class="menu-row" disabled>`), class `.menu-groups`, `.menu-group`, `.menu-list`, `.menu-row`, `.menu-row-icon`, `.menu-row-text`, `.menu-row-title`, `.menu-row-sub`, `.menu-row-chevron`, symbol `icon-wallet`, `icon-bell`, `icon-users`, `icon-book`

**LINE check:** (หลัง push และ Render deploy เสร็จ)

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ ฉัน | ใต้การ์ดโปรไฟล์มีหัวข้อ "การจัดการข้อมูล" และ "ระบบอัตโนมัติและการตั้งค่า" แต่ละแถวมีไอคอน ชื่อ คำอธิบาย และลูกศรขวา ยังมีกระเป๋าเงิน การแจ้งเตือน เพื่อนอยู่ด้านล่างเหมือนเดิม (ข้อนี้อธิบายสถานะหลัง Task 1 เท่านั้น ถูกแทนด้วยข้อของ Task 2/3/4 เมื่อทดสอบหลัง deploy ครบทุก Task) |
| 2 | กดแถว "จัดการหมวดหมู่" | เปิดหน้า หมวดของฉัน ปุ่มย้อนกลับมุมซ้ายบน |
| 3 | กดย้อนกลับ | กลับแท็บ ฉัน โฟกัสอยู่ที่แถวหมวดหมู่ |
| 4 | แท็บ งบ ล่างสุด กด "จัดการหมวดหมู่" แล้วย้อนกลับ | กลับแท็บ งบ (ไม่ใช่แท็บ ฉัน) |
| 5 | แท็บ ฉัน กดแถว "รายการประจำ" แล้วย้อนกลับ | เปิดหน้ารายการประจำและกลับแท็บ ฉัน เหมือนเดิม |

- [ ] **Step 0: แตก branch**

```bash
git checkout main
git checkout -b feat/me-menu
```

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้ม**

ใน `public/liff/app.dom.test.mjs` `describe('index.html static invariants', ...)` แทนเทสต์ `has a disabled recurring entry button that uses the repeat icon` ทั้งก้อนด้วย:

```js
  it('lists the me tab entries as menu rows that start disabled', () => {
    const recurring = doc.getElementById('recurring-open');
    expect(recurring.classList.contains('menu-row')).toBe(true);
    expect(recurring.hasAttribute('disabled')).toBe(true);
    expect(recurring.querySelector('.menu-row-title').textContent).toBe('รายการประจำ');
    expect(recurring.querySelector('.menu-row-sub').textContent).toBe('รายรับรายจ่ายที่เกิดทุกเดือน บอทจดให้เอง');
    expect(recurring.querySelector('use').getAttribute('href')).toBe('#tab-repeat');
    const categories = doc.getElementById('me-categories-open');
    expect(categories.hasAttribute('disabled')).toBe(true);
    expect(categories.querySelector('.menu-row-title').textContent).toBe('จัดการหมวดหมู่');
    expect(categories.querySelector('.menu-row-sub').textContent).toBe('เพิ่ม แก้ไข ซ่อน และลบหมวด');
  });

  it('points every menu row icon at a symbol that exists in the sprite', () => {
    const hrefs = [...doc.querySelectorAll('.menu-row use')].map((use) => use.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(doc.querySelector(href), href).not.toBeNull();
    for (const id of ['icon-wallet', 'icon-bell', 'icon-users', 'icon-book']) expect(doc.getElementById(id), id).not.toBeNull();
  });
```

(เทสต์เดิม `puts the entry button right after the profile card and before the wallets section` ไม่ต้องแก้ใน task นี้ เพราะ `.menu-groups` มาแทน `.categories-entry` ในตำแหน่งเดิมและยังอยู่ก่อน `#wallets`)

ต่อจาก `describe('LIFF recurring page under the me tab', ...)` ทั้งก้อน เพิ่ม:

```js
describe('LIFF categories page opened from the me tab', () => {
  it('opens from the me tab and goes back to the me tab', async () => {
    await boot();
    clickTab('profile');
    const open = byId('me-categories-open');
    expect(open.disabled).toBe(false);

    open.click();

    expect(byId('panel-categories').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('หมวดของฉัน');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId('panel-categories').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId('me-categories-open'));
  });

  it('keeps the budgets tab entry going back to the budgets tab', async () => {
    await boot();
    clickTab('budgets');
    byId('categories-open').click();

    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปจัดการงบ');

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
  });
});
```

ใน `public/liff/style.test.mjs` ต่อจากเทสต์ `gives the header back and home controls a pressed state`:

```js
  it('styles the me tab menu rows as full-width tap targets', () => {
    expect(declarations('.menu-row')).toMatch(/min-height:\s*64px/);
    expect(declarations('.menu-row')).toMatch(/width:\s*100%/);
    expect(declarations('.menu-row-icon')).toMatch(/width:\s*40px/);
    expect(declarations('.menu-row:disabled')).toMatch(/cursor:\s*not-allowed/);
  });
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs -t "menu row|me tab entries|opened from the me tab"`
Expected: FAIL ทุกเทสต์ใหม่ (`recurring.querySelector('.menu-row-title')` เป็น `null`, `byId('me-categories-open')` เป็น `null`, style ล้มด้วย TypeError เพราะ `declarations()` คืน `null`) ส่วนเทสต์ `keeps the budgets tab entry going back...` ผ่านอยู่แล้ว (กันพฤติกรรมเดิมไม่ให้เสีย)

- [ ] **Step 3: เพิ่ม symbol ไอคอนใน `index.html`**

ต่อจาก `</symbol>` ของ `icon-categories` (ก่อน `</svg>` ที่ปิดสปไรต์):

```html
    <symbol id="icon-wallet" viewBox="0 0 24 24">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 14.5h2" />
    </symbol>
    <symbol id="icon-bell" viewBox="0 0 24 24">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4" />
    </symbol>
    <symbol id="icon-users" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14.5c1.8.7 3 2.5 3 4.5" />
    </symbol>
    <symbol id="icon-book" viewBox="0 0 24 24">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7" />
    </symbol>
```

- [ ] **Step 4: เปลี่ยนบล็อกปุ่มรายการประจำใน `#panel-profile`**

แทนบล็อกนี้ทั้งก้อน (ต่อจากปิด `</section>` ของ `#profile-card` ก่อน `<section id="wallets"`):

```html
      <div class="categories-entry">
        <button type="button" id="recurring-open" class="categories-open" disabled><svg class="icon"
            aria-hidden="true" focusable="false">
            <use href="#tab-repeat"></use>
          </svg>รายการประจำ</button>
        <p class="categories-entry-hint">รายรับรายจ่ายที่เกิดทุกเดือน บอทจดให้เอง</p>
      </div>
```

ด้วย:

```html
      <div class="menu-groups">
        <section class="menu-group" aria-labelledby="menu-data-title">
          <h2 id="menu-data-title">การจัดการข้อมูล</h2>
          <ul class="menu-list">
            <li><button type="button" id="me-categories-open" class="menu-row" disabled>
                <span class="menu-row-icon"><svg class="icon" aria-hidden="true" focusable="false">
                    <use href="#icon-categories"></use>
                  </svg></span>
                <span class="menu-row-text"><span class="menu-row-title">จัดการหมวดหมู่</span><span
                    class="menu-row-sub">เพิ่ม แก้ไข ซ่อน และลบหมวด</span></span>
                <svg class="icon menu-row-chevron" aria-hidden="true" focusable="false">
                  <use href="#icon-chevron"></use>
                </svg></button></li>
          </ul>
        </section>
        <section class="menu-group" aria-labelledby="menu-auto-title">
          <h2 id="menu-auto-title">ระบบอัตโนมัติและการตั้งค่า</h2>
          <ul class="menu-list">
            <li><button type="button" id="recurring-open" class="menu-row" disabled>
                <span class="menu-row-icon"><svg class="icon" aria-hidden="true" focusable="false">
                    <use href="#tab-repeat"></use>
                  </svg></span>
                <span class="menu-row-text"><span class="menu-row-title">รายการประจำ</span><span
                    class="menu-row-sub">รายรับรายจ่ายที่เกิดทุกเดือน บอทจดให้เอง</span></span>
                <svg class="icon menu-row-chevron" aria-hidden="true" focusable="false">
                  <use href="#icon-chevron"></use>
                </svg></button></li>
          </ul>
        </section>
      </div>
```

- [ ] **Step 5: เพิ่ม CSS**

ใน `public/liff/style.css` ต่อจากบรรทัด `.categories-entry-hint { ... }`:

```css
.menu-groups { display: flex; flex-direction: column; gap: 14px; margin: 14px 16px 0; }
.menu-group h2 { margin: 0 4px 6px; font-size: 14px; font-weight: 800; color: var(--muted); }
.menu-list { list-style: none; margin: 0; padding: 0; overflow: hidden; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.menu-list li + li { border-top: 1px solid var(--border); }
.menu-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 64px; box-sizing: border-box; padding: 12px 16px; border: none; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
.menu-row:active { background: var(--brand-soft); }
.menu-row:focus-visible { outline: 3px solid var(--primary); outline-offset: -3px; }
.menu-row:disabled { background: none; border: none; color: var(--muted); cursor: not-allowed; opacity: 0.6; }
.menu-row-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 40px; height: 40px; border-radius: 12px; background: var(--brand-soft); color: var(--primary); }
.menu-row-icon .icon { width: 22px; height: 22px; stroke-width: 2; }
.menu-row-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.menu-row-title { font-size: 16px; font-weight: 700; }
.menu-row-sub { font-size: 13px; color: var(--muted); }
.menu-row-chevron { flex: none; width: 20px; height: 20px; color: var(--muted); }
```

(กฎ `button:disabled` เดิมที่บรรทัด ~135 ใส่พื้นเทาและขอบประ จึงต้องมี `.menu-row:disabled` ทับ specificity สูงกว่า)

- [ ] **Step 6: แก้ `app.mjs`**

ใน `const els = { ... }` ต่อจากบรรทัด `recurringOpen: document.getElementById('recurring-open'),`:

```js
  meCategoriesOpen: document.getElementById('me-categories-open'),
```

ในฟังก์ชันที่มีบรรทัด `els.categoriesOpen.disabled = categories.length === 0;` (ใน `setCategories`) ต่อท้ายบรรทัดนั้น:

```js
  els.meCategoriesOpen.disabled = categories.length === 0;
```

แทนบล็อก `enterCategoriesPage`:

```js
function enterCategoriesPage() {
  // ข้อความผลบันทึกรอบก่อนไม่ควรค้างมาตอนเข้าหน้าใหม่
  document.getElementById('category-status').textContent = '';
  enterSubPage(CATEGORIES_PAGE);
}

els.categoriesOpen.addEventListener('click', enterCategoriesPage);
```

ด้วย (ฟังก์ชันรับหน้า เพราะหน้าหมวดเปิดจากสองแท็บ):

```js
function enterCategoriesPage(page) {
  // ข้อความผลบันทึกรอบก่อนไม่ควรค้างมาตอนเข้าหน้าใหม่
  document.getElementById('category-status').textContent = '';
  enterSubPage(page);
}

// หน้าย่อยที่เปิดจากเมนูในแท็บ ฉัน กลับมาแท็บเดียวกัน
function mePage(panelId, title, returnFocus) {
  return { panelId, title, backLabel: 'กลับไปหน้าฉัน', ownerTab: 'profile', returnFocus };
}

const ME_CATEGORIES_PAGE = { ...CATEGORIES_PAGE, backLabel: 'กลับไปหน้าฉัน', ownerTab: 'profile', returnFocus: els.meCategoriesOpen };

els.categoriesOpen.addEventListener('click', () => enterCategoriesPage(CATEGORIES_PAGE));
els.meCategoriesOpen.addEventListener('click', () => enterCategoriesPage(ME_CATEGORIES_PAGE));
```

แทนค่า `RECURRING_PAGE` ที่เป็น object literal ด้วย:

```js
const RECURRING_PAGE = mePage('panel-recurring', 'รายการประจำ', els.recurringOpen);
```

(หา `RECURRING_PAGE` จากข้อความ `const RECURRING_PAGE = {` และลบทั้ง literal เดิม; `mePage` ต้องประกาศก่อนบรรทัดนี้ ซึ่งเป็นไปตามลำดับในไฟล์เพราะ `enterCategoriesPage` อยู่ก่อน `RECURRING_PAGE`) ก่อนแก้ให้ `grep -n "enterCategoriesPage\|RECURRING_PAGE" public/liff/app.mjs` และยืนยันว่าไม่มีที่อื่นเรียก `enterCategoriesPage()` แบบไม่มี argument

- [ ] **Step 7: เก็บเทสต์เดิมที่ถูกกระทบ**

ใน `public/liff/app.dom.test.mjs` เทสต์ใน `describe('LIFF recurring page under the me tab', ...)` ที่ใช้ `byId('recurring-open')` ยังผ่านเพราะ id เดิม ไม่ต้องแก้ ตรวจว่ามีเทสต์ไหนยืนยัน `.categories-entry-hint` ของแท็บ ฉัน (ที่ P2 เพิ่ม): `grep -n "categories-entry-hint" public/liff/app.dom.test.mjs` ถ้ามีเทสต์ที่ใช้ตัวที่ผูกกับ `recurring-open` ให้ลบ assertion นั้นออก (ถูกแทนด้วย `.menu-row-sub` ในเทสต์ใหม่แล้ว) และเทสต์ `names the delete action in the categories hint...` ใช้ `#panel-budgets .categories-entry-hint` อยู่แล้วจึงไม่ถูกกระทบ

- [ ] **Step 8: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสองไฟล์

Run: `npm run lint` และ `node --check public/liff/app.mjs`
Expected: ไม่มี error

- [ ] **Step 9: Commit**

```bash
git add public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/app.dom.test.mjs public/liff/style.test.mjs
git commit -m "feat: add menu rows to the me tab and open the categories page from it

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U4ZkrWzSDkVzuwonx7BGhW"
```

---

### Task 2: กระเป๋าเงินและการแจ้งเตือนเป็นหน้าย่อย

**Depends on:** Task 1

**Files:**
- Modify: `public/liff/index.html` (ย้าย `<section id="wallets">` และ `<section id="notify">` ออกจาก `#panel-profile`; เพิ่มแถวในกลุ่ม; panel ใหม่)
- Modify: `public/liff/app.mjs` (`els`, หน้าย่อย, เปิดปุ่มเมื่อมี api)
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `mePage`, `enterSubPage` จาก Task 1
- Produces: `#wallets-open`, `#notify-open` (แถวเมนู เริ่มต้น `disabled` เปิดเมื่อสร้าง api แล้ว), `#panel-wallets`, `#panel-notify`, `WALLETS_PAGE`, `NOTIFY_PAGE`

**LINE check:**

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ ฉัน | กลุ่มแรกมี "กระเป๋าเงิน" เหนือ "จัดการหมวดหมู่" กลุ่มสองมี "รายการประจำ" และ "การแจ้งเตือน" ด้านล่างไม่มีส่วนกระเป๋าและการแจ้งเตือนวางอยู่แล้ว |
| 2 | กด "กระเป๋าเงิน" | หน้ากระเป๋าเงินเปิด เห็นรายการกระเป๋า ยอด และช่องเพิ่มกระเป๋า เพิ่ม/เปลี่ยนชื่อ/ซ่อนได้เหมือนเดิม |
| 3 | ย้อนกลับ | กลับแท็บ ฉัน |
| 4 | กด "การแจ้งเตือน" | หน้าการแจ้งเตือนเปิด มีสวิตช์สรุปรายสัปดาห์และเตือนลืมจด สลับได้และข้อความผลขึ้นเหมือนเดิม |

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้ม**

ใน `describe('index.html static invariants', ...)` ต่อจากเทสต์ `points every menu row icon at a symbol...` เพิ่ม:

```js
  it('has disabled menu rows for the wallets and notification pages', () => {
    const wallets = doc.getElementById('wallets-open');
    const notify = doc.getElementById('notify-open');
    expect(wallets.hasAttribute('disabled')).toBe(true);
    expect(wallets.querySelector('.menu-row-title').textContent).toBe('กระเป๋าเงิน');
    expect(wallets.querySelector('.menu-row-sub').textContent).toBe('จัดการกระเป๋าและดูยอดแยก');
    expect(notify.hasAttribute('disabled')).toBe(true);
    expect(notify.querySelector('.menu-row-title').textContent).toBe('การแจ้งเตือน');
    expect(notify.querySelector('.menu-row-sub').textContent).toBe('สรุปรายสัปดาห์และเตือนลืมจด');
  });
```

แก้เทสต์เดิม (หาจากชื่อ):
1. `places the wallets section between the profile card and the notification section` (ลิสต์ `#panel-profile > section`) เปลี่ยนชื่อเป็น `leaves only the profile card and the friends section directly in the me tab panel` และ `expect(ids).toEqual(['profile-card', 'friends']);`
2. เทสต์ที่ยืนยัน `doc.getElementById('notify').closest('#panel-profile')` (static invariants, ใกล้บรรทัด 366) เปลี่ยนเป็น `.closest('#panel-notify')` ให้ตรงกับที่ย้ายไป
3. เทสต์ `puts the entry button right after the profile card and before the wallets section` เปลี่ยนชื่อเป็น `puts the menu groups right after the profile card` และบรรทัด `expect(byId('profile-card').nextElementSibling.nextElementSibling).toBe(byId('wallets'));` เปลี่ยนเป็น `expect(byId('profile-card').nextElementSibling.nextElementSibling).toBe(byId('friends'));`

เพิ่ม describe ใหม่ต่อจาก `describe('LIFF categories page opened from the me tab', ...)`:

```js
describe('LIFF wallets and notification pages under the me tab', () => {
  it.each([
    ['wallets-open', 'panel-wallets', 'wallets', 'กระเป๋าเงิน'],
    ['notify-open', 'panel-notify', 'notify', 'การแจ้งเตือน'],
  ])('opens %s as a page and goes back to the me tab', async (openId, panelId, sectionId, title) => {
    await boot();
    clickTab('profile');
    await settle();
    expect(byId(openId).disabled).toBe(false);

    byId(openId).click();

    expect(byId(panelId).hidden).toBe(false);
    expect(byId(panelId).contains(byId(sectionId))).toBe(true);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe(title);
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId(panelId).hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId(openId));
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "wallets and notification pages|menu rows for the wallets|leaves only the profile card|menu groups right after"`
Expected: FAIL (`byId('wallets-open')` เป็น `null`, รายการ `ids` ยังมี `wallets`/`notify`, `closest('#panel-notify')` เป็น `null`)

- [ ] **Step 3: ย้ายส่วนและเพิ่มแถวใน `index.html`**

ตัดบล็อก `<section id="wallets" ...>...</section>` (index.html บรรทัด 484-501 ที่ `69b82d7` ก่อนเพิ่มโค้ดของ Task 1) และ `<section id="notify" ...>...</section>` (บรรทัด 502-519) ออกจาก `#panel-profile` (เหลือ `<section id="friends">` อยู่ต่อ) แล้ววางเป็น panel ใหม่ ต่อจากปิด `</div>` ของ `#panel-profile` (ก่อน `</main>`) โดยคงเนื้อในของสองส่วนไว้ทุกตัวอักษร:

```html
    <div id="panel-wallets" class="panel" hidden>
      <!-- ย้ายบล็อก <section id="wallets" ...> ... </section> เดิมมาวางที่นี่ทั้งก้อน -->
    </div>
    <div id="panel-notify" class="panel" hidden>
      <!-- ย้ายบล็อก <section id="notify" ...> ... </section> เดิมมาวางที่นี่ทั้งก้อน -->
    </div>
```

(สองบรรทัดคอมเมนต์ในตัวอย่างคือตำแหน่งที่วางของเดิม ให้แทนด้วยบล็อกจริง ไม่ทิ้งคอมเมนต์ไว้ในไฟล์)

ในกลุ่มแรก ใส่แถวกระเป๋าเงินเป็นแถวแรกของ `<ul class="menu-list">` ในกลุ่ม `menu-data-title` (ก่อนแถว `me-categories-open`):

```html
            <li><button type="button" id="wallets-open" class="menu-row" disabled>
                <span class="menu-row-icon"><svg class="icon" aria-hidden="true" focusable="false">
                    <use href="#icon-wallet"></use>
                  </svg></span>
                <span class="menu-row-text"><span class="menu-row-title">กระเป๋าเงิน</span><span
                    class="menu-row-sub">จัดการกระเป๋าและดูยอดแยก</span></span>
                <svg class="icon menu-row-chevron" aria-hidden="true" focusable="false">
                  <use href="#icon-chevron"></use>
                </svg></button></li>
```

ในกลุ่มสอง ใส่แถวการแจ้งเตือนเป็นแถวสุดท้ายของ `<ul class="menu-list">` ในกลุ่ม `menu-auto-title` (ต่อจากแถว `recurring-open`):

```html
            <li><button type="button" id="notify-open" class="menu-row" disabled>
                <span class="menu-row-icon"><svg class="icon" aria-hidden="true" focusable="false">
                    <use href="#icon-bell"></use>
                  </svg></span>
                <span class="menu-row-text"><span class="menu-row-title">การแจ้งเตือน</span><span
                    class="menu-row-sub">สรุปรายสัปดาห์และเตือนลืมจด</span></span>
                <svg class="icon menu-row-chevron" aria-hidden="true" focusable="false">
                  <use href="#icon-chevron"></use>
                </svg></button></li>
```

- [ ] **Step 4: แก้ `app.mjs`**

ใน `const els = { ... }` ต่อจาก `meCategoriesOpen`:

```js
  walletsOpen: document.getElementById('wallets-open'),
  notifyOpen: document.getElementById('notify-open'),
```

ต่อจากบรรทัด `const RECURRING_PAGE = mePage(...)` และ listener ของ `recurringOpen`:

```js
const WALLETS_PAGE = mePage('panel-wallets', 'กระเป๋าเงิน', els.walletsOpen);
const NOTIFY_PAGE = mePage('panel-notify', 'การแจ้งเตือน', els.notifyOpen);

els.walletsOpen.addEventListener('click', () => enterSubPage(WALLETS_PAGE));
els.notifyOpen.addEventListener('click', () => enterSubPage(NOTIFY_PAGE));
```

ใน `boot()` ต่อจากบรรทัด `document.getElementById('bill-new').disabled = false;`:

```js
    // ส่วนเหล่านี้โหลดตอนเข้าแท็บ ฉัน ต้องมี api ก่อน ไม่งั้นเปิดมาเป็นหน้าว่าง
    for (const button of [els.walletsOpen, els.notifyOpen]) button.disabled = false;
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสองไฟล์ (เทสต์กระเป๋า/การแจ้งเตือนเดิมที่กดปุ่มในส่วนเหล่านั้นต้องผ่านโดยไม่แก้ เพราะ id เดิมทุกตัว)

Run: `grep -n "panel-profile\|'wallets'\|'notify'" public/liff/app.dom.test.mjs` และอ่านผลอีกรอบว่าไม่มีเทสต์อื่นที่อ้างตำแหน่งเดิมของส่วนที่ย้าย

Run: `npm run lint` และ `node --check public/liff/app.mjs`
Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add public/liff/index.html public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: open wallets and notification settings as pages from the me tab

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U4ZkrWzSDkVzuwonx7BGhW"
```

---

### Task 3: เพื่อนและหารบิลเป็นหน้าย่อย และลิงก์ชวนเพื่อนเปิดหน้านี้

**Depends on:** Task 2

ข้อเท็จจริงที่ใช้ (ตรวจแล้ว): ฟอร์มค้นหาเพื่อนและข้อความ error อยู่ใน `<section id="friends">` เอง (ไม่ใช่ dialog) มีแค่กล่องยืนยัน `#friend-dialog` เป็น modal ลิงก์ชวน `?friend=<รหัส>` จึงต้องเปิดหน้านี้ให้เห็น error ได้ `enterBillsPage()` ย้าย `#friends` ไปไว้ใน `#panel-bills` อยู่แล้ว (หน้าหารบิลแยก) ซึ่งไม่กระทบโครงใหม่ เทสต์ลิงก์ชวน 12 ตัวยืนยัน `aria-current` ของแท็บ (ตัว controller ยังเป็น profile) และกล่อง dialog จึงไม่ถูกกระทบ

**Files:**
- Modify: `public/liff/index.html` (ย้าย `<section id="friends">`; กลุ่มที่ 3; แถวเพื่อน)
- Modify: `public/liff/app.mjs` (`els`, `FRIENDS_PAGE`, `boot()`)
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `mePage`, `enterSubPage`
- Produces: `#friends-open`, `#panel-friends`, `FRIENDS_PAGE`, กลุ่มเมนู `menu-help-title`

**LINE check:**

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ ฉัน | มีกลุ่มที่ 3 "ความช่วยเหลือและการใช้งานร่วมกัน" มีแถว "เพื่อนและหารบิล" และไม่มีส่วนเพื่อนวางอยู่ด้านล่างแล้ว |
| 2 | กด "เพื่อนและหารบิล" | หน้าเพื่อนเปิด เห็นรหัสเพื่อน ปุ่มส่งลิงก์ ช่องเพิ่มเพื่อน ลิงก์ "ไปหารบิลกับเพื่อน" และรายชื่อ |
| 3 | ย้อนกลับ | กลับแท็บ ฉัน |
| 4 | เปิดลิงก์ชวนเพื่อนของคนอื่น (หรือรหัสตัวเองเพื่อดูข้อความ) | เปิดหน้า เพื่อนและหารบิล ทันทีและเห็นกล่องยืนยันหรือข้อความ error ในหน้านั้น (ข้อนี้ข้ามได้ถ้าไม่มีลิงก์) |

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้ม**

ใน `describe('index.html static invariants', ...)` ต่อจากเทสต์ของ Task 2:

```js
  it('has a disabled menu row for the friends page in the help group', () => {
    const friends = doc.getElementById('friends-open');
    expect(friends.hasAttribute('disabled')).toBe(true);
    expect(friends.closest('.menu-group').querySelector('h2').textContent).toBe('ความช่วยเหลือและการใช้งานร่วมกัน');
    expect(friends.querySelector('.menu-row-title').textContent).toBe('เพื่อนและหารบิล');
    expect(friends.querySelector('.menu-row-sub').textContent).toBe('จัดการเพื่อนและไปหารบิล');
  });
```

แก้เทสต์เดิม:
1. `leaves only the profile card and the friends section directly in the me tab panel` เปลี่ยนชื่อเป็น `leaves only the profile card directly in the me tab panel` และ `expect(ids).toEqual(['profile-card']);`
2. `puts the menu groups right after the profile card`: บรรทัด `...nextElementSibling.nextElementSibling).toBe(byId('friends'))` เปลี่ยนเป็น `expect(byId('profile-card').nextElementSibling.querySelector('.menu-group')).not.toBeNull();` (ห้ามเขียน `.nextElementSibling.nextElementSibling.tagName` เพราะหลังย้ายแล้วไม่มี element ถัดจาก `.menu-groups` ใน task นี้ จะเป็น `null` และ throw)
3. เทสต์ใน `describe('LIFF friends tab ...')`/ที่ยืนยัน `byId('panel-profile').contains(byId('friends'))` (ใกล้บรรทัด 472 ในเทสต์ `renders the five bottom tabs with the list tab selected`) เปลี่ยนเป็น `expect(byId('panel-friends').contains(byId('friends'))).toBe(true);`

เพิ่มต่อจาก describe ของ Task 2:

```js
describe('LIFF friends page under the me tab', () => {
  it('opens the friends section as a page and goes back to the me tab', async () => {
    await boot();
    clickTab('profile');
    await settle();
    expect(byId('friends-open').disabled).toBe(false);

    byId('friends-open').click();

    expect(byId('panel-friends').hidden).toBe(false);
    expect(byId('panel-friends').contains(byId('friends'))).toBe(true);
    expect(byId('page-title').textContent).toBe('เพื่อนและหารบิล');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId('panel-friends').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId('friends-open'));
  });

  it('shows the friends page itself when the app is opened from an invite link', async () => {
    await boot({ search: '?friend=wxyz-2345' });
    await settle();

    expect(byId('panel-friends').hidden).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('เพื่อนและหารบิล');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);

    byId('friend-dialog-cancel').click();
    byId('page-back').click();

    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
  });

  it('shows the friends page from the start for an invite link, before liff is ready', async () => {
    const liff = await boot({ search: '?friend=WXYZ2345', holdInit: true });

    expect(byId('panel-friends').hidden).toBe(false);
    expect(byId('panel-list').hidden).toBe(true);
    liff.releaseInit();
    await settle();
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "friends page|friends page under|directly in the me tab panel|menu groups right after|disabled menu row for the friends"`
Expected: FAIL (`byId('friends-open')` เป็น `null`, `byId('panel-friends')` เป็น `null`, รายการ `ids` ยังมี `friends`)

- [ ] **Step 3: ย้ายส่วนเพื่อนและเพิ่มกลุ่มใน `index.html`**

ตัดบล็อก `<section id="friends" ...>...</section>` ออกจาก `#panel-profile` แล้ววางเป็น panel ใหม่ ต่อจาก `#panel-notify` (เนื้อในคงเดิมทุกตัวอักษร ไม่ทิ้งคอมเมนต์):

```html
    <div id="panel-friends" class="panel" hidden>
      <!-- ย้ายบล็อก <section id="friends" ...> ... </section> เดิมมาวางที่นี่ทั้งก้อน -->
    </div>
```

ใน `.menu-groups` ต่อจากกลุ่ม `menu-auto-title` เพิ่มกลุ่มที่ 3 (Task 4 จะเติมแถววิธีใช้งานต่อท้ายลิสต์นี้):

```html
        <section class="menu-group" aria-labelledby="menu-help-title">
          <h2 id="menu-help-title">ความช่วยเหลือและการใช้งานร่วมกัน</h2>
          <ul class="menu-list">
            <li><button type="button" id="friends-open" class="menu-row" disabled>
                <span class="menu-row-icon"><svg class="icon" aria-hidden="true" focusable="false">
                    <use href="#icon-users"></use>
                  </svg></span>
                <span class="menu-row-text"><span class="menu-row-title">เพื่อนและหารบิล</span><span
                    class="menu-row-sub">จัดการเพื่อนและไปหารบิล</span></span>
                <svg class="icon menu-row-chevron" aria-hidden="true" focusable="false">
                  <use href="#icon-chevron"></use>
                </svg></button></li>
          </ul>
        </section>
```

- [ ] **Step 4: แก้ `app.mjs`**

ใน `const els = { ... }` ต่อจาก `notifyOpen`:

```js
  friendsOpen: document.getElementById('friends-open'),
```

ต่อจากบรรทัด `els.notifyOpen.addEventListener('click', ...)`:

```js
const FRIENDS_PAGE = mePage('panel-friends', 'เพื่อนและหารบิล', els.friendsOpen);

els.friendsOpen.addEventListener('click', () => enterSubPage(FRIENDS_PAGE));
```

ใน `boot()` เปลี่ยนบรรทัด

```js
  else if (parseFriendLink(window.location.search)) tabController.select('profile');
```

เป็น

```js
  else if (parseFriendLink(window.location.search)) {
    tabController.select('profile');
    // ฟอร์มค้นหาและข้อความ error ของลิงก์ชวนอยู่ในส่วนเพื่อน จึงเปิดหน้านี้เลย
    enterSubPage(FRIENDS_PAGE);
  }
```

และเปลี่ยนลูปที่เพิ่มใน Task 2 เป็น `for (const button of [els.walletsOpen, els.notifyOpen, els.friendsOpen]) button.disabled = false;`

ใน `boot()` บล็อก `if (friendCode) { tabController.select('profile'); friendsPanel.openAdd(friendCode); }` (ใกล้ลิงก์ชวน หลัง `loadAll` ไม่ใช่) ให้เพิ่มบรรทัดกันกรณีที่ parse ตอนต้นพลาดแต่ parse หลัง login สำเร็จ ต่อจาก `tabController.select('profile');`:

```js
      if (!activeSubPage) enterSubPage(FRIENDS_PAGE);
```

(ไม่งั้นกล่องยืนยันจะเด้งทับเมนู และข้อความ error ไปตกใน panel ที่ซ่อน)

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสองไฟล์ รวมเทสต์ลิงก์ชวนเดิมที่ไม่ได้แก้ (`opens the profile tab and asks to add the friend from an invite link`, `says it is my own code...`, `loads the profile once when opened from an invite link` ฯลฯ)

Run: `grep -n "panel-profile\|'wallets'\|'friends'\|'notify'" public/liff/app.dom.test.mjs` และอ่านผลอีกรอบว่าไม่มีเทสต์อื่นที่อ้างตำแหน่งเดิมของส่วนที่ย้าย

Run: `npm run lint` และ `node --check public/liff/app.mjs`
Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add public/liff/index.html public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: open the friends section as a page and show it for invite links

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U4ZkrWzSDkVzuwonx7BGhW"
```

---

### Task 4: วิธีใช้งานเป็นหน้าย่อย ปุ่มกลับไปแชตท้ายหน้า และเอกสาร

**Depends on:** Task 3

**Files:**
- Modify: `public/liff/index.html` (ย้าย `<section class="profile-tips">` ออกจาก `#profile-card`; ย้าย `#profile-close`; แถววิธีใช้งาน)
- Modify: `public/liff/style.css` (ระยะห่างของส่วนที่ย้ายออกจากการ์ด)
- Modify: `public/liff/app.mjs` (`els`, `TIPS_PAGE`)
- Modify: `README.md`, `SPEC.md`, `work-memory/STATE.md`
- Test: `public/liff/app.dom.test.mjs`, `public/liff/style.test.mjs`

**Interfaces:**
- Consumes: `mePage`, `enterSubPage`, กลุ่ม `menu-help-title` จาก Task 3
- Produces: `#tips-open` (ไม่ disabled เพราะไม่ใช้ข้อมูลจาก api), `#panel-tips`, `TIPS_PAGE`, `.profile-close-wrap`

**LINE check:**

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ ฉัน | กลุ่มที่ 3 มี "เพื่อนและหารบิล" และ "วิธีใช้งาน" การ์ดโปรไฟล์ไม่มีกล่อง "วิธีใช้บอท" ต่อท้ายแล้ว ปุ่ม "กลับไปแชต" อยู่ล่างสุดของหน้า (ในแอป LINE) |
| 2 | กด "วิธีใช้งาน" | หน้าวิธีใช้เปิด เห็นกล่อง "วิธีใช้บอท" 6 ข้อ |
| 3 | ย้อนกลับ แล้วกด "กลับไปแชต" | กลับแท็บ ฉัน และปุ่มกลับไปแชตปิดหน้าเว็บได้เหมือนเดิม |
| 4 | การ์ดโปรไฟล์ด้านบน | เหมือนก่อนแก้ทุกอย่าง (หัวน้ำเงิน ยอดสะสม 3 ช่องสถิติ) |

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้ม**

ใน `describe('index.html static invariants', ...)` ต่อจากเทสต์ของ Task 3:

```js
  it('has an enabled usage menu row and keeps the close button outside the profile card', () => {
    const tips = doc.getElementById('tips-open');
    expect(tips.hasAttribute('disabled')).toBe(false);
    expect(tips.querySelector('.menu-row-title').textContent).toBe('วิธีใช้งาน');
    expect(tips.querySelector('.menu-row-sub').textContent).toBe('วิธีใช้บอทและคำสั่งในแชต');
    expect(doc.getElementById('panel-tips').contains(doc.querySelector('.profile-tips'))).toBe(true);
    expect(doc.getElementById('profile-card').contains(doc.getElementById('profile-close'))).toBe(false);
    expect(doc.getElementById('panel-profile').contains(doc.getElementById('profile-close'))).toBe(true);
  });
```

เพิ่มต่อจาก describe ของ Task 3:

```js
describe('LIFF usage page under the me tab', () => {
  it('opens the usage tips as a page and goes back to the me tab', async () => {
    await boot();
    clickTab('profile');
    expect(byId('tips-open').disabled).toBe(false);

    byId('tips-open').click();

    expect(byId('panel-tips').hidden).toBe(false);
    expect(document.querySelectorAll('#panel-tips .profile-tips li')).toHaveLength(6);
    expect(byId('page-title').textContent).toBe('วิธีใช้งาน');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId('panel-tips').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('tips-open'));
  });

  it('keeps the profile card without the usage tips', async () => {
    await boot();
    clickTab('profile');

    expect(byId('profile-card').querySelector('.profile-tips')).toBeNull();
    expect(byId('profile-card').querySelector('.balance-card')).not.toBeNull();
    expect(byId('profile-card').querySelectorAll('.profile-stats .stat')).toHaveLength(3);
  });
});
```

ใน `public/liff/style.test.mjs` ต่อจากเทสต์ของ Task 1:

```js
  it('keeps the margins of the sections that moved out of the profile card', () => {
    expect(declarations('#panel-tips .profile-tips')).toMatch(/margin:\s*12px 16px 0/);
    expect(declarations('.profile-close-wrap')).toMatch(/margin:\s*0 16px/);
  });
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs -t "usage|usage menu row|moved out of the profile card"`
Expected: FAIL (`byId('tips-open')` เป็น `null`, `#panel-tips .profile-tips` ไม่มี, `declarations()` คืน `null`)

- [ ] **Step 3: แก้ `index.html`**

1. ตัด `<section class="profile-tips" aria-labelledby="tips-title">...</section>` (บรรทัด 464-474 ที่ `69b82d7`; เลขอาจเลื่อน ให้หาจากข้อความ) ออกจาก `#profile-card` แล้ววางเป็น panel ใหม่ต่อจาก `#panel-friends` (เนื้อในคงเดิมทุกตัวอักษร ไม่ทิ้งคอมเมนต์):

```html
    <div id="panel-tips" class="panel" hidden>
      <!-- ย้ายบล็อก <section class="profile-tips" aria-labelledby="tips-title"> ... </section> เดิมมาวางที่นี่ทั้งก้อน -->
    </div>
```

2. ตัด `<button type="button" id="profile-close" class="profile-close" hidden>กลับไปแชต</button>` ออกจาก `#profile-card` แล้ววางท้าย `#panel-profile` (ต่อจากปิด `</div>` ของ `.menu-groups`):

```html
      <div class="profile-close-wrap">
        <button type="button" id="profile-close" class="profile-close" hidden>กลับไปแชต</button>
      </div>
```

3. ต่อท้ายลิสต์ในกลุ่ม `menu-help-title` (ต่อจากแถว `friends-open`):

```html
            <li><button type="button" id="tips-open" class="menu-row">
                <span class="menu-row-icon"><svg class="icon" aria-hidden="true" focusable="false">
                    <use href="#icon-book"></use>
                  </svg></span>
                <span class="menu-row-text"><span class="menu-row-title">วิธีใช้งาน</span><span
                    class="menu-row-sub">วิธีใช้บอทและคำสั่งในแชต</span></span>
                <svg class="icon menu-row-chevron" aria-hidden="true" focusable="false">
                  <use href="#icon-chevron"></use>
                </svg></button></li>
```

- [ ] **Step 4: เพิ่ม CSS**

ใน `public/liff/style.css` ต่อจากบรรทัด `.profile-close, #profile-retry { ... }`:

```css
#panel-tips .profile-tips { margin: 12px 16px 0; }
.profile-close-wrap { margin: 0 16px; }
```

- [ ] **Step 5: แก้ `app.mjs`**

ใน `const els = { ... }` ต่อจาก `friendsOpen`:

```js
  tipsOpen: document.getElementById('tips-open'),
```

ต่อจาก `els.friendsOpen.addEventListener(...)`:

```js
const TIPS_PAGE = mePage('panel-tips', 'วิธีใช้งาน', els.tipsOpen);

els.tipsOpen.addEventListener('click', () => enterSubPage(TIPS_PAGE));
```

- [ ] **Step 6: แก้เอกสาร**

ใน `SPEC.md` อ่านบรรทัดที่ขึ้นต้น `- แท็บ: ` และบรรทัดที่อธิบายลำดับส่วนของแท็บ ฉัน (หาจากข้อความ `แท็บ ฉัน เรียง:`) แล้วแก้ให้ตรงกับโครงใหม่ ใช้ข้อความนี้แทนบรรทัดลำดับ: `แท็บ ฉัน: การ์ดโปรไฟล์ (ยอดสะสม = รายรับหักรายจ่ายทั้งหมด รายรับ/รายจ่ายสะสม จำนวนรายการ) ตามด้วยเมนู 3 กลุ่มที่แต่ละแถวเปิดเป็นหน้าย่อย: การจัดการข้อมูล (กระเป๋าเงิน, จัดการหมวดหมู่) / ระบบอัตโนมัติและการตั้งค่า (รายการประจำ, การแจ้งเตือน) / ความช่วยเหลือและการใช้งานร่วมกัน (เพื่อนและหารบิล, วิธีใช้งาน) และปุ่มกลับไปแชต` ห้ามลบข้อความอื่นในบรรทัดเดียวกันที่ไม่เกี่ยว (อ่านเต็มบรรทัดก่อนแก้)

ใน `README.md` แทนท้ายบรรทัด `เว็บ LIFF 5 แท็บ` ส่วนในวงเล็บของ ฉัน เป็น `ฉัน (การ์ดโปรไฟล์ และเมนูเข้ากระเป๋า หมวดหมู่ รายการประจำ การแจ้งเตือน เพื่อน วิธีใช้)` (อ่านเต็มบรรทัดก่อนแก้)

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 8: ตรวจทั้งโปรเจกต์**

Run: `npm test`
Expected: ผ่านทั้งหมด (ฐาน 2130 บวกเทสต์ใหม่สุทธิราว 15 ตัว ให้รายงานตัวเลขจริง)

Run: `npm run lint` และ `node --check index.js` และ `node --check public/liff/app.mjs`
Expected: ไม่มี error

Run: `grep -rn "categories-entry" public/liff/index.html`
Expected: เหลือเฉพาะบล็อกของแท็บ งบ (`#panel-budgets`)

- [ ] **Step 9: Commit และอัปเดต STATE**

```bash
git add public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/app.dom.test.mjs public/liff/style.test.mjs README.md SPEC.md
git commit -m "feat: open the usage tips as a page and finish the me tab menu

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U4ZkrWzSDkVzuwonx7BGhW"
```

แก้ `work-memory/STATE.md`: เพิ่มรายการใต้ Next ว่าแท็บ ฉัน แบบเมนูจัดกลุ่มเสร็จบน branch `feat/me-menu` (ยังไม่ merge/push) ผล `npm test` และ lint และรอผู้ใช้ทำ LINE check ของ Task 1-4 ตามแผน `docs/superpowers/plans/2026-10-20-me-tab-menu.md` ใส่ใน "รอผู้ใช้ทำ" เป็นข้อถัดไป รักษาขนาดไฟล์ไม่เกินประมาณ 60 บรรทัด แล้ว commit:

```bash
git add work-memory/STATE.md
git commit -m "docs: record the me tab menu progress in STATE

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U4ZkrWzSDkVzuwonx7BGhW"
```
