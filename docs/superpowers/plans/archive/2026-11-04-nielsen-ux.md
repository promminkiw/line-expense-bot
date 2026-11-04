# Nielsen UX Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับแชตและเว็บ LIFF ตามผลตรวจ Nielsen ข้อ 1-5 และ 7-10 (ไม่ทำข้อ 6 ปุ่มเปลี่ยนเดือน)

**Architecture:** ฝั่งแชตเพิ่ม LINE loading animation แบบไม่รอผล และปรับข้อความ ฝั่ง API เปลี่ยน `DELETE /api/transactions/:id` ให้คืนข้อมูลสำหรับกู้คืน และเพิ่ม `POST /api/transactions/restore` ฝั่งเว็บเพิ่มแถบเลิกทำ ป้ายบอกเดือน ช่องเงินแบบ text คำใบ้ปัดลบ และคืนตำแหน่งเลื่อน

**Tech Stack:** Node.js, Express 5, @line/bot-sdk 11, Supabase, vanilla ES modules (LIFF), vitest + jsdom

## Global Constraints

- ทำบน branch `feat/nielsen-ux` ไม่ทำบน main; ห้าม push จนกว่าผู้ใช้สั่ง
- เขียน test ก่อนโค้ดทุก task; ก่อนจบแต่ละ task รัน `npm test` และ `npm run lint` ให้ผ่านทั้งหมด
- คอมเมนต์ในโค้ด: บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปรและ log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด/log/commit (ยกเว้น `HELP_SECTIONS` ที่มีอยู่แล้ว)
- น้ำเสียงบอท: แทนตัวเองว่า "เฮีย" เรียกผู้ใช้ว่า "คุณ" ไม่มีคำลงท้าย
- คำตัดสินของผู้ใช้ (2026-11-04): เว็บใช้ "เฮีย" แทน "บอท" ยกเว้นข้อความชวนเพื่อนใน `friends-format.mjs`; รายการที่บันทึกแล้วใช้คำว่า "ลบ" ส่วนสลิปที่ยังไม่บันทึกและบิลคงคำว่า "ยกเลิก"; ทักทายเป็นข้อความธรรมดา; เลิกทำใช้วิธีลบจริงแล้วกู้คืน
- รายการ `source = 'bill'` เลิกทำไม่ได้ เพราะ FK ของบิลเป็น `on delete set null` กู้คืนแล้วลิงก์กับบิลไม่กลับมา
- ทุก task แก้ไฟล์ร่วมกัน (`app.mjs`, `index.html`, `style.css`, `SPEC.md`) จึงทำเรียงลำดับทีละ task ไม่ทำขนาน
- อัปเดต `work-memory/STATE.md` หลังแต่ละ task (Done/Next) ตามกติกาในหัวไฟล์
- ไม่แก้ `.env`

---

### Task 1: LINE loading animation

**Depends on:** none

**Files:**
- Modify: `src/chat/line-reply.js`
- Modify: `src/chat/bot.js`
- Modify: `index.js`
- Modify: `SPEC.md`
- Test: `src/chat/line-reply.test.js`, `src/chat/bot.test.js`

**Interfaces:**
- Produces: `createShowLoading(client)` คืน `async showLoading(chatId)`; `createBot` รับ dependency ใหม่ `showLoading`

- [ ] **Step 0: สร้าง branch**

```bash
git checkout -b feat/nielsen-ux
```

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

เพิ่มใน `src/chat/line-reply.test.js` (เพิ่ม `createShowLoading` ใน import เดิม):

```js
describe('createShowLoading', () => {
  it('asks LINE to show the animation for the reply deadline', async () => {
    const client = { showLoadingAnimation: vi.fn().mockResolvedValue({}) };

    await createShowLoading(client)('U1');

    expect(client.showLoadingAnimation).toHaveBeenCalledWith({ chatId: 'U1', loadingSeconds: 50 });
  });
});
```

ใน `src/chat/bot.test.js` เพิ่ม `showLoading: vi.fn().mockResolvedValue(),` ใน `deps` ของ `setup()` ต่อจาก `replyFlex` แล้วเพิ่ม:

```js
describe('bot loading animation', () => {
  it('shows it for a text message before replying', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.showLoading).toHaveBeenCalledWith('U1');
    expect(deps.showLoading.mock.invocationCallOrder[0]).toBeLessThan(deps.replyText.mock.invocationCallOrder[0]);
  });

  it('shows it for an image message', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.showLoading).toHaveBeenCalledWith('U1');
  });

  it('does not show it for a postback or follow event', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));
    await bot.handleEvent(followEvent());

    expect(deps.showLoading).not.toHaveBeenCalled();
  });

  it('does not show it for a group message', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป', { source: { type: 'group', groupId: 'G1' } }));

    expect(deps.showLoading).not.toHaveBeenCalled();
  });

  it('still replies and logs when the animation fails', async () => {
    const { deps, bot } = setup();
    const failure = new Error('line down');
    deps.showLoading.mockRejectedValue(failure);

    await bot.handleEvent(textEvent('สรุป'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(deps.replyText).toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to show loading animation', { lineUserId: 'U1' }, failure);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/chat/line-reply.test.js src/chat/bot.test.js`
Expected: FAIL ที่ `createShowLoading is not a function` และ `showLoading` ไม่ถูกเรียก

- [ ] **Step 3: เขียนโค้ด**

`src/chat/line-reply.js` เพิ่มเหนือ `module.exports` และ export `createShowLoading`:

```js
// LINE รับเฉพาะเลขหาร 5 ลงตัว ตั้งเท่า REPLY_DEADLINE_MS เพราะหลังจากนั้นบอทตอบข้อความแจ้งว่าช้าแล้ว
const LOADING_SECONDS = 50;

function createShowLoading(client) {
  return async function showLoading(chatId) {
    await client.showLoadingAnimation({ chatId, loadingSeconds: LOADING_SECONDS });
  };
}
```

`src/chat/bot.js` เพิ่ม `showLoading,` ใน parameter ของ `createBot` ต่อจาก `replyFlex,` และใน `handleEvent` ต่อจาก `const lineUserId = event.source.userId;`:

```js
    if (isTextMessage(event) || isImageMessage(event)) {
      // ไม่ await เพื่อไม่ให้ตอบช้าลง และ animation พังต้องไม่กระทบการบันทึก
      showLoading(lineUserId).catch((err) => logger.error('Failed to show loading animation', { lineUserId }, err));
    }
```

`index.js` เพิ่ม `createShowLoading` ใน require ของ `./src/chat/line-reply` และเพิ่มใน `createBot({ ... })` ต่อจาก `replyText`:

```js
  showLoading: createShowLoading(lineClient),
```

`SPEC.md` เพิ่มในหัวข้อ `### 1. บันทึกด้วยข้อความ`:

```markdown
- ข้อความและรูปขึ้น LINE loading animation ระหว่างประมวลผล ไม่รอผลและพังแล้วแค่ log (ตอน server หลับ animation ขึ้นหลัง server ตื่นเท่านั้น)
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/chat/line-reply.js src/chat/line-reply.test.js src/chat/bot.js src/chat/bot.test.js index.js SPEC.md
git commit -m "feat(chat): show the LINE loading animation while processing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ข้อความ error และทักทายคนเพิ่มเพื่อน

**Depends on:** Task 1

**Files:**
- Modify: `src/chat/replies.js`
- Modify: `src/chat/bot.js`
- Modify: `SPEC.md`
- Test: `src/chat/bot.test.js`

**Interfaces:**
- Produces: `WELCOME_REPLY` export จาก `src/chat/replies.js` และ `src/chat/bot.js`

- [ ] **Step 1: แก้ test ให้ตรงพฤติกรรมใหม่**

ใน `src/chat/bot.test.js` เพิ่ม `WELCOME_REPLY` ใน import จาก `./bot` และแก้ test เดิมที่บรรทัดราว 445:

```js
    expect(SYSTEM_ERROR_REPLY).toBe('เฮียขออภัย ระบบมีปัญหา ถ้าจดรายการไว้ ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าขอสรุปหรือถามยอด ลองใหม่อีกครั้ง');
```

แก้ test แรกใน `describe('bot follow event')`:

```js
  it('registers the user and greets them', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(followEvent());

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.resumeMonthlySummary).toHaveBeenCalledWith('U1');
    expect(deps.users.ensureUser.mock.invocationCallOrder[0]).toBeLessThan(deps.repository.resumeMonthlySummary.mock.invocationCallOrder[0]);
    expect(deps.replyText).toHaveBeenCalledWith('r3', WELCOME_REPLY, undefined);
  });

  it('keeps the greeting short and shows how to start', () => {
    expect(WELCOME_REPLY).toBe(
      'สวัสดี เฮียช่วยจดรายรับรายจ่ายให้คุณเอง\nพิมพ์ชื่อรายการตามด้วยจำนวนเงินได้เลย เช่น กินข้าว 60\nส่งรูปสลิปก็ได้ หรือกด วิธีการใช้ ในเมนูด้านล่างเพื่อดูทั้งหมด'
    );
  });
```

test `logs but does not reply when resuming the monthly summary fails` และ `sends nothing for a follow event that passes the deadline` คงเดิม

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/chat/bot.test.js`
Expected: FAIL ที่ข้อความ error และ `WELCOME_REPLY` เป็น undefined

- [ ] **Step 3: เขียนโค้ด**

`src/chat/replies.js` แก้ `SYSTEM_ERROR_REPLY` และเพิ่มค่าคงที่ (export `WELCOME_REPLY` ด้วย):

```js
const SYSTEM_ERROR_REPLY = 'เฮียขออภัย ระบบมีปัญหา ถ้าจดรายการไว้ ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าขอสรุปหรือถามยอด ลองใหม่อีกครั้ง';
const WELCOME_REPLY = [
  'สวัสดี เฮียช่วยจดรายรับรายจ่ายให้คุณเอง',
  'พิมพ์ชื่อรายการตามด้วยจำนวนเงินได้เลย เช่น กินข้าว 60',
  'ส่งรูปสลิปก็ได้ หรือกด วิธีการใช้ ในเมนูด้านล่างเพื่อดูทั้งหมด',
].join('\n');
```

`src/chat/bot.js`: เพิ่ม `WELCOME_REPLY` ใน require และ `module.exports`, แก้คอมเมนต์และ follow:

```js
// follow และ unfollow ไม่ส่งข้อความ error และ unfollow ไม่มี replyToken จึงห้ามส่งข้อความระบบ
function isSilentEvent(event) {
```

```js
    if (event.type === 'follow') {
      await users.ensureUser(lineUserId);
      await repository.resumeMonthlySummary(lineUserId);
      return { text: WELCOME_REPLY };
    }
```

`SPEC.md` เพิ่มในหัวข้อ `### 4. Rich Menu`:

```markdown
- เพิ่มเพื่อนแล้วเฮียทักทายเป็นข้อความธรรมดา (`WELCOME_REPLY`) ต้องปิด Greeting message ใน LINE OA Manager ไม่งั้นข้อความซ้ำ
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/chat/replies.js src/chat/bot.js src/chat/bot.test.js SPEC.md
git commit -m "feat(chat): greet new friends and make the system error actionable" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ใช้คำให้สม่ำเสมอ (เฮีย, ลบ) และแก้คู่มือที่ล้าสมัย

**Depends on:** Task 2

**Files:**
- Modify: `src/chat/replies.js`, `src/parser/saved-flex.js`, `src/menu/fixed-replies.js`
- Modify: `public/liff/index.html`, `public/liff/ui/empty-state.mjs`
- Modify: `SPEC.md`, `README.md`
- Test: `src/chat/bot.test.js`, `src/parser/saved-flex.test.js`, `src/recurring/run.test.js`, `src/goals/flex.test.js`, `src/menu/fixed-replies.test.js`, `public/liff/app.core.dom.test.mjs`, `public/liff/app.list.dom.test.mjs`, `public/liff/ui/empty-state.test.mjs`, `public/liff/style.test.mjs`

**Interfaces:**
- Produces: ปุ่ม undo ใช้ `label: 'ลบ'` และ `displayText: 'ลบ'`; postback data เดิม การ์ดเก่าในแชตจึงยังกดได้

- [ ] **Step 1: แก้ test ก่อน**

รันใน Git Bash:

```bash
sed -i "54s/label: 'ยกเลิก'/label: 'ลบ'/; 54s/displayText: 'ยกเลิก'/displayText: 'ลบ'/; 57s/label: 'ยกเลิกรายการนี้'/label: 'ลบรายการนี้'/; 744s/label: 'ยกเลิก'/label: 'ลบ'/; 744s/displayText: 'ยกเลิก'/displayText: 'ลบ'/; 1666s/label: 'ยกเลิกรายการนี้'/label: 'ลบรายการนี้'/; 1666s/displayText: 'ยกเลิก'/displayText: 'ลบ'/; 1814s/label: 'ยกเลิกรายการนี้'/label: 'ลบรายการนี้'/; 1814s/displayText: 'ยกเลิก'/displayText: 'ลบ'/" src/chat/bot.test.js
sed -i "8s/label: 'ยกเลิก'/label: 'ลบ'/; 8s/displayText: 'ยกเลิก'/displayText: 'ลบ'/; 61s/ยกเลิกรายการนี้/ลบรายการนี้/; 62s/ยกเลิกทั้งหมด/ลบทั้งหมด/" src/parser/saved-flex.test.js
sed -i "61s/label: 'ยกเลิก'/label: 'ลบ'/; 63s/displayText: 'ยกเลิก'/displayText: 'ลบ'/" src/recurring/run.test.js
sed -i "10s/label: 'ยกเลิก'/label: 'ลบ'/; 10s/displayText: 'ยกเลิก'/displayText: 'ลบ'/" src/goals/flex.test.js
sed -i 's/ในบอทตั้งแต่เริ่ม/กับเฮียตั้งแต่เริ่ม/; s/เกิดทุกเดือน บอทจดให้เอง/เกิดทุกเดือน เฮียจดให้เอง/; s/วิธีใช้บอทและคำสั่งในแชต/วิธีใช้เฮียและคำสั่งในแชต/g' public/liff/app.core.dom.test.mjs
sed -i "s/บอทจดให้อัตโนมัติ/เฮียจดให้อัตโนมัติ/; s/กดยกเลิกได้/กดลบได้/" public/liff/app.list.dom.test.mjs
sed -i 's/แล้วบอทจะบันทึกให้เอง/แล้วเฮียจะบันทึกให้เอง/' public/liff/ui/empty-state.test.mjs
sed -i 's/ตัด บอทบันทึก เป็น บอทบัน\/ทึก/ตัด เฮียบันทึก เป็น เฮียบัน\/ทึก/' public/liff/style.test.mjs
sed -i 's/กด "ยกเลิก" ได้'"'"',$/กด "ลบ" ได้'"'"',/; s/1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)/1000 (กด "ลบ" ได้ถ้าพิมพ์ผิด)/; s/กดปุ่ม "ยกเลิก" ใต้ข้อความ "เฮียบันทึกแล้ว" ได้ทันที/กดปุ่ม "ลบรายการนี้" บนการ์ด "เฮียบันทึกแล้ว" ได้เลย/' src/menu/fixed-replies.test.js
```

เช็กเลขบรรทัดด้วย `git diff --stat` ว่าทุกไฟล์เปลี่ยนจริง ถ้า sed ตามเลขบรรทัดพลาดเพราะ Task 1-2 เลื่อนบรรทัด ให้แก้ตามข้อความแทน (Task 1-2 แก้ `bot.test.js` จึงต้องเช็กไฟล์นี้เป็นพิเศษด้วย `git diff src/chat/bot.test.js`)

เพิ่ม test ใน `src/menu/fixed-replies.test.js` ถัดจาก `documents the undo button under the saved message`:

```js
  it('does not claim the delete button disappears, because it stays on the card', () => {
    expect(sectionLines('↩️ บันทึกผิด')).toContain('(ปุ่มอยู่บนการ์ด กดย้อนหลังได้)');
    expect(sectionLines('↩️ บันทึกผิด')).not.toContain('(ปุ่มจะหายไปเมื่อส่งข้อความถัดไป)');
  });
```

เพิ่ม test ใน `src/chat/bot.test.js`:

```js
describe('delete wording on saved entries', () => {
  it('says the entry was deleted', () => {
    expect(UNDO_DONE_REPLY).toBe('เฮียลบรายการให้แล้ว');
    expect(UNDO_NOT_FOUND_REPLY).toBe('เฮียไม่พบรายการที่จะลบ อาจถูกลบไปแล้ว');
    expect(UNDO_SAVING_DONE_REPLY).toBe('เฮียลบรายการออมให้แล้ว');
    expect(UNDO_SAVING_NOT_FOUND_REPLY).toBe('เฮียไม่พบรายการออมที่จะลบ อาจถูกลบไปแล้ว');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npm test`
Expected: FAIL ในไฟล์ test ที่แก้ด้วยข้อความเดิม

- [ ] **Step 3: แก้โค้ดและข้อความ**

`src/chat/replies.js`:

```js
const UNDO_DONE_REPLY = 'เฮียลบรายการให้แล้ว';
const UNDO_NOT_FOUND_REPLY = 'เฮียไม่พบรายการที่จะลบ อาจถูกลบไปแล้ว';
const UNDO_SAVING_DONE_REPLY = 'เฮียลบรายการออมให้แล้ว';
const UNDO_SAVING_NOT_FOUND_REPLY = 'เฮียไม่พบรายการออมที่จะลบ อาจถูกลบไปแล้ว';
```

ใน `buildUndoQuickReply` และ `buildUndoSavingQuickReply` เปลี่ยน `label: 'ยกเลิก'` เป็น `label: 'ลบ'` และ `displayText: 'ยกเลิก'` เป็น `displayText: 'ลบ'` (ไม่แตะ `buildSlipQuickReply`)

`src/parser/saved-flex.js`:

```js
  const deleteLabel = many ? 'ลบทั้งหมด' : 'ลบรายการนี้';
```

```js
          contents: buttons.map((item) => softButton(item.action.label === 'ลบ' ? relabel(item.action, deleteLabel) : item.action)),
```

`src/menu/fixed-replies.js`:

```js
      'เฮียบันทึกให้เดือนละครั้งและแจ้งในแชต กด "ลบ" ได้',
```

```js
      'กดปุ่ม "ลบรายการนี้" บนการ์ด "เฮียบันทึกแล้ว" ได้เลย',
      '(ปุ่มอยู่บนการ์ด กดย้อนหลังได้)',
```

```js
      'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ลบ" ได้ถ้าพิมพ์ผิด)',
```

เว็บ รันใน Git Bash:

```bash
sed -i 's/ในบอทตั้งแต่เริ่ม/กับเฮียตั้งแต่เริ่ม/; s/บอท/เฮีย/g; s/และกดยกเลิกได้/และกดลบได้/; s/บันทึกผิด กดปุ่มยกเลิกใต้ข้อความตอบกลับได้เลย/บันทึกผิด กดปุ่มลบบนการ์ดที่เฮียตอบกลับได้เลย/' public/liff/index.html
sed -i 's/บอทจะบันทึกให้/เฮียจะบันทึกให้/g' public/liff/ui/empty-state.mjs
```

ไม่แก้ `public/liff/friends/friends-format.mjs` เพราะข้อความชวนส่งให้คนนอกที่ยังไม่รู้จักเฮีย

`SPEC.md`:

```bash
sed -i 's/ และ prompt ของ Claude (`src\/persona.js`) เว็บ LIFF ยังใช้คำว่า "บอท"/, prompt ของ Claude (`src\/persona.js`) และเว็บ LIFF ยกเว้นข้อความชวนเพื่อน/; s/ปุ่ม ยกเลิก (postback `undo`)/ปุ่ม ลบรายการนี้ (postback `undo`)/; s/push แจ้งพร้อมปุ่มยกเลิกทุกรายการที่บันทึก/push แจ้งพร้อมปุ่มลบทุกรายการที่บันทึก/; s/ปุ่ม ดูเป้าในเว็บ และ ยกเลิก/ปุ่ม ดูเป้าในเว็บ และ ลบ/' SPEC.md
sed -i '15s/พร้อมปุ่มยกเลิก/พร้อมปุ่มลบ/' README.md
```

ดู `README.md:9` ถ้าพูดถึงปุ่มยกเลิกของการ์ดบันทึก ให้เปลี่ยนเป็นปุ่มลบด้วย

- [ ] **Step 4: เช็กส่วนที่ได้รับผลกระทบ**

Run: `grep -n "บอท" public/liff/index.html public/liff/ui/empty-state.mjs`
Expected: ไม่มีผลลัพธ์

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด ถ้า test อื่นตรวจข้อความเดิมให้แก้เฉพาะข้อความนั้นให้ตรงคำตัดสิน

- [ ] **Step 5: Commit**

```bash
git add -u
git reset -q work-memory/STATE.md
git commit -m "feat(ux): use one wording for the persona and for deleting saved entries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API กู้คืนรายการที่ลบ

**Depends on:** Task 3

**Files:**
- Modify: `src/db/domains/transactions.js`
- Modify: `src/api/validate.js`, `src/api/router.js`
- Modify: `public/liff/api.mjs`
- Modify: `SPEC.md`
- Test: `src/db/domains/transactions.test.js`, `src/db/repository-surface.test.js`, `src/api/validate.test.js`, `src/api/router.test.js`, `public/liff/api.test.mjs`

**Interfaces:**
- Produces:
  - `repository.deleteTransaction(userId, id)` คืน snapshot `{ id, amount, note, occurredOn, categoryId, walletId, source, lineEventId, createdAt }` หรือ `null`
  - `repository.restoreTransaction(userId, fields)` คืน `true` หรือ `false` เมื่อ id ซ้ำ; `fields` เพิ่ม `type`
  - `DELETE /api/transactions/:id` ตอบ 200 `{ restore: snapshot | null }` (`null` เมื่อ `source` เป็น `bill`)
  - `POST /api/transactions/restore` รับ snapshot ตอบ 204, 400, หรือ 409
  - `api.restoreTransaction(snapshot)` ในเว็บ

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`src/db/domains/transactions.test.js` แทน `describe('repository.deleteTransaction')` เดิมทั้งก้อน:

```js
describe('repository.deleteTransaction', () => {
  const ROW = {
    id: 't1', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-10-01', category_id: 'c1',
    wallet_id: null, source: 'text', line_event_id: 'ev1', created_at: '2026-10-01T01:00:00+00:00',
  };

  it('deletes only this user row and returns a snapshot for restoring it', async () => {
    const { supabase, calls } = fakeSupabase({ data: [ROW], error: null });

    expect(await createTransactionsRepository(supabase).deleteTransaction('user-1', 't1')).toEqual({
      id: 't1', amount: 60, note: 'กินข้าว', occurredOn: '2026-10-01', categoryId: 'c1',
      walletId: null, source: 'text', lineEventId: 'ev1', createdAt: '2026-10-01T01:00:00+00:00',
    });
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 't1'],
      ['select', 'id, amount, note, occurred_on, category_id, wallet_id, source, line_event_id, created_at'],
    ]);
  });

  it('returns null when the row does not exist', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createTransactionsRepository(supabase).deleteTransaction('user-1', 't1')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createTransactionsRepository(supabase).deleteTransaction('user-1', 't1')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository.restoreTransaction', () => {
  const FIELDS = {
    id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-10-01', categoryId: 'c1',
    walletId: null, source: 'text', lineEventId: 'ev1', createdAt: '2026-10-01T01:00:00+00:00',
  };

  it('inserts the row under this user with its original id and time', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 't1' }], error: null });

    expect(await createTransactionsRepository(supabase).restoreTransaction('user-1', FIELDS)).toBe(true);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['insert', {
        id: 't1', user_id: 'user-1', type: 'expense', amount: 60, note: 'กินข้าว', occurred_on: '2026-10-01',
        category_id: 'c1', wallet_id: null, source: 'text', line_event_id: 'ev1', created_at: '2026-10-01T01:00:00+00:00',
      }],
      ['select', 'id'],
    ]);
  });

  it('returns false when the id already exists', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'dup', code: '23505' } });

    expect(await createTransactionsRepository(supabase).restoreTransaction('user-1', FIELDS)).toBe(false);
  });

  it('throws DatabaseError on other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createTransactionsRepository(supabase).restoreTransaction('user-1', FIELDS)).rejects.toBeInstanceOf(DatabaseError);
  });
});
```

`src/db/repository-surface.test.js`: เพิ่ม `'restoreTransaction'` ลงในรายชื่อตามลำดับตัวอักษรที่ไฟล์นี้ใช้

`src/api/validate.test.js` (เพิ่ม `validateTransactionRestore` ใน import เดิม):

```js
describe('validateTransactionRestore', () => {
  const BODY = {
    id: '11111111-2222-3333-4444-555555555555', amount: 60, note: 'กินข้าว', occurredOn: '2026-10-01', categoryId: 'c1',
    walletId: null, source: 'text', lineEventId: 'ev1', createdAt: '2026-10-01T01:00:00+00:00',
  };

  it('accepts a snapshot from the delete response', () => {
    expect(validateTransactionRestore(BODY)).toEqual({ ok: true, value: BODY });
  });

  it('lowercases the id because Postgres stores uuid in lowercase', () => {
    const id = 'AAAAAAAA-2222-3333-4444-555555555555';
    expect(validateTransactionRestore({ ...BODY, id }).value.id).toBe(id.toLowerCase());
  });

  it.each([
    ['id', 'abc', 'Invalid id'],
    ['amount', 0, 'Invalid amount'],
    ['categoryId', '', 'Invalid category'],
    ['occurredOn', '2026-13-01', 'Invalid date'],
    ['walletId', '', 'Invalid wallet'],
    ['source', 'bill', 'Invalid source'],
    ['lineEventId', 5, 'Invalid event'],
    ['createdAt', 'not-a-date', 'Invalid time'],
  ])('rejects a bad %s', (field, value, error) => {
    expect(validateTransactionRestore({ ...BODY, [field]: value })).toEqual({ ok: false, error });
  });

  it('rejects a missing body', () => {
    expect(validateTransactionRestore(null)).toEqual({ ok: false, error: 'Invalid body' });
  });
});
```

`src/api/router.test.js`: ใน `setup()` เปลี่ยน `deleteTransaction: vi.fn().mockResolvedValue(true),` เป็น:

```js
      deleteTransaction: vi.fn().mockResolvedValue(DELETED_SNAPSHOT),
      restoreTransaction: vi.fn().mockResolvedValue(true),
```

เพิ่มค่าคงที่ใต้ `WALLETS`:

```js
const DELETED_SNAPSHOT = {
  id: ID, amount: 60, note: 'กินข้าว', occurredOn: '2026-10-01', categoryId: 'c-food',
  walletId: null, source: 'text', lineEventId: 'ev1', createdAt: '2026-10-01T01:00:00+00:00',
};
```

ใน `describe('DELETE /api/transactions/:id')` แทน `deletes this user entry` และ `returns 404 when nothing was deleted`:

```js
  it('deletes this user entry and returns what is needed to restore it', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restore: DELETED_SNAPSHOT });
    expect(deps.repository.deleteTransaction).toHaveBeenCalledWith('user-1', ID);
  });

  it('offers no restore for a bill entry because its bill link cannot come back', async () => {
    const deps = setup();
    deps.repository.deleteTransaction.mockResolvedValue({ ...DELETED_SNAPSHOT, source: 'bill' });
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restore: null });
  });

  it('returns 404 when nothing was deleted', async () => {
    const deps = setup();
    deps.repository.deleteTransaction.mockResolvedValue(null);
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
  });
```

เพิ่ม describe ใหม่ถัดไป (ถ้ารูปแบบ `call` ใน test รับ `body` ต่างจากนี้ ให้ทำตาม test ของ `PATCH /transactions/:id` ในไฟล์เดียวกัน):

```js
describe('POST /api/transactions/restore', () => {
  const post = (base, body) => call(base, '/transactions/restore', { method: 'POST', body: JSON.stringify(body) });

  it('restores with the type of this user category', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await post(base, DELETED_SNAPSHOT);

    expect(res.status).toBe(204);
    expect(deps.repository.restoreTransaction).toHaveBeenCalledWith('user-1', { ...DELETED_SNAPSHOT, type: 'expense' });
  });

  it('keeps a wallet that belongs to this user', async () => {
    const deps = setup();
    const base = await start(deps);

    await post(base, { ...DELETED_SNAPSHOT, walletId: WALLET_ID });

    expect(deps.repository.restoreTransaction.mock.calls[0][1].walletId).toBe(WALLET_ID);
  });

  it('rejects a category of someone else', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await post(base, { ...DELETED_SNAPSHOT, categoryId: 'c-other' });

    expect(res.status).toBe(400);
    expect(deps.repository.restoreTransaction).not.toHaveBeenCalled();
  });

  it('rejects a wallet of someone else', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await post(base, { ...DELETED_SNAPSHOT, walletId: 'w-other' });

    expect(res.status).toBe(400);
    expect(deps.repository.restoreTransaction).not.toHaveBeenCalled();
  });

  it('returns 409 when the id already exists', async () => {
    const deps = setup();
    deps.repository.restoreTransaction.mockResolvedValue(false);
    const base = await start(deps);

    const res = await post(base, DELETED_SNAPSHOT);

    expect(res.status).toBe(409);
  });
});
```

`public/liff/api.test.mjs` เพิ่มต่อจาก test ของ `deleteTransaction`:

```js
  it('posts the snapshot to restore a transaction', async () => {
    const fetchImpl = fakeFetch(204, null);

    await setup(fetchImpl).restoreTransaction({ id: 't1' });

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/transactions/restore');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[0][1].body).toBe('{"id":"t1"}');
  });
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/db/domains/transactions.test.js src/db/repository-surface.test.js src/api/validate.test.js src/api/router.test.js public/liff/api.test.mjs`
Expected: FAIL

- [ ] **Step 3: เขียนโค้ด**

`src/db/domains/transactions.js`: เปลี่ยนบรรทัดแรก และเพิ่มค่าคงที่กับ function ใต้ `toTransaction`:

```js
const { throwIfError, UNIQUE_VIOLATION } = require('../errors');
```

```js
const RESTORE_COLUMNS = 'id, amount, note, occurred_on, category_id, wallet_id, source, line_event_id, created_at';

function toRestoreSnapshot(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    note: row.note,
    occurredOn: row.occurred_on,
    categoryId: row.category_id,
    walletId: row.wallet_id ?? null,
    source: row.source,
    lineEventId: row.line_event_id ?? null,
    createdAt: row.created_at,
  };
}
```

แทน `deleteTransaction` และเพิ่ม `restoreTransaction` (เพิ่มใน object ที่ return ด้วย):

```js
  async function deleteTransaction(userId, id) {
    const { data, error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .eq('id', id)
      .select(RESTORE_COLUMNS);
    throwIfError('deleteTransaction', error);
    return data.length > 0 ? toRestoreSnapshot(data[0]) : null;
  }

  async function restoreTransaction(userId, fields) {
    const { error } = await supabase
      .from('transactions')
      .insert({
        id: fields.id,
        user_id: userId,
        type: fields.type,
        amount: fields.amount,
        note: fields.note,
        occurred_on: fields.occurredOn,
        category_id: fields.categoryId,
        wallet_id: fields.walletId,
        source: fields.source,
        line_event_id: fields.lineEventId,
        created_at: fields.createdAt,
      })
      .select('id');
    // กดเลิกทำซ้ำจนแถวกลับมาแล้ว ไม่ใช่ error ของระบบ
    if (error && error.code === UNIQUE_VIOLATION) return false;
    throwIfError('restoreTransaction', error);
    return true;
  }
```

`src/api/validate.js`: เพิ่ม import `const { UUID_PATTERN } = require('../utils/uuid');` ค่าคงที่ และ function ถัดจาก `validateTransactionUpdate` พร้อมเพิ่มใน `module.exports`:

```js
// บิลไม่อยู่ในรายการนี้ เพราะกู้คืนแล้วลิงก์กับบิลไม่กลับมา
const RESTORABLE_SOURCES = ['text', 'slip', 'recurring'];
const MAX_EVENT_ID_LENGTH = 200;

function validateTransactionRestore(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const { id, amount, categoryId, occurredOn, note, walletId, source, lineEventId, createdAt } = body;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    return { ok: false, error: 'Invalid id' };
  }
  const base = validateTransactionUpdate({ amount, categoryId, occurredOn, note });
  if (!base.ok) return base;
  if (walletId !== null && (typeof walletId !== 'string' || walletId.length === 0)) {
    return { ok: false, error: 'Invalid wallet' };
  }
  if (!RESTORABLE_SOURCES.includes(source)) {
    return { ok: false, error: 'Invalid source' };
  }
  if (lineEventId !== null && (typeof lineEventId !== 'string' || lineEventId.length === 0 || lineEventId.length > MAX_EVENT_ID_LENGTH)) {
    return { ok: false, error: 'Invalid event' };
  }
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    return { ok: false, error: 'Invalid time' };
  }
  return { ok: true, value: { ...base.value, id: id.toLowerCase(), walletId, source, lineEventId, createdAt } };
}
```

`src/api/router.js`: เพิ่ม `validateTransactionRestore` ใน import, แทน route DELETE และเพิ่ม route ใหม่:

```js
  router.delete('/transactions/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const deleted = await repository.deleteTransaction(req.userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // บิลเก็บลิงก์แบบ on delete set null กู้คืนแล้วยกเลิกบิลจะไม่ลบรายการนี้
    res.json({ restore: deleted.source === 'bill' ? null : deleted });
  });

  router.post('/transactions/restore', async (req, res) => {
    const result = validateTransactionRestore(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    if (result.value.walletId !== null) {
      const wallets = await users.loadWallets(req.userId);
      if (!wallets.some((item) => item.id === result.value.walletId.toLowerCase())) {
        res.status(400).json({ error: 'Invalid wallet' });
        return;
      }
    }
    const restored = await repository.restoreTransaction(req.userId, { ...result.value, type: category.type });
    if (!restored) {
      res.status(409).json({ error: 'Already exists' });
      return;
    }
    res.status(204).end();
  });
```

`public/liff/api.mjs` เพิ่มถัดจาก `deleteTransaction`:

```js
    restoreTransaction: (snapshot) => request('/transactions/restore', { method: 'POST', body: JSON.stringify(snapshot) }),
```

`SPEC.md` เพิ่มในหัวข้อ `### 3. เว็บ LIFF` ถัดจากบรรทัด API:

```markdown
- API: `DELETE /api/transactions/:id` ตอบ `{ restore }` (`null` เมื่อเป็นรายการจากบิล), `POST /api/transactions/restore` รับ `restore` กลับมา ตอบ 204 หรือ 409 เมื่อ id มีอยู่แล้ว
```

- [ ] **Step 4: เช็กผู้เรียกใช้**

Run: `grep -rn "deleteTransaction\b" src public/liff --include=*.js --include=*.mjs | grep -v test`
Expected: ผู้เรียกมีแค่ `src/api/router.js` และ `public/liff/app.mjs` (เว็บไม่ได้ใช้ค่าที่คืนจนกว่าจะถึง Task 5)

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/db/domains/transactions.js src/db/domains/transactions.test.js src/db/repository-surface.test.js src/api/validate.js src/api/validate.test.js src/api/router.js src/api/router.test.js public/liff/api.mjs public/liff/api.test.mjs SPEC.md
git commit -m "feat(api): return a restore snapshot on delete and add the restore endpoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: แถบเลิกทำหลังปัดลบ

**Depends on:** Task 4

**Files:**
- Create: `public/liff/ui/undo-bar.mjs`
- Modify: `public/liff/format.mjs`, `public/liff/app.mjs`, `public/liff/index.html`, `public/liff/style.css`, `SPEC.md`
- Test: `public/liff/ui/undo-bar.test.mjs`, `public/liff/format.test.mjs`, `public/liff/app.list.dom.test.mjs`

**Interfaces:**
- Consumes: `api.deleteTransaction(id)` คืน `{ restore }`, `api.restoreTransaction(snapshot)`
- Produces: `createUndoBar({ el, textEl, button, durationMs })` คืน `{ show(text, onUndo), hide() }`; `describeRestoreFailure(status)` คืน `{ message, retryable }`

**Browser check:**
- Preconditions: deploy หรือรันผ่าน ngrok แล้ว, เปิดเว็บจากปุ่ม เว็บไซต์ ในแอป LINE, เดือนนี้มีรายการที่พิมพ์จากแชตอย่างน้อย 1 รายการ

| # | Action | Expected |
|---|---|---|
| 1 | ปัดแถวรายการไปทางซ้าย แล้วกด ลบ | แถวหาย ยอดเปลี่ยน มีแถบ "ลบรายการแล้ว" พร้อมปุ่ม เลิกทำ เหนือเมนูล่าง |
| 2 | กด เลิกทำ ภายใน 5 วินาที | แถวกลับมาที่เดิม ยอดกลับเท่าเดิม แถบหายไป |
| 3 | ปัดลบอีกครั้งแล้วรอ 5 วินาที | แถบหายเอง รายการยังถูกลบ |
| 4 | ปัดลบรายการของบิล | ลบสำเร็จ ไม่มีแถบเลิกทำ |

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

สร้าง `public/liff/ui/undo-bar.test.mjs`:

```js
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createUndoBar } from './undo-bar.mjs';

function setup() {
  const el = document.createElement('div');
  const textEl = document.createElement('span');
  const button = document.createElement('button');
  el.append(textEl, button);
  el.hidden = true;
  return { el, textEl, button, bar: createUndoBar({ el, textEl, button, durationMs: 5000 }) };
}

afterEach(() => vi.useRealTimers());

describe('createUndoBar', () => {
  it('shows the text and hides itself when time runs out', () => {
    vi.useFakeTimers();
    const { el, textEl, bar } = setup();

    bar.show('ลบรายการแล้ว', () => {});
    expect(el.hidden).toBe(false);
    expect(textEl.textContent).toBe('ลบรายการแล้ว');

    vi.advanceTimersByTime(5000);
    expect(el.hidden).toBe(true);
  });

  it('runs the undo once and hides immediately', () => {
    vi.useFakeTimers();
    const { el, button, bar } = setup();
    const onUndo = vi.fn();

    bar.show('ลบรายการแล้ว', onUndo);
    button.click();
    button.click();

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(el.hidden).toBe(true);
  });

  it('replaces the previous undo and restarts the time on a new show', () => {
    vi.useFakeTimers();
    const { el, button, bar } = setup();
    const first = vi.fn();
    const second = vi.fn();

    bar.show('ก', first);
    vi.advanceTimersByTime(4000);
    bar.show('ข', second);
    vi.advanceTimersByTime(4000);
    expect(el.hidden).toBe(false);

    button.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
```

`public/liff/format.test.mjs` (เพิ่ม `describeRestoreFailure` ใน import เดิม):

```js
describe('describeRestoreFailure', () => {
  it('asks to log in again on 401 without offering a retry', () => {
    expect(describeRestoreFailure(401)).toEqual({ message: LOGIN_REQUIRED_MESSAGE, retryable: false });
  });

  it('explains that the old data changed on 400', () => {
    expect(describeRestoreFailure(400)).toEqual({ message: 'กู้คืนไม่ได้ หมวดหรือกระเป๋าของรายการนี้อาจถูกลบไปแล้ว', retryable: false });
  });

  it('offers a retry on other failures', () => {
    expect(describeRestoreFailure(undefined)).toEqual({ message: 'เลิกทำไม่สำเร็จ ลองใหม่อีกครั้ง', retryable: true });
  });
});
```

ถ้า `format.test.mjs` ยังไม่ได้ import `LOGIN_REQUIRED_MESSAGE` ให้เพิ่มจาก `./format.mjs`

`public/liff/app.list.dom.test.mjs` เพิ่มใน `describe('LIFF list swipe to delete')`:

```js
  const SNAPSHOT = { id: 'restored', amount: 60, note: '', occurredOn: '2026-10-01', categoryId: 'c', walletId: null, source: 'text', lineEventId: null, createdAt: '2026-10-01T01:00:00+00:00' };

  async function swipeDeleteFirst() {
    const [row] = firstRows();
    swipeRow(row, 60);
    row.querySelector('.row-delete').click();
    await settle();
  }

  it('offers undo after a swipe delete and restores the entry', async () => {
    await boot();
    const calls = routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return {};
      return undefined;
    });

    await swipeDeleteFirst();
    expect(byId('undo-bar').hidden).toBe(false);
    expect(byId('undo-bar-text').textContent).toBe('ลบรายการแล้ว');

    byId('undo-bar-button').click();
    await settle();

    expect(byId('undo-bar').hidden).toBe(true);
    expect(calls).toContain('POST /api/transactions/restore');
  });

  it('offers no undo when the server returns no snapshot', async () => {
    await boot();
    routeFetch((method, path) => (method === 'DELETE' && path.startsWith('/api/transactions/') ? { restore: null } : undefined));

    await swipeDeleteFirst();

    expect(byId('undo-bar').hidden).toBe(true);
  });

  it('treats 409 as already restored', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return { status: 409 };
      return undefined;
    });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();

    expect(byId('banner').hidden).toBe(true);
    expect(byId('undo-bar').hidden).toBe(true);
  });

  it('keeps the undo available after a network failure', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return { status: 500 };
      return undefined;
    });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();

    expect(byId('banner').textContent).toBe('เลิกทำไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('undo-bar').hidden).toBe(false);
  });
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run public/liff/ui/undo-bar.test.mjs public/liff/format.test.mjs public/liff/app.list.dom.test.mjs`
Expected: FAIL เพราะยังไม่มีโมดูลและ element

- [ ] **Step 3: เขียนโค้ด**

สร้าง `public/liff/ui/undo-bar.mjs`:

```js
export function createUndoBar({ el, textEl, button, durationMs }) {
  let timer = null;
  let pendingUndo = null;

  function hide() {
    clearTimeout(timer);
    pendingUndo = null;
    el.hidden = true;
  }

  button.addEventListener('click', () => {
    const undo = pendingUndo;
    hide();
    if (undo) undo();
  });

  return {
    show(text, onUndo) {
      clearTimeout(timer);
      pendingUndo = onUndo;
      textEl.textContent = text;
      el.hidden = false;
      timer = setTimeout(hide, durationMs);
    },
    hide,
  };
}
```

`public/liff/format.mjs` เพิ่มถัดจาก `describeEditFailure`:

```js
export function describeRestoreFailure(status) {
  if (status === 401) return { message: LOGIN_REQUIRED_MESSAGE, retryable: false };
  if (status === 400) return { message: 'กู้คืนไม่ได้ หมวดหรือกระเป๋าของรายการนี้อาจถูกลบไปแล้ว', retryable: false };
  return { message: 'เลิกทำไม่สำเร็จ ลองใหม่อีกครั้ง', retryable: true };
}
```

`public/liff/index.html` เพิ่มก่อน `<nav id="bottom-nav"`:

```html
  <div id="undo-bar" class="undo-bar" role="status" hidden>
    <span id="undo-bar-text"></span>
    <button type="button" id="undo-bar-button">เลิกทำ</button>
  </div>
```

`public/liff/style.css` เพิ่มท้ายไฟล์:

```css
.undo-bar { position: fixed; left: 16px; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 11; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 8px 4px 16px; border-radius: 12px; background: var(--text); color: var(--surface); font-size: 14px; }
.undo-bar[hidden] { display: none; }
.undo-bar button { min-height: 44px; padding: 0 12px; border: none; background: none; color: var(--surface); font: inherit; font-weight: 700; text-decoration: underline; }
```

`public/liff/app.mjs`:

เพิ่ม import และ `describeRestoreFailure` ใน import จาก `./format.mjs`:

```js
import { createUndoBar } from './ui/undo-bar.mjs';
```

เพิ่ม element ใน `els`:

```js
  undoBar: document.getElementById('undo-bar'),
  undoBarText: document.getElementById('undo-bar-text'),
  undoBarButton: document.getElementById('undo-bar-button'),
```

แทน `deleteBySwipe` ทั้ง function และเพิ่มส่วนกู้คืนต่อท้าย:

```js
const UNDO_DURATION_MS = 5000;
const undoBar = createUndoBar({ el: els.undoBar, textEl: els.undoBarText, button: els.undoBarButton, durationMs: UNDO_DURATION_MS });

async function refreshAfterTransactionChange(focusId) {
  pendingListFocus = { id: focusId };
  await loadMonth();
  pendingListFocus = null;
  profileStale = true;
  loadProfile();
  walletsPanel.load();
}

// ปุ่มลบที่เผยจากการปัดลบทันที (ปัด + กดปุ่ม คือสองขั้นอยู่แล้ว)
async function deleteBySwipe(item, button) {
  if (swipeDeleting) return;
  swipeDeleting = true;
  button.disabled = true;
  const tab = tabController.current;
  const focusId = neighbourRowId(item.id);
  let failure = null;
  let snapshot = null;
  try {
    const result = await api.deleteTransaction(item.id);
    snapshot = result?.restore ?? null;
  } catch (err) {
    failure = describeEditFailure(err instanceof ApiError ? err.status : undefined, 'delete');
  } finally {
    swipeDeleting = false;
  }
  if (!failure || failure.closeAndReload) {
    await refreshAfterTransactionChange(focusId);
  } else {
    button.disabled = false;
  }
  // ผู้ใช้ย้ายไปแท็บอื่นระหว่างรอแล้ว ข้อความนี้เป็นเรื่องของแท็บเดิม
  if (failure && tabController.current === tab) setBanner(failure.message);
  if (snapshot) offerUndoDelete(snapshot);
}

function offerUndoDelete(snapshot) {
  undoBar.show('ลบรายการแล้ว', () => restoreDeleted(snapshot));
}

async function restoreDeleted(snapshot) {
  try {
    await api.restoreTransaction(snapshot);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    // 409 คือแถวกลับมาแล้วจากการกดครั้งก่อนที่ไม่ได้รับคำตอบ
    if (status !== 409) {
      const failure = describeRestoreFailure(status);
      setBanner(failure.message);
      if (failure.retryable) offerUndoDelete(snapshot);
      return;
    }
  }
  await refreshAfterTransactionChange(snapshot.id);
}
```

ตรวจว่าคอมเมนต์ของ `deleteBySwipe` และบรรทัด "ผู้ใช้ย้ายไปแท็บอื่น" ตรงกับของเดิมในไฟล์ ถ้าถูกตัดไปในแผนนี้ให้คงข้อความเดิม

`SPEC.md` เพิ่มในหัวข้อ `### 3. เว็บ LIFF`:

```markdown
- ปัดลบแล้วมีแถบ เลิกทำ 5 วินาที (ไม่มีสำหรับรายการจากบิล) ลบผ่านตัวแก้ไขมี dialog ยืนยันจึงไม่มีแถบนี้
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add public/liff/ui/undo-bar.mjs public/liff/ui/undo-bar.test.mjs public/liff/format.mjs public/liff/format.test.mjs public/liff/app.mjs public/liff/app.list.dom.test.mjs public/liff/index.html public/liff/style.css SPEC.md
git commit -m "feat(liff): offer undo after a swipe delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ป้ายบอกว่าไม่ได้ดูเดือนปัจจุบัน

**Depends on:** Task 5

**Files:**
- Modify: `public/liff/format.mjs`, `public/liff/app.mjs`, `public/liff/index.html`, `public/liff/style.css`, `SPEC.md`, `work-memory/STATE.md`
- Test: `public/liff/format.test.mjs`, `public/liff/app.core.dom.test.mjs`

**Interfaces:**
- Produces: `describeViewedMonth(month)` เช่น `'2026-09'` คืน `'กำลังดูเดือน ก.ย. 2569'`

**Browser check:**
- Preconditions: เหมือน Task 5

| # | Action | Expected |
|---|---|---|
| 1 | เปิดเว็บที่แท็บ รายการ | ไม่มีป้ายบอกเดือน |
| 2 | เลือกเดือนก่อนหน้าที่มุมขวาบน | มีป้าย "กำลังดูเดือน …" พร้อมปุ่ม กลับเดือนนี้ |
| 3 | กดแท็บ ฉัน | ป้ายหาย |
| 4 | กดแท็บ สรุป | ป้ายกลับมา |
| 5 | กด กลับเดือนนี้ | ช่องเดือนเป็นเดือนปัจจุบัน ยอดโหลดใหม่ ป้ายหาย |

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`public/liff/format.test.mjs` (เพิ่ม `describeViewedMonth` ใน import):

```js
describe('describeViewedMonth', () => {
  it('names the month in Thai with the Buddhist year', () => {
    expect(describeViewedMonth('2026-09')).toBe('กำลังดูเดือน ก.ย. 2569');
  });
});
```

`public/liff/app.core.dom.test.mjs` (เวลาในการ boot คือ 2026-10-15):

```js
describe('LIFF viewed month notice', () => {
  const pickMonth = async (month) => {
    byId('month').value = month;
    byId('month').dispatchEvent(new Event('change'));
    await settle();
  };

  it('is hidden on the current month', async () => {
    await boot();
    expect(byId('month-context').hidden).toBe(true);
  });

  it('shows the viewed month and returns to the current month', async () => {
    await boot();
    await pickMonth('2026-09');
    expect(byId('month-context').hidden).toBe(false);
    expect(byId('month-context-text').textContent).toBe('กำลังดูเดือน ก.ย. 2569');

    byId('month-context-today').click();
    await settle();

    expect(byId('month').value).toBe('2026-10');
    expect(byId('month-context').hidden).toBe(true);
  });

  it('opens with the notice from a monthly summary link', async () => {
    await boot({ search: '?tab=summary&m=2026-09' });
    expect(byId('month-context').hidden).toBe(false);
  });

  it('hides on tabs without a month and comes back', async () => {
    await boot();
    await pickMonth('2026-09');

    clickTab('profile');
    expect(byId('month-context').hidden).toBe(true);

    clickTab('summary');
    expect(byId('month-context').hidden).toBe(false);
  });
});
```

ถ้า `clickTab` ยังไม่อยู่ใน import ของไฟล์นี้ ให้เพิ่มจาก `./dom-harness.mjs`

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run public/liff/format.test.mjs public/liff/app.core.dom.test.mjs`
Expected: FAIL

- [ ] **Step 3: เขียนโค้ด**

`public/liff/format.mjs` เพิ่มถัดจาก `thaiMonthShort`:

```js
const BUDDHIST_YEAR_OFFSET = 543;

export function describeViewedMonth(month) {
  return `กำลังดูเดือน ${thaiMonthShort(month)} ${Number(month.split('-')[0]) + BUDDHIST_YEAR_OFFSET}`;
}
```

`public/liff/index.html` เพิ่มก่อน `<div class="banner-area">`:

```html
      <div id="month-context" class="month-context" hidden>
        <span id="month-context-text"></span>
        <button type="button" id="month-context-today">กลับเดือนนี้</button>
      </div>
```

`public/liff/style.css` เพิ่มท้ายไฟล์:

```css
.month-context { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; background: var(--notice-bg); color: var(--notice-text); font-size: 14px; }
.month-context[hidden] { display: none; }
.month-context button { min-height: 44px; padding: 0 4px; border: none; background: none; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; white-space: nowrap; }
```

`public/liff/app.mjs`:

เพิ่ม `describeViewedMonth` ใน import จาก `./format.mjs` และเพิ่มใน `els`:

```js
  monthContext: document.getElementById('month-context'),
  monthContextText: document.getElementById('month-context-text'),
  monthContextToday: document.getElementById('month-context-today'),
```

เพิ่มก่อน `async function loadMonth`:

```js
// ช่องเดือนซ่อนอยู่แปลว่าหน้านี้ไม่ขึ้นกับเดือน ป้ายจึงซ่อนตาม
function updateMonthContext() {
  const month = els.month.value;
  const show = !els.month.hidden && Boolean(month) && month !== currentMonth(new Date());
  els.monthContext.hidden = !show;
  if (show) els.monthContextText.textContent = describeViewedMonth(month);
}
```

เพิ่มบรรทัดแรกใน `loadMonth` ถัดจาก `const month = els.month.value;`:

```js
  updateMonthContext();
```

เพิ่มใน `onChange` ของ `createTabController` ก่อน `window.scrollTo`:

```js
    updateMonthContext();
```

เพิ่มใน `enterSubPage` ถัดจาก `els.month.hidden = true;`:

```js
  updateMonthContext();
```

เพิ่มถัดจาก `els.month.addEventListener('change', ...)`:

```js
els.monthContextToday.addEventListener('click', () => {
  els.month.value = currentMonth(new Date());
  // ปุ่มนี้กำลังจะซ่อน focus ต้องมีที่ไปต่อ
  els.month.focus();
  loadMonth({ reset: true });
});
```

ถ้าหน้าบิล (`bills-page`) ไม่ได้ซ่อน `#month` ให้ซ่อนป้ายด้วยเงื่อนไขเดียวกับ `canSwitch` โดยเพิ่ม `&& !document.getElementById('app').classList.contains('bills-page')` ใน `show`

`SPEC.md` เพิ่มในหัวข้อ `### 3. เว็บ LIFF`:

```markdown
- เลือกเดือนอื่นที่ไม่ใช่เดือนนี้ (รวมเปิดจากการ์ดรายเดือน) ขึ้นป้าย กำลังดูเดือน … พร้อมปุ่ม กลับเดือนนี้ ในแท็บที่มีช่องเดือน
```

`work-memory/STATE.md`: ลบบรรทัด Next `product: หน้าเว็บไม่มีสัญญาณว่ากำลังดูเดือนที่ผ่านมา`

- [ ] **Step 4: รันให้ผ่าน**

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add public/liff/format.mjs public/liff/format.test.mjs public/liff/app.mjs public/liff/app.core.dom.test.mjs public/liff/index.html public/liff/style.css SPEC.md work-memory/STATE.md
git commit -m "feat(liff): show which month is viewed when it is not the current one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ช่องจำนวนเงินรับคอมมา

**Depends on:** Task 6

**Files:**
- Modify: `public/liff/format.mjs`, `public/liff/app.mjs`, `public/liff/goals/goals-panel.mjs`, `public/liff/index.html`
- Test: `public/liff/format.test.mjs`, `public/liff/app.core.dom.test.mjs`, `public/liff/app.goals.dom.test.mjs`

ขอบเขต: `edit-amount`, `recurring-amount`, `goal-editor-target`, `goal-detail-amount` ไม่รวมช่องส่วนแบ่งรายคนในฟอร์มบิลที่ `bill-form.mjs` อ้างด้วย `input[type="number"]`

**Interfaces:**
- Produces: `parseAmountText(text)` คืน number หรือ `NaN`

**Browser check:**
- Preconditions: เหมือน Task 5

| # | Action | Expected |
|---|---|---|
| 1 | แตะแถวรายการ พิมพ์จำนวน `1,500` แล้วกดบันทึก | บันทึกได้ แถวแสดง 1,500 |
| 2 | พิมพ์จำนวน `abc` แล้วกดบันทึก | browser เตือนและยังไม่บันทึก |
| 3 | พิมพ์จำนวน `0` แล้วกดบันทึก | ขึ้นข้อความ error ภาษาไทยในกล่องแก้ไข |

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`public/liff/format.test.mjs` (เพิ่ม `parseAmountText` ใน import):

```js
describe('parseAmountText', () => {
  it.each([
    ['1,500', 1500],
    ['1,500.50', 1500.5],
    [' 60 ', 60],
    ['60', 60],
  ])('reads %s', (text, amount) => {
    expect(parseAmountText(text)).toBe(amount);
  });

  it.each(['', 'abc', '1.2.3', '-5'])('rejects %s', (text) => {
    expect(parseAmountText(text)).toBeNaN();
  });
});
```

`public/liff/app.core.dom.test.mjs` (ถ้าไฟล์นี้ยังไม่ import `routeFetch` ให้เพิ่มจาก `./dom-harness.mjs`):

```js
describe('LIFF amount inputs', () => {
  it.each(['edit-amount', 'recurring-amount', 'goal-editor-target', 'goal-detail-amount'])('%s accepts typed commas', async (id) => {
    await boot();
    const input = byId(id);

    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(new RegExp(`^(?:${input.pattern})$`).test('1,500.50')).toBe(true);
    expect(new RegExp(`^(?:${input.pattern})$`).test('abc')).toBe(false);
  });

  it('sends the comma amount as a number when saving an edit', async () => {
    await boot();
    let sent;
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'PATCH') sent = JSON.parse(options.body);
      return original(url, options);
    });

    document.querySelector('#list .row-button').click();
    await settle();
    byId('edit-amount').value = '1,500';
    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(sent.amount).toBe(1500);
  });
});
```

`public/liff/app.goals.dom.test.mjs`: เพิ่มใน `describe` เดียวกับ test `adds a contribution and refreshes the goal and its history` และใช้ helper เดิมของไฟล์

```js
  it('reads commas in the new goal target', async () => {
    await openTab();
    const calls = captureFetch((method, path) => (method === 'POST' && path === '/api/goals' ? { goal: { id: 'g-new' } } : undefined));

    byId('goal-add').click();
    byId('goal-editor-name').value = 'คอนโด';
    byId('goal-editor-target').value = '1,500';
    submitEditor();
    await settle();

    expect(calls[0].body.targetAmount).toBe(1500);
  });

  it('reads commas in a contribution', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method, path) =>
      method === 'POST' && path === '/api/goals/g-1/contributions' ? { contribution: { id: 'gc-3' }, saved: 6500 } : undefined
    );

    byId('goal-detail-amount').value = '1,500';
    submitDetail();
    await settle();

    expect(calls[0].body.amount).toBe(1500);
  });
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run public/liff/format.test.mjs public/liff/app.core.dom.test.mjs public/liff/app.goals.dom.test.mjs`
Expected: FAIL

- [ ] **Step 3: เขียนโค้ด**

`public/liff/format.mjs`:

```js
// ช่อง number ของ browser ไม่รับ 1,500 จึงใช้ช่อง text แล้วตัดคอมมาเอง
export function parseAmountText(text) {
  const cleaned = text.replace(/[,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}
```

`public/liff/index.html` แทน 4 ช่อง (คงแอตทริบิวต์อื่นของแต่ละบรรทัด):

```html
<input id="edit-amount" type="text" inputmode="decimal" autocomplete="off" pattern="\s*\d[\d,]*(\.\d{1,2})?\s*" title="ใส่ตัวเลข เช่น 1,500 หรือ 60.50" required>
<input id="recurring-amount" type="text" inputmode="decimal" autocomplete="off" pattern="\s*\d[\d,]*(\.\d{1,2})?\s*" title="ใส่ตัวเลข เช่น 1,500 หรือ 60.50" required>
<input id="goal-editor-target" type="text" inputmode="decimal" autocomplete="off" pattern="\s*\d[\d,]*(\.\d{1,2})?\s*" title="ใส่ตัวเลข เช่น 1,500 หรือ 60.50" required>
<input id="goal-detail-amount" type="text" inputmode="decimal" autocomplete="off" pattern="\s*\d[\d,]*(\.\d{1,2})?\s*" title="ใส่ตัวเลข เช่น 1,500 หรือ 60.50" required>
```

ค่า 0 และยอดเกิน 10,000,000 ผ่าน pattern แล้วให้ server ตอบ 400 ซึ่งแต่ละฟอร์มแสดงข้อความ error อยู่แล้ว

`public/liff/app.mjs`: เพิ่ม `parseAmountText` ใน import จาก `./format.mjs` แล้วเปลี่ยน:

```js
    amount: parseAmountText(els.amount.value),
```

```js
    amount: parseAmountText(els.recurringAmount.value),
```

`public/liff/goals/goals-panel.mjs`: เพิ่ม `parseAmountText` ใน import เดิมจาก `../format.mjs` แล้วเปลี่ยน:

```js
      targetAmount: parseAmountText(els.editorTarget.value),
```

```js
    const amount = parseAmountText(els.detailAmount.value);
```

`JSON.stringify(NaN)` กลายเป็น `null` ซึ่ง server ตอบ 400 แต่ native `pattern` กันไว้ก่อนแล้วในการใช้งานจริง

- [ ] **Step 4: เช็กที่อื่นที่อ่านค่าสี่ช่องนี้**

Run: `grep -n "goal-detail-amount\|goal-editor-target\|recurring-amount\|edit-amount\|detailAmount\|editorTarget\|recurringAmount\|els\.amount" public/liff/app.mjs public/liff/goals/goals-panel.mjs public/liff/style.css`
Expected: ไม่มีการอ่านค่าด้วย `Number(...)` เหลืออยู่ และ `.amount` ใน `budget-sheet.mjs` เป็นคนละ `els`

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add public/liff/format.mjs public/liff/format.test.mjs public/liff/app.mjs public/liff/goals/goals-panel.mjs public/liff/index.html public/liff/app.core.dom.test.mjs public/liff/app.goals.dom.test.mjs
git commit -m "feat(liff): accept commas in amount inputs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: คำใบ้ปัดลบและคืนตำแหน่งเลื่อน

**Depends on:** Task 7

**Files:**
- Modify: `public/liff/ui/tabs.mjs`, `public/liff/app.mjs`, `public/liff/index.html`, `public/liff/style.css`, `SPEC.md`, `work-memory/p3-audit.md`
- Test: `public/liff/ui/tabs.test.mjs`, `public/liff/app.list.dom.test.mjs`, `public/liff/app.core.dom.test.mjs`

**Interfaces:**
- Produces: `createTabController` รับ `onBeforeChange(previousTabId)` เรียกก่อนสลับแท็บเฉพาะที่ไม่ใช่ `force`

**Browser check:**
- Preconditions: เหมือน Task 5, ล้างข้อมูลเว็บของ LIFF หรือยังไม่เคยเห็นคำใบ้

| # | Action | Expected |
|---|---|---|
| 1 | เปิดแท็บ รายการ ที่มีรายการ | เห็นคำใบ้ "ปัดแถวไปทางซ้ายเพื่อลบ" พร้อมปุ่ม รับทราบ |
| 2 | กด รับทราบ แล้วปิดและเปิดเว็บใหม่ | คำใบ้ไม่ขึ้นอีก |
| 3 | เลื่อนรายการลง กดแท็บ สรุป แล้วกดแท็บ รายการ | กลับมาตำแหน่งเดิม |
| 4 | ที่แท็บ ฉัน เลื่อนลง กด กระเป๋าเงิน แล้วกดกลับ | กลับมาตำแหน่งเดิมของแท็บ ฉัน |
| 5 | เลื่อนรายการลง เปลี่ยนเดือน | หน้าไม่คืนตำแหน่งเก่าเมื่อสลับแท็บไปกลับ |

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`public/liff/ui/tabs.test.mjs` เพิ่ม `describe` ใหม่ โดยเพิ่ม optional parameter `overrides = {}` ให้ `setup()` แล้วกระจาย `...overrides` ลงใน option ของ `createTabController`:

```js
  it('reports the previous tab before switching but not on a forced re-select', () => {
    const order = [];
    const { controller } = setup({
      onBeforeChange: (id) => order.push(`before:${id}`),
      onChange: (id) => order.push(`change:${id}`),
    });
    controller.select('list');
    order.length = 0;

    controller.select('summary');
    expect(order).toEqual(['before:list', 'change:summary']);

    order.length = 0;
    controller.select('summary', { force: true });
    expect(order).toEqual(['change:summary']);
  });
```

`public/liff/app.list.dom.test.mjs`:

```js
describe('LIFF swipe hint', () => {
  afterEach(() => localStorage.clear());

  it('shows once there are rows and stays dismissed after the button', async () => {
    await boot();
    expect(byId('swipe-hint').hidden).toBe(false);

    byId('swipe-hint-dismiss').click();
    expect(byId('swipe-hint').hidden).toBe(true);

    await boot();
    expect(byId('swipe-hint').hidden).toBe(true);
  });

  it('dismisses itself when a row is swiped open', async () => {
    await boot();

    swipeRow(firstRows()[0], 60);

    expect(byId('swipe-hint').hidden).toBe(true);
    expect(localStorage.getItem('swipe-hint-seen')).toBe('1');
  });

  it('stays hidden on an empty month', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });
    expect(byId('swipe-hint').hidden).toBe(true);
  });

  it('still works when storage throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await boot();
    expect(byId('swipe-hint').hidden).toBe(false);
    spy.mockRestore();
  });
});
```

เพิ่ม `EMPTY_MONTH` ใน import จาก `./dom-harness.mjs` ถ้ายังไม่มี

`public/liff/app.core.dom.test.mjs`:

```js
describe('LIFF scroll restore', () => {
  const setScrollY = (value) => Object.defineProperty(window, 'scrollY', { value, configurable: true });

  afterEach(() => setScrollY(0));

  it('returns to where the tab was when switching back', async () => {
    await boot();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    setScrollY(420);
    clickTab('summary');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    setScrollY(0);
    clickTab('list');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420);
    scrollTo.mockRestore();
  });

  it('forgets saved positions after the month changes', async () => {
    await boot();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    setScrollY(420);
    clickTab('summary');
    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));
    await settle();

    clickTab('list');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    scrollTo.mockRestore();
  });

  it('returns to the owner tab position after leaving a sub-page', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    setScrollY(300);
    byId('wallets-open').click();
    await settle();
    setScrollY(0);
    byId('page-back').click();
    await settle();

    expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
    scrollTo.mockRestore();
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run public/liff/ui/tabs.test.mjs public/liff/app.list.dom.test.mjs public/liff/app.core.dom.test.mjs`
Expected: FAIL

- [ ] **Step 3: เขียนโค้ด**

`public/liff/ui/tabs.mjs`:

```js
export function createTabController({ doc, nav, titleEl, monthEl, panelFor, onChange = () => {}, onBeforeChange = () => {} }) {
```

ใน `select` ถัดจาก `if (tab.id === current && !force) return;`:

```js
    // force มาจากการกลับจากหน้าย่อย ตำแหน่งตอนนั้นเป็นของหน้าย่อย ไม่ใช่ของแท็บ
    if (current && !force) onBeforeChange(current);
```

`public/liff/index.html` เพิ่มก่อน `<ul id="list" class="list"></ul>`:

```html
      <p id="swipe-hint" class="swipe-hint" hidden>
        <span>ปัดแถวไปทางซ้ายเพื่อลบ</span>
        <button type="button" id="swipe-hint-dismiss">รับทราบ</button>
      </p>
```

และเพิ่มในรายการของ `#panel-tips` ถัดจากบรรทัด "บันทึกผิด":

```html
          <li>ในหน้ารายการ แตะแถวเพื่อแก้ไข หรือปัดแถวไปทางซ้ายเพื่อลบ</li>
```

`public/liff/style.css` เพิ่มท้ายไฟล์:

```css
.swipe-hint { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 16px 0; color: var(--muted); font-size: 14px; }
.swipe-hint[hidden] { display: none; }
.swipe-hint button { min-height: 44px; padding: 0 4px; border: none; background: none; color: var(--primary); font: inherit; font-weight: 700; }
```

`public/liff/app.mjs`:

เพิ่มใน `els`:

```js
  swipeHint: document.getElementById('swipe-hint'),
  swipeHintDismiss: document.getElementById('swipe-hint-dismiss'),
```

เพิ่มใกล้ `let lastTruncated = false;`:

```js
const SWIPE_HINT_KEY = 'swipe-hint-seen';
// ตำแหน่งเลื่อนต่อแท็บ ล้างเมื่อเปลี่ยนเดือนเพราะเนื้อหาเปลี่ยนแล้ว
const tabScroll = new Map();

// webview บางตัวปิด storage ถ้าอ่านไม่ได้ก็แค่เห็นคำใบ้ซ้ำ
function readSwipeHintSeen() {
  try {
    return localStorage.getItem(SWIPE_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

let swipeHintSeen = readSwipeHintSeen();

function dismissSwipeHint() {
  swipeHintSeen = true;
  els.swipeHint.hidden = true;
  try {
    localStorage.setItem(SWIPE_HINT_KEY, '1');
  } catch {
    // ปิด storage ไว้ ซ่อนเฉพาะรอบนี้
  }
}
```

ใน `renderList()` ถัดจาก `openSwipeRow = null;`:

```js
  els.swipeHint.hidden = true;
```

และถัดจาก `setStatus('');` บรรทัดสุดท้ายก่อน `let rowIndex = 0;`:

```js
  els.swipeHint.hidden = swipeHintSeen;
```

ใน `setRowOpen` ในเงื่อนไข `if (open) {` เพิ่มบรรทัดแรก:

```js
    if (!swipeHintSeen) dismissSwipeHint();
```

เพิ่มถัดจาก `els.month.addEventListener('change', ...)`:

```js
els.swipeHintDismiss.addEventListener('click', dismissSwipeHint);
```

ใน `loadMonth` ในบล็อก `if (reset) {` บรรทัดแรก:

```js
    tabScroll.clear();
```

ใน `createTabController({ ... })` เพิ่ม option:

```js
  onBeforeChange: (id) => tabScroll.set(id, window.scrollY),
```

และใน `onChange` แทน `window.scrollTo(0, 0);`:

```js
    window.scrollTo(0, tabScroll.get(id) ?? 0);
```

ใน `enterSubPage` บรรทัดแรก ก่อน `if (!activeSubPage) pushSubPageEntry();`:

```js
  if (!activeSubPage) tabScroll.set(tabController.current, window.scrollY);
```

`leaveSubPage` เรียก `select(ownerTab, { force: true })` ซึ่งไปถึง `onChange` อยู่แล้ว จึงคืนตำแหน่งให้เอง แต่ถ้า `ownerTab` ต่างจาก `tabController.current` ตำแหน่งที่บันทึกจะอยู่ใต้แท็บเดิม ซึ่งยอมรับได้เพราะเปิดหน้าย่อยจากแท็บเจ้าของเท่านั้น

`SPEC.md` เพิ่มในหัวข้อ `### 3. เว็บ LIFF`:

```markdown
- สลับแท็บหรือกลับจากหน้าย่อยคืนตำแหน่งเลื่อนของแท็บนั้น เปลี่ยนเดือนแล้วเริ่มจากบนสุด
- คำใบ้ปัดลบขึ้นจนกด รับทราบ หรือปัดแถวครั้งแรก จำใน localStorage คีย์ `swipe-hint-seen`
```

`work-memory/p3-audit.md`: เติม `[ทำแล้ว 2026-11-04]` ที่หัวข้อ 3, 7, 9 (เฉพาะฟอร์มเดี่ยว ไม่รวมส่วนแบ่งในบิล), 11

- [ ] **Step 4: รันให้ผ่าน**

Run: `npm test` และ `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add public/liff/ui/tabs.mjs public/liff/ui/tabs.test.mjs public/liff/app.mjs public/liff/app.list.dom.test.mjs public/liff/app.core.dom.test.mjs public/liff/index.html public/liff/style.css SPEC.md work-memory/p3-audit.md
git commit -m "feat(liff): hint the swipe delete and restore the tab scroll position" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## หลังจบทุก task

- [ ] รัน `npm test` และ `npm run lint` รอบสุดท้ายแล้วบันทึกจำนวนเทสต์ใน `work-memory/STATE.md`
- [ ] เพิ่มใน `work-memory/user-checks.md` และหัวข้อ รอผู้ใช้ทำ ของ STATE: ปิด Greeting message ใน LINE OA Manager ก่อน deploy, ทดสอบ Browser check ของ Task 5-8 และลอง loading animation กับข้อความทักทายในแอป LINE
- [ ] ย้ายแผนนี้ไป `docs/superpowers/plans/archive/` เมื่อ merge แล้ว ไม่ merge หรือ push จนกว่าผู้ใช้สั่ง
