const express = require('express');
const { UUID_PATTERN } = require('../utils/uuid');
const { validateGoalCreate, validateGoalUpdate, validateContribution } = require('./validate');

// แชตแสดงรายชื่อเป้าที่เปิดอยู่ทั้งหมดเมื่อหาเป้าไม่เจอ จึงจำกัดไม่ให้ข้อความยาวเกินไป
const MAX_OPEN_GOALS = 20;

function notFound(res) {
  res.status(404).json({ error: 'Not found' });
}

function badRequest(res, error) {
  res.status(400).json({ error });
}

function countOpen(goals) {
  return goals.filter((goal) => !goal.closed).length;
}

// Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ UUID_PATTERN รับตัวพิมพ์ใหญ่ด้วย
function readId(value) {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

// ต้อง mount หลัง middleware ตรวจ ID token ของ /api เพราะใช้ req.userId
function createGoalsRouter({ repository }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    res.json({ goals: await repository.listGoals(req.userId) });
  });

  router.post('/', async (req, res) => {
    const result = validateGoalCreate(req.body);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    if (countOpen(await repository.listGoals(req.userId)) >= MAX_OPEN_GOALS) {
      res.status(409).json({ error: 'Too many goals' });
      return;
    }
    const created = await repository.createGoal(req.userId, result.value);
    if (created.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    res.status(201).json({ goal: created.goal });
  });

  router.patch('/:id', async (req, res) => {
    const id = readId(req.params.id);
    if (!id) {
      notFound(res);
      return;
    }
    const result = validateGoalUpdate(req.body);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    const goals = await repository.listGoals(req.userId);
    const goal = goals.find((item) => item.id === id);
    if (!goal) {
      notFound(res);
      return;
    }
    if (result.value.closed === false && goal.closed && countOpen(goals) >= MAX_OPEN_GOALS) {
      res.status(409).json({ error: 'Too many goals' });
      return;
    }
    const updated = await repository.updateGoal(req.userId, id, result.value);
    if (updated.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    if (updated.status === 'not_found') {
      notFound(res);
      return;
    }
    res.json({ goal: updated.goal });
  });

  router.get('/:id/contributions', async (req, res) => {
    const id = readId(req.params.id);
    // ตรวจว่าเป็นเป้าของผู้ใช้ก่อน ไม่งั้นเป้าของคนอื่นจะได้รายการว่างแทน 404
    if (!id || !(await repository.listGoals(req.userId)).some((goal) => goal.id === id)) {
      notFound(res);
      return;
    }
    res.json({ contributions: await repository.listGoalContributions(req.userId, id) });
  });

  router.post('/:id/contributions', async (req, res) => {
    const id = readId(req.params.id);
    if (!id) {
      notFound(res);
      return;
    }
    const result = validateContribution(req.body);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    const added = await repository.addGoalContribution(req.userId, id, result.value);
    if (added.status === 'not_found') {
      notFound(res);
      return;
    }
    if (added.status === 'closed') {
      res.status(409).json({ error: 'Goal closed' });
      return;
    }
    res.status(201).json({ contribution: { id: added.contributionId }, saved: added.saved });
  });

  router.delete('/:id/contributions/:contributionId', async (req, res) => {
    const id = readId(req.params.id);
    const contributionId = readId(req.params.contributionId);
    if (!id || !contributionId || !(await repository.deleteGoalContribution(req.userId, id, contributionId))) {
      notFound(res);
      return;
    }
    res.status(204).end();
  });

  return router;
}

module.exports = { createGoalsRouter, MAX_OPEN_GOALS };
