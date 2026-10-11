// ใช้ตรวจ id จาก URL หรือ postback ก่อนส่งไป Postgres เพราะค่าที่ไม่ใช่ UUID ทำให้ query error
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { UUID_PATTERN };
