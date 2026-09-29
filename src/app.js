const express = require('express');
const { middleware, SignatureValidationFailed, JSONParseError } = require('@line/bot-sdk');

function createApp({ channelSecret, handleEvents, logger = console }) {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // อ่าน body เป็น raw Buffer (ไม่ใช่ JSON) พร้อมจำกัดขนาด เพราะ SDK ต้องใช้ byte ดิบตรวจ signature
  app.post('/webhook', express.raw({ type: () => true, limit: '1mb' }), middleware({ channelSecret }), (req, res) => {
    // ตอบ 200 ก่อนประมวลผล เพราะ LINE มี timeout ของ webhook สั้น
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
    if (err.type === 'entity.too.large') {
      res.status(413).send('Payload too large');
      return;
    }
    if (err instanceof JSONParseError) {
      res.status(400).send('Invalid body');
      return;
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    const status = err.status || err.statusCode;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      res.status(status).send('Bad request');
      return;
    }
    logger.error('Unhandled request error', err);
    res.status(500).send('Internal error');
  });

  return app;
}

module.exports = { createApp };
