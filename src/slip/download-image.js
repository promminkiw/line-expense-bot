// เพดานนี้กันให้ base64 ของรูปไม่เกิน 5 MB ซึ่งเป็นขีดจำกัดรูปของ Claude
const MAX_IMAGE_BYTES = 3.75 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ตรวจจาก magic bytes เพราะ Claude ปฏิเสธรูปที่ media type ไม่ตรงเนื้อไฟล์
function detectMediaType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'))) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function createImageDownloader({ blobClient, timeoutMs = DOWNLOAD_TIMEOUT_MS }) {
  return async function downloadImage(messageId) {
    let stream = null;
    let timedOut = false;
    let timer;

    async function readImage() {
      const content = await blobClient.getMessageContent(messageId);
      // สตรีมที่มาถึงหลังหมดเวลาต้องปิดทิ้ง ไม่งั้นค้างอยู่
      if (timedOut) {
        content.destroy();
        return null;
      }
      stream = content;
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        // หยุดอ่านทันทีที่เกินเพดาน ไม่เก็บรูปใหญ่ทั้งใบไว้ใน memory
        if (size > MAX_IMAGE_BYTES) {
          return { status: 'too_large' };
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const mediaType = detectMediaType(buffer);
      if (!mediaType) {
        return { status: 'unsupported' };
      }
      return { status: 'ok', mediaType, data: buffer.toString('base64') };
    }

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        if (stream) {
          stream.destroy();
        }
        reject(new Error('LINE image download timed out'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([readImage(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createImageDownloader, MAX_IMAGE_BYTES };
