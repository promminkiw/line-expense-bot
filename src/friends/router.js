const express = require('express');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOKUP_ERRORS = {
  invalid: [400, 'Invalid code'],
  self: [400, 'Own code'],
  not_found: [404, 'Not found'],
};

// ต้อง mount หลัง middleware ตรวจ ID token ของ /api เพราะใช้ req.userId
function createFriendsRouter({ friends, allowFriendLookup }) {
  // ไม่มี default เพราะถ้าลืมส่ง limit การเดารหัสจะทำได้ไม่จำกัด
  if (typeof allowFriendLookup !== 'function') {
    throw new TypeError('createFriendsRouter requires allowFriendLookup');
  }
  const router = express.Router();

  function sendLookupResult(res, result) {
    if (result.status === 'ok') {
      res.json({ friend: result.friend });
      return;
    }
    const [status, error] = LOOKUP_ERRORS[result.status];
    res.status(status).json({ error });
  }

  function rejectWhenLimited(req, res) {
    if (allowFriendLookup(req.userId)) {
      return false;
    }
    res.status(429).json({ error: 'Too many requests' });
    return true;
  }

  router.get('/', async (req, res) => {
    res.json(await friends.getOverview(req.userId));
  });

  router.get('/lookup', async (req, res) => {
    if (rejectWhenLimited(req, res)) return;
    sendLookupResult(res, await friends.lookup(req.userId, req.query.code));
  });

  router.post('/', async (req, res) => {
    if (rejectWhenLimited(req, res)) return;
    sendLookupResult(res, await friends.addByCode(req.userId, req.body && req.body.code));
  });

  router.post('/code', async (req, res) => {
    res.json({ code: await friends.regenerateCode(req.userId) });
  });

  router.delete('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id) || !(await friends.remove(req.userId, req.params.id))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}

module.exports = { createFriendsRouter };
