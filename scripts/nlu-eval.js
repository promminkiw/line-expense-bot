// รันชุดข้อความกับ Claude จริงเพื่อวัดว่าแก้ prompt แล้วดีขึ้นหรือพัง เสียค่า API จึงไม่อยู่ใน npm test
require('dotenv').config({ quiet: true });
const path = require('node:path');
const fs = require('node:fs');
const Anthropic = require('@anthropic-ai/sdk');
const { loadConfig } = require('../src/config');
const { createMessageParser } = require('../src/parser/parse-message');
const { createQuestionParser } = require('../src/query/parse-question');
const { TEXT_CATEGORIES } = require('../src/parser/categories');
const { checkCase } = require('./nlu-eval-check');

const CONCURRENCY = 4;

async function main() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'nlu-eval-cases.json'), 'utf8'));
  const config = loadConfig(process.env);
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const parseMessage = createMessageParser({ client, model: config.claudeModel });
  const parseQuestion = createQuestionParser({ client, model: config.claudeModel });
  const categoryNames = [...new Set([...TEXT_CATEGORIES.expense, ...TEXT_CATEGORIES.income])];

  async function runCase(testCase) {
    try {
      const actual =
        testCase.parser === 'question' ? await parseQuestion(testCase.text, categoryNames) : await parseMessage(testCase.text);
      return { testCase, actual, problems: checkCase(testCase.expect, actual) };
    } catch (err) {
      return { testCase, actual: null, problems: [`error: ${err.message}`] };
    }
  }

  // ยิงพร้อมกันทีละไม่กี่ข้อ กัน 429 ที่จะดูเหมือน prompt พัง
  const results = [];
  for (let start = 0; start < cases.length; start += CONCURRENCY) {
    results.push(...(await Promise.all(cases.slice(start, start + CONCURRENCY).map(runCase))));
  }

  let failed = 0;
  for (const { testCase, actual, problems } of results) {
    const label = testCase.parser === 'question' ? `[question] ${testCase.text}` : testCase.text;
    if (problems.length === 0) {
      console.log(`PASS ${label}`);
      continue;
    }
    failed += 1;
    console.log(`FAIL ${label}\n  ${problems.join('\n  ')}\n  got ${JSON.stringify(actual)}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed (model ${config.claudeModel})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('nlu-eval failed', err);
  process.exitCode = 1;
});
