// คำนวณนิพจน์ยอดเงินเองแทน Claude เพราะ LLM คิดเลขพลาดได้ และห้ามใช้ eval ซึ่งรันโค้ดอะไรก็ได้
const MAX_EXPRESSION_LENGTH = 100;
const TOKEN_PATTERN = /\d+(?:\.\d+)?|sqrt|[+\-*/()]/y;

function normalize(text) {
  return (
    text
      .replace(/\s+/g, '')
      // คอมมาเป็นตัวคั่นหลักพันเท่านั้น
      .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
      // ผู้ใช้พิมพ์ "*x" ซ้อนกันได้ ยุบก่อนแปลง x เพื่อไม่ให้ "**" ที่พิมพ์เองผ่าน
      .replace(/\*[xX×]/g, '*')
      .replace(/[×xX]/g, '*')
      .replace(/÷/g, '/')
      .replace(/√|รูท/g, 'sqrt')
  );
}

function tokenize(text) {
  const tokens = [];
  TOKEN_PATTERN.lastIndex = 0;
  while (TOKEN_PATTERN.lastIndex < text.length) {
    const match = TOKEN_PATTERN.exec(text);
    if (!match) return null;
    tokens.push(match[0]);
  }
  return tokens;
}

function evaluateTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expression() {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function term() {
    let value = factor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const right = factor();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function factor() {
    const token = next();
    if (token === '(') {
      const value = expression();
      if (next() !== ')') throw new SyntaxError('Missing closing parenthesis');
      return value;
    }
    if (token === 'sqrt') return Math.sqrt(factor());
    if (token !== undefined && /^\d/.test(token)) return Number(token);
    throw new SyntaxError('Unexpected token');
  }

  const value = expression();
  if (pos !== tokens.length) throw new SyntaxError('Unexpected trailing token');
  return value;
}

function evaluateAmountExpression(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_EXPRESSION_LENGTH) {
    return null;
  }
  // normalize ลบช่องว่าง ถ้าไม่ดักก่อน "40 100" หรือ "40 ,100" จะกลายเป็นยอดเดียว
  if (/[\d.,]\s+[\d.,]/.test(text)) {
    return null;
  }
  const tokens = tokenize(normalize(text));
  if (!tokens || tokens.length === 0) return null;
  let value;
  try {
    value = evaluateTokens(tokens);
  } catch {
    return null;
  }
  // หารด้วย 0 ได้ Infinity และ sqrt ติดลบได้ NaN
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? rounded : null;
}

module.exports = { evaluateAmountExpression, MAX_EXPRESSION_LENGTH };
