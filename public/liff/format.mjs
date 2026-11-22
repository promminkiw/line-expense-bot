import { t, formatAmount, formatMonth, formatDate } from './i18n/translate.mjs';
import { getLang } from './i18n/current.mjs';
import { displayCategoryName } from './i18n/names.mjs';

// lang ไม่ส่ง = ภาษาของหน้าตอน render ส่วนเทสต์ส่งเองได้
export function formatBaht(amount, lang = getLang()) {
  return formatAmount(lang, amount);
}

export function formatSignedBaht(item, lang = getLang()) {
  return `${item.type === 'income' ? '+' : '-'}${formatBaht(item.amount, lang)}`;
}

export function formatThaiDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

// วันตามเวลาไทยเหมือนวันที่ที่บอทใช้บันทึก
export function currentDate(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function currentMonth(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}`;
}

export function groupByDate(transactions) {
  const groups = [];
  for (const item of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.occurredOn) {
      last.items.push(item);
    } else {
      groups.push({ date: item.occurredOn, items: [item] });
    }
  }
  return groups;
}

// ปัดเป็นสตางค์ก่อนเทียบ กัน float noise เช่น 0.1 + 0.2
function netCents(items) {
  return items.reduce((sum, item) => sum + (item.type === 'income' ? 1 : -1) * Math.round(item.amount * 100), 0);
}

export function formatDayNet(items) {
  const cents = netCents(items);
  if (cents === 0) return '0';
  const text = (Math.abs(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${cents > 0 ? '+' : '-'}${text}`;
}

// หมวดที่ซ่อนไม่ให้เลือกใหม่ ยกเว้นหมวดเดิมของรายการที่กำลังแก้ หรือเมื่อขอทั้งหมดสำหรับตัวกรอง
export function groupCategoryOptions(categories, { includeHidden = false, keepId = null } = {}) {
  const shown = categories.filter((category) => includeHidden || !category.hidden || category.id === keepId);
  return {
    expense: shown.filter((category) => category.type === 'expense'),
    income: shown.filter((category) => category.type === 'income'),
  };
}

// หมวดที่ซ่อนโผล่ในตัวกรองและฟอร์มแก้ไข จึงบอกเหตุผลที่ตัวเลือกนี้ไม่อยู่ในฟอร์มเพิ่มใหม่
export function categoryOptionLabel(category, lang = getLang()) {
  const name = displayCategoryName(lang, category.type, category.name);
  return category.hidden ? t(lang, 'web.category.hiddenOption', { name }) : name;
}

// เป็น function ไม่ใช่ค่าคงที่ เพราะภาษาของหน้าอาจเปลี่ยนหลัง module โหลดแล้ว
export function loginRequiredMessage(lang = getLang()) {
  return t(lang, 'web.error.loginRequired');
}

// ต้องตรงกับ pattern ใน index.html คอมมายอมเฉพาะเป็นตัวคั่นหลักพัน
const AMOUNT_TEXT_SHAPE = /^(\d{1,3}(,\d{3})+(\.\d{1,2})?|\d+(\.\d{1,2})?|\.\d{1,2})$/;

const THOUSANDS_COMMAS_SHAPE = /^\d{1,3}(,\d{3})+(\.\d*)?$/;

// ข้อความที่มีคอมมาต้องเป็นตัวคั่นหลักพันเท่านั้น กันอ่าน 60,50 เป็น 6050
export function hasOnlyThousandsCommas(text) {
  return !text.includes(',') || THOUSANDS_COMMAS_SHAPE.test(text);
}

// ช่อง number ของ browser ไม่รับ 1,500 จึงใช้ช่อง text แล้วตัดคอมมาเอง
export function parseAmountText(text) {
  const trimmed = text.trim();
  return AMOUNT_TEXT_SHAPE.test(trimmed) ? Number(trimmed.replaceAll(',', '')) : Number.NaN;
}

function actionFailed(lang, action) {
  return t(lang, action === 'delete' ? 'web.error.deleteFailed' : 'web.error.saveFailed');
}

export function describeEditFailure(status, action, lang = getLang()) {
  if (status === 401) {
    return { message: loginRequiredMessage(lang), closeAndReload: false };
  }
  if (status === 404) {
    return { message: t(lang, 'web.editor.notFound'), closeAndReload: true };
  }
  if (status === 400 && action === 'save') {
    return { message: t(lang, 'web.editor.invalid'), closeAndReload: false };
  }
  return { message: actionFailed(lang, action), closeAndReload: false };
}

export function describeRestoreFailure(status, lang = getLang()) {
  if (status === 401) return { message: loginRequiredMessage(lang), retryable: false };
  if (status === 400) return { message: t(lang, 'web.undo.restoreGone'), retryable: false };
  return { message: t(lang, 'web.undo.restoreFailed'), retryable: true };
}

export function describeDeleteTarget(item, lang = getLang()) {
  return {
    title: t(lang, 'web.confirm.title'),
    category: displayCategoryName(lang, item.type, item.categoryName),
    amount: formatSignedBaht(item, lang),
    date: formatThaiDate(item.occurredOn),
    note: item.note || '',
  };
}

// ยอดรวมมาจาก SQL เพื่อให้ตรงกับที่บอทสรุป และนับครบแม้รายการที่แสดงถูกตัด
export function summaryTotals(summary) {
  let income = 0;
  let expense = 0;
  for (const row of summary) {
    const satang = Math.round(row.total * 100);
    if (row.type === 'income') {
      income += satang;
    } else {
      expense += satang;
    }
  }
  return { income: income / 100, expense: expense / 100 };
}

// ยอดเท่ากันเรียงตามชื่อที่ผู้ใช้เห็นในภาษานั้น ไม่ใช่ชื่อไทยใน DB
export function chartRows(summary, type, lang = getLang()) {
  const shown = (row) => displayCategoryName(lang, type, row.category);
  const rows = summary
    .filter((row) => row.type === type && row.total > 0)
    .sort((a, b) => b.total - a.total || shown(a).localeCompare(shown(b), lang));
  const sum = rows.reduce((acc, row) => acc + row.total, 0);
  const max = rows.length > 0 ? rows[0].total : 0;
  return rows.map((row) => {
    const percent = (row.total / sum) * 100;
    // ปัดเป็นจำนวนเต็มให้อ่านง่าย ผลรวมอาจไม่ครบ 100 พอดี
    const share = Math.round(percent);
    return {
      category: row.category,
      total: row.total,
      share,
      // หมวดที่มียอดจริงแต่ปัดแล้วเป็น 0 ต้องไม่ดูเหมือนไม่มียอด
      shareText: percent < 1 ? '<1%' : `${share}%`,
      // แท่งที่ยอดสูงสุดยาวเต็ม แท่งอื่นเทียบกับแท่งนี้
      width: (row.total / max) * 100,
    };
  });
}

// ความกว้างใช้สัดส่วนจริงไม่ปัด ทุกช่วงจึงรวมเต็มแถบพอดี สีวนกลับเมื่อหมวดมากกว่าจำนวนสี
export function chartSegments(rows, colorCount) {
  const sum = rows.reduce((acc, row) => acc + row.total, 0);
  return rows.map((row, index) => ({
    category: row.category,
    width: (row.total / sum) * 100,
    color: (index % colorCount) + 1,
  }));
}

export function hasChartData(summary) {
  return summary.some((row) => row.total > 0);
}

export function describeExportFailure(status, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  if (status === 429) return t(lang, 'web.export.tooFast');
  return t(lang, 'web.export.failed');
}

export function formatMonthLabel(month) {
  const [year, value] = month.split('-');
  return `${value}/${year}`;
}

// ให้ผลของ request ล่าสุดเท่านั้นได้แสดง กันผลที่ช้ากว่ามาทับ
export function createLatestGuard() {
  let latest = 0;
  return {
    start: () => ++latest,
    isCurrent: (id) => id === latest,
  };
}

// ปัด % ลงและเทียบเป็นสตางค์ ให้ตรงกับเส้นที่บอทใช้เตือนในแชต
export function budgetRows(budgets, lang = getLang()) {
  const rows = budgets.map((row) => {
    // งบ 0 บาทเทียบเป็นเปอร์เซ็นต์ไม่ได้ จึงถือว่าไม่ได้ตั้งงบ
    if (row.budget === null || row.budget <= 0) {
      return {
        categoryId: row.categoryId,
        category: row.category,
        budget: null,
        spent: row.spent,
        level: 'none',
        percent: null,
        width: 0,
        text: t(lang, 'web.budget.rowNoBudget', { spent: formatBaht(row.spent, lang) }),
      };
    }
    const percent = Math.floor((Math.round(row.spent * 100) * 100) / Math.round(row.budget * 100));
    return {
      categoryId: row.categoryId,
      category: row.category,
      budget: row.budget,
      spent: row.spent,
      level: percent >= 100 ? 'over' : percent >= 80 ? 'warn' : 'ok',
      percent,
      width: Math.min(percent, 100),
      text: t(lang, 'web.budget.rowUsage', { spent: formatBaht(row.spent, lang), budget: formatBaht(row.budget, lang), percent }),
    };
  });
  // หมวดที่ตั้งงบแล้วขึ้นก่อน เพราะเป็นส่วนที่ผู้ใช้ต้องติดตาม
  return [...rows.filter((row) => row.budget !== null), ...rows.filter((row) => row.budget === null)];
}

export function describeBudgetFailure(status, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  if (status === 400) return t(lang, 'web.budget.invalidAmount');
  if (status === 404) return t(lang, 'web.budget.categoryGone');
  return t(lang, 'web.budget.saveFailed');
}

export function describeRecurringDay(day, lang = getLang()) {
  return t(lang, day > 28 ? 'web.recurring.dayClamped' : 'web.recurring.day', { day });
}

export function recurringRows(rules, categories, lang = getLang()) {
  const names = new Map(categories.map((category) => [category.id, displayCategoryName(lang, category.type, category.name)]));
  return rules.map((rule) => {
    const parts = [`${t(lang, `type.${rule.type}`)} ${formatBaht(rule.amount, lang)}`, describeRecurringDay(rule.dayOfMonth, lang)];
    if (rule.note) parts.push(rule.note);
    if (!rule.active) parts.push(t(lang, 'web.recurring.paused'));
    const title = names.get(rule.categoryId) || t(lang, 'web.recurring.unknownCategory');
    return {
      id: rule.id,
      categoryId: rule.categoryId,
      amount: rule.amount,
      note: rule.note,
      dayOfMonth: rule.dayOfMonth,
      active: rule.active,
      title,
      text: parts.join(' · '),
      type: rule.type,
      // แถวแบบปฏิทินใช้โน้ตเป็นชื่อหลัก ถ้าไม่มีโน้ตใช้ชื่อหมวดและเว้นบรรทัดรองไว้ไม่ให้ซ้ำ
      name: rule.note || title,
      subtitle: rule.note ? title : '',
      amountText: formatSignedBaht(rule, lang),
    };
  });
}

export function describeRecurringFailure(status, action, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  if (status === 404) return t(lang, 'web.recurring.notFound');
  if (status === 409) return t(lang, 'web.recurring.limit');
  if (status === 400) return t(lang, 'web.recurring.invalid');
  return actionFailed(lang, action);
}

export function shouldCloseRecurringEditor(status) {
  return status === 404;
}

// ค้นได้ทั้งชื่อที่แสดงและชื่อใน DB ผู้ใช้อังกฤษพิมพ์ food หรือ อาหาร ก็เจอ
export function filterTransactions(transactions, { query = '', categoryId = '', type = '', walletId = '' } = {}, lang = getLang()) {
  const needle = query.trim().toLowerCase();
  return transactions.filter((item) => {
    if (type && item.type !== type) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (walletId && item.walletId !== walletId) return false;
    if (!needle) return true;
    const shown = displayCategoryName(lang, item.type, item.categoryName);
    return `${item.categoryName} ${shown} ${item.note || ''}`.toLowerCase().includes(needle);
  });
}

export function isFilterActive({ query = '', categoryId = '', type = '', walletId = '' } = {}) {
  return Boolean(query.trim() || categoryId || type || walletId);
}

export function describeFilterResult(shown, total, truncated, lang = getLang()) {
  const counts = { shown: shown.length, total };
  const cents = netCents(shown);
  // เครื่องหมายอยู่หน้าสกุลเงิน ไทยได้ +60 บาท อังกฤษได้ +฿60 ตามรูปแบบยอดเงินของแต่ละภาษา
  const net = `${cents > 0 ? '+' : cents < 0 ? '-' : ''}${formatBaht(Math.abs(cents) / 100, lang)}`;
  const text = shown.length > 0
    ? t(lang, 'web.list.filterResultNet', { ...counts, net })
    : t(lang, 'web.list.filterResult', counts);
  return truncated ? t(lang, 'web.list.filterTruncated', { text }) : text;
}

// ชื่อเดิมคงไว้ให้ call site เดิม ส่วนภาษาอังกฤษได้ชื่อเดือนอังกฤษ
export function thaiMonthShort(month, lang = getLang()) {
  return t(lang, `common.month.short.${Number(month.split('-')[1])}`);
}

export function describeViewedMonth(month, lang = getLang()) {
  return t(lang, 'web.month.viewing', { month: formatMonth(lang, month, { short: true }) });
}

// ไทยใช้ พ.ศ. อังกฤษใช้ ค.ศ. ตาม formatDate ของชุดแปล
export function formatFullThaiDate(isoDate, lang = getLang()) {
  return formatDate(lang, isoDate);
}

// ค่าที่มากกว่า 0 แต่เล็กมากต้องยังเห็นเป็นแท่ง ไม่ให้ดูเหมือนไม่มียอด
function barHeight(value, max) {
  if (max === 0 || value <= 0) return 0;
  return Math.max((value / max) * 100, 2);
}

export function trendBars(months, lang = getLang()) {
  const max = Math.max(0, ...months.flatMap((entry) => [entry.income, entry.expense]));
  return months.map((entry) => {
    const label = thaiMonthShort(entry.month, lang);
    return {
      month: entry.month,
      label,
      income: entry.income,
      expense: entry.expense,
      incomeHeight: barHeight(entry.income, max),
      expenseHeight: barHeight(entry.expense, max),
      description: t(lang, 'web.trend.barDescription', { month: label, income: formatBaht(entry.income, lang), expense: formatBaht(entry.expense, lang) }),
    };
  });
}

// เทียบเป็นสตางค์เพื่อไม่ให้ทศนิยมลอยตัวทำให้เปอร์เซ็นต์เพี้ยน
export function describeExpenseComparison(months, lang = getLang()) {
  if (months.length < 2) return { level: 'none', text: '' };
  const current = Math.round(months[months.length - 1].expense * 100);
  const previous = Math.round(months[months.length - 2].expense * 100);
  if (previous === 0) return { level: 'none', text: t(lang, 'web.trend.noPrevious') };
  const diff = current - previous;
  if (diff === 0) return { level: 'same', text: t(lang, 'web.trend.same') };
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  const amount = formatBaht(Math.abs(diff) / 100, lang);
  // เดือนก่อนจ่ายน้อยมาก % จะพุ่งเป็นหลักพันจนอ่านไม่ได้ความหมาย จึงบอกแค่จำนวนเงิน
  if (diff > 0 && percent > 200) return { level: 'up', text: t(lang, 'web.trend.upAmount', { amount }) };
  return diff > 0
    ? { level: 'up', text: t(lang, 'web.trend.up', { percent, amount }) }
    : { level: 'down', text: t(lang, 'web.trend.down', { percent, amount }) };
}

const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

// grapheme แรกของชื่อ: emoji แบบ ZWJ และพยัญชนะไทยพร้อมวรรณยุกต์ไม่ถูกตัดครึ่ง (เบราว์เซอร์เก่าใช้ code point แทน)
function firstGrapheme(text) {
  if (graphemeSegmenter) {
    const first = graphemeSegmenter.segment(text)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment;
  }
  return Array.from(text)[0];
}

// รับเฉพาะ https เพราะค่ามาจาก token ฝั่ง client และจะใส่เป็น src ของรูป
export function profilePictureUrl(decodedToken) {
  const picture = decodedToken && decodedToken.picture;
  return typeof picture === 'string' && picture.startsWith('https://') ? picture : null;
}

export function profileView(profile, lang = getLang()) {
  const name = (profile.displayName || '').trim() || t(lang, 'web.profile.defaultName');
  return {
    name,
    initial: firstGrapheme(name).toUpperCase(),
    balance: profile.balance,
    balanceText: formatBaht(profile.balance, lang),
    negative: profile.balance < 0,
    incomeText: formatBaht(profile.income, lang),
    expenseText: formatBaht(profile.expense, lang),
    countText: t(lang, `web.profile.entries.${profile.entryCount === 1 ? 'one' : 'other'}`, { count: profile.entryCount.toLocaleString('en-US') }),
    sinceText: profile.firstDate
      ? t(lang, 'web.profile.since', { date: formatFullThaiDate(profile.firstDate, lang) })
      : t(lang, 'web.profile.noEntries'),
  };
}
