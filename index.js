require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { messagingApi } = require('@line/bot-sdk');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText } = require('./src/line-reply');
const { createMessageParser } = require('./src/parser/parse-message');

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
const parseMessage = createMessageParser({ client: anthropic, model: config.claudeModel });

const bot = createBot({ replyText: createReplyText(lineClient), parseMessage });
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
