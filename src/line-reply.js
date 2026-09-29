function createReplyText(client) {
  return async function replyText(replyToken, text, quickReplyItems) {
    const message = { type: 'text', text };
    if (quickReplyItems && quickReplyItems.length > 0) {
      message.quickReply = { items: quickReplyItems };
    }
    await client.replyMessage({ replyToken, messages: [message] });
  };
}

module.exports = { createReplyText };
