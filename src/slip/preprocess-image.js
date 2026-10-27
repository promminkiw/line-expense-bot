const sharp = require('sharp');

// Claude ย่อรูปที่ด้านยาวเกินค่านี้เองอยู่แล้ว ย่อก่อนส่งช่วยลดขนาดโดยไม่เสียรายละเอียดที่ Claude เห็น
const MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 90;
// รูปเล็กแต่ขนาด pixel มหาศาลกิน RAM ตอน decode จน instance เดียวล่มได้ ค่านี้ยังรับรูปกล้องมือถือ 50MP
const MAX_INPUT_PIXELS = 50000000;

// ไม่ขยายรูปเล็กเพราะไม่ได้เพิ่มรายละเอียด และถ้าปรับรูปพังให้ใช้รูปเดิมแทนการทำให้อ่านสลิปไม่ได้
// คืน null เมื่อรูปมี pixel เกิน limit เพื่อไม่ให้ส่งรูปเดิมไปหา Claude
async function preprocessImage(image, { logger = console, maxInputPixels = MAX_INPUT_PIXELS } = {}) {
  try {
    const input = Buffer.from(image.data, 'base64');
    // metadata อ่านแค่ header จึงรู้ขนาดก่อน decode ทั้งรูป
    const { width = 0, height = 0 } = await sharp(input).metadata();
    if (width * height > maxInputPixels) {
      return null;
    }
    // rotate() ไม่ใส่ค่าคือหมุนตาม EXIF แล้วลบแท็กทิ้ง รูปที่ถ่ายจากมือถือจึงไม่นอนข้าง
    const pipeline = sharp(input, { limitInputPixels: maxInputPixels })
      .rotate()
      .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .normalise();
    // PNG มักเป็นภาพหน้าจอที่ตัวหนังสือคม จึงคงเป็น PNG ส่วนอื่นแปลงเป็น JPEG
    if (image.mediaType === 'image/png') {
      const buffer = await pipeline.png().toBuffer();
      return { data: buffer.toString('base64'), mediaType: 'image/png' };
    }
    const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer();
    return { data: buffer.toString('base64'), mediaType: 'image/jpeg' };
  } catch (err) {
    logger.error('Failed to preprocess slip image, using the original', err);
    return image;
  }
}

module.exports = { preprocessImage, MAX_LONG_EDGE, MAX_INPUT_PIXELS };
