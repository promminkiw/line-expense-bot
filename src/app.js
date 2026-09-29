const express = require('express');
const { middleware, SignatureValidationFailed, JSONParseError } = require('@line/bot-sdk');

function createApp({ channelSecret, handleEvents, logger = console }) {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // ห้ามใส่ express.json() ก่อน middleware นี้ เพราะต้องใช้ raw body ตรวจ signature
  app.post('/webhook', middleware({ channelSecret }), (req, res) => {
    // ตอบ 200 ก่อนประมวลผล เพราะ LINE จะ timeout และส่งซ้ำถ้ารอนาน
    res.sendStatus(200);
    const events = req.body.events || [];
    Promise.resolve()
      .then(() => handleEvents(events))
      .catch((err) => logger.error('Failed to handle events', err));
  });

  app.use((err, req, res, next) => {
    if (err instanceof SignatureValidationFailed) {
      res.status(401).send('Invalid signature');
      return;
    }
    if (err instanceof JSONParseError) {
      res.status(400).send('Invalid body');
      return;
    }
    next(err);
  });

  return app;
}

module.exports = { createApp };
