# แผน Deploy บน Render (ขั้นที่ 10)

วันที่เขียน: 2026-10-02 | branch ที่เตรียมไว้: `chore/deploy-render`

## สิ่งที่ผู้ใช้ตัดสินใจแล้ว
- Render แพ็กเกจ **Free** + ตั้ง cron-job.org พิง `/health` ทุก 10 นาทีเพื่อไม่ให้หลับ
- เขียน `render.yaml` (Blueprint) ให้ Render ตั้งค่าอัตโนมัติ ผู้ใช้กรอกเฉพาะค่า secret
- ใช้ GitHub **private repo** (ผู้ใช้เป็นคนสร้าง)
- Region: Singapore (ค่าที่ผมตั้งเอง ใกล้ไทยที่สุดในรายการของ Render)

## ข้อเท็จจริงของ Render ที่ตรวจจากเอกสารแล้ว (2026-10-02)
- Free web service หลับเมื่อไม่มี traffic ขาเข้า 15 นาที ตื่นใหม่ใช้ประมาณ 1 นาที
- ฟรี 750 ชั่วโมงต่อเดือนต่อ workspace (เปิดตลอดเดือน 31 วัน = 744 ชั่วโมง ใช้ได้ถ้าไม่มี free service อื่นใน workspace เดียวกัน)
- HTTP request ขาเข้านับเป็น traffic (พิงจากภายนอกได้) แต่เอกสารไม่ได้รับรองเรื่องการพิงไว้ชัดเจน
- `plan: free` และ `region: singapore` ใช้ใน Blueprint ได้, ตัวแปร `sync: false` จะถูกถามค่าตอนสร้างจาก Blueprint
- Render ตั้ง `PORT` ให้เอง (โค้ดอ่าน `process.env.PORT` อยู่แล้ว)

## ภาพรวม 10 ขั้น
| ขั้น | ใคร | ทำอะไร |
| --- | --- | --- |
| 1 | ผู้ใช้ | สร้าง private repo บน GitHub |
| 2 | Claude (หลังผู้ใช้สั่ง) | commit `render.yaml`, merge เข้า main, ตั้ง remote และ push ครั้งแรก |
| 3 | ผู้ใช้ | สมัคร Render ด้วย GitHub |
| 4 | ผู้ใช้ | สร้าง Blueprint จาก repo และกรอก secret 8 ตัว |
| 5 | ผู้ใช้ | รอ deploy แล้วเช็ก `/health` |
| 6 | ผู้ใช้ | เปลี่ยน Webhook URL ใน LINE Developers |
| 7 | ผู้ใช้ | เปลี่ยน Endpoint URL ของ LIFF |
| 8 | ผู้ใช้ | ทดสอบในแอป LINE |
| 9 | ผู้ใช้ | ตั้ง cron-job.org 2 งาน (รายการประจำ + พิงกันหลับ) |
| 10 | ผู้ใช้ | ปิด ngrok และ server ในเครื่อง แล้วแจ้ง Claude อัปเดตบันทึก |

## ขั้นที่ 1: สร้าง private repo (ผู้ใช้)
1. เปิด https://github.com/new แล้วล็อกอิน
2. Repository name: `line-expense-bot`
3. เลือก **Private**
4. **ห้ามติ๊ก** Add a README / .gitignore / license (ต้องเป็น repo ว่าง)
5. กด Create repository
- ผลที่ควรเห็น: หน้า repo ว่างที่มีคำแนะนำ "Quick setup" และ URL แบบ `https://github.com/<ชื่อคุณ>/line-expense-bot.git`
6. คัดลอก URL นั้นมาบอก Claude

## ขั้นที่ 2: push ครั้งแรก (Claude ทำ หลังผู้ใช้สั่งชัดเจน)
- commit ไฟล์ของ branch นี้ แล้ว merge เข้า `main` ในเครื่อง
- `git remote add origin <URL>` แล้ว `git push -u origin main`
- การ push จะส่งทุก commit (240+ รายการ) ขึ้น private repo ตรวจแล้วว่าไม่มี secret ในประวัติ (`.env` ไม่เคยถูก commit)
- ครั้งแรก Git อาจเด้งหน้าต่างให้ล็อกอิน GitHub ในเบราว์เซอร์ ผู้ใช้ต้องกดอนุญาตเอง
- ผลที่ควรเห็น: หน้า repo บน GitHub มีไฟล์ครบ และแท็บ Actions เริ่มรัน CI (ต้องผ่านเป็นสีเขียว)

## ขั้นที่ 3: สมัคร Render (ผู้ใช้)
1. เปิด https://render.com กด Get Started / Sign in
2. เลือก **GitHub** เพื่อสมัครด้วยบัญชี GitHub
- ผลที่ควรเห็น: เข้า Dashboard ของ Render

## ขั้นที่ 4: สร้าง Blueprint และกรอก secret (ผู้ใช้)
1. ใน Dashboard กด **New +** แล้วเลือก **Blueprint**
2. เลือก repo `line-expense-bot` (ถ้าไม่เห็น กด Configure account แล้วให้สิทธิ์ Render เข้าถึง repo นี้)
3. Render อ่าน `render.yaml` และแสดงบริการ `line-expense-bot` (plan Free, region Singapore)
4. หน้านี้จะให้กรอกค่าตัวแปร 8 ตัว ให้เปิดไฟล์ `.env` ในเครื่องแล้วคัดลอกค่าไปกรอกทีละตัว **ห้ามวางค่าเหล่านี้ในแชต**

   | ตัวแปร | ค่าจากไหน |
   | --- | --- |
   | `LINE_CHANNEL_SECRET` | `.env` |
   | `LINE_CHANNEL_ACCESS_TOKEN` | `.env` |
   | `ANTHROPIC_API_KEY` | `.env` |
   | `SUPABASE_URL` | `.env` (รูปแบบ `https://<ref>.supabase.co` ห้ามมี `/rest/v1/` ต่อท้าย) |
   | `SUPABASE_SERVICE_ROLE_KEY` | `.env` |
   | `LIFF_ID` | `.env` |
   | `LINE_LOGIN_CHANNEL_ID` | `.env` |
   | `CRON_SECRET` | `.env` (ใช้ค่าเดิม ยาว 48 ตัวอักษร ผ่านเกณฑ์ขั้นต่ำ 32) |

   `NODE_VERSION=22` และ `CLAUDE_MODEL` ถูกตั้งไว้ในไฟล์แล้ว ไม่ต้องกรอก ส่วน `PORT` Render ตั้งให้เอง
5. กด **Deploy Blueprint** (หรือ Apply)
- ผลที่ควรเห็น: บริการเริ่ม build ใช้เวลาประมาณ 2-5 นาที

## ขั้นที่ 5: รอ deploy แล้วเช็ก (ผู้ใช้)
1. คลิกบริการ `line-expense-bot` ดูแท็บ **Logs**
2. ผลที่ควรเห็นเมื่อสำเร็จ: log บรรทัด `Server listening on port ...` และสถานะ **Live** สีเขียว
3. คัดลอก URL ของบริการ (อยู่ใต้ชื่อบริการ) รูปแบบ `https://line-expense-bot-xxxx.onrender.com`
4. เปิด `<URL>/health` ในเบราว์เซอร์
- ผลที่ควรเห็น: `{"status":"ok"}`
- ถ้า build ล้ม หรือ log ขึ้น `Missing environment variables: ...` ให้ส่งข้อความ error นั้นมา (ไม่ต้องส่งค่า secret) แล้วไปแก้ที่แท็บ Environment

## ขั้นที่ 6: เปลี่ยน Webhook URL (ผู้ใช้)
1. เปิด LINE Developers Console แล้วเลือก channel **Messaging API** ของบอท
2. แท็บ **Messaging API** หาช่อง **Webhook URL** กด Edit
3. ใส่ `<URL>/webhook` แล้วกด Update
4. กด **Verify**
- ผลที่ควรเห็น: ขึ้น Success ถ้า timeout ให้เปิด `<URL>/health` เพื่อปลุก server แล้วกด Verify ใหม่
5. ตรวจว่า **Use webhook** เปิดอยู่

## ขั้นที่ 7: เปลี่ยน Endpoint URL ของ LIFF (ผู้ใช้)
1. ใน LINE Developers Console เลือก channel **LINE Login** ที่มี LIFF app
2. แท็บ **LIFF** กดแก้ไข LIFF app ของบอท
3. เปลี่ยน **Endpoint URL** เป็น `<URL>/liff/` (มี `/` ท้าย) แล้วบันทึก
- LIFF ID และลิงก์ Rich Menu (`https://liff.line.me/<LIFF_ID>`) ไม่เปลี่ยน

## ขั้นที่ 8: ทดสอบในแอป LINE (ผู้ใช้)
1. ส่ง `กินข้าว 60` ควรได้การ์ด "บันทึกแล้ว" พร้อมปุ่มยกเลิก
2. แตะแถวในการ์ด ควรเปิดหน้าเว็บที่ตัวแก้ไขของรายการนั้น
3. เปิดหน้าเว็บจาก Rich Menu ดู 5 แท็บ ข้อมูลต้องตรงกับเดิม (ใช้ฐานข้อมูล Supabase ตัวเดิม)
4. ปัดซ้ายที่แถวในแท็บรายการ ควรเห็นปุ่มลบ
5. ส่งรูปสลิป ควรได้การ์ดสรุปพร้อมปุ่มบันทึก/ยกเลิก
- ถ้าข้อ 1 ไม่ตอบ: ดู Logs ใน Render ก่อน (ถ้ามี `Failed to ...` ให้ส่งข้อความนั้นมา)

## ขั้นที่ 9: ตั้ง cron-job.org 2 งาน (ผู้ใช้)
เข้า https://cron-job.org สมัครและล็อกอิน แล้วสร้าง 2 งาน

**งาน A: รายการประจำ (วันละครั้ง)**
- URL: `<URL>/internal/recurring/run`
- Request method: **POST** (ในส่วน Advanced)
- Headers: ชื่อ `Authorization` ค่า `Bearer <CRON_SECRET>` (B ตัวใหญ่ เว้นวรรคเดียว)
- Schedule: วันละครั้ง (เช่น 06:00) ตั้ง time zone เป็น Asia/Bangkok
- Timeout: 60 วินาที (เผื่อ server ตื่นช้า)
- เปิด **Notify on failure** (endpoint ตอบ 500 เมื่อมีกฎที่ทำไม่สำเร็จ)
- ทดสอบด้วยปุ่ม Test run: ควรได้ HTTP 200 และ JSON คล้าย `{"due":0,"created":0,"skipped":0,"failed":0,"pushFailed":0}`
- ถ้าได้ 401: ค่า header ไม่ตรง ตรวจตัวพิมพ์ใหญ่ B และ secret ให้ตรงกับใน Render

**งาน B: พิงกันหลับ (ทุก 10 นาที)**
- URL: `<URL>/health` method GET ไม่ต้องมี header
- Schedule: ทุก 10 นาที
- ผลที่ควรเห็น: ประวัติ execution ขึ้น 200 ต่อเนื่อง

## ขั้นที่ 10: ปิดของเดิมในเครื่อง (ผู้ใช้) แล้วอัปเดตบันทึก (Claude)
1. ปิดหน้าต่าง `npm start` และ ngrok ในเครื่อง (ไม่ต้องใช้แล้ว)
2. แจ้ง Claude ให้อัปเดต `work-memory/STATE.md`, README และบันทึกเรื่อง ngrok ที่เคยจดไว้ (URL ใหม่คือ URL ของ Render)

## ข้อควรรู้หลัง deploy
- **push เข้า main = deploy ใหม่อัตโนมัติ** (`autoDeployTrigger: commit`) ระหว่าง deploy ประมาณ 2-5 นาที บอทอาจไม่ตอบ ถ้าอยากให้ deploy เมื่อ CI ผ่านเท่านั้น เปลี่ยนเป็น `checksPass`
- **webhook ชี้ที่ Render แล้ว** ถ้าจะทดสอบโค้ดใหม่ในเครื่องผ่าน ngrok ต้องสลับ Webhook URL ไปมา (ทำให้บอทจริงหยุดตอบระหว่างนั้น) ทางแก้ระยะยาวคือสร้าง LINE channel แยกสำหรับทดสอบ (ยังไม่ทำ)
- โควตา LINE: ข้อความตอบกลับ (reply) ไม่นับโควตา ส่วน push (รายการประจำ) นับ แพ็กเกจปัจจุบันจำกัด 300 ข้อความต่อเดือน (ใช้ไปแล้ว 1 ณ 2026-10-02)
- Supabase ฟรีอาจ pause โปรเจกต์เมื่อไม่มีการใช้งานหลายวัน ซึ่งงาน B ไม่ช่วยเรื่องนี้ (พิงแค่ `/health` ไม่แตะฐานข้อมูล)
- ข้อจำกัดของ Free: instance restart เองเป็นครั้งคราวได้ และอาจถูกจำกัดหาก traffic ผิดปกติ

## แผนถอยกลับ (ถ้า deploy แล้วมีปัญหา)
1. LINE Developers: เปลี่ยน Webhook URL กลับเป็น URL ngrok เดิม และ LIFF Endpoint URL กลับเป็น `https://<ngrok เดิม>/liff/`
2. เปิด `npm start` และ ngrok ในเครื่องใหม่
3. ใน Render กด Suspend บริการ (ไม่ต้องลบ)

## สิ่งที่ยังไม่ได้ตรวจ (ต้องดูตอนทำจริง)
- ยังไม่เคยรันบน Render จริง: `npm ci` บน Linux, พอร์ต 10000, health check
- ยังไม่ได้ลองส่ง webhook จริงมาที่ Render (LINE Verify ในขั้นที่ 6 จะบอกได้)
- การพิง `/health` ทุก 10 นาทีป้องกันการหลับได้จริงหรือไม่ ต้องดูผลหลังใช้จริงหลายชั่วโมง
