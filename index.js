require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { messagingApi } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText, createReplyFlex } = require('./src/line-reply');
const { createMessageParser } = require('./src/parser/parse-message');
const { createRepository } = require('./src/db/repository');
const { createUserService } = require('./src/users');
const { createRateLimiter } = require('./src/rate-limit');
const { createFetchWithTimeout } = require('./src/db/fetch-with-timeout');
const { createSummaryCommenter } = require('./src/summary/comment');
const { createIdTokenVerifier } = require('./src/api/verify-id-token');
const { createApiRouter } = require('./src/api/router');
const { createExportRouter } = require('./src/export/router');

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };
const EXPORT_RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };
const SUPABASE_TIMEOUT_MS = 5000;

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
const parseMessage = createMessageParser({ client: anthropic, model: config.claudeModel });
const commentSummary = createSummaryCommenter({ client: anthropic, model: config.claudeModel });

// server ใช้ service role key ตรงๆ ไม่มีการ login จึงไม่ต้องเก็บหรือต่ออายุ session
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: createFetchWithTimeout(SUPABASE_TIMEOUT_MS) },
  // ปิด retry ของ postgrest เพราะจะลองซ้ำหลัง timeout จนเกินเวลาของ reply token
  db: { retry: false },
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
  replyFlex: createReplyFlex(lineClient),
  parseMessage,
  commentSummary,
  repository,
  users,
  allowRequest,
  liffUrl: `https://liff.line.me/${config.liffId}`,
});
const apiRouter = createApiRouter({
  verifyIdToken: createIdTokenVerifier({ channelId: config.lineLoginChannelId }),
  users,
  repository,
  liffId: config.liffId,
  allowExport: createRateLimiter(EXPORT_RATE_LIMIT),
});
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
  apiRouter,
  exportRouter: createExportRouter({ repository }),
});

app.listen(config.port, (err) => {
  if (err) {
    console.error('Failed to start server', err);
    process.exitCode = 1;
    return;
  }
  console.log(`Server listening on port ${config.port}`);
});
