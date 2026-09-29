function createReplyText(client) {
  return async function replyText(replyToken, text) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  };
}

module.exports = { createReplyText };
