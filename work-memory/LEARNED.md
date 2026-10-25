# LEARNED

สิ่งที่เรียนรู้ระหว่างทำงาน แยกจาก STATE เพื่อไม่ต้องอ่านทุก session เปิดดูเฉพาะหัวข้อที่เกี่ยวกับงาน

## LINE และ LIFF
- LINE edit event (messageEdited, ออก 2026-08-12) ส่งมาเฉพาะ group chat ไม่มีในแชท 1:1; unsend event ในเอกสาร developer บอกว่ามีในแชท 1:1 แต่แอป LINE ในไทยไม่มีเมนูยกเลิกข้อความในแชทกับ official account (ลองจริง 2026-10-18) และในไทยยกเลิกข้อความได้แค่ภายใน 1 ชั่วโมง
- LINE Verify ผ่านได้แม้ข้อความแชตยังไม่ถูกส่งมา webhook -> ต้องปิด Chat และเปิด Webhook ใน OA Manager > Response settings
- global `[hidden]{display:none!important}` จำเป็น เพราะ display ของ component (เช่น grid) ชนะ attribute hidden; element ที่ JS สลับโหลด/error ต้องเริ่มด้วย `hidden`
- LIFF ต้องล็อกอิน LINE จึงใช้ Playwright ทดสอบอัตโนมัติไม่ได้: ตรวจ UI ด้วยมือในแอป LINE + DOM smoke test ด้วย jsdom (`public/liff/app.dom.test.mjs` ใช้ fake `liff`/`fetch`); jsdom ไม่มี `matchMedia`/`showModal` ต้อง stub
- error โหลดข้อมูลแสดงใน #banner ที่อยู่นอก panel ซึ่งถูกซ่อนตามแท็บ และต้องเป็น sticky loadError ที่แสดงซ้ำเมื่อสลับแท็บ (ไม่ใช่ล้างทุกครั้ง) ไม่งั้นแท็บอื่นว่างเปล่าไม่มีข้อความ; ข้อความชั่วคราว (เช่น 404 ตอนแก้) ยังล้างเมื่อสลับแท็บ
- ID token ของ LIFF ใน Chrome หมดอายุราว 1 ชั่วโมง หน้าเว็บขึ้น "กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง" ต้อง `liff.logout()` แล้วให้ผู้ใช้กด Log in เอง (Claude ไม่กดปุ่ม login แทน)

## Supabase และ Postgres
- PostgREST: embed users จาก bills ต้องใส่ hint (owner:users!bills_owner_id_fkey) เพราะ bill_members ที่มี PK (bill_id, user_id) ทำให้เกิดเส้น many-to-many อีกเส้น ไม่ใส่จะได้ PGRST201; เทสต์ fakeSupabase จับไม่ได้
- supabase.rpc ใช้ POST จึงไม่ถูก postgrest retry อัตโนมัติ
- SUPABASE_URL ต้องเป็น `https://<ref>.supabase.co` เท่านั้น ถ้ามี `/rest/v1/` ต่อท้าย supabase-js จะได้ status 200 แต่ count เป็น null โดยไม่มี error
- postgrest-js retry GET/HEAD เองเมื่อเจอ TimeoutError (ข้ามเฉพาะ AbortError) และรอ Retry-After ของ 503 โดยไม่มีเพดาน -> ปิดได้ด้วย `db: { retry: false }`
- Supabase free tier อาจ pause project ถ้าไม่มีการใช้งานหลายวัน ระหว่างนั้นทุกข้อความจะได้ข้อความระบบมีปัญหา (จาก final review ยังไม่ได้ตรวจกับเอกสาร)

## Express
- Express 5 (router 2.2.0) ตอบ HEAD ด้วย handler ของ GET และ decodeParam ที่พังโยน URIError (status 400) ที่มีค่า param ใน message -> route ที่มีผลข้างเคียงต้องกัน HEAD และห้าม log error นี้ถ้า param เป็นความลับ
- Express router ที่ต่อหลัง `express.json()` ข้างนอกจะไม่ได้รับ error ของ body-parser -> ถ้าต้องการให้ API ตอบ JSON เสมอ ต้อง parse ใน router เอง
- `express.raw` ต้องอยู่ก่อน LINE middleware ถึงจะจำกัดขนาด body ได้ (SDK ใช้ Buffer จาก req.body)

## Claude SDK
- Anthropic SDK: sleep ระหว่าง retry หยุดได้ด้วย signal จึงใช้ AbortSignal.timeout คุมเวลารวมได้จริง; stop_reason max_tokens/refusal อาจมี text บางส่วนมาด้วย ต้องเช็คก่อนใช้
- SDK default timeout 600 วินาทีนานเกินไปสำหรับ reply token ของ LINE; Anthropic SDK ทำตาม retry-after โดยไม่มีเพดาน ต้องใส่ `signal: AbortSignal.timeout(...)`
- structured outputs ผ่าน messages.create ต้องเขียน additionalProperties: false เอง

## การออกแบบ
- งานที่เขียนข้อมูลแล้วตอบช้า (สร้างบิล) ต้องถือว่า status 0 และ 5xx เป็น "ไม่ทราบผล" ไม่ใช่ "ลองใหม่" เพราะ RPC อาจ commit แล้วทั้งที่ client timeout
- การเตือนแบบตอนข้ามเส้น (edge-triggered) ไม่เก็บสถานะ ถ้าเช็กพังตอนข้ามเส้นคำเตือนหายถาวร -> ต้องบอกผู้ใช้เมื่อเช็กพัง ไม่ใช่เงียบ

## เทสต์
- PGlite (เทสต์ SQL): ต้องสร้าง role anon/authenticated/service_role เอง และ service_role ต้อง bypassrls + grant ตารางถึงจะเหมือน Supabase; เรียงข้อความแบบ C collation ชื่อไทยที่ขึ้นต้นด้วยสระหน้า (เ แ โ) ลำดับต่างจาก Supabase; เริ่ม DB ราว 3 วินาที
- กฎที่มีแค่ใน SQL (แถว null ใหม่กว่ายกเลิกงบเก่า, ขอบเดือน, แยกผู้ใช้) เทสต์ JS พิสูจน์ไม่ได้เพราะ fakeSupabase คืนแถวสำเร็จรูป -> ต้องมี manual check/SQL check ใน Task 7 เสมอ
- เทสต์ขอบ (>= กับ >) ต้องพิสูจน์ด้วยการ mutate เงื่อนไขชั่วคราวแล้วเห็นเทสต์แดง; สถานะ M ของ public/liff/format.mjs ที่เห็นใน git status เป็นแค่ line ending (diff ว่าง)
- `require('vitest')` throw ใน CommonJS -> ไฟล์เทสต์ต้องใช้ `import`
- ใน vitest ถ้าเทสต์ `import` class แต่โค้ด `require` module เดียวกัน จะได้คนละ instance ทำให้ `instanceof` เป็น false -> เทสต์ต้องโหลดด้วย `createRequire(import.meta.url)` (router.test.js)
- เทสต์ jsdom ล้มสุ่มด้วย "timed out in 5000ms" เกิดจาก RAM หมด (เครื่อง 5.8 GB, worker ค่าเริ่มต้น ~11 ตัว, RAM ว่างลงถึง 0 GB แล้ว swap); แก้ด้วย `maxWorkers: 3` ใน vitest.config.mjs (2026-10-26: 4 ผ่านแต่เฉียด, 6 ล้ม 3 ข้อ); อย่าแก้ด้วย testTimeout
- เทสต์ jsdom ใน public/liff/ heap โตราว 7 MB ต่อเทสต์ (boot() รีเซ็ต module + innerHTML ทุกข้อ) ไฟล์เกิน ~350 เทสต์ worker crash exit 134 -> แยกไฟล์ตามแท็บเป็น app.<กลุ่ม>.dom.test.mjs และใช้ helper ใน dom-harness.mjs (2026-10-21 แยกจาก app.dom.test.mjs เดิมแล้ว ไฟล์ใหญ่สุด bills ~660 MB)

## เครื่องมือและ workflow
- Chrome tab ที่ automation เปิดอยู่ในสถานะ hidden ทำให้ requestAnimationFrame หยุด แท่งกราฟค้าง 0% และตัวเลข count-up ว่าง ต้อง screenshot ก่อนวัดขนาด; resize_window ใช้ไม่ได้ ใช้ iframe กว้าง 390px แทน
- gate-default.sh เป็น no-op ในโปรเจกต์นี้ (ใช้ npx vitest run กับไฟล์ของ task แทน) และไม่พิมพ์อะไรเมื่อผ่าน ต้องรัน vitest กับไฟล์ของ task แยกเพื่อยืนยันว่ามีเทสต์รันจริง
- แผน SDD ควรมี step สุดท้าย "อัปเดต work-memory/STATE.md" เพราะ subagent ไม่แตะ STATE เอง (final review จับได้ทั้งขั้นที่ 4 และ 5)
- subagent ใส่ Co-Authored-By/Claude-Session ตามชื่อ model และ session ของตัวเอง ไม่ใช่ตามที่แผนเขียน เว้นแต่ข้อความ dispatch ให้บรรทัดตรงตัว
- Edit/Write tool และ heredoc ที่ส่งผ่าน tool แปลง `\u....` และ `\\n` เป็นอักขระจริง -> ถ้าต้องการ backslash ในไฟล์ให้สร้างด้วย python `chr(92)` แล้วเช็กด้วย grep
- Claude in Chrome ต้องให้ผู้ใช้อนุญาตเว็บใน extension ก่อน (เจอ "Permission denied for this action on this domain")
