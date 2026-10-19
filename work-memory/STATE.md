# STATE
Updated: 2026-10-19 (ล่าสุด: push main แล้ว รอผู้ใช้ตั้ง cron และลองในแอป LINE)
Goal: ผลักดัน push รวมของฟีเจอร์ 3-6 (สรุปรายสัปดาห์, เตือนลืมจด, เป้าหมายการออม, กระเป๋าเงิน) ให้ผ่านการตรวจแล้วขึ้น main; หมวดของผู้ใช้เองและถามยอดเสร็จและ push แล้ว

กติกา: ทั้งไฟล์ไม่เกินประมาณ 60 บรรทัด, รายการละไม่เกิน 2 บรรทัด (รายละเอียดชี้ไปที่ไฟล์แผนหรือ commit), Done เก็บแค่ 5 รายการล่าสุด, งานที่ merge แล้วย้ายไป work-memory/archive/ (ของเก่า: archive/STATE-2026-09-to-10.md)

## รอผู้ใช้ทำ (ตอบตามนี้เมื่อผู้ใช้ถามว่าทำถึงไหน)
ฟีเจอร์ 3-6 push แล้ว (31c793d, 2026-10-19; ตรวจแล้วว่า Supabase มี 021-024 ครบก่อน push, npm test 2038/2038 lint ผ่าน); ทำตามลำดับ:
1. รอ Render deploy เสร็จ (สถานะ Live)
2. เพิ่ม cron-job.org 2 งาน: weekly อาทิตย์ 19:00, daily-reminder ทุกวัน 21:00 (ดู README)
3. ลองในแอป LINE: ออม (แผน savings-goals Task 6, 8-10), กระเป๋า (แผน wallets Task 7, 10-12 รวมชื่อยาวจอ 320px และการ์ด "อ่านกระเป๋าไม่ได้")

## Next
- [ ] `next` LINE check การ์ดถามยอด: merge+push แล้ว (18ee475) รอผู้ใช้ลอง (การ์ด, ปุ่ม ดูรายการในเว็บ เปิดเดือนนั้นพร้อมตัวกรองหมวด/คำค้น/ประเภท); worktree C:\GithubPrommin\line-expense-bot-flex ยังไม่ลบ (ต้องถามก่อนลบ); Minor M1-M5 ของ reviewer ถามยอดยังไม่ทำ
- [ ] `next` Browser check ในแอป LINE ของการลบหมวด (Task 4 ของแผน 2026-10-19-delete-category.md): merge+push แล้ว (bfc5dd1) ผู้ใช้รัน 019 แล้ว รอผู้ใช้ลอง
- [ ] Browser check ในแอป LINE ของไอคอนหมวด (Task 8 ของแผน 2026-10-18-category-icons.md) และหมวดของผู้ใช้เอง (Task 9 ของแผน 2026-10-18-custom-categories.md): merge+push แล้ว รอผู้ใช้ลอง
- [ ] custom categories follow-ups ที่เหลือ (ยังไม่เริ่ม; ข้อชื่อหมวดเจ้าของบิลแก้แล้วใน 6a4b442): limit race, unicode แปลก (C1/zero-width/bidi/fullwidth comma), toggle alert ไม่ล้างและอยู่ไกลแถว, refresh ยิง GET เกิน, loadTextCategories ต่อคิว loadHistory และอ่านหมวด 2 ครั้ง, latency ของ schema หลัง deploy
- [ ] wallets follow-ups (ยังไม่เริ่ม): index transactions(wallet_id,user_id), ชื่อซ้ำแยกตัวพิมพ์, ชื่อ look-alike "เงินสด" (zero-width/bidi), PATCH ไปกระเป๋าซ่อน, cap race, ลิงก์ w= หลังเปลี่ยนชื่อ, grid ตัวกรองครึ่งแถว, เทสต์ที่ขาด (รายละเอียด .superpowers/sdd/wa-final-findings.md)
- [ ] ตกค้างจาก 2026-10-12 ผู้ใช้ตัดสินไม่ทำ: รูปเพื่อนในรายชื่อ, สำเนา UUID_PATTERN ใน LIFF, ลำดับล็อก cancel_bill, push tag design-v1 (ข้อความเต็มดู archive)
- [ ] ความเสี่ยงที่ผู้ใช้ยอมรับแล้ว ไม่แก้ (2026-10-01): ไม่มี rate limit ที่ endpoint cron (secret 48 ตัว), เพดาน 50 กฎแข่งกันได้ (soft cap), .limit(500) ต่อรอบไม่กันกฎที่พังถาวร, Bearer แยกตัวพิมพ์ (ต้องพิมพ์ Bearer ตัว B ใหญ่)

## Done
- [x] กระเป๋าเงิน เฟส 1 roadmap ข ข้อ 6 (2026-10-19, branch feat/wallets ยังไม่ merge): migration 024, API /api/wallets, Claude เลือกกระเป๋า, ตัวกรอง/ตัวแก้ในเว็บ, ถามยอดกรองกระเป๋า; ส่วนกระเป๋าในโปรไฟล์โชว์ notify-loading และปิดฟอร์มเพิ่มจนโหลดครั้งแรกเสร็จ (ผู้ใช้ตัดสิน ไม่ตามแผน); npm test 2036/2036 lint ผ่าน (หลังรอบแก้ final review)
- [x] เป้าหมายการออม roadmap ข (2026-10-19, merge 784949b ในเครื่อง): reviewer I1 กดออมซ้ำระหว่างโหลดใหม่ได้ยอดซ้ำ แก้ใน 2b95e25 (เทสต์แดงก่อนแก้); npm test 1903/1903 lint ผ่าน; Minor M1-M3 M5-M8 ยังไม่ทำ (ตัดชื่อใน ไม่พบเป้า, normalize ชื่อ, 409/404 ไม่โหลดใหม่, ลบประวัติไม่ยืนยัน, "ออม 1000" ไปเป็นรายจ่าย, aria-label งบ, soft cap 20 เป้า/ปี 0000)
- [x] ถามยอดด้วยภาษาธรรมชาติ roadmap ข ข้อ 2 (2026-10-19, merge 95734a1 push แล้ว): ผู้ใช้รัน 020 ก่อน push; npm test 1609/1609 lint ผ่าน; ลอง API จริง schema 100 หมวด+"" ผ่าน; ถัดไปตาม roadmap คือข้อ 3 สรุปรายสัปดาห์ (migration 021)
- [x] ยอดยาวในการ์ด K (2026-10-19, branch fix/million-amount-wrap): ยอดเกิน 12 ตัวอักษรเรียงรายรับ/รายจ่ายแนวตั้ง, ยอดคงเหลือย่อตาม --amount-chars; ตรวจ headless Chrome จอ 320/360/390/430 ไม่ล้น; roadmap-b อัปเดตสถานะและเลข migration 020-024
- [x] PUT /api/budgets/:categoryId รับ id ตัวพิมพ์ใหญ่ (2026-10-19, branch fix/budget-uuid-case): เทสต์ใหม่แดง 404 ก่อนแก้; npm test 1552/1552 lint ผ่าน

## Blocked
- คำตอบของบอทส่งออกไปที่ LINE API โดยตรง ไม่ผ่าน ngrok จึงต้องให้ผู้ใช้ยืนยันจากแอป LINE เอง

## Learned
- LINE edit event (messageEdited, ออก 2026-08-12) ส่งมาเฉพาะ group chat ไม่มีในแชท 1:1; unsend event ในเอกสาร developer บอกว่ามีในแชท 1:1 แต่แอป LINE ในไทยไม่มีเมนูยกเลิกข้อความในแชทกับ official account (ลองจริง 2026-10-18) และในไทยยกเลิกข้อความได้แค่ภายใน 1 ชั่วโมง
- PostgREST: embed users จาก bills ต้องใส่ hint (owner:users!bills_owner_id_fkey) เพราะ bill_members ที่มี PK (bill_id, user_id) ทำให้เกิดเส้น many-to-many อีกเส้น ไม่ใส่จะได้ PGRST201; เทสต์ fakeSupabase จับไม่ได้
- งานที่เขียนข้อมูลแล้วตอบช้า (สร้างบิล) ต้องถือว่า status 0 และ 5xx เป็น "ไม่ทราบผล" ไม่ใช่ "ลองใหม่" เพราะ RPC อาจ commit แล้วทั้งที่ client timeout
- Chrome tab ที่ automation เปิดอยู่ในสถานะ hidden ทำให้ requestAnimationFrame หยุด แท่งกราฟค้าง 0% และตัวเลข count-up ว่าง ต้อง screenshot ก่อนวัดขนาด; resize_window ใช้ไม่ได้ ใช้ iframe กว้าง 390px แทน
- PGlite (เทสต์ SQL): ต้องสร้าง role anon/authenticated/service_role เอง และ service_role ต้อง bypassrls + grant ตารางถึงจะเหมือน Supabase; เรียงข้อความแบบ C collation ชื่อไทยที่ขึ้นต้นด้วยสระหน้า (เ แ โ) ลำดับต่างจาก Supabase; เริ่ม DB ราว 3 วินาที
- กฎที่มีแค่ใน SQL (แถว null ใหม่กว่ายกเลิกงบเก่า, ขอบเดือน, แยกผู้ใช้) เทสต์ JS พิสูจน์ไม่ได้เพราะ fakeSupabase คืนแถวสำเร็จรูป -> ต้องมี manual check/SQL check ใน Task 7 เสมอ
- การเตือนแบบตอนข้ามเส้น (edge-triggered) ไม่เก็บสถานะ ถ้าเช็กพังตอนข้ามเส้นคำเตือนหายถาวร -> ต้องบอกผู้ใช้เมื่อเช็กพัง ไม่ใช่เงียบ
- เทสต์ขอบ (>= กับ >) ต้องพิสูจน์ด้วยการ mutate เงื่อนไขชั่วคราวแล้วเห็นเทสต์แดง; สถานะ M ของ public/liff/format.mjs ที่เห็นใน git status เป็นแค่ line ending (diff ว่าง)
- Express 5 (router 2.2.0) ตอบ HEAD ด้วย handler ของ GET และ decodeParam ที่พังโยน URIError (status 400) ที่มีค่า param ใน message -> route ที่มีผลข้างเคียงต้องกัน HEAD และห้าม log error นี้ถ้า param เป็นความลับ
- gate-default.sh เป็น no-op ในโปรเจกต์นี้ (ใช้ npx vitest run กับไฟล์ของ task แทน) และไม่พิมพ์อะไรเมื่อผ่าน ต้องรัน vitest กับไฟล์ของ task แยกเพื่อยืนยันว่ามีเทสต์รันจริง
- แผน SDD ควรมี step สุดท้าย "อัปเดต work-memory/STATE.md" เพราะ subagent ไม่แตะ STATE เอง (final review จับได้ทั้งขั้นที่ 4 และ 5)
- Anthropic SDK: sleep ระหว่าง retry หยุดได้ด้วย signal จึงใช้ AbortSignal.timeout คุมเวลารวมได้จริง; stop_reason max_tokens/refusal อาจมี text บางส่วนมาด้วย ต้องเช็คก่อนใช้
- supabase.rpc ใช้ POST จึงไม่ถูก postgrest retry อัตโนมัติ
- SUPABASE_URL ต้องเป็น `https://<ref>.supabase.co` เท่านั้น ถ้ามี `/rest/v1/` ต่อท้าย supabase-js จะได้ status 200 แต่ count เป็น null โดยไม่มี error
- `require('vitest')` throw ใน CommonJS -> ไฟล์เทสต์ต้องใช้ `import`
- ใน vitest ถ้าเทสต์ `import` class แต่โค้ด `require` module เดียวกัน จะได้คนละ instance ทำให้ `instanceof` เป็น false -> เทสต์ต้องโหลดด้วย `createRequire(import.meta.url)` (router.test.js)
- Express router ที่ต่อหลัง `express.json()` ข้างนอกจะไม่ได้รับ error ของ body-parser -> ถ้าต้องการให้ API ตอบ JSON เสมอ ต้อง parse ใน router เอง
- LINE Verify ผ่านได้แม้ข้อความแชตยังไม่ถูกส่งมา webhook -> ต้องปิด Chat และเปิด Webhook ใน OA Manager > Response settings
- `express.raw` ต้องอยู่ก่อน LINE middleware ถึงจะจำกัดขนาด body ได้ (SDK ใช้ Buffer จาก req.body)
- SDK default timeout 600 วินาทีนานเกินไปสำหรับ reply token ของ LINE; Anthropic SDK ทำตาม retry-after โดยไม่มีเพดาน ต้องใส่ `signal: AbortSignal.timeout(...)`
- postgrest-js retry GET/HEAD เองเมื่อเจอ TimeoutError (ข้ามเฉพาะ AbortError) และรอ Retry-After ของ 503 โดยไม่มีเพดาน -> ปิดได้ด้วย `db: { retry: false }`
- structured outputs ผ่าน messages.create ต้องเขียน additionalProperties: false เอง
- subagent ใส่ Co-Authored-By/Claude-Session ตามชื่อ model และ session ของตัวเอง ไม่ใช่ตามที่แผนเขียน เว้นแต่ข้อความ dispatch ให้บรรทัดตรงตัว
- Supabase free tier อาจ pause project ถ้าไม่มีการใช้งานหลายวัน ระหว่างนั้นทุกข้อความจะได้ข้อความระบบมีปัญหา (จาก final review ยังไม่ได้ตรวจกับเอกสาร)
- global `[hidden]{display:none!important}` จำเป็น เพราะ display ของ component (เช่น grid) ชนะ attribute hidden; element ที่ JS สลับโหลด/error ต้องเริ่มด้วย `hidden`
- LIFF ต้องล็อกอิน LINE จึงใช้ Playwright ทดสอบอัตโนมัติไม่ได้: ตรวจ UI ด้วยมือในแอป LINE + DOM smoke test ด้วย jsdom (`public/liff/app.dom.test.mjs` ใช้ fake `liff`/`fetch`); jsdom ไม่มี `matchMedia`/`showModal` ต้อง stub
- error โหลดข้อมูลแสดงใน #banner ที่อยู่นอก panel ซึ่งถูกซ่อนตามแท็บ และต้องเป็น sticky loadError ที่แสดงซ้ำเมื่อสลับแท็บ (ไม่ใช่ล้างทุกครั้ง) ไม่งั้นแท็บอื่นว่างเปล่าไม่มีข้อความ; ข้อความชั่วคราว (เช่น 404 ตอนแก้) ยังล้างเมื่อสลับแท็บ
