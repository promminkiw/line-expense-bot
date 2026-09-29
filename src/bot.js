const { formatParseReply } = require('./parser/format-reply');

const PARSE_FAILED_REPLY = 'ขออภัย ระบบอ่านข้อความไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง เช่น "กินข้าว 60"';

function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function createBot({ replyText, parseMessage, logger = console }) {
  async function buildReply(text) {
    try {
      const result = await parseMessage(text);
      return formatParseReply(result);
    } catch (err) {
      logger.error('Failed to parse message', err);
      return PARSE_FAILED_REPLY;
    }
  }

  async function handleEvent(event) {
    if (!isTextMessage(event)) {
      return;
    }
    const reply = await buildReply(event.message.text);
    await replyText(event.replyToken, reply);
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อ log error ของทุก event ที่พัง (Promise.all จะเก็บแค่ error แรก)
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = { createBot, PARSE_FAILED_REPLY };
