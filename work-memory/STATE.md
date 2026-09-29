# STATE
Updated: 2026-09-29
Goal: ทำขั้นที่ 3 (ตาราง Supabase + RLS, บันทึกรายการจริง, สมัครผู้ใช้อัตโนมัติ) ตามแผน docs/superpowers/plans/2026-09-29-supabase-save-entries.md บน branch feat/step3-supabase

## Next
- [ ] `next` ผู้ใช้ตัดสินใจ: เพิ่ม `db: { retry: false }` ใน createClient ของ index.js ไหม (final re-review บอกว่า timeout 5 วินาทีของ Supabase ยังไม่จำกัดเวลาจริง เพราะ postgrest retry เองได้ถึง ~27 วินาทีต่อการอ่าน) - ต้องทำก่อน deploy
- [ ] ผู้ใช้ทำ manual check Task 1 Step 3 ข้อ 1-8 (สร้าง Supabase project, รัน schema, ตรวจ RLS/cascade/grant, ใส่ SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env)
- [ ] ผู้ใช้ทำ manual check Task 9 Step 5 ข้อ 1-9 กับ LINE และ Supabase จริง
- [ ] ผู้ใช้ตัดสินใจเรื่อง Co-Authored-By: commit ของ subagent ลงท้าย "Claude Sonnet 5.5" แต่แผนเขียน "Opus 5.5" (แก้ต้องเขียนประวัติ git ใหม่)
- [ ] ตัดสินใจ merge feat/step3-supabase เข้า main (หลัง manual check ผ่าน)

## Done
- [x] ขั้นที่ 1-2 เสร็จและ merge เข้า main ในเครื่องแล้ว (merge commit 2b5f77d, ยังไม่ push); manual check ขั้นที่ 1-2 ผ่านครบ
- [x] เปลี่ยนข้อความตอบเมื่อระบบมีปัญหาเป็น `ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง` (ตอนนี้ชื่อค่าคงที่คือ SYSTEM_ERROR_REPLY ใน src/bot.js)
- [x] ขั้นที่ 3 Task 1-9 implement + review + gate ผ่านครบด้วย Subagent-Driven (2026-09-29); Task 1, 6, 7 มี fix round 1 รอบ
- [x] final review ทั้ง branch (dragon/viper/coral) -> fix wave เดียว: deadline 30 วินาทีของ Claude, timeout 5 วินาทีต่อ request ของ Supabase, pin test ว่า undo ลบได้เฉพาะเจ้าของ, log `Failed to send reply` พร้อม lineUserId, ปฏิเสธจำนวนเงินที่ปัดแล้วเป็น 0 สตางค์, เพิ่มคำสั่งแก้ grant ใน manual check
- [x] `npm test` ผ่าน 101 tests ใน 13 ไฟล์ และ `node --check index.js` ผ่าน (HEAD a275dd4 + docs)

## Blocked
- คำตอบของบอทส่งออกไปที่ LINE API โดยตรง ไม่ผ่าน ngrok จึงต้องให้ผู้ใช้ยืนยันจากแอป LINE เอง
- ไม่มี Postgres/Supabase ในเครื่อง: SQL และ query จริงยังไม่เคยรัน ต้องรอผู้ใช้ทำ manual check

## Learned
- `require('vitest')` throw ใน CommonJS -> ไฟล์เทสต์ต้องใช้ `import`
- winget ติดตั้ง ngrok แต่ไม่เพิ่มเข้า PATH -> เรียกด้วย path เต็ม `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe`
- LINE Verify ผ่านได้แม้ข้อความแชตยังไม่ถูกส่งมา webhook -> ต้องปิด Chat และเปิด Webhook ใน OA Manager > Response settings
- `express.raw` ต้องอยู่ก่อน LINE middleware ถึงจะจำกัดขนาด body ได้ (SDK ใช้ Buffer จาก req.body)
- SDK default timeout 600 วินาทีนานเกินไปสำหรับ reply token ของ LINE; Anthropic SDK ทำตาม retry-after โดยไม่มีเพดาน ต้องใส่ `signal: AbortSignal.timeout(...)`
- postgrest-js retry GET/HEAD เองเมื่อเจอ TimeoutError (ข้ามเฉพาะ AbortError) และรอ Retry-After ของ 503 โดยไม่มีเพดาน -> ปิดได้ด้วย `db: { retry: false }`
- structured outputs ผ่าน messages.create ต้องเขียน additionalProperties: false เอง
- subagent ใส่ Co-Authored-By ตามชื่อ model ของตัวเอง ไม่ใช่ตามที่แผนเขียน
- Supabase free tier อาจ pause project ถ้าไม่มีการใช้งานหลายวัน ระหว่างนั้นทุกข้อความจะได้ข้อความระบบมีปัญหา (จาก final review ยังไม่ได้ตรวจกับเอกสาร)
- backlog ที่ยังเหลือ: dotenv quiet, trim input ของ try-parse, deadline รวมทั้ง handler, timeout ของ getProfile, minor อื่นใน .superpowers/sdd/step3-deferred-minors.md
