// LINE ปฏิเสธข้อความเกิน 5000 หน่วย UTF-16 จึงตัดก่อนส่งแทนปล่อยให้ตอบไม่ได้เงียบๆ
const MAX_TEXT_UNITS = 5000;
const CUT_TEXT_UNITS = 4990;

function capTextLength(text) {
  if (text.length <= MAX_TEXT_UNITS) {
    return text;
  }
  let end = CUT_TEXT_UNITS;
  const lastKept = text.charCodeAt(end - 1);
  // ถ้าจุดตัดอยู่กลาง surrogate pair ให้ถอยหนึ่งหน่วยเพื่อไม่ทิ้งครึ่ง emoji
  if (lastKept >= 0xd800 && lastKept <= 0xdbff) {
    end -= 1;
  }
  return text.slice(0, end) + '...';
}

function buildTextMessage(text, quickReplyItems) {
  const message = { type: 'text', text: capTextLength(text) };
  if (quickReplyItems && quickReplyItems.length > 0) {
    message.quickReply = { items: quickReplyItems };
  }
  return message;
}

function createReplyText(client) {
  return async function replyText(replyToken, text, quickReplyItems) {
    await client.replyMessage({ replyToken, messages: [buildTextMessage(text, quickReplyItems)] });
  };
}

function createPushText(client) {
  return async function pushText(to, text, quickReplyItems) {
    await client.pushMessage({ to, messages: [buildTextMessage(text, quickReplyItems)] });
  };
}

function createReplyFlex(client) {
  return async function replyFlex(replyToken, flexMessage) {
    await client.replyMessage({ replyToken, messages: [flexMessage] });
  };
}

module.exports = { capTextLength, createReplyText, createReplyFlex, createPushText };
