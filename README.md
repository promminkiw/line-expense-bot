# line-expense-bot

LINE Official Account ที่บันทึกรายรับรายจ่ายจากข้อความภาษาธรรมชาติ (เช่น "กินข้าว 60 กาแฟ 45") โดยใช้ Claude แยกข้อความเป็นรายการ เก็บลง Supabase และมีเว็บ LIFF เปิดในแอป LINE สำหรับดู แก้ไข และวิเคราะห์ข้อมูล รองรับหลายผู้ใช้

## ความสามารถ

- บันทึกด้วยข้อความ: พิมพ์ภาษาธรรมชาติ ถ้ากำกวมบอทถามกลับสั้นๆ ก่อนบันทึก และมีปุ่มยกเลิก/แก้ไข
- อ่านสลิป/ใบเสร็จ: ส่งรูปให้บอทอ่านยอดและรายการ แล้วยืนยันก่อนบันทึก
- สรุปวัน/สัปดาห์/เดือน: คำนวณยอดด้วย SQL แล้วส่งเป็น Flex Message
- งบประมาณและการเตือน: ตั้งงบต่อหมวด บอทเตือนเมื่อใช้ใกล้ถึงหรือเกินงบ
- รายการประจำ: บันทึกอัตโนมัติตามรอบเดือน จัดการผ่านหน้า LIFF
- เว็บ LIFF 5 แท็บ (ธีมสว่างอย่างเดียว): รายการ (ค้นหา/กรอง แก้/ลบ), สรุป (กราฟตามหมวด แนวโน้ม 6 เดือน), จัดการงบ, รอบเดือน (รายการประจำ), โปรไฟล์ (ยอดเงินคงเหลือสะสม)
- Export CSV จากหน้าสรุป

## สถาปัตยกรรม

```mermaid
flowchart LR
  LINE[LINE app / LIFF] --> Express
  subgraph Express[Express server]
    Webhook[webhook]
    Api[/api]
    Static[/liff static]
  end
  Webhook --> Claude[Claude API]
  Webhook --> Supabase[(Supabase)]
  Api --> Supabase
  Cron[cron-job.org] --> Run[/internal/recurring/run]
  Run --> Express
```

## Tech stack

- Node.js 22, Express 5
- LINE Messaging API, LIFF, `@line/bot-sdk`
- Claude API (`@anthropic-ai/sdk`) สำหรับแยกข้อความและอ่านสลิป
- Supabase (Postgres) ผ่าน `@supabase/supabase-js`
- เว็บ LIFF เป็น HTML + ES module ธรรมดา ไม่มี build step
- vitest + jsdom สำหรับเทสต์, ESLint, GitHub Actions

## โครงสร้างโฟลเดอร์

```
src/                        โค้ดฝั่ง server (bot, api, parser, slip, summary, budget, recurring, db)
public/liff/                หน้าเว็บ LIFF และเทสต์ของหน้า
supabase/                   SQL schema และ migration (รันตามลำดับ)
docs/superpowers/plans/     แผนงานรายขั้น
```

## การติดตั้งและรัน

1. ติดตั้ง dependency: `npm ci`
2. สร้างไฟล์ `.env` (ห้าม commit) ตามชื่อตัวแปรด้านล่าง ดูตัวอย่างชื่อใน `.env.example`

   | ตัวแปร | คำอธิบาย |
   | --- | --- |
   | `LINE_CHANNEL_SECRET` | channel secret ของ Messaging API ใช้ตรวจ signature |
   | `LINE_CHANNEL_ACCESS_TOKEN` | access token สำหรับตอบกลับและ push |
   | `ANTHROPIC_API_KEY` | API key ของ Claude |
   | `CLAUDE_MODEL` | (ไม่บังคับ) ชื่อโมเดล ถ้าไม่ตั้งใช้ค่าเริ่มต้นในโค้ด |
   | `SUPABASE_URL` | URL ของโปรเจกต์ Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key ของ Supabase (ใช้ฝั่ง server เท่านั้น) |
   | `LIFF_ID` | LIFF ID ของหน้าเว็บ |
   | `LINE_LOGIN_CHANNEL_ID` | channel ID ของ LINE Login ใช้ verify ID token |
   | `CRON_SECRET` | secret ของ endpoint cron (ยาวอย่างน้อย 32 ตัวอักษร) |
   | `PORT` | (ไม่บังคับ) พอร์ตของ server ค่าเริ่มต้น 3000 |

3. รัน SQL ใน `supabase/` ที่ Supabase SQL Editor ตามลำดับ: `schema.sql` แล้ว `002` ถึง `010`
4. เริ่มเซิร์ฟเวอร์: `npm start`

## คำสั่งพัฒนา

- `npm test` รันเทสต์ทั้งหมด
- `npm run lint` ตรวจโค้ดด้วย ESLint
- `npm run try-parse` ลองแยกข้อความด้วย Claude จาก command line

## หมายเหตุความปลอดภัย

- ตรวจ LINE signature ของทุก webhook request
- หน้า LIFF ส่ง ID token ไปให้ server verify กับ LINE แล้วจึงอ้างอิงผู้ใช้
- เปิด RLS ทุกตาราง และ function ใน DB จำกัดให้ `service_role` เท่านั้น
- มี rate limit ที่ endpoint ที่เสี่ยงถูกเรียกถี่
- endpoint cron `/internal/recurring/run` ป้องกันด้วย secret (`CRON_SECRET`)

## สถานะ

อยู่ระหว่างเตรียม deploy (ขั้นที่ 10)
