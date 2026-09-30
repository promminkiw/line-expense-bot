# STATE
Updated: 2026-09-30
Goal: ทำขั้นที่ 6b (กราฟตามหมวด + export CSV + แก้รายการเกิน max-rows) ตามแผน docs/superpowers/plans/2026-09-30-liff-chart-csv.md บน branch feat/step6b-chart-csv

## Next
- [ ] `next` ผู้ใช้เลือกวิธีลงมือแผน 6b (Subagent-Driven แนะนำ หรือ Inline) แล้วเริ่ม Task 1, 2, 3, 6 พร้อมกัน
- [ ] Task 9 ของแผน 6b (ผู้ใช้): รัน supabase/004_export_links.sql, npm start ใหม่, manual check 9 ข้อในแอป LINE
- [ ] merge feat/step6b-chart-csv เข้า main หลัง Task 9 ผ่าน

## Done
- [x] เขียนแผนขั้นที่ 6b (2026-09-30, commit 0c96984) บน branch feat/step6b-chart-csv (แยกจาก main e9d4102): ผู้ใช้เลือก กราฟแท่งแนวนอนทำด้วย HTML/CSS, แท็บ รายจ่าย/รายรับ เปิดมาเป็นรายจ่าย, CSV ผ่านลิงก์ใช้ครั้งเดียว 5 นาทีเปิดใน Safari (liff.openWindow external) เก็บ hash ในตาราง export_links, CSV เฉพาะเดือนที่เลือก; ค่าเริ่มต้น: ยอดรวม/กราฟจาก summarize_transactions, หมายเหตุเมื่อรายการถูกตัด, CSV UTF-8 BOM หัวตารางภาษาไทย กัน CSV injection; 8 tasks + Task 9 ผู้ใช้
- [x] แก้ minor ที่ค้างของ 6a ตามที่ผู้ใช้สั่ง (ec1504a): guard editor เปิดค้างหลังโหลดหมวด, คอมเมนต์ router.js, ปุ่ม กำลังลบ... ไม่จาง; npm test 259/259
- [x] merge feat/step6-liff เข้า main ในเครื่อง (ยังไม่ push)
- [x] Task 9 ของ 6a ผ่าน (2026-09-30): สร้าง LINE Login channel + LIFF app (Endpoint https://populace-gong-fossil.ngrok-free.dev/liff/, scope openid), .env ครบ 9 key, manual check 10 ข้อผ่าน (เปิดเว็บตอบลิงก์, หน้าเว็บตรงกับ Supabase, เดือนว่าง 0 บาท, แก้จำนวนเงิน, เปลี่ยนเป็นรายรับ type=income, 20000000 ถูก browser กัน, modal ยืนยันลบ + ลบจริง, API ไม่มี token ได้ Unauthorized, Rich Menu ช่อง B เป็นลิงก์ LIFF แล้ว), หน้าไม่เด้งหลังแก้รายการล่าง; ทดสอบเปิดค้างเกิน 1 ชั่วโมง ผู้ใช้เลือกไม่ทดสอบ
- [x] ระหว่าง Task 9: แก้ ngrok free แทรกหน้าเตือน (ERR_NGROK_6024) กับ fetch ไป /api -> ส่ง header ngrok-skip-browser-warning (be668a8); ผู้ใช้ขอเปลี่ยนปุ่มลบแบบกดสองครั้งเป็น modal ยืนยันที่ออกแบบเอง (32964c9) falcon+panda ผ่าน; npm test 259/259 ใน 24 ไฟล์
- [x] ขั้นที่ 1-2 เสร็จและ merge เข้า main ในเครื่องแล้ว (merge commit 2b5f77d, ยังไม่ push); manual check ขั้นที่ 1-2 ผ่านครบ
- [x] เปลี่ยนข้อความตอบเมื่อระบบมีปัญหาเป็น `ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง` (ตอนนี้ชื่อค่าคงที่คือ SYSTEM_ERROR_REPLY ใน src/bot.js)
- [x] ขั้นที่ 3 Task 1-9 implement + review + gate ผ่านครบด้วย Subagent-Driven (2026-09-29); Task 1, 6, 7 มี fix round 1 รอบ
- [x] final review ทั้ง branch (dragon/viper/coral) -> fix wave เดียว: deadline 30 วินาทีของ Claude, timeout 5 วินาทีต่อ request ของ Supabase, pin test ว่า undo ลบได้เฉพาะเจ้าของ, log `Failed to send reply` พร้อม lineUserId, ปฏิเสธจำนวนเงินที่ปัดแล้วเป็น 0 สตางค์, เพิ่มคำสั่งแก้ grant ใน manual check
- [x] `npm test` ผ่าน 101 tests ใน 13 ไฟล์ และ `node --check index.js` ผ่าน (HEAD a275dd4 + docs)
- [x] เพิ่ม `db: { retry: false }` ใน createClient ของ index.js ตามที่ผู้ใช้สั่ง (ตรวจแล้วว่า builder ได้ retry=false, npm test 101/101)
- [x] ต่อ Supabase จริงได้ (2026-09-29): ผู้ใช้ใส่ key ใน .env แล้ว, ทั้ง 6 ตารางตอบ status 200 rows=0 ด้วย service role (อ่านอย่างเดียว)
- [x] Manual check ขั้นที่ 3 ผ่านครบ (2026-09-29): Task 1 Step 3 (RLS 6 ตาราง true, cascade script 0 ทุกคอลัมน์, grant service_role ครบ) และ Task 9 Step 5 ข้อ 1-9 (บันทึก+ปุ่มยกเลิก, users 1 แถว, categories 10, transactions 2 แถว line_event_id เดียวกัน, ยกเลิกลบจริง, clarify ไม่มีปุ่ม, 20000000 ไม่บันทึก, anon ได้ [], ลบ user แล้ว block/unblock สมัครใหม่พร้อม 10 หมวด)
- [x] ข้อความตอบเมื่อจำนวนเงินเกินเพดานเป็น `จำนวนเงินเกินเพดานที่กำหนด (ไม่เกิน 10,000,000 บาทต่อรายการ)` (AMOUNT_TOO_LARGE_QUESTION ใน parse-message.js, test ก่อน, npm test 102/102)
- [x] เพิ่มกฎใน system prompt ห้ามถามวันที่ตอน clarify (test ก่อน, npm test 103/103, try-parse กับ Claude จริงได้ "ซื้อของเท่าไหร่")
- [x] บอทจำคำถามกลับ 10 นาที (ตาราง pending_clarifications ใน supabase/002_pending_clarifications.sql, เก็บสูงสุด 6 ข้อความ, ล้างเมื่อบันทึกสำเร็จ; test ก่อน, npm test 115/115; ลองกับ Claude จริง: ซื้อรถ -> 500000 ได้รายการ, -> 20000000 ได้ข้อความเพดาน)
- [x] ผู้ใช้รัน 002_pending_clarifications.sql และลองใน LINE แล้ว (2026-09-29): ซื้อรถ -> 500000 บันทึกได้; ตรวจแล้ว pending_clarifications ถูกล้างเป็น 0 แถว, transactions 1 แถว
- [x] review งานหลัง final review (falcon+viper) -> แก้: ล้างบริบทหลังบันทึกสำเร็จ, บันทึก/ล้างบริบทพังไม่กระทบคำตอบ, กฎ prompt ให้ดึงรายการจากข้อความล่าสุด; re-review ผ่าน; Claude จริง 4 กรณีถูก; npm test 119/119
- [x] ผู้ใช้เลือกปล่อย Co-Authored-By "Sonnet 5.5" ของ subagent ไว้ตามเดิม
- [x] merge feat/step3-supabase เข้า main ในเครื่อง (ยังไม่ push)
- [x] เขียนแผนขั้นที่ 4 (2026-09-29): SQL function summarize_transactions (003), สัปดาห์ = จันทร์ถึงวันนี้, แสดง 5 หมวดรายจ่ายแรก + หมวดอื่น, "สรุป" เฉยๆ ขึ้นปุ่ม 3 ช่วง
- [x] ขั้นที่ 4 Task 1-9 implement + review + gate ผ่านด้วย Subagent-Driven (2026-09-29); Task 5 (guard stop_reason) และ Task 6 (แก้คอมเมนต์ตามที่ผู้ใช้เลือก + เพิ่ม 2 เทสต์) มี fix round 1 รอบ; final review dragon/viper/coral = With fixes -> fix wave เดียว; npm test 162/162 ใน 18 ไฟล์ (หลัง fix wave 774ae62 ด้วย)
- [x] Manual check ขั้นที่ 4 ผ่านครบ (2026-09-29): รัน 003 สำเร็จ, ยอดจาก function ตรงกับ Table Editor, สิทธิ์ anon=false authenticated=false service_role=true; ใน LINE: สรุป ขึ้น 3 ปุ่ม, การ์ดวันนี้ยอดตรงมีคำอธิบาย, สัปดาห์นี้ 28/09-29/09, สรุป เดือนนี้ (เว้นวรรค) 01/09-29/09, ไม่มีแถวใหม่จากคำสั่งสรุป, altText ถูก, publishable key เรียก rpc ได้ 42501 permission denied (ครั้งแรกได้ [] น่าจะใช้ secret key ผิดตัว)
- [x] merge feat/step4-summary เข้า main ในเครื่อง (merge commit 58bdb00, ยังไม่ push) npm test บน main 162/162
- [x] เขียนแผนขั้นที่ 5 (2026-09-29): สร้างเมนูใน OA Manager, ปุ่มเปิดเว็บตอบกำลังพัฒนาจนกว่าจะมี LIFF, ใช้ข้อความช่วยเหลือที่ร่างไว้
- [x] ขั้นที่ 5 Task 1-2 implement + review + gate ผ่านด้วย Subagent-Driven (2026-09-29): src/menu/fixed-replies.js และบอทตอบ ช่วยเหลือ/เปิดเว็บ หลัง dedupe ก่อน rate limit ไม่เรียก Claude; final review (dragon) = With fixes; npm test 172/172 ใน 19 ไฟล์
- [x] ข้อความช่วยเหลือเปลี่ยนเป็นแบบแบ่งหัวข้อพร้อม emoji ตามที่ผู้ใช้ขอ (ผู้ใช้อนุญาต emoji เฉพาะข้อความนี้; falcon Approved; npm test 172/172)
- [x] Manual check ขั้นที่ 5 ผ่านครบ (2026-09-29): สร้าง Rich Menu ใน OA Manager ด้วยรูป 2500x843 ที่สร้างด้วย PowerShell (OA Manager ไม่มีปุ่มสร้างภาพ), เมนูขึ้น 3 ช่อง, สรุป ขึ้นปุ่ม 3 ช่วง, ช่วยเหลือ ได้ข้อความใหม่, เปิดเว็บ ได้ข้อความกำลังพัฒนา, ไม่มีแถวใหม่ใน transactions, พับ/กางเมนูได้
- [x] merge feat/step5-rich-menu เข้า main ในเครื่อง (merge commit 960be2e, ยังไม่ push) npm test บน main 172/172
- [x] เขียนแผนขั้นที่ 6a (2026-09-30): แบ่ง 6a/6b, HTML+JS ธรรมดา (public/liff, .mjs), ngrok ของผู้ใช้ URL คงที่อยู่แล้ว, แก้ได้ จำนวนเงิน/หมวด/วันที่/โน้ต (ประเภทตามหมวด)
- [x] ขั้นที่ 6a Task 1-8 implement + review + gate ผ่านด้วย Subagent-Driven (2026-09-30), HEAD fe2ae19; npm test 256/256 ใน 24 ไฟล์, node --check index.js ผ่าน; final review dragon/viper/panda = With fixes -> fix wave เดียว (log เหตุผลที่ LINE ปฏิเสธ token, LINE 5xx/429 เป็น 500, timeout 15 วินาทีฝั่งหน้าเว็บ, ไม่ล้าง list ตอน reload หลังแก้, ลองโหลดหมวดใหม่ใน editor, ปิด dialog ไม่ได้ระหว่างบันทึก)
- [x] สิ่งที่ผู้ใช้ตัดสินระหว่าง 6a (ต่างจากแผน): หน้าเว็บจัดการ error/สี AA/แถวเป็นปุ่ม, เพิ่มเทสต์ AuthError+timeout, ใช้ isValidCalendarDate ร่วมกันใน src/utils/date.js (แตะ parse-message.js), router parse JSON เอง (limit 10kb, error 4xx เป็น JSON, 404 JSON) และ app mount `/api` โดยไม่มี express.json ข้างนอก
- [x] ข้อเล็กที่เลื่อนไว้ของ 6a อยู่ใน .superpowers/sdd/step6a-minors.md และ ledger .superpowers/sdd/progress.md (เช่น serve *.test.mjs, API สร้าง user ให้คนที่ยังไม่เพิ่มเพื่อนบอท, หน้าเว็บไม่มี retry button)

## Blocked
- คำตอบของบอทส่งออกไปที่ LINE API โดยตรง ไม่ผ่าน ngrok จึงต้องให้ผู้ใช้ยืนยันจากแอป LINE เอง

## Learned
- แผน SDD ควรมี step สุดท้าย "อัปเดต work-memory/STATE.md" เพราะ subagent ไม่แตะ STATE เอง (final review จับได้ทั้งขั้นที่ 4 และ 5)
- Anthropic SDK: sleep ระหว่าง retry หยุดได้ด้วย signal จึงใช้ AbortSignal.timeout คุมเวลารวมได้จริง; stop_reason max_tokens/refusal อาจมี text บางส่วนมาด้วย ต้องเช็คก่อนใช้
- supabase.rpc ใช้ POST จึงไม่ถูก postgrest retry อัตโนมัติ
- SUPABASE_URL ต้องเป็น `https://<ref>.supabase.co` เท่านั้น ถ้ามี `/rest/v1/` ต่อท้าย supabase-js จะได้ status 200 แต่ count เป็น null โดยไม่มี error
- ngrok แบบฟรีแทรกหน้าเตือน HTML ให้ request ที่ดูเหมือนมาจาก browser (ไม่ส่งต่อมาที่ server และไม่โผล่ใน inspector) -> fetch จากหน้าเว็บต้องส่ง header ngrok-skip-browser-warning; เช็กได้จาก http://127.0.0.1:4040/api/requests/http
- `require('vitest')` throw ใน CommonJS -> ไฟล์เทสต์ต้องใช้ `import`
- ใน vitest ถ้าเทสต์ `import` class แต่โค้ด `require` module เดียวกัน จะได้คนละ instance ทำให้ `instanceof` เป็น false -> เทสต์ต้องโหลดด้วย `createRequire(import.meta.url)` (router.test.js)
- Express router ที่ต่อหลัง `express.json()` ข้างนอกจะไม่ได้รับ error ของ body-parser -> ถ้าต้องการให้ API ตอบ JSON เสมอ ต้อง parse ใน router เอง
- winget ติดตั้ง ngrok แต่ไม่เพิ่มเข้า PATH -> เรียกด้วย path เต็ม `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe`
- LINE Verify ผ่านได้แม้ข้อความแชตยังไม่ถูกส่งมา webhook -> ต้องปิด Chat และเปิด Webhook ใน OA Manager > Response settings
- `express.raw` ต้องอยู่ก่อน LINE middleware ถึงจะจำกัดขนาด body ได้ (SDK ใช้ Buffer จาก req.body)
- SDK default timeout 600 วินาทีนานเกินไปสำหรับ reply token ของ LINE; Anthropic SDK ทำตาม retry-after โดยไม่มีเพดาน ต้องใส่ `signal: AbortSignal.timeout(...)`
- postgrest-js retry GET/HEAD เองเมื่อเจอ TimeoutError (ข้ามเฉพาะ AbortError) และรอ Retry-After ของ 503 โดยไม่มีเพดาน -> ปิดได้ด้วย `db: { retry: false }`
- structured outputs ผ่าน messages.create ต้องเขียน additionalProperties: false เอง
- subagent ใส่ Co-Authored-By ตามชื่อ model ของตัวเอง ไม่ใช่ตามที่แผนเขียน
- Supabase free tier อาจ pause project ถ้าไม่มีการใช้งานหลายวัน ระหว่างนั้นทุกข้อความจะได้ข้อความระบบมีปัญหา (จาก final review ยังไม่ได้ตรวจกับเอกสาร)
- backlog ที่ยังเหลือ: ขั้นที่ 6 ต้องเปลี่ยนปุ่มเปิดเว็บใน OA Manager เป็นลิงก์ LIFF และเอา WEB_COMING_SOON_REPLY ออก, ปุ่มสรุปยังนับ rate limit แม้ reply เมนูไม่เรียก Claude, loadHistory อ่านบริบทพังแล้วตอบ system error (ควรถือเป็นไม่มีบริบท), dotenv quiet, trim input ของ try-parse, deadline รวมทั้ง handler, timeout ของ getProfile, minor อื่นใน .superpowers/sdd/step3-deferred-minors.md
