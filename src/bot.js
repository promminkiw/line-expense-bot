function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function createBot({ replyText, logger = console }) {
  async function handleEvent(event) {
    if (!isTextMessage(event)) {
      return;
    }
    await replyText(event.replyToken, event.message.text);
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อไม่ให้ event ที่พังหนึ่งอันทำให้ event อื่นไม่ถูกตอบ
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = { createBot };
