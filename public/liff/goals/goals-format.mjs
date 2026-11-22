import { formatBaht, formatFullThaiDate, loginRequiredMessage } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

const plural = (count) => (count === 1 ? 'one' : 'other');

// คิดเป็นสตางค์และปัดลง ให้ตรงกับเปอร์เซ็นต์ที่บอทตอบในแชต
export function goalPercent(saved, target) {
  return Math.floor((Math.round(saved * 100) * 100) / Math.round(target * 100));
}

// ชื่อเป้าเป็นข้อมูลของผู้ใช้ ไม่แปล แปลเฉพาะข้อความรอบๆ
export function goalRow(goal, lang = getLang()) {
  const percent = goalPercent(goal.saved, goal.targetAmount);
  const amounts = { saved: formatBaht(goal.saved, lang), target: formatBaht(goal.targetAmount, lang) };
  return {
    ...goal,
    percent,
    width: Math.min(percent, 100),
    reached: percent >= 100,
    text: t(lang, 'web.goals.progress', { ...amounts, percent }),
    amountText: t(lang, 'web.goals.amount', amounts),
    dateText: dateTextOf(goal, percent >= 100, lang),
  };
}

// เป้าที่ครบแล้วและไม่มีวัน ไม่ต้องบอกว่าไม่กำหนดวัน เพราะไม่มีอะไรให้รอแล้ว
function dateTextOf(goal, reached, lang) {
  if (goal.targetDate) return t(lang, 'web.goals.targetDate', { date: formatFullThaiDate(goal.targetDate, lang) });
  return reached ? '' : t(lang, 'web.goals.noDate');
}

export function goalLabel(row) {
  return `${row.name} ${row.text}`;
}

// รวมเฉพาะเป้าที่เปิดอยู่ คิดเป็นสตางค์เหมือน goalPercent เพื่อไม่ให้ทศนิยมเพี้ยน
export function goalsSummary(goals, lang = getLang()) {
  const open = goals.filter((goal) => !goal.closed);
  if (open.length === 0) return null;
  const savedSatang = open.reduce((sum, goal) => sum + Math.round(goal.saved * 100), 0);
  const targetSatang = open.reduce((sum, goal) => sum + Math.round(goal.targetAmount * 100), 0);
  const saved = savedSatang / 100;
  const target = targetSatang / 100;
  const remaining = Math.max(targetSatang - savedSatang, 0) / 100;
  const percent = goalPercent(saved, target);
  return {
    count: open.length,
    saved,
    target,
    remaining,
    percent,
    width: Math.min(percent, 100),
    savedValue: saved.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    countText: t(lang, `web.goals.hero.count.${plural(open.length)}`, { count: open.length }),
    percentText: t(lang, 'web.goals.hero.percent', { percent, target: formatBaht(target, lang) }),
    remainingText: t(lang, 'web.goals.hero.remaining', { amount: formatBaht(remaining, lang) }),
  };
}

export function splitGoals(goals, lang = getLang()) {
  const rows = goals.map((goal) => goalRow(goal, lang));
  return { open: rows.filter((row) => !row.closed), closed: rows.filter((row) => row.closed) };
}

export function contributionRows(contributions, lang = getLang()) {
  return contributions.map((item) => {
    const date = formatFullThaiDate(item.occurredOn, lang);
    const amount = formatBaht(item.amount, lang);
    return { id: item.id, text: `${date} · ${amount}`, label: t(lang, 'web.goals.history.deleteLabel', { amount, date }) };
  });
}

const MESSAGE_KEYS = new Map([
  ['409:Duplicate name', 'web.goals.error.duplicate'],
  ['409:Too many goals', 'web.goals.error.tooMany'],
  ['409:Goal closed', 'web.goals.error.closed'],
  ['400:Invalid name', 'web.goals.error.invalidName'],
  ['400:Invalid amount', 'web.goals.error.invalidAmount'],
  ['400:Invalid date', 'web.goals.error.invalidDate'],
]);

export function describeGoalError(status, error, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  if (status === 404) return t(lang, 'web.goals.error.notFound');
  return t(lang, MESSAGE_KEYS.get(`${status}:${error}`) ?? 'web.error.saveFailed');
}
