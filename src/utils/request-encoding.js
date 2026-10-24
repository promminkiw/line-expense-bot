const ALLOWED_ENCODINGS = new Set(['identity', 'gzip', 'deflate']);

// body-parser คลาย br/zstd ให้เอง และ express.raw ของ webhook ทำงานก่อนตรวจ signature จึงปิดทางไว้ก่อน
function rejectUnsupportedEncoding(req, res, next) {
  const header = req.headers['content-encoding'];
  if (header === undefined) {
    next();
    return;
  }
  // ไม่กรอง token ว่างทิ้ง: ค่าที่เสียรูปต้องถูกปฏิเสธ ไม่ใช่ถูกมองข้าม
  const encodings = header.split(',').map((value) => value.trim().toLowerCase());
  if (encodings.every((encoding) => ALLOWED_ENCODINGS.has(encoding))) {
    next();
    return;
  }
  res.status(415).json({ error: 'Unsupported encoding' });
}

module.exports = { rejectUnsupportedEncoding };
