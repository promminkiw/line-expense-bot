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

module.exports = { createBot };
