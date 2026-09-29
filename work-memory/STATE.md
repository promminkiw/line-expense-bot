# STATE
Updated: 2026-09-29
Goal: ทำขั้นที่ 1 (echo bot ผ่าน ngrok) และขั้นที่ 2 (Claude แยกข้อความเป็น JSON) ให้ `npm test` ผ่านครบ และ Manual check ใน LINE จริงผ่านทุกข้อ

## Next
- [ ] ผู้ใช้ทำ Manual check: Task 4 ข้อ 1, 2, 3, 5 และ Task 8 ข้อ 1-7 (Task 4 ข้อ 4 "บอท echo สวัสดี" ใช้ไม่ได้แล้วที่ HEAD เพราะ Task 8 แทน echo; Task 8 ข้อ 5 ครอบคลุมการตอบจริงแทน)
- [ ] ตัดสินใจ merge branch feat/step1-2-echo-and-parser
- [ ] เริ่ม SPEC ขั้นที่ 3

## Done
- [x] Task 1-8 implement และ review แล้วบน branch feat/step1-2-echo-and-parser
- [x] final fix wave (ซ่อน stack trace, timeout/retry ของ Claude, listen error, .gitignore `.env*`, แก้คอมเมนต์)
- [x] `npm test` ผ่าน 52 tests ใน 8 ไฟล์

## Blocked
- Manual check ต้องใช้ LINE OA, `.env`, ngrok และ Anthropic key ของผู้ใช้

## Learned
- `require('vitest')` throw ใน CommonJS -> ไฟล์เทสต์ต้องใช้ `import`
- `express.raw` ต้องอยู่ก่อน LINE middleware ถึงจะจำกัดขนาด body ได้ (SDK ใช้ Buffer จาก req.body)
- SDK default timeout 600 วินาทีนานเกินไปสำหรับ reply token ของ LINE
- structured outputs ผ่าน messages.create ต้องเขียน additionalProperties: false เอง
- backlog ขั้น 3 จาก review: dedupe ด้วย webhookEventId, rate limit ต่อผู้ใช้สำหรับเรียก Claude, เพดานจำนวนเงิน, ใส่ user id ใน log, กรอง event.source.type (group), dotenv quiet, trim input ของ try-parse
