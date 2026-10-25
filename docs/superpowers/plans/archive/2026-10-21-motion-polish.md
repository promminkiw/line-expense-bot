# Motion Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม animation เบาๆ ให้ LIFF ตาม 10 ข้อที่ผู้ใช้เลือกจากหน้าเลือก (artifact https://claude.ai/artifact/KKySVN94Ezont31rQjqqEj) โดยไม่ทำให้ลายตา

**Architecture:** ส่วนใหญ่เป็น CSS ล้วนที่เล่นเองเมื่อ panel ถูกแสดง (`.panel:not([hidden])`) หรือ dialog เปิด; สองส่วนที่ต้องมี JS คือ ริบเปิลตอนกดปุ่มเหลือง (`ripple.mjs`) และเครื่องหมายถูกในข้อความสถานะ (`success-mark.mjs`); แถบสีหน้าสรุปใช้ `replayClass` ที่มีอยู่แล้ว

**Tech Stack:** CSS keyframes, ES modules, vitest + jsdom (เทสต์ CSS แบบอ่านไฟล์ด้วย `declarations()` ใน `style.test.mjs`)

## ที่ผู้ใช้เลือก

| # | หัวข้อ | แบบที่เลือก | ทำใน Task |
|---|---|---|---|
| 1 | สลับแท็บ | A จางเข้า เลื่อนขึ้นเบาๆ | ไม่ต้องทำ (ตรงกับ `panel-in` ที่มีอยู่) |
| 2 | แถบเมนูล่าง | A ไอคอนเด้งเล็กน้อย | 1 |
| 3 | รายการ | B เลื่อนเข้าจากขวา | 1 |
| 8 | แผ่นล่างและ dialog | B เด้งนุ่มตอนถึง | 1 |
| 5 | งบ | A แท่งเติม | 2 |
| 6 | ออม | A แท่งรวมเติม การ์ดตามมา | 2 |
| 7 | ฉัน | C รูปเด้ง แล้วเมนูตาม | 2 |
| 4 | สรุป | C แถบสีไหลเต็ม | 3 |
| 9 | ตอนกดปุ่ม | B ริบเปิลวงกว้าง เฉพาะปุ่มหลักสีเหลือง | 4 |
| 10 | บันทึกสำเร็จ | A เครื่องหมายถูกวาดเอง ที่ข้อความสถานะหลังบันทึกงบและบิล | 5 |

**ข้อควรแจ้งผู้ใช้ (ต่างจากตัวอย่างในหน้าเลือก):**
- ข้อ 5: หน้างานจริงใช้แท่ง **แนวตั้ง** (ส่วนต้องดูแล) กับแท่งแนวนอน (ส่วนปกติ) จึงให้แท่งตั้งโตจาก **ล่างขึ้นบน** และแท่งนอนโตจากซ้าย ตัวอย่างในหน้าเลือกวาดเป็นแท่งนอนล้วน
- ข้อ 8: กล่องยืนยันกลางจอ (`dialog.budget-confirm`) ใช้ซูมเด้งแทนการเลื่อนจากล่าง เพราะมันไม่ได้ติดขอบล่าง

## Global Constraints

- ทุก animation ต้องหยุดเมื่อผู้ใช้ตั้ง "ลดการเคลื่อนไหว": กฎเดิม `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }` ใน `style.css` ครอบ CSS ทั้งหมดอยู่แล้ว ห้ามลบ ส่วน JS ใหม่ต้องเช็ก `prefersReducedMotion` จาก `motion.mjs`
- ห้ามใช้สีตายตัว (hex/rgb) ใน `style.css` ใช้ token จาก `tokens.css` (`tokens.test.mjs` ตรวจอยู่) ใช้ `currentColor` ได้
- ความยาวแต่ละ animation 0.25-0.7 วินาที ห้ามวนซ้ำ (`infinite`)
- คอมเมนต์ภาษาไทยบรรทัดเดียวอธิบาย "ทำไม" ไม่ใช้ emoji; ชื่อตัวแปรและ log เป็นอังกฤษ
- เขียนเทสต์ก่อนโค้ด (CLAUDE.md ของโปรเจกต์) รัน `npm test` กับ `npm run lint` ก่อนบอกว่าเสร็จ
- ไม่แตะ logic ของแอปนอกจุดที่ระบุ; ถามผู้ใช้ก่อน commit (ผู้ใช้ไม่เคยอนุญาต commit ล่วงหน้า) และห้าม push เอง
- ทุก task แก้ `public/liff/style.css` ร่วมกัน จึงต้องทำตามลำดับ ห้ามขนาน

---

### Task 1: ไอคอนแท็บเด้ง, รายการเลื่อนจากขวา, dialog เด้งนุ่ม (CSS ล้วน)

**Depends on:** none

**Files:**
- Modify: `public/liff/style.css` (บรรทัด 181 กฎไอคอนแท็บ, 255 และ 260 กฎ `row-in`, เพิ่มกฎ dialog ต่อท้ายบล็อก motion ราวบรรทัด 260)
- Test: `public/liff/style.test.mjs`

**Interfaces:**
- Produces: keyframes `nav-bounce`, `sheet-spring`, `fade-in`, `pop-in` (Task 2-3 ใช้ `fade-in`)

**Browser check:**
- Preconditions: เซิร์ฟเวอร์ของโปรเจกต์ (ผู้ใช้เปิดเอง) แล้วเปิด `/liff/` ในเบราว์เซอร์หรือใน LINE โดย login แล้ว และมีรายการในเดือนนั้นอย่างน้อย 5 รายการ

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "งบ" ที่แถบล่าง | ไอคอนของแท็บ "งบ" เด้งขึ้นเล็กน้อยแล้วลงกลับภายในประมาณครึ่งวินาที ไม่มีแท็บอื่นเด้ง |
| 2 | แตะแท็บ "รายการ" | แถวรายการเลื่อนเข้าจากขอบขวาทีละแถว ไม่เกิดแถบเลื่อนแนวนอนของหน้า |
| 3 | แตะรายการแถวแรกเพื่อเปิดฟอร์มแก้ไข | แผ่นเลื่อนขึ้นจากล่างจอแล้วเลยนิดหนึ่งก่อนหยุด ฉากหลังค่อยๆ มืด |
| 4 | ปิดแผ่น (ปุ่ม X) | แผ่นปิดทันที ไม่มีอาการค้าง |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** เพิ่มท้าย `style.test.mjs`

```js
describe('style.css motion polish: nav, list and dialogs', () => {
  it('bounces the icon of the current tab', () => {
    expect(declarations('.nav-button[aria-current="page"] .icon')).toMatch(/animation:\s*nav-bounce/);
    expect(css).toContain('@keyframes nav-bounce');
  });

  it('slides list rows in from the right with a capped stagger', () => {
    expect(css).toMatch(/@keyframes row-in\s*\{\s*from\s*\{[^}]*translateX\(26px\)/);
    expect(declarations('.list.enter .row')).toMatch(/min\(var\(--i, 0\), 8\)/);
  });

  it('clips the list horizontally while rows slide in so the page cannot scroll sideways', () => {
    expect(declarations('.list.enter')).toMatch(/overflow-x:\s*clip/);
  });

  it('springs bottom dialogs in and fades the backdrop', () => {
    expect(declarations('dialog[open]')).toMatch(/animation:\s*sheet-spring/);
    expect(declarations('dialog[open]::backdrop')).toMatch(/animation:\s*fade-in/);
    expect(css).toContain('@keyframes sheet-spring');
  });

  it('pops the centered confirm dialog instead of sliding it from the bottom', () => {
    expect(declarations('dialog.budget-confirm[open]')).toMatch(/animation:\s*pop-in/);
    expect(css).toContain('@keyframes pop-in');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/style.test.mjs`
Expected: FAIL 5 ข้อใหม่ (ข้อความ `expected ... to match` / `to contain`)

- [ ] **Step 3: แก้ CSS**

3.1 ที่บรรทัด 181 เปลี่ยน

```css
.nav-button[aria-current="page"] .icon { fill: var(--brand-soft); stroke-width: 2.6; }
```
เป็น

```css
.nav-button[aria-current="page"] .icon { fill: var(--brand-soft); stroke-width: 2.6; animation: nav-bounce 0.4s ease-out; }
```

3.2 ที่บรรทัด 255 และ 260 เปลี่ยน

```css
.list.enter .row { animation: row-in 0.25s ease-out both; animation-delay: calc(var(--i, 0) * 25ms); }
```
เป็น (ตัดดีเลย์ที่ 8 แถวเพื่อไม่ให้รายการยาวรอนาน)

```css
.list.enter { overflow-x: clip; }
.list.enter .row { animation: row-in 0.28s ease-out both; animation-delay: calc(min(var(--i, 0), 8) * 45ms); }
```
และ `@keyframes row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }` เป็น

```css
@keyframes row-in { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
```
(อย่าแก้ `panel-in` ที่อยู่บรรทัด 259)

3.3 เพิ่มต่อจากบรรทัด `@keyframes row-in` (ก่อน `@media (prefers-reduced-motion: reduce) {` บรรทัด 261)

```css
/* แผ่นล่างเด้งเลยจุดหยุดนิดหนึ่ง ส่วนกล่องยืนยันกลางจอใช้ซูมแทนเพราะไม่ได้ติดขอบล่าง */
dialog[open] { animation: sheet-spring 0.48s cubic-bezier(0.34, 1.3, 0.64, 1); }
dialog[open]::backdrop { animation: fade-in 0.25s ease-out; }
dialog.budget-confirm[open] { animation: pop-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes nav-bounce { 0%, 100% { transform: none; } 45% { transform: translateY(-6px) scale(1.15); } }
@keyframes sheet-spring { from { transform: translateY(100%); } to { transform: none; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop-in { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run public/liff/style.test.mjs public/liff/tokens.test.mjs`
Expected: PASS ทั้งสองไฟล์ (ไม่มีสีตายตัวเพิ่ม)

- [ ] **Step 5: ตรวจว่าไม่มีเทสต์อื่นผูกกับ `row-in`/ดีเลย์เดิม**

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด

- [ ] **Step 6: Commit (ถามผู้ใช้ก่อน)** `git add public/liff/style.css public/liff/style.test.mjs` / `git commit -m "feat: add tab icon bounce, right-slide list rows and spring dialogs"`

---

### Task 2: แท่งงบ, หน้าออม, หน้า ฉัน (CSS เล่นตอน panel แสดง)

**Depends on:** Task 1 (ใช้ keyframes `fade-in`)

**Files:**
- Modify: `public/liff/style.css` (เพิ่มต่อจากบล็อกของ Task 1)
- Test: `public/liff/style.test.mjs`

**Interfaces:**
- Consumes: `fade-in`, `panel-in` (มีอยู่แล้ว)
- Produces: keyframes `grow-x`, `grow-y`, `avatar-pop`

**Browser check:**
- Preconditions: เหมือน Task 1 และมี: หมวดที่ตั้งงบอย่างน้อย 2 หมวด (หมวดเกินงบ 1), เป้าออม 2 เป้าขึ้นไป

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "งบ" | แท่งตั้งในส่วน "ต้องดูแล" โตจากล่างขึ้นบน ส่วนสีแดงเหนือเส้นโผล่ตามหลัง แท่งนอนในส่วน "ปกติ" โตจากซ้าย |
| 2 | แตะแท็บ "ออม" | แท่งขาวในการ์ดน้ำเงินด้านบนเติมจากซ้าย แล้วการ์ดเป้าขึ้นมาทีละใบ แท่งในการ์ดเติมตาม |
| 3 | แตะแท็บ "ฉัน" | รูปโปรไฟล์เด้งเข้า ชื่อจางเข้า แล้วการ์ดยอด และกลุ่มเมนูจางเข้าไล่ลงมา |
| 4 | สลับไปแท็บอื่นแล้วกลับมาแท็บ "งบ" | เล่นอีกครั้ง ไม่ค้างกลางทาง |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** เพิ่มท้าย `style.test.mjs`

```js
describe('style.css motion polish: budgets, goals and profile', () => {
  it('grows budget bars from the bottom and calm bars from the left when the panel shows', () => {
    expect(declarations('.panel:not([hidden]) .budget-bar-fill')).toMatch(/transform-origin:\s*bottom;[^}]*animation:\s*grow-y/);
    expect(declarations('.panel:not([hidden]) .budget-calm-fill')).toMatch(/transform-origin:\s*left;[^}]*animation:\s*grow-x/);
    expect(declarations('.panel:not([hidden]) .budget-bar-over')).toMatch(/animation:\s*fade-in/);
    expect(css).toContain('@keyframes grow-x');
    expect(css).toContain('@keyframes grow-y');
  });

  it('fills the goals hero bar first and brings the goal cards in after it', () => {
    expect(declarations('.panel:not([hidden]) .goals-hero-fill')).toMatch(/animation:\s*grow-x/);
    expect(declarations('.panel:not([hidden]) .goal-row')).toMatch(/animation:\s*panel-in[^;]*backwards/);
    expect(declarations('.panel:not([hidden]) .goal-row:nth-child(2)')).toMatch(/animation-delay:/);
    expect(declarations('.panel:not([hidden]) .goal-fill')).toMatch(/animation:\s*grow-x/);
  });

  it('pops the profile avatar and then fades the cards and menu groups in', () => {
    expect(declarations('.panel:not([hidden]) .profile-avatar')).toMatch(/animation:\s*avatar-pop/);
    expect(declarations('.panel:not([hidden]) .profile-name, .panel:not([hidden]) .profile-since')).toMatch(/animation:\s*fade-in/);
    expect(declarations('.panel:not([hidden]) .balance-card, .panel:not([hidden]) .profile-stats')).toMatch(/animation:\s*fade-in/);
    expect(declarations('.panel:not([hidden]) .menu-group')).toMatch(/animation:\s*fade-in/);
    expect(css).toContain('@keyframes avatar-pop');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/style.test.mjs`
Expected: FAIL 3 ข้อใหม่

- [ ] **Step 3: เพิ่ม CSS** ต่อจากบล็อกของ Task 1 (ก่อน `@media (prefers-reduced-motion: reduce) {`)

```css
/* animation ของลูกเริ่มเมื่อ panel เปลี่ยนจาก hidden เป็นแสดง จึงเล่นทุกครั้งที่เข้าแท็บโดยไม่ต้องใช้ JS */
.panel:not([hidden]) .budget-bar-fill { transform-origin: bottom; animation: grow-y 0.6s ease-out; }
.panel:not([hidden]) .budget-bar-over { animation: fade-in 0.3s ease-out 0.5s backwards; }
.panel:not([hidden]) .budget-calm-fill { transform-origin: left; animation: grow-x 0.6s ease-out; }
.panel:not([hidden]) .goals-hero-fill { transform-origin: left; animation: grow-x 0.7s ease-out; }
.panel:not([hidden]) .goal-row { animation: panel-in 0.28s ease-out 0.25s backwards; }
.panel:not([hidden]) .goal-row:nth-child(2) { animation-delay: 0.37s; }
.panel:not([hidden]) .goal-row:nth-child(3) { animation-delay: 0.49s; }
.panel:not([hidden]) .goal-row:nth-child(n+4) { animation-delay: 0.61s; }
.panel:not([hidden]) .goal-fill { transform-origin: left; animation: grow-x 0.6s ease-out 0.35s backwards; }
.panel:not([hidden]) .profile-avatar { animation: avatar-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }
.panel:not([hidden]) .profile-name, .panel:not([hidden]) .profile-since { animation: fade-in 0.25s ease-out 0.15s backwards; }
.panel:not([hidden]) .balance-card, .panel:not([hidden]) .profile-stats { animation: fade-in 0.3s ease-out 0.25s backwards; }
.panel:not([hidden]) .menu-group { animation: fade-in 0.3s ease-out 0.35s backwards; }
.panel:not([hidden]) .menu-group:nth-child(2) { animation-delay: 0.47s; }
.panel:not([hidden]) .menu-group:nth-child(3) { animation-delay: 0.59s; }
@keyframes grow-x { from { transform: scaleX(0); } to { transform: none; } }
@keyframes grow-y { from { transform: scaleY(0); } to { transform: none; } }
@keyframes avatar-pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run public/liff/style.test.mjs public/liff/tokens.test.mjs`
Expected: PASS

- [ ] **Step 5: ตรวจว่าแท่งงบไม่ถูกบีบด้วยกฎอื่น** อ่าน `style.css` ช่วง `.budget-bar-fill` (บรรทัด ~584) ยืนยันว่า `.budget-bar-fill` ไม่มี `transform` อื่นของตัวเอง (ถ้ามี ให้รวมเป็นที่เดียวแล้วบอกผู้ใช้)

Run: `grep -n "budget-bar-fill\|budget-calm-fill\|goal-fill\|goals-hero-fill" public/liff/style.css`
Expected: ไม่มีบรรทัดไหนตั้ง `transform:` ให้ตัวเหล่านี้นอกจากที่เพิ่ม

- [ ] **Step 6: รันเทสต์ทั้ง liff**

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด

- [ ] **Step 7: Commit (ถามผู้ใช้ก่อน)** `git commit -m "feat: grow budget and goal bars and stagger the profile tab on show"`

---

### Task 3: แถบสีหน้าสรุปไหลเต็ม

**Depends on:** Task 2

**Files:**
- Modify: `public/liff/style.css` (ต่อจาก `.chart-stack span` บรรทัด 51 หรือท้ายบล็อก motion)
- Modify: `public/liff/app.mjs` (ฟังก์ชันวาดกราฟ บรรทัด ~878 และ `onChange` ของ tab controller บรรทัด ~1711)
- Test: `public/liff/style.test.mjs`, `public/liff/app.core.dom.test.mjs`

**Interfaces:**
- Consumes: `replayClass(el, className)` จาก `motion.mjs` (import อยู่ที่ `app.mjs:46` แล้ว)
- Produces: class `sweep` บน `#chart-stack`

**Browser check:**
- Preconditions: เหมือน Task 1 และเดือนที่เลือกมีรายจ่ายหลายหมวด

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "สรุป" | แถบสีรวมหลายสีใต้หัวข้อ "สรุปตามหมวด" ไหลจากซ้ายไปขวาจนเต็มในประมาณ 0.8 วินาที ส่วนแท่งรายหมวดด้านล่างโตตามเดิม |
| 2 | กด "รายรับ" แล้วกลับ "รายจ่าย" | แถบสีไหลซ้ำทุกครั้งที่สลับ |
| 3 | เปลี่ยนเป็นเดือนที่ไม่มีรายการ | ไม่มีแถบค้าง ขึ้นข้อความว่างตามปกติ |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม (CSS)** เพิ่มท้าย `style.test.mjs`

```js
describe('style.css motion polish: summary stack', () => {
  it('sweeps the stacked bar from the left', () => {
    expect(declarations('.chart-stack.sweep')).toMatch(/animation:\s*stack-sweep/);
    expect(css).toMatch(/@keyframes stack-sweep\s*\{\s*from\s*\{\s*clip-path:\s*inset\(0 100% 0 0\)/);
  });
});
```

- [ ] **Step 2: เขียนเทสต์ที่ล้ม (DOM)** เพิ่ม `describe` ใหม่ท้าย `public/liff/app.core.dom.test.mjs` (ตรวจว่า import `boot, byId, clickTab, settle` จาก `./dom-harness.mjs` อยู่แล้ว ถ้าไม่มีให้เพิ่ม)

```js
describe('LIFF summary stacked bar motion', () => {
  it('replays the sweep class when the summary tab opens', async () => {
    await boot();
    clickTab('summary');
    await settle();

    expect(byId('chart-stack').classList.contains('sweep')).toBe(true);
  });

  it('replays the sweep class when the chart type changes', async () => {
    await boot();
    clickTab('summary');
    await settle();
    byId('chart-stack').classList.remove('sweep');
    document.querySelector('#chart .tabs button[data-type="income"]').click();
    await settle();

    expect(byId('chart-stack').classList.contains('sweep')).toBe(true);
  });
});
```

- [ ] **Step 3: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/style.test.mjs public/liff/app.core.dom.test.mjs`
Expected: FAIL 3 ข้อใหม่ (ไม่มี class `sweep`, ไม่มีกฎ)

- [ ] **Step 4: เพิ่ม CSS** ต่อจากบล็อก Task 2 (ก่อน `@media (prefers-reduced-motion: reduce) {`)

```css
.chart-stack.sweep { animation: stack-sweep 0.8s ease-out; }
@keyframes stack-sweep { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
```

- [ ] **Step 5: แก้ `app.mjs`**

5.1 บรรทัด ~878 เปลี่ยน

```js
  if (animate && !els.panelSummary.hidden) playBars(window, els.chartRows);
```
เป็น

```js
  if (animate && !els.panelSummary.hidden) {
    playBars(window, els.chartRows);
    replayClass(els.chartStack, 'sweep');
  }
```

5.2 บรรทัด ~1711 ใน `onChange` เปลี่ยน

```js
    if (id === 'summary') {
      playBars(window, els.chartRows);
      playBars(window, els.trendBars);
    }
```
เป็น

```js
    if (id === 'summary') {
      playBars(window, els.chartRows);
      playBars(window, els.trendBars);
      replayClass(els.chartStack, 'sweep');
    }
```

- [ ] **Step 6: รันให้ผ่าน**

Run: `npx vitest run public/liff/style.test.mjs public/liff/app.core.dom.test.mjs`
Expected: PASS ถ้าข้อ "chart type changes" ล้ม ให้ตรวจว่า caller ของฟังก์ชันวาดกราฟตอนสลับประเภทส่ง `animate` เป็น true หรือไม่ (`grep -n "renderChart\|function render.*Chart" public/liff/app.mjs`) แล้วปรับเทสต์ให้ตรงกับพฤติกรรมจริงของ `playBars` ที่ผูกอยู่กับ `animate` เดียวกัน ห้ามเปลี่ยน `animate` ของส่วนอื่น

- [ ] **Step 7: Commit (ถามผู้ใช้ก่อน)** `git commit -m "feat: sweep the summary stacked bar when the chart shows"`

---

### Task 4: ริบเปิลบนปุ่มหลักสีเหลือง

**Depends on:** Task 3

**Files:**
- Create: `public/liff/ripple.mjs`
- Test: `public/liff/ripple.test.mjs` (Create)
- Modify: `public/liff/style.css` (ต่อท้ายบล็อก motion)
- Modify: `public/liff/app.mjs` (import และเรียก `installRipple(document)` ใกล้ import/ส่วน init ของ `motion.mjs`)
- Test: `public/liff/style.test.mjs`

**Interfaces:**
- Produces: `export const RIPPLE_SELECTOR` (string), `export function installRipple(doc)` ผูก listener `pointerdown` ที่ `doc` ครั้งเดียว

ปุ่มหลักสีเหลืองในโค้ดตอนนี้คือ `.actions .primary, .bill-new, #friend-add-submit, #friend-share, .bill-actions .bill-confirm, #bill-form-submit` (ตรงกับกฎ `background: var(--cta)` ใน `style.css`)

**Browser check:**
- Preconditions: เหมือน Task 1 และมีเพื่อนหรือบิลให้เปิดหน้าบิลได้

| # | Action | Expected |
|---|---|---|
| 1 | เปิดฟอร์มแก้รายการแล้วกดปุ่มเหลือง "บันทึก" ค้างที่ขอบซ้ายของปุ่ม | วงกลมจางขยายออกจากจุดที่แตะและหายไปภายในราว 0.65 วินาที ไม่ล้นขอบปุ่ม |
| 2 | กดปุ่ม "ยกเลิก" (ปุ่มรอง) | ไม่มีริบเปิล |
| 3 | เปิดฟอร์มที่ปุ่มบันทึกถูกปิด (disabled) แล้วแตะ | ไม่มีริบเปิล |
| 4 | กด Enter บนปุ่มเหลืองด้วยคีย์บอร์ด | ไม่มีริบเปิล (ยอมรับได้ เพราะไม่มีจุดแตะ) |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** สร้าง `public/liff/ripple.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installRipple } from './ripple.mjs';

function press(target, x = 30, y = 10) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
}

describe('installRipple', () => {
  let primary;
  let secondary;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="actions">
        <button type="button" id="secondary">ยกเลิก</button>
        <button type="submit" class="primary" id="primary">บันทึก</button>
      </div>`;
    primary = document.getElementById('primary');
    secondary = document.getElementById('secondary');
    installRipple(document);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.matchMedia;
  });

  it('adds a ripple at the pointer position of a primary button and removes it afterwards', () => {
    press(primary, 30, 10);

    const ripple = primary.querySelector('.ripple');
    expect(ripple).not.toBeNull();
    expect(ripple.style.left).toBe('30px');
    expect(ripple.style.top).toBe('10px');

    vi.advanceTimersByTime(700);
    expect(primary.querySelector('.ripple')).toBeNull();
  });

  it('ignores secondary buttons', () => {
    press(secondary);
    expect(secondary.querySelector('.ripple')).toBeNull();
  });

  it('ignores a disabled primary button', () => {
    primary.disabled = true;
    press(primary);
    expect(primary.querySelector('.ripple')).toBeNull();
  });

  it('adds nothing when the user prefers reduced motion', () => {
    window.matchMedia = () => ({ matches: true });
    press(primary);
    expect(primary.querySelector('.ripple')).toBeNull();
  });
});
```

- [ ] **Step 2: เขียนเทสต์ที่ล้ม (CSS)** เพิ่มท้าย `style.test.mjs`

```js
describe('style.css motion polish: ripple', () => {
  it('clips the ripple to the yellow primary buttons', () => {
    expect(declarations('.actions .primary, .bill-new, #friend-add-submit, #friend-share, .bill-actions .bill-confirm, #bill-form-submit')).toMatch(/overflow:\s*hidden/);
  });

  it('expands the ripple from the pointer and fades it using the button text color', () => {
    const rule = declarations('.ripple');
    expect(rule).toMatch(/border-radius:\s*50%/);
    expect(rule).toMatch(/background:\s*currentColor/);
    expect(rule).toMatch(/animation:\s*ripple-out/);
    expect(css).toContain('@keyframes ripple-out');
  });
});
```

- [ ] **Step 3: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/ripple.test.mjs public/liff/style.test.mjs`
Expected: FAIL (ไม่พบ `./ripple.mjs`, ไม่มีกฎ CSS)

- [ ] **Step 4: เขียน `public/liff/ripple.mjs`**

```js
import { prefersReducedMotion } from './motion.mjs';

// ตรงกับปุ่มหลักสีเหลือง (--cta) ใน style.css
export const RIPPLE_SELECTOR = '.actions .primary, .bill-new, #friend-add-submit, #friend-share, .bill-actions .bill-confirm, #bill-form-submit';
const RIPPLE_MS = 650;

// ผูกที่ document ครั้งเดียว เพราะปุ่มถูกสร้างและแทนที่บ่อย
export function installRipple(doc) {
  doc.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.(RIPPLE_SELECTOR);
    if (!button || button.disabled || prefersReducedMotion(doc.defaultView)) return;
    const rect = button.getBoundingClientRect();
    // วงใหญ่กว่าปุ่มสองเท่าเพื่อให้คลุมปุ่มทั้งปุ่มแม้แตะที่มุม
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = doc.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);
    // ลบด้วย timer เพราะผู้ใช้ที่ลดการเคลื่อนไหวจะไม่มี animationend
    setTimeout(() => ripple.remove(), RIPPLE_MS + 50);
  });
}
```

- [ ] **Step 5: เพิ่ม CSS** ต่อท้ายบล็อก motion (ก่อน `@media (prefers-reduced-motion: reduce) {`)

```css
/* วงริบเปิลใช้สีตัวอักษรของปุ่ม จึงไม่ต้องมีสีตายตัวและเข้ากับทั้งสองธีม */
.actions .primary, .bill-new, #friend-add-submit, #friend-share, .bill-actions .bill-confirm, #bill-form-submit { overflow: hidden; }
.ripple { position: absolute; border-radius: 50%; background: currentColor; pointer-events: none; transform: scale(0); animation: ripple-out 0.65s ease-out forwards; }
@keyframes ripple-out { from { transform: scale(0); opacity: 0.25; } to { transform: scale(1); opacity: 0; } }
```

- [ ] **Step 6: ผูกใน `app.mjs`** เพิ่ม import ต่อจากบรรทัด 46

```js
import { installRipple } from './ripple.mjs';
```
และเรียกใช้ในส่วนที่ผูก event ระดับ document ตอนเริ่มต้น (ใกล้บรรทัด `els.bannerRetry.addEventListener('click'` ราว 1616)

```js
installRipple(document);
```

- [ ] **Step 7: รันให้ผ่าน**

Run: `npx vitest run public/liff/ripple.test.mjs public/liff/style.test.mjs public/liff/tokens.test.mjs`
Expected: PASS

- [ ] **Step 8: รันเทสต์ DOM ทุกไฟล์ที่กดปุ่ม** ยืนยันว่าไม่มีเทสต์ที่นับ children ของปุ่มแล้วพัง

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit (ถามผู้ใช้ก่อน)** `git add public/liff/ripple.mjs public/liff/ripple.test.mjs public/liff/style.css public/liff/style.test.mjs public/liff/app.mjs` / `git commit -m "feat: add a ripple to the yellow primary buttons"`

---

### Task 5: เครื่องหมายถูกที่ข้อความสถานะหลังบันทึกงบและบิล

**Depends on:** Task 4

**Files:**
- Create: `public/liff/success-mark.mjs`
- Test: `public/liff/success-mark.test.mjs` (Create)
- Modify: `public/liff/budgets-all-panel.mjs:128` (เพิ่ม `setSuccess`)
- Modify: `public/liff/app.mjs` (บรรทัด ~1847 `onDone`)
- Modify: `public/liff/bills-panel.mjs` (เพิ่ม `setSuccess` ข้างๆ `setStatus` บรรทัด 52, ใช้ที่บรรทัด ~341 และ ~389)
- Modify: `public/liff/style.css`
- Test: `public/liff/style.test.mjs`, เทสต์ DOM ที่ตรวจข้อความ `บันทึกงบแล้ว` (ค้นหาด้วย grep ใน Step 1)

**Interfaces:**
- Produces: `export function setSuccessStatus(el, text)` วาง `<svg class="success-mark">` ตามด้วยข้อความใน `el` (`el.textContent` ต้องเท่ากับ `text` เป๊ะ เพื่อไม่ให้เทสต์เดิมที่เทียบข้อความพัง); `text` ว่างให้ล้างเนื้อหาไม่ใส่ svg
- Produces: `budgetsAllPanel.setSuccess(text)` และ `setSuccess(text)` ภายใน `bills-panel.mjs`

**Browser check:**
- Preconditions: เหมือน Task 1 และมีหมวดที่ตั้งงบอย่างน้อย 2 หมวด, มีบิลที่รอเรายืนยัน 1 ใบ (หรือใช้บัญชีเพื่อนสร้างบิลให้)

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ "งบ" > "ดูทั้งหมด" > "แก้งบหลายหมวดพร้อมกัน" แก้ 1 หมวดแล้วกด "บันทึกทั้งหมด" | กลับหน้าดูทั้งหมดและเห็นข้อความ "บันทึกงบแล้ว 1 หมวด" มีวงกลมเขียวเด้งและเครื่องหมายถูกถูกวาดนำหน้าข้อความ |
| 2 | หน้าบิล กด "ยืนยัน" ที่บิลที่รอยืนยัน | ข้อความ "ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ" มีเครื่องหมายถูกนำหน้า |
| 3 | หน้าบิล กด "ปฏิเสธ" ที่บิลอีกใบ | ข้อความ "ปฏิเสธบิลนี้แล้ว" เป็นข้อความธรรมดา ไม่มีเครื่องหมายถูก |

- [ ] **Step 1: หาเทสต์เดิมที่ตรวจข้อความสถานะ**

Run: `grep -rn "บันทึกงบแล้ว\|ยืนยันแล้ว บันทึกเป็นรายจ่าย\|ส่งลิงก์บิลแล้ว" public/liff/*.test.mjs`
Expected: แสดงเทสต์ที่เทียบ `textContent` ของ `#budget-all-status` และ `#bills-status` จดชื่อไฟล์ไว้ใช้ใน Step 7

- [ ] **Step 2: เขียนเทสต์ที่ล้ม** สร้าง `public/liff/success-mark.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setSuccessStatus } from './success-mark.mjs';

describe('setSuccessStatus', () => {
  let el;

  beforeEach(() => {
    document.body.innerHTML = '<p id="status"></p>';
    el = document.getElementById('status');
  });

  it('puts a check mark before the text and keeps textContent equal to the text', () => {
    setSuccessStatus(el, 'บันทึกงบแล้ว 2 หมวด');

    expect(el.textContent).toBe('บันทึกงบแล้ว 2 หมวด');
    expect(el.querySelector('svg.success-mark')).not.toBeNull();
    expect(el.firstElementChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a single mark when called twice', () => {
    setSuccessStatus(el, 'ครั้งแรก');
    setSuccessStatus(el, 'ครั้งที่สอง');

    expect(el.querySelectorAll('svg.success-mark')).toHaveLength(1);
    expect(el.textContent).toBe('ครั้งที่สอง');
  });

  it('clears the element without a mark when the text is empty', () => {
    setSuccessStatus(el, 'บันทึกแล้ว');
    setSuccessStatus(el, '');

    expect(el.textContent).toBe('');
    expect(el.querySelector('svg')).toBeNull();
  });
});
```

- [ ] **Step 3: เขียนเทสต์ที่ล้ม (CSS)** เพิ่มท้าย `style.test.mjs`

```js
describe('style.css motion polish: success mark', () => {
  it('pops the circle and draws the check stroke', () => {
    expect(declarations('.success-mark circle')).toMatch(/animation:\s*mark-pop/);
    expect(declarations('.success-mark path')).toMatch(/stroke-dasharray:\s*1/);
    expect(declarations('.success-mark path')).toMatch(/animation:\s*mark-draw/);
    expect(css).toContain('@keyframes mark-pop');
    expect(css).toContain('@keyframes mark-draw');
  });
});
```

- [ ] **Step 4: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/success-mark.test.mjs public/liff/style.test.mjs`
Expected: FAIL (ไม่พบ `./success-mark.mjs`, ไม่มีกฎ CSS)

- [ ] **Step 5: เขียน `public/liff/success-mark.mjs`**

```js
const SVG_NS = 'http://www.w3.org/2000/svg';

// svg ไม่มีข้อความ el.textContent จึงยังเท่ากับ text ตามเดิม
export function setSuccessStatus(el, text) {
  el.replaceChildren();
  if (!text) return;
  const doc = el.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'success-mark');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const circle = doc.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '11');
  const check = doc.createElementNS(SVG_NS, 'path');
  check.setAttribute('d', 'M6.5 12.5l3.6 3.6 7.4-8');
  // pathLength=1 ทำให้ stroke-dasharray ใน CSS ใช้ได้โดยไม่ต้องวัดความยาวเส้น
  check.setAttribute('pathLength', '1');
  svg.append(circle, check);
  el.append(svg, doc.createTextNode(text));
}
```

- [ ] **Step 6: เพิ่ม CSS** ต่อท้ายบล็อก motion (ก่อน `@media (prefers-reduced-motion: reduce) {`)

```css
/* เส้นถูกวาดด้วย dash และใช้สี --surface เพื่อให้อ่านชัดบนวงเขียวทั้งสองธีม */
.success-mark { width: 1.2em; height: 1.2em; margin-right: 6px; vertical-align: -0.2em; }
.success-mark circle { fill: var(--income); transform-box: fill-box; transform-origin: center; animation: mark-pop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1); }
.success-mark path { fill: none; stroke: var(--surface); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; animation: mark-draw 0.38s ease-out 0.2s backwards; }
@keyframes mark-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: none; } }
@keyframes mark-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
```

- [ ] **Step 7: ผูกใช้งาน**

7.1 `budgets-all-panel.mjs` บรรทัด 128 เปลี่ยน

```js
  return { setBudgets, show, setStatus: (text) => { els.status.textContent = text; } };
```
เป็น

```js
  return {
    setBudgets,
    show,
    setStatus: (text) => { els.status.textContent = text; },
    setSuccess: (text) => setSuccessStatus(els.status, text),
  };
```
และเพิ่ม `import { setSuccessStatus } from './success-mark.mjs';` ท้ายกลุ่ม import ของไฟล์

7.2 `app.mjs` ใน `onDone` เปลี่ยน `budgetsAllPanel.setStatus(\`บันทึกงบแล้ว ${savedCount} หมวด\`);` เป็น `budgetsAllPanel.setSuccess(\`บันทึกงบแล้ว ${savedCount} หมวด\`);`

7.3 `bills-panel.mjs` เพิ่มต่อจากฟังก์ชัน `setStatus` (บรรทัด ~52-55) โดยใช้การ scroll แบบเดียวกัน

```js
  function setSuccess(text) {
    setSuccessStatus(els.status, text);
    if (text && typeof els.status.scrollIntoView === 'function') els.status.scrollIntoView({ block: 'nearest' });
  }
```
เพิ่ม `import { setSuccessStatus } from './success-mark.mjs';` ท้ายกลุ่ม import

7.4 `bills-panel.mjs` บรรทัด ~340-341 เปลี่ยน

```js
    if (earlier) setStatus(earlier);
    else setStatus(answer === 'confirm' ? 'ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ' : 'ปฏิเสธบิลนี้แล้ว');
```
เป็น

```js
    // เครื่องหมายถูกเฉพาะตอนเพิ่งยืนยันสำเร็จ ส่วนข้อความตอบซ้ำหรือปฏิเสธเป็นข้อความธรรมดา
    if (earlier) setStatus(earlier);
    else if (answer === 'confirm') setSuccess('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
    else setStatus('ปฏิเสธบิลนี้แล้ว');
```

7.5 `bills-panel.mjs` บรรทัด ~389 เปลี่ยน `if (result) setStatus('ส่งลิงก์บิลแล้ว');` เป็น `if (result) setSuccess('ส่งลิงก์บิลแล้ว');`

- [ ] **Step 8: เพิ่ม assertion ในเทสต์เดิมที่ได้จาก Step 1** ในเทสต์ที่ยืนยันข้อความ `บันทึกงบแล้ว N หมวด` เพิ่มบรรทัด

```js
expect(byId('budget-all-status').querySelector('.success-mark')).not.toBeNull();
```
และในเทสต์ที่ยืนยันข้อความ `ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ` เพิ่ม `expect(byId('bills-status').querySelector('.success-mark')).not.toBeNull();` (ตรวจ id ของ element สถานะบิลจาก `index.html` ก่อน: `grep -n "bills-status" public/liff/index.html`) และในเทสต์ที่ยืนยัน `ปฏิเสธบิลนี้แล้ว` เพิ่ม `expect(...querySelector('.success-mark')).toBeNull();`

- [ ] **Step 9: รันให้ผ่าน**

Run: `npx vitest run public/liff/success-mark.test.mjs public/liff/style.test.mjs public/liff/tokens.test.mjs`
Expected: PASS

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด

- [ ] **Step 10: Commit (ถามผู้ใช้ก่อน)** `git commit -m "feat: draw a check mark on budget and bill success messages"`

---

### Task 6: ตรวจรวมและส่งมอบ

**Depends on:** Task 5

**Files:**
- Modify: `work-memory/STATE.md`
- Modify: `work-memory/LEARNED.md` (หัวข้อ LINE และ LIFF หรือ การออกแบบ เพิ่ม 1 บรรทัดถ้ามีข้อค้นพบ เช่นเรื่อง `overflow-x: clip`)

- [ ] **Step 1: รันทั้งโปรเจกต์ที่ heap ปกติ**

Run: `npm test 2>&1 | tail -8` และ `npm run lint`
Expected: ผ่านทั้งหมด ไม่มี `heap out of memory`; จดจำนวนเทสต์

- [ ] **Step 2: เช็กลดการเคลื่อนไหว** เปิด `/liff/` ใน Chrome > DevTools > Rendering > "Emulate CSS media feature prefers-reduced-motion: reduce" แล้วไล่แตะทุกแท็บ เปิดแผ่นแก้รายการ กดปุ่มเหลือง
Expected: ไม่มี animation ใดเล่น ไม่มีวงริบเปิลค้างบนปุ่ม

- [ ] **Step 3: เช็กธีมมืด** สลับธีมมืด (DevTools emulate `prefers-color-scheme: dark`) แล้วทำซ้ำเฉพาะ Browser check ของ Task 5
Expected: เครื่องหมายถูกขาว/ดำอ่านชัดบนวงเขียว ริบเปิลเห็นเป็นสีเข้มจางบนปุ่มเหลือง

- [ ] **Step 4: อัปเดต STATE.md** ใส่ใน Done ว่า "motion polish 10 ข้อ (commit ... ) รอผู้ใช้ลองใน LINE" และใน "รอผู้ใช้ทำ" ใส่รายการลองด้วยตาตามตาราง Browser check ของ Task 1-5 พร้อมข้อ 4 ในตาราง (ข้อ 1 สลับแท็บไม่มีการเปลี่ยน)

- [ ] **Step 5: Commit (ถามผู้ใช้ก่อน)** `git commit -m "docs: record the motion polish in STATE"`

---

## Self-Review

- **Spec coverage:** ทั้ง 10 ข้อมีใน Task (ข้อ 1 ระบุว่าไม่ต้องทำ) ข้อควรแจ้งผู้ใช้ 2 ข้อที่ต่างจากตัวอย่างอยู่ในหัวแผน
- **Placeholder scan:** ทุก step ที่แก้โค้ดมีโค้ดจริง Step ที่ต้อง "หา" (Task 5 Step 1, Task 3 Step 6) ให้คำสั่งค้นหาและเกณฑ์ตัดสิน
- **Test coverage:** ทุก task แก้ไฟล์ที่มีเทสต์ข้างไฟล์ (`style.test.mjs`, `ripple.test.mjs`, `success-mark.test.mjs`, `app.core.dom.test.mjs`) ทุก task ที่เปลี่ยนสิ่งที่ผู้ใช้เห็นมี Browser check
- **Type consistency:** `setSuccessStatus(el, text)` (Task 5 Step 5) ตรงกับที่เรียกใน 7.1 และ `bills-panel.mjs` 7.3; `installRipple(doc)` ตรงกับ Step 6 ของ Task 4; keyframes `fade-in` นิยามใน Task 1 และใช้ใน Task 2
- **ความเสี่ยงที่ทราบ:** (1) เทสต์ CSS ตรวจแค่ว่ากฎมีอยู่ ไม่พิสูจน์ว่าภาพสวย ต้องให้ผู้ใช้ดูใน LINE (2) animation เล่นซ้ำทุกครั้งที่ re-render ข้อมูลของแท็บนั้น (เช่นหลังแก้งบ) ซึ่งตั้งใจให้เป็นสัญญาณว่าข้อมูลอัปเดต ถ้ารู้สึกรบกวนให้จำกัดเฉพาะตอนเข้าแท็บ (3) `overflow-x: clip` ต้องใช้ WebView ที่ใหม่พอ (Chrome 90+) ถ้า LINE รุ่นเก่าไม่รองรับ แถวจะเลื่อนเข้าแบบไม่ถูกตัดขอบเป็นเวลา 0.3 วินาทีเท่านั้น
