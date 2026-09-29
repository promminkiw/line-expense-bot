# STATE
Updated: 2026-09-29
Goal: ทำขั้นที่ 1 (echo bot ผ่าน ngrok) และขั้นที่ 2 (Claude แยกข้อความเป็น JSON) ให้ `npm test` ผ่าน 43 tests และ Manual check ใน LINE จริงผ่านทุกข้อ

## Next
- [ ] `next` เลือกวิธี execute แผน `docs/superpowers/plans/2026-09-29-line-webhook-and-claude-parser.md` (subagent-driven หรือ inline)
- [ ] Task 1-3 (ทำขนานได้) -> Task 4 (ผู้ใช้ตั้ง LINE OA + ngrok)
- [ ] Task 5, 7 -> Task 6 -> Task 8 (ผู้ใช้ใส่ ANTHROPIC_API_KEY + ทดสอบจริง)

## Done
- [x] เขียนแผนขั้นที่ 1-2 (ยังไม่ commit)

## Blocked
- Task 4 และ Task 8 ต้องให้ผู้ใช้สร้าง `.env`, รัน `npm start` และ `ngrok` เอง

## Learned
- `require('vitest')` ใช้ไม่ได้ใน CommonJS (throw ทันที) ไฟล์เทสต์ต้องใช้ `import`
- `@line/bot-sdk` 11.2.0 มี CJS build: ใช้ `messagingApi.MessagingApiClient`, `middleware`, `SignatureValidationFailed`, `JSONParseError`
- `@anthropic-ai/sdk` 0.129.0 รองรับ `output_config.format = { type: 'json_schema', schema }` และ model `claude-haiku-4-5`
- ตัดสินใจกับผู้ใช้: ขั้น 2 ตอบสรุปรายการ (ยังไม่บันทึก), ใช้หมวด default ในโค้ด, ข้อความหลายรายการแยกเป็นหลาย item
