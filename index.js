require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { messagingApi } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText } = require('./src/line-reply');
const { createMessageParser } = require('./src/parser/parse-message');
const { createRepository } = require('./src/db/repository');
const { createUserService } = require('./src/users');
const { createRateLimiter } = require('./src/rate-limit');
const { createFetchWithTimeout } = require('./src/db/fetch-with-timeout');

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };
const SUPABASE_TIMEOUT_MS = 5000;

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
const parseMessage = createMessageParser({ client: anthropic, model: config.claudeModel });

// server ใช้ service role key ตรงๆ ไม่มีการ login จึงไม่ต้องเก็บหรือต่ออายุ session
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: createFetchWithTimeout(SUPABASE_TIMEOUT_MS) },
});
const repository = createRepository(supabase);
const users = createUserService({
  repository,
  getDisplayName: async (lineUserId) => (await lineClient.getProfile(lineUserId)).displayName,
});
// ตัวนับอยู่ในหน่วยความจำ พอสำหรับ server instance เดียว
const allowRequest = createRateLimiter(RATE_LIMIT);

const bot = createBot({
  replyText: createReplyText(lineClient),
  parseMessage,
  repository,
  users,
  allowRequest,
});
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
});

app.listen(config.port, (err) => {
  if (err) {
    console.error('Failed to start server', err);
    process.exitCode = 1;
    return;
  }
  console.log(`Server listening on port ${config.port}`);
});
