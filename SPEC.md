\# โปรเจค: LINE Bot บันทึกรายรับรายจ่าย (Multi-user)



\## เป้าหมาย

LINE OA ที่ผู้ใช้พิมพ์ภาษาธรรมชาติ เช่น "กินข้าว 60 กาแฟ 45" แล้วระบบบันทึกรายรับรายจ่ายให้ พร้อมสรุปผล และมีเว็บเปิดในไลน์ (LIFF) สำหรับดู/แก้ไขข้อมูล รองรับหลายผู้ใช้ตั้งแต่แรก



\## Tech Stack

\- LINE Messaging API + LIFF + Rich Menu

\- Node.js (Express) + @line/bot-sdk

\- Claude API (@anthropic-ai/sdk) ใช้โมเดลเล็ก (เช่น Haiku) สำหรับแยกข้อความ/อ่านสลิป

\- Supabase (Postgres) พร้อม Row Level Security

\- Deploy บน Render



\## ฟังก์ชัน

1\. บันทึกรายรับ/รายจ่าย: Claude แยกข้อความเป็น JSON (type, category, amount, date, note) ถ้ากำกวมให้ถามกลับสั้นๆ ก่อนบันทึก ตอบกลับพร้อม Quick Reply "ยกเลิก/แก้ไข"

2\. สรุปผล: พิมพ์ "สรุปวันนี้/สัปดาห์นี้/เดือนนี้" หรือกด Rich Menu คำนวณยอดด้วย SQL (ห้ามให้ Claude คิดเลข) แล้วให้ Claude เขียนคำอธิบายสั้นๆ ส่งเป็น Flex Message

3\. เว็บ LIFF: ดู/แก้ไข/ลบรายการ, กราฟตามหมวด, กรองตามเดือน, Export CSV

4\. Rich Menu: ปุ่ม สรุป / เปิดเว็บ / ช่วยเหลือ

5\. งบประมาณรายเดือนต่อหมวด: เตือนเมื่อใช้เกิน 80% และ 100%

6\. อ่านสลิป: ผู้ใช้ส่งรูป, Claude vision อ่านยอด/วันที่/ผู้รับ แล้วให้ผู้ใช้ยืนยันก่อนบันทึก ใบเสร็จที่มีสินค้าหลายอย่างแสดงเป็นรายการแยกราคาของแต่ละอย่างในข้อความเดียว (ไม่รวมยอด) กดยืนยันครั้งเดียวบันทึกทุกรายการ

7\. รายการประจำ (เช่น ค่าเน็ตทุกเดือน): บันทึกอัตโนมัติตามรอบ



\## Database (Supabase)

\- users: id, line\_user\_id (unique), display\_name, created\_at

\- categories: id, user\_id, name, type

\- transactions: id, user\_id, type (income/expense), category\_id, amount (numeric), note, occurred\_on (date), source (text/slip/recurring), line\_event\_id, created\_at

\- budgets: id, user\_id, category\_id, month (วันที่ 1 ที่งบเริ่มมีผล), amount (null = ไม่ตั้งงบตั้งแต่เดือนนั้น)

\- pending\_slips: id, user\_id, line\_event\_id, items (jsonb อาร์เรย์ของรายการจากสลิป), created\_at (พักรายการรอผู้ใช้กดยืนยัน หมดเวลา 10 นาที)

\- recurring\_rules: id, user\_id, type, category\_id, amount, note, day\_of\_month, active, last\_run\_on (ทำงานเดือนละครั้ง, last\_run\_on เป็นวันครบกำหนดของรอบล่าสุด)

\- ทุกตารางมี user\_id, เปิด RLS ทุกตาราง



\## Security

\- ตรวจ x-line-signature ทุก webhook request

\- LIFF: ส่ง LINE ID token ไป server ทุกครั้ง server verify กับ LINE แล้วดึง line\_user\_id

\- Server ใช้ Supabase service role key (เก็บฝั่ง server เท่านั้น) และต้อง filter user\_id ทุก query

\- เปิด RLS เป็นด่านที่สอง (ไม่ให้ anon key อ่านข้อมูลใครได้)

\- เก็บ secret ทั้งหมดใน environment variables ห้าม commit



\## Deploy (Render)

\- Web Service เดียว: Express ให้บริการ webhook + API + static หน้า LIFF

\- ตอบ LINE webhook ด้วย 200 ทันที แล้วประมวลผลต่อ

\- แพ็กเกจฟรีจะ "หลับ" ทำให้ข้อความแรกช้า

\- รายการประจำและแจ้งเตือน: ใช้ตัวกระตุ้นภายนอก (เช่น cron-job.org หรือ Supabase pg\_cron) เรียก endpoint ที่มี secret token ป้องกัน

\- Push message นับโควตาของแพ็กเกจ LINE OA ต้องเช็กจำกัดต่อเดือน



\## ลำดับการทำ (ทำทีละขั้น ทดสอบให้ผ่านก่อนไปต่อ)

1\. ตั้งค่า LINE OA + Messaging API + webhook echo bot (ทดสอบในเครื่องด้วย ngrok)

2\. เชื่อม Claude แยกข้อความเป็น JSON

3\. สร้างตาราง Supabase + RLS แล้วบันทึกข้อมูลจริง (สมัครผู้ใช้อัตโนมัติเมื่อเพิ่มเพื่อน)

4\. สรุปผลด้วย SQL + Flex Message

5\. Rich Menu

6\. LIFF เว็บ (ดู/แก้/ลบ/กราฟ/CSV)

7\. งบประมาณ + แจ้งเตือน

8\. อ่านสลิป

9\. รายการประจำ

10\. Deploy บน Render และตั้ง webhook URL จริง



\## ข้อกำหนดการทำงานร่วมกับผู้ใช้

\- ผู้ใช้ใช้ Windows คำสั่งทั้งหมดต้องใช้ได้บน Windows

\- อธิบายเป็นภาษาไทย ศัพท์เทคนิคใช้ภาษาอังกฤษ

\- คอมเมนต์ในโค้ดสั้นๆ เป็นภาษาไทย ไม่ใส่ emoji ในโค้ด

\- แนะนำทีละขั้นชัดเจน ห้ามข้ามขั้นตอน

##### \- หลังแก้โค้ด ต้องเช็กส่วนอื่นที่ได้รับผลกระทบก่อนบอกว่าเสร็จ

