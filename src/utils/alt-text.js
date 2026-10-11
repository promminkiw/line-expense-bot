// LINE จำกัด altText ที่ 400 ตัวอักษร
const ALT_TEXT_MAX = 400;
const ELLIPSIS = '...';

// นับตามหน่วย UTF-16 ให้ไม่เกินเพดานแน่ แต่ตัดทีละอักขระเพื่อไม่ผ่ากลาง emoji
function capAltText(text) {
  if (text.length <= ALT_TEXT_MAX) {
    return text;
  }
  let kept = '';
  for (const char of text) {
    if (kept.length + char.length > ALT_TEXT_MAX - ELLIPSIS.length) break;
    kept += char;
  }
  return `${kept}${ELLIPSIS}`;
}

module.exports = { capAltText, ALT_TEXT_MAX };
