# STATE
Updated: 2026-09-29
Goal: ทำขั้นที่ 3 (ตาราง Supabase + RLS, บันทึกรายการจริง, สมัครผู้ใช้อัตโนมัติ) ตามแผน docs/superpowers/plans/2026-09-29-supabase-save-entries.md บน branch feat/step3-supabase

## Next
- [ ] `next` ทำ Subagent-Driven ต่อ: ดู .superpowers/sdd/progress.md ส่วน 'PLAN step3' (หยุดกลางทางเพราะ usage limit) - อ่านผล T2/T6, รัน gate T3/T4/T5, แก้ข้อ viper ของ T1 (เพิ่มขั้นตรวจ cascade ตอนลบ user และตรวจ grant ของ service_role ใน manual Step 3)
- [ ] Task 7 -> 8 -> 9 ของแผนขั้นที่ 3 (Task 1 Step 3 และ Task 9 Step 5 ผู้ใช้ทำเอง)

## Done
- [x] Task 1-8 implement และ review แล้วบน branch feat/step1-2-echo-and-parser
- [x] final fix wave (ซ่อน stack trace, timeout/retry ของ Claude, listen error, .gitignore `.env*`, แก้คอมเมนต์)
- [x] `npm test` ผ่าน 52 tests ใน 8 ไฟล์
- [x] Manual check Task 8 ข้อ 1-4 ผ่านกับ Claude จริง (try-parse, 2026-09-29): API รับ output_config json_schema, แยกหลายรายการ, วันที่ "เมื่อวาน" ถูก, "ซื้อของ" ได้ clarify
- [x] ผู้ใช้สร้าง `.env` ครบ 5 key แล้ว (ไม่ถูก track)
- [x] Manual check Task 4 ข้อ 1-3 ผ่าน (2026-09-29): /health ok ทั้ง local และผ่าน ngrok, POST /webhook ไม่มี signature ได้ 401, LINE Verify ได้ 200
- [x] ข้อความจริงจากแอป LINE (text 4 ข้อความ + sticker) ถึง /webhook ครบ ได้ 200 ทุกข้อความ ไม่มี redelivery (ตรวจจาก ngrok inspector)
- [x] ผู้ใช้ยืนยันคำตอบของบอทในแอป LINE ตรงตาราง (2026-09-29): Task 8 ข้อ 5-6 และ Task 4 ข้อ 5 (sticker ไม่ตอบ) ผ่าน; Task 4 ข้อ 4 (echo) ไม่ใช้แล้วเพราะ Task 8 แทน echo
- [x] merge feat/step1-2-echo-and-parser เข้า main ในเครื่อง (2026-09-29, merge commit 2b5f77d, ยังไม่ push) `npm test` บน main ผ่าน 52 tests
- [x] Task 8 ข้อ 7 ผ่าน (2026-09-29): ใช้ key ผิด บอทตอบ `ขออภัย ระบบอ่านข้อความไม่สำเร็จ ...` และ terminal มี log `Failed to parse message`; ผู้ใช้ใส่ key จริงคืนแล้ว -> Manual check ขั้นที่ 1-2 ผ่านครบ
- [x] เปลี่ยน PARSE_FAILED_REPLY ใน src/bot.js เป็น `ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง` ตามที่ผู้ใช้ขอ (test ก่อน, `npm test` ผ่าน 53 tests, commit แล้ว; ยังไม่ได้ลองในแอป LINE ต้อง restart `npm start` ก่อน)
- [x] เขียนแผนขั้นที่ 3 (2026-09-29): ผู้ใช้เลือกสร้างครบ 5 ตาราง + line_events, บันทึก + ปุ่มยกเลิก (แก้ไขไปขั้น 6), กันบันทึกซ้ำ, เพดาน 10 ล้านบาท, ข้าม group + user id ใน log, rate limit 10 ข้อความ/60 วินาที, สร้างตารางผ่าน SQL Editor
- [x] Subagent-Driven ขั้นที่ 3: Task 1, 3, 4, 5, 6 implement + commit แล้ว; review ผ่าน T3/T4/T5, T1 falcon ผ่านแต่ viper ขอเพิ่มขั้นตรวจ cascade

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
