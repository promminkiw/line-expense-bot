# Reply Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลดกรณีที่บอทตอบ "ระบบมีปัญหา" หรือไม่ตอบเลยทั้งที่ทำต่อได้: อ่านบริบทพังให้ทำต่อแบบไม่มีบริบท, ดาวน์โหลดรูปสลิปลองใหม่ 1 ครั้ง, getProfile มี timeout และทั้ง handler มี deadline ที่ตอบแจ้งก่อน reply token หมดอายุ

**Architecture:** แก้ 3 ไฟล์ที่มีอยู่โดยไม่เพิ่มไฟล์ใหม่: `src/bot.js` (loadHistory จับ error และ `handleEvent` แข่งเวลากับ deadline), `src/slip/download-image.js` (ห่อการดาวน์โหลดหนึ่งครั้งด้วย retry 1 ครั้งสำหรับ error ชั่วคราว) และ `src/users.js` (ให้ `getDisplayName` แข่งกับ timeout) ทุกค่าเวลาเป็น option ของ factory พร้อมค่าเริ่มต้น `index.js` จึงไม่ต้องแก้

**Tech Stack:** Node.js 22 (CommonJS), vitest (fake timers), @line/bot-sdk 11.2.0

**Branch:** `fix/reply-resilience` (สร้างจาก `main` ก่อน Task 1)

## Global Constraints

- deadline รวมของการประมวลผล 1 event: 50000 ms (ผู้ใช้เลือก) เกินแล้วตอบข้อความ `SLOW_PROCESSING_REPLY` ทันที งานที่ค้างยังทำต่อ ผลที่มาช้าถูกทิ้งและ log
- `SLOW_PROCESSING_REPLY` = `ระบบตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง`
- event `follow` ไม่ตอบข้อความเมื่อเกิน deadline (เหมือนตอน error)
- ดาวน์โหลดรูป: ลองใหม่ 1 ครั้ง (ผู้ใช้เลือก) แต่ละครั้งมี timeout 15000 ms ของตัวเอง รอ 500 ms ก่อนลองใหม่; ลองใหม่เฉพาะ timeout ของเรา, `TypeError` จาก fetch (เชื่อมต่อไม่ได้/ขาดกลางทาง) และ `HTTPFetchError` ที่ status >= 500; ไม่ลองใหม่เมื่อ status 4xx, error อื่น, `too_large` หรือ `unsupported`
- getProfile timeout 3000 ms เกินแล้วสมัครผู้ใช้ด้วย `displayName: null` (พฤติกรรมเดียวกับตอน getProfile พัง)
- อ่านบริบท (`getPendingClarification`) พัง: log `Failed to load pending clarification` พร้อม `{ userId }` แล้วทำต่อเหมือนไม่มีบริบท (`[]`)
- ห้ามเพิ่ม dependency; `index.js` ไม่ต้องแก้ (ใช้ค่าเริ่มต้นของ option)
- log ห้ามมีข้อความของผู้ใช้หรือ message id ของรูป (ใส่ได้แค่ `userId`/`lineUserId`, `eventType`, ชนิดของ error)
- โค้ดใน `src/` เป็น CommonJS ไฟล์เทสต์เป็น ESM (`import`)
- คอมเมนต์สั้นบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม commit `.env` หรือ secret
- รันเทสต์ด้วย `npx vitest run <file>`; ก่อนจบทุก task รัน `npm test` และ `npm run lint` ให้ผ่าน

---

### Task 1: Treat a failed context load as no context

**Depends on:** none

**Files:**
- Modify: `src/bot.js` (function `loadHistory` ใน `createBot`)
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: none
- Produces: none (พฤติกรรมภายใน `createBot` เท่านั้น)

- [ ] **Step 1: Write the failing tests**

ใน `src/bot.test.js` เพิ่มเทสต์ 2 ข้อนี้ใน `describe('bot text message', ...)` ต่อจากเทสต์ `'keeps the pending conversation when saving the entries fails'`:

```js
  it('treats a failed context load as no context and still saves', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', []);
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
    expect(deps.replyFlex).toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to load pending clarification',
      { userId: 'user-1' },
      expect.any(Error)
    );
  });

  it('still asks back and remembers the question when the context load failed', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'ซื้ออะไรกี่บาท' });
    const { deps, bot } = setup({ parseMessage });
    deps.repository.getPendingClarification.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('ซื้อของ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'ซื้ออะไรกี่บาท', undefined);
    expect(deps.repository.savePendingClarification).toHaveBeenCalledWith('user-1', [
      { role: 'user', text: 'ซื้อของ' },
      { role: 'assistant', text: 'ซื้ออะไรกี่บาท' },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL 2 เทสต์ใหม่ (บอทตอบ `SYSTEM_ERROR_REPLY` และ `parseMessage` ไม่ถูกเรียก)

- [ ] **Step 3: Implement**

ใน `src/bot.js` แทน function `loadHistory` ทั้งก้อน:

```js
  async function loadHistory(userId) {
    const pending = await repository.getPendingClarification(userId);
    if (!pending || now() - Date.parse(pending.updatedAt) > PENDING_TTL_MS) {
      return [];
    }
    return pending.messages;
  }
```

ด้วย:

```js
  // บริบทเป็นตัวช่วย ถ้าอ่านไม่ได้ให้ถือว่าเป็นเรื่องใหม่ ดีกว่าตอบว่าระบบมีปัญหา
  async function loadHistory(userId) {
    let pending;
    try {
      pending = await repository.getPendingClarification(userId);
    } catch (err) {
      logger.error('Failed to load pending clarification', { userId }, err);
      return [];
    }
    if (!pending || now() - Date.parse(pending.updatedAt) > PENDING_TTL_MS) {
      return [];
    }
    return pending.messages;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทุกเทสต์ (รวม 2 เทสต์ใหม่)

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add src/bot.js src/bot.test.js
git commit -m "fix: continue without context when loading it fails"
```

---

### Task 2: Retry the slip image download once

**Depends on:** none

**Files:**
- Modify: `src/slip/download-image.js`
- Test: `src/slip/download-image.test.js`

**Interfaces:**
- Consumes: none
- Produces: `createImageDownloader({ blobClient, timeoutMs?, retryDelayMs?, logger? })` คืน `downloadImage(messageId)` รูปแบบผลเหมือนเดิม (`{ status: 'ok', mediaType, data }` / `{ status: 'too_large' }` / `{ status: 'unsupported' }` หรือ reject) ค่าเริ่มต้น `timeoutMs = 15000`, `retryDelayMs = 500`, `logger = console`; export `MAX_IMAGE_BYTES` เหมือนเดิม

- [ ] **Step 1: Write the failing tests and update the timeout tests**

ใน `src/slip/download-image.test.js`:

(a) เพิ่มต่อจาก function `setup` ด้านบนไฟล์:

```js
function quietLogger() {
  return { info: vi.fn() };
}

function fetchFailed() {
  return Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
}

function httpError(status) {
  return Object.assign(new Error(`Request failed with status code: ${status}`), { name: 'HTTPFetchError', status });
}
```

(b) เพิ่ม `describe` ใหม่นี้ต่อจากเทสต์ `'lets a download error propagate so the bot can log and apologise'` (ก่อน `describe('download timeout', ...)`):

```js
  describe('retry', () => {
    it('retries once after a connection failure and returns the image', async () => {
      const blobClient = {
        getMessageContent: vi.fn().mockRejectedValueOnce(fetchFailed()).mockResolvedValueOnce(Readable.from([JPEG])),
      };
      const logger = quietLogger();

      const result = await createImageDownloader({ blobClient, retryDelayMs: 0, logger })('m1');

      expect(result).toEqual({ status: 'ok', mediaType: 'image/jpeg', data: JPEG.toString('base64') });
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Retrying LINE image download', { reason: 'TypeError', status: null });
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain('m1');
    });

    it('retries once when LINE answers 5xx', async () => {
      const blobClient = {
        getMessageContent: vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(Readable.from([PNG])),
      };
      const logger = quietLogger();

      const result = await createImageDownloader({ blobClient, retryDelayMs: 0, logger })('m1');

      expect(result.status).toBe('ok');
      expect(logger.info).toHaveBeenCalledWith('Retrying LINE image download', { reason: 'HTTPFetchError', status: 503 });
    });

    it('does not retry when LINE answers 4xx', async () => {
      const blobClient = { getMessageContent: vi.fn().mockRejectedValue(httpError(404)) };

      await expect(createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).rejects.toThrow(
        'status code: 404'
      );
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
    });

    it('does not retry a plain error', async () => {
      const blobClient = { getMessageContent: vi.fn().mockRejectedValue(new Error('LINE down')) };

      await expect(createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).rejects.toThrow(
        'LINE down'
      );
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
    });

    it('does not retry a too large image', async () => {
      const blobClient = { getMessageContent: vi.fn().mockResolvedValue(Readable.from([Buffer.alloc(MAX_IMAGE_BYTES + 1)])) };

      expect(await createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).toEqual({
        status: 'too_large',
      });
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
    });

    it('rejects with the second error when the retry also fails', async () => {
      const blobClient = {
        getMessageContent: vi.fn().mockRejectedValueOnce(fetchFailed()).mockRejectedValueOnce(httpError(502)),
      };

      await expect(createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).rejects.toThrow(
        'status code: 502'
      );
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
    });
  });
```

(c) ใน `describe('download timeout', ...)` แทนเทสต์ 3 ข้อเดิม `'rejects when getMessageContent never resolves'`, `'rejects and destroys the stream when it stalls mid-way'`, `'destroys a stream that arrives after the timeout already fired'` และข้อ `'uses a 15 second timeout by default'` ด้วยชุดนี้ (เทสต์ `'clears the timer on the normal path and on a download error'` คงไว้ตามเดิม):

```js
    it('retries once after a timeout and rejects when the retry also times out', async () => {
      vi.useFakeTimers();
      const blobClient = { getMessageContent: vi.fn(() => new Promise(() => {})) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);

      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    });

    it('destroys both streams when each attempt stalls mid-way', async () => {
      vi.useFakeTimers();
      const first = new Readable({ read() {} });
      const second = new Readable({ read() {} });
      first.push(JPEG);
      second.push(JPEG);
      const blobClient = { getMessageContent: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(2500);

      await assertion;
      expect(first.destroyed).toBe(true);
      expect(second.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('destroys a stream that arrives after its attempt already timed out', async () => {
      vi.useFakeTimers();
      const late = new Readable({ read() {} });
      let deliver;
      const blobClient = {
        getMessageContent: vi
          .fn()
          .mockImplementationOnce(() => new Promise((resolve) => { deliver = resolve; }))
          .mockImplementationOnce(() => new Promise(() => {})),
      };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);
      deliver(late);
      await vi.advanceTimersByTimeAsync(0);
      expect(late.destroyed).toBe(true);
      await vi.advanceTimersByTimeAsync(1500);

      await assertion;
    });

    it('uses a 15 second timeout per attempt and waits 500 ms before the retry by default', async () => {
      vi.useFakeTimers();
      const blobClient = { getMessageContent: vi.fn(() => new Promise(() => {})) };
      const pending = createImageDownloader({ blobClient, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(14999);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(15000);

      await assertion;
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/slip/download-image.test.js`
Expected: FAIL เทสต์ retry และเทสต์ timeout ที่เขียนใหม่ (โค้ดเดิมไม่ลองใหม่: `getMessageContent` ถูกเรียก 1 ครั้ง)

- [ ] **Step 3: Implement**

ใน `src/slip/download-image.js`:

(a) แทนบรรทัด

```js
const DOWNLOAD_TIMEOUT_MS = 15000;
```

ด้วย

```js
const DOWNLOAD_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 500;
const DOWNLOAD_TIMEOUT_CODE = 'LINE_DOWNLOAD_TIMEOUT';

// เครือข่ายหรือ LINE สะดุดชั่วคราวลองใหม่แล้วมักหาย ส่วน 4xx หรือ error อื่นลองซ้ำก็ไม่หาย
function isRetryableDownloadError(err) {
  if (err?.code === DOWNLOAD_TIMEOUT_CODE || err instanceof TypeError) {
    return true;
  }
  return err?.name === 'HTTPFetchError' && Number.isInteger(err.status) && err.status >= 500;
}
```

(b) แทน function `createImageDownloader` ทั้งก้อนด้วย:

```js
function createImageDownloader({ blobClient, timeoutMs = DOWNLOAD_TIMEOUT_MS, retryDelayMs = RETRY_DELAY_MS, logger = console }) {
  async function downloadOnce(messageId) {
    let stream = null;
    let timedOut = false;
    let timer;

    async function readImage() {
      const content = await blobClient.getMessageContent(messageId);
      // สตรีมที่มาถึงหลังหมดเวลาต้องปิดทิ้ง ไม่งั้นค้างอยู่
      if (timedOut) {
        content.destroy();
        return null;
      }
      stream = content;
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        // หยุดอ่านทันทีที่เกินเพดาน ไม่เก็บรูปใหญ่ทั้งใบไว้ใน memory
        if (size > MAX_IMAGE_BYTES) {
          return { status: 'too_large' };
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const mediaType = detectMediaType(buffer);
      if (!mediaType) {
        return { status: 'unsupported' };
      }
      return { status: 'ok', mediaType, data: buffer.toString('base64') };
    }

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        if (stream) {
          stream.destroy();
        }
        reject(Object.assign(new Error('LINE image download timed out'), { code: DOWNLOAD_TIMEOUT_CODE }));
      }, timeoutMs);
    });

    try {
      return await Promise.race([readImage(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return async function downloadImage(messageId) {
    try {
      return await downloadOnce(messageId);
    } catch (err) {
      if (!isRetryableDownloadError(err)) {
        throw err;
      }
      // log แค่ชนิดของ error ไม่ใส่ message id ของรูป
      logger.info('Retrying LINE image download', { reason: err.code === DOWNLOAD_TIMEOUT_CODE ? 'timeout' : err.name, status: err.status ?? null });
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return downloadOnce(messageId);
    }
  };
}
```

หมายเหตุ: เทสต์ `'retries once after a connection failure...'` คาด `reason: 'TypeError'` และเทสต์ 5xx คาด `reason: 'HTTPFetchError'` ซึ่งตรงกับ `err.name`; กรณี timeout ได้ `reason: 'timeout'`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/slip/download-image.test.js`
Expected: PASS ทุกเทสต์ ไม่มี output จาก console (ทุกเทสต์ที่ retry ส่ง `quietLogger()`)

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด (`src/bot.test.js` ใช้ `downloadImage` ปลอมจึงไม่ได้รับผลกระทบ)

- [ ] **Step 6: Commit**

```bash
git add src/slip/download-image.js src/slip/download-image.test.js
git commit -m "fix: retry the slip image download once on a transient failure"
```

---

### Task 3: Time out the LINE profile request

**Depends on:** none

**Files:**
- Modify: `src/users.js` (function `fetchDisplayName` และ signature ของ `createUserService`)
- Test: `src/users.test.js`

**Interfaces:**
- Consumes: none
- Produces: `createUserService({ repository, getDisplayName, logger?, profileTimeoutMs? })` ค่าเริ่มต้น `profileTimeoutMs = 3000`; `ensureUser` และ `loadCategoryIds` เหมือนเดิม

- [ ] **Step 1: Write the failing tests**

ใน `src/users.test.js` แก้บรรทัดแรกเป็น

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
```

แล้วเพิ่มต่อท้าย `describe('userService.ensureUser', ...)` (ก่อนวงเล็บปิดของ describe นั้น):

```js
  describe('profile timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates the user with a null name when LINE profile takes too long', async () => {
      vi.useFakeTimers();
      const { repository, logger, service } = setup({}, vi.fn(() => new Promise(() => {})));
      const pending = service.ensureUser('U1');

      await vi.advanceTimersByTimeAsync(3000);

      expect(await pending).toBe('user-1');
      expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: null });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch LINE profile',
        { lineUserId: 'U1' },
        expect.objectContaining({ message: 'LINE profile request timed out' })
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it('waits up to 3 seconds by default', async () => {
      vi.useFakeTimers();
      const { repository, service } = setup({}, vi.fn(() => new Promise(() => {})));
      service.ensureUser('U1');

      await vi.advanceTimersByTimeAsync(2999);
      expect(repository.createUser).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(repository.createUser).toHaveBeenCalled();
    });

    it('clears the timer when LINE profile answers in time', async () => {
      vi.useFakeTimers();
      const { service } = setup();

      await service.ensureUser('U1');

      expect(vi.getTimerCount()).toBe(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/users.test.js`
Expected: FAIL 2 เทสต์แรก (`createUser` ไม่ถูกเรียกเพราะรอ getProfile ตลอดไป)

- [ ] **Step 3: Implement**

ใน `src/users.js` แทนส่วนต้นไฟล์

```js
function createUserService({ repository, getDisplayName, logger = console }) {
  async function fetchDisplayName(lineUserId) {
    try {
      return await getDisplayName(lineUserId);
    } catch (err) {
      // ชื่อเป็นแค่ข้อมูลประกอบ ดึงไม่ได้ก็ยังสมัครผู้ใช้ต่อได้
      logger.error('Failed to fetch LINE profile', { lineUserId }, err);
      return null;
    }
  }
```

ด้วย

```js
// getProfile ของ LINE SDK ไม่มี timeout ถ้าค้างจะกินเวลาของ reply token
const PROFILE_TIMEOUT_MS = 3000;

function createUserService({ repository, getDisplayName, logger = console, profileTimeoutMs = PROFILE_TIMEOUT_MS }) {
  async function fetchDisplayName(lineUserId) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('LINE profile request timed out')), profileTimeoutMs);
    });
    try {
      return await Promise.race([getDisplayName(lineUserId), timeout]);
    } catch (err) {
      // ชื่อเป็นแค่ข้อมูลประกอบ ดึงไม่ได้ก็ยังสมัครผู้ใช้ต่อได้
      logger.error('Failed to fetch LINE profile', { lineUserId }, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/users.test.js`
Expected: PASS ทุกเทสต์ (รวมเทสต์เดิม `'still creates the user with null name when LINE profile fails'`)

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add src/users.js src/users.test.js
git commit -m "fix: time out the LINE profile request after 3 seconds"
```

---

### Task 4: Reply before the deadline, update docs and STATE

**Depends on:** Task 1 (แก้ `src/bot.js` และ `src/bot.test.js` ไฟล์เดียวกัน ห้ามทำพร้อมกัน), Task 2, Task 3 (STATE ต้องสรุปผลทุก task)

**Files:**
- Modify: `src/bot.js` (ค่าคงที่ด้านบน, signature ของ `createBot`, `handleEvent`, `module.exports`)
- Test: `src/bot.test.js`
- Modify: `README.md` (หัวข้อ "ข้อจำกัดที่ทราบ")
- Modify: `work-memory/STATE.md`

**Interfaces:**
- Consumes: none
- Produces: `createBot({ ..., replyDeadlineMs? })` ค่าเริ่มต้น `REPLY_DEADLINE_MS = 50000`; export `SLOW_PROCESSING_REPLY` และ `REPLY_DEADLINE_MS` เพิ่มจาก `src/bot.js`

- [ ] **Step 1: Write the failing tests**

ใน `src/bot.test.js`:

(a) แก้บรรทัดแรกเป็น

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
```

(b) ในบล็อก import จาก `'./bot.js'` เพิ่ม `SLOW_PROCESSING_REPLY,` และ `REPLY_DEADLINE_MS,` ต่อจาก `SLIP_TTL_MS,`

(c) เพิ่ม `describe` ใหม่นี้ท้ายไฟล์:

```js
describe('bot reply deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('keeps the slow reply text and the 50 second deadline', () => {
    expect(SLOW_PROCESSING_REPLY).toBe(
      'ระบบตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง'
    );
    expect(REPLY_DEADLINE_MS).toBe(50000);
  });

  it('replies the slow message at the deadline and drops the late reply', async () => {
    vi.useFakeTimers();
    const parse = deferred();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => parse.promise), replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('กินข้าว 60'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.replyText).toHaveBeenCalledWith('r1', SLOW_PROCESSING_REPLY, undefined);
    expect(deps.logger.error).toHaveBeenCalledWith('Event passed the reply deadline', { lineUserId: 'U1', eventType: 'message' });

    parse.resolve({ status: 'ok', items: [FOOD_ITEM] });
    await vi.advanceTimersByTimeAsync(0);

    // งานที่ค้างยังบันทึกต่อ จึงต้องบอกผู้ใช้ให้ตรวจก่อนส่งซ้ำ
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledTimes(1);
    expect(deps.logger.info).toHaveBeenCalledWith('Dropped a reply that finished after the deadline', {
      lineUserId: 'U1',
      eventType: 'message',
    });
  });

  it('logs a failure that happens after the deadline without replying again', async () => {
    vi.useFakeTimers();
    const parse = deferred();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => parse.promise), replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('กินข้าว 60'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;
    parse.reject(new Error('overloaded'));
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.replyText).toHaveBeenCalledTimes(1);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event after the reply deadline',
      { lineUserId: 'U1', eventType: 'message' },
      expect.any(Error)
    );
  });

  it('uses a 50 second deadline by default', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => new Promise(() => {})) });

    const handled = bot.handleEvent(textEvent('กินข้าว 60'));
    await vi.advanceTimersByTimeAsync(49999);
    expect(deps.replyText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await handled;

    expect(deps.replyText).toHaveBeenCalledWith('r1', SLOW_PROCESSING_REPLY, undefined);
  });

  it('still replies system error when processing fails before the deadline', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ parseMessage: vi.fn().mockRejectedValue(new Error('overloaded')), replyDeadlineMs: 1000 });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline timer on the normal path', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ replyDeadlineMs: 1000 });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyFlex).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends nothing for a follow event that passes the deadline', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ replyDeadlineMs: 1000 });
    deps.users.ensureUser.mockImplementation(() => new Promise(() => {}));

    const handled = bot.handleEvent(followEvent());
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL (`SLOW_PROCESSING_REPLY` และ `REPLY_DEADLINE_MS` เป็น undefined และบอทไม่ตอบเมื่อครบ deadline)

- [ ] **Step 3: Implement**

ใน `src/bot.js`:

(a) เพิ่มต่อจากบรรทัด `const SYSTEM_ERROR_REPLY = ...`:

```js
const SLOW_PROCESSING_REPLY =
  'ระบบตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง';
// LINE ไม่ระบุอายุของ reply token ที่แน่นอน ตอบก่อนราว 1 นาทีที่มักใช้ได้ ผู้ใช้จะได้ไม่เงียบหาย
const REPLY_DEADLINE_MS = 50000;
const DEADLINE_PASSED = Symbol('deadline passed');
```

(b) ใน signature ของ `createBot` เพิ่ม `replyDeadlineMs = REPLY_DEADLINE_MS,` ต่อจาก `now = () => Date.now(),`

(c) เพิ่ม function นี้ใน `createBot` ก่อน `async function handleEvent(event) {`:

```js
  // งานที่ค้างยังทำต่อจนจบ ผลที่มาช้าถูกทิ้งเพราะ reply token อาจหมดอายุแล้ว
  async function buildReplyBeforeDeadline(event, lineUserId) {
    const work = buildReply(event, lineUserId);
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve(DEADLINE_PASSED), replyDeadlineMs);
    });
    try {
      const result = await Promise.race([work, deadline]);
      if (result !== DEADLINE_PASSED) {
        return result;
      }
    } finally {
      clearTimeout(timer);
    }
    const context = { lineUserId, eventType: event.type };
    logger.error('Event passed the reply deadline', context);
    work.then(
      () => logger.info('Dropped a reply that finished after the deadline', context),
      (err) => logger.error('Failed to process event after the reply deadline', context, err)
    );
    return event.type === 'follow' ? null : { text: SLOW_PROCESSING_REPLY };
  }
```

(d) ใน `handleEvent` แทน

```js
      reply = await buildReply(event, lineUserId);
```

ด้วย

```js
      reply = await buildReplyBeforeDeadline(event, lineUserId);
```

(e) ใน `module.exports` เพิ่ม `SLOW_PROCESSING_REPLY,` และ `REPLY_DEADLINE_MS,` ต่อจาก `SYSTEM_ERROR_REPLY,`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทุกเทสต์ (รวมเทสต์เดิมทั้งหมดของ bot ที่ใช้ timer จริง เพราะงานจบก่อน 50 วินาที)

- [ ] **Step 5: Update README limitations**

ใน `README.md` หัวข้อ "ข้อจำกัดที่ทราบ" เพิ่มบรรทัดนี้ต่อจากบรรทัด "ถ้า LINE ปฏิเสธการ์ด Flex ...":

```markdown
- ถ้าประมวลผลข้อความใดเกิน 50 วินาที บอทตอบว่าระบบตอบช้ากว่าปกติแทนผลจริง แต่งานยังทำต่อ รายการจึงอาจถูกบันทึกหลังจากนั้น (ผู้ใช้ควรตรวจในหน้าเว็บก่อนส่งซ้ำ) LINE ไม่ระบุอายุของ reply token ที่แน่นอน ค่า 50 วินาทีเป็นค่าที่เลือกเผื่อไว้
```

- [ ] **Step 6: Run the full suite, lint and syntax check**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: ผ่านทั้งหมด

- [ ] **Step 7: Update work-memory/STATE.md**

ใน `work-memory/STATE.md` หัวข้อ `## Next`:
- แทนรายการที่ขึ้นต้น `- [ ] backlog เล็ก (ย้ายมาจาก Learned 2026-10-07):` ด้วยรายการเดิมที่ตัด 4 เรื่องที่ทำเสร็จออก (loadHistory, retry ดาวน์โหลดรูป, deadline รวมทั้ง handler, getProfile timeout) เหลือ: `- [ ] backlog เล็ก (ย้ายมาจาก Learned 2026-10-07): ปุ่มสรุปยังนับ rate limit แม้ไม่เรียก Claude, dotenv quiet, trim input ของ try-parse; ไฟล์ .superpowers/sdd/step3-deferred-minors.md ที่เคยอ้างถึงไม่มีอยู่แล้ว (รายละเอียด minor อื่นของขั้นที่ 3 หายไป)`
- เพิ่มบรรทัดบนสุดของ `## Next`: `- [ ] reply resilience (2026-10-07, branch fix/reply-resilience, แผน docs/superpowers/plans/2026-10-07-reply-resilience.md): โค้ด Task 1-4 เสร็จ (ใส่จำนวนเทสต์จาก npm test ที่รันจริง) ยังไม่ merge ยังไม่ push; อ่านบริบทพังทำต่อแบบไม่มีบริบท, ดาวน์โหลดรูปลองใหม่ 1 ครั้ง (15 วิต่อครั้ง รอ 0.5 วิ เฉพาะ timeout/เชื่อมต่อไม่ได้/5xx), getProfile timeout 3 วิ, deadline 50 วิแล้วตอบ SLOW_PROCESSING_REPLY (งานค้างยังบันทึกต่อได้); ยังไม่ได้ลองในแอป LINE: ข้อความ deadline และ retry ทำงานกับ LINE จริง`

แก้บรรทัด `Updated:` เป็น `Updated: 2026-10-07` (ถ้ายังไม่ใช่)

- [ ] **Step 8: Commit**

```bash
git add src/bot.js src/bot.test.js README.md work-memory/STATE.md
git commit -m "fix: reply before the deadline when processing takes too long"
```

---

## Manual check (ผู้ใช้ทำเอง หลัง merge และ deploy)

ไม่มี Browser check เพราะไม่แตะหน้า LIFF; ทั้ง 3 เรื่องเกิดเฉพาะตอนระบบภายนอกช้าหรือพัง จึงสร้างซ้ำในแอป LINE ได้ยาก หลักฐานหลักคือ unit test

| # | Action | Expected |
|---|---|---|
| 1 | ส่ง "กินข้าว 60" ในแอป LINE | ได้การ์ดบันทึกตามปกติ (ไม่มีอะไรเปลี่ยนในกรณีปกติ) |
| 2 | ส่งรูปสลิป 1 รูป | ได้การ์ดยืนยันสลิปตามปกติ |
| 3 | เปิด log ของ Render หลังใช้งานไป 1-2 วัน ค้นคำว่า `Retrying LINE image download` และ `Event passed the reply deadline` | ถ้าเจอ แปลว่ากลไกใหม่ทำงานจริง ถ้า `Event passed the reply deadline` เจอบ่อย ให้แจ้งผู้พัฒนาเพื่อดูว่าขั้นไหนช้า |
