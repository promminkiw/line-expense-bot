// สคริปต์ลองเรียก Claude จริงโดยไม่ต้องผ่าน LINE ใช้ปรับ prompt
require('dotenv').config({ quiet: true });
const Anthropic = require('@anthropic-ai/sdk');
const { loadConfig } = require('../src/config');
const { createMessageParser } = require('../src/parser/parse-message');

async function main() {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) {
    console.error('Usage: npm run try-parse -- "<message>"');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(process.env);
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const parseMessage = createMessageParser({ client, model: config.claudeModel });

  const result = await parseMessage(text);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('try-parse failed', err);
  process.exitCode = 1;
});
