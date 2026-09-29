# STATE
Updated: 2026-09-29
Goal: ทำขั้นที่ 1 (echo bot ผ่าน ngrok) และขั้นที่ 2 (Claude แยกข้อความเป็น JSON) ให้ `npm test` ผ่านครบ และ Manual check ใน LINE จริงผ่านทุกข้อ

## Next
- [ ] `next` ตัดสินใจว่าจะทดสอบ Task 8 ข้อ 7 (API key ผิด) หรือข้าม (error path มี unit test ใน src/bot.test.js แล้ว)
- [ ] ตัดสินใจ merge branch feat/step1-2-echo-and-parser
- [ ] เริ่ม SPEC ขั้นที่ 3

## Done
- [x] Task 1-8 implement และ review แล้วบน branch feat/step1-2-echo-and-parser
- [x] final fix wave (ซ่อน stack trace, timeout/retry ของ Claude, listen error, .gitignore `.env*`, แก้คอมเมนต์)
- [x] `npm test` ผ่าน 52 tests ใน 8 ไฟล์
- [x] Manual check Task 8 ข้อ 1-4 ผ่านกับ Claude จริง (try-parse, 2026-09-29): API รับ output_config json_schema, แยกหลายรายการ, วันที่ "เมื่อวาน" ถูก, "ซื้อของ" ได้ clarify
- [x] ผู้ใช้สร้าง `.env` ครบ 5 key แล้ว (ไม่ถูก track)
- [x] Manual check Task 4 ข้อ 1-3 ผ่าน (2026-09-29): /health ok ทั้ง local และผ่าน ngrok, POST /webhook ไม่มี signature ได้ 401, LINE Verify ได้ 200
- [x] ข้อความจริงจากแอป LINE (text 4 ข้อความ + sticker) ถึง /webhook ครบ ได้ 200 ทุกข้อความ ไม่มี redelivery (ตรวจจาก ngrok inspector)
- [x] ผู้ใช้ยืนยันคำตอบของบอทในแอป LINE ตรงตาราง (2026-09-29): Task 8 ข้อ 5-6 และ Task 4 ข้อ 5 (sticker ไม่ตอบ) ผ่าน; Task 4 ข้อ 4 (echo) ไม่ใช้แล้วเพราะ Task 8 แทน echo

## Blocked
- คำตอบของบอทส่งออกไปที่ LINE API โดยตรง ไม่ผ่าน ngrok จึงต้องให้ผู้ใช้ยืนยันจากแอป LINE เอง

## Learned
- `require('vitest')` throw ใน CommonJS -> ไฟล์เทสต์ต้องใช้ `import`
- winget ติดตั้ง ngrok แต่ไม่เพิ่มเข้า PATH -> เรียกด้วย path เต็ม `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe`
- LINE Verify ผ่านได้แม้ข้อความแชตยังไม่ถูกส่งมา webhook -> ต้องปิด Chat และเปิด Webhook ใน OA Manager > Response settings
- `express.raw` ต้องอยู่ก่อน LINE middleware ถึงจะจำกัดขนาด body ได้ (SDK ใช้ Buffer จาก req.body)
- SDK default timeout 600 วินาทีนานเกินไปสำหรับ reply token ของ LINE
- structured outputs ผ่าน messages.create ต้องเขียน additionalProperties: false เอง
- backlog ขั้น 3 จาก review: dedupe ด้วย webhookEventId, rate limit ต่อผู้ใช้สำหรับเรียก Claude, เพดานจำนวนเงิน, ใส่ user id ใน log, กรอง event.source.type (group), dotenv quiet, trim input ของ try-parse
