require('dotenv').config();
const { messagingApi } = require('@line/bot-sdk');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText } = require('./src/line-reply');

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const bot = createBot({ replyText: createReplyText(lineClient) });
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
