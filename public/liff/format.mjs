export function formatBaht(amount) {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท`;
}

export function formatSignedBaht(item) {
  return `${item.type === 'income' ? '+' : '-'}${formatBaht(item.amount)}`;
}

export function formatThaiDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
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

export function groupCategoryOptions(categories) {
  return {
    expense: categories.filter((category) => category.type === 'expense'),
    income: categories.filter((category) => category.type === 'income'),
  };
}

export const LOGIN_REQUIRED_MESSAGE = 'กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง';

export function describeEditFailure(status, action) {
  if (status === 401) {
    return { message: LOGIN_REQUIRED_MESSAGE, closeAndReload: false };
  }
  if (status === 404) {
    return { message: 'ไม่พบรายการนี้แล้ว', closeAndReload: true };
  }
  if (status === 400 && action === 'save') {
    return { message: 'ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่อีกครั้ง', closeAndReload: false };
  }
  const failed = action === 'delete' ? 'ลบไม่สำเร็จ' : 'บันทึกไม่สำเร็จ';
  return { message: `${failed} ลองใหม่อีกครั้ง`, closeAndReload: false };
}

export function describeDeleteTarget(item) {
  return {
    title: 'ลบรายการนี้?',
    category: item.categoryName,
    amount: formatSignedBaht(item),
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

export function chartRows(summary, type) {
  const rows = summary
    .filter((row) => row.type === type && row.total > 0)
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'th'));
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

export function hasChartData(summary) {
  return summary.some((row) => row.total > 0);
}

export function describeExportFailure(status) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 429) return 'กด Export ถี่เกินไป รอสักครู่แล้วลองใหม่';
  return 'Export ไม่สำเร็จ ลองใหม่อีกครั้ง';
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
export function budgetRows(budgets) {
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
        text: `ใช้ไป ${formatBaht(row.spent)} · ยังไม่ตั้งงบ`,
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
      text: `ใช้ไป ${formatBaht(row.spent)} จาก ${formatBaht(row.budget)} (${percent}%)`,
    };
  });
  // หมวดที่ตั้งงบแล้วขึ้นก่อน เพราะเป็นส่วนที่ผู้ใช้ต้องติดตาม
  return [...rows.filter((row) => row.budget !== null), ...rows.filter((row) => row.budget === null)];
}

export function describeBudgetFailure(status) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 400) return 'จำนวนเงินไม่ถูกต้อง ใส่ได้ไม่เกิน 10,000,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง';
  if (status === 404) return 'ไม่พบหมวดนี้แล้ว';
  return 'บันทึกงบไม่สำเร็จ ลองใหม่อีกครั้ง';
}

const RECURRING_TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

export function describeRecurringDay(day) {
  return day > 28 ? `ทุกวันที่ ${day} (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย)` : `ทุกวันที่ ${day}`;
}

export function recurringRows(rules, categories) {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return rules.map((rule) => {
    const parts = [`${RECURRING_TYPE_LABELS[rule.type]} ${formatBaht(rule.amount)}`, describeRecurringDay(rule.dayOfMonth)];
    if (rule.note) parts.push(rule.note);
    if (!rule.active) parts.push('หยุดไว้');
    return {
      id: rule.id,
      categoryId: rule.categoryId,
      amount: rule.amount,
      note: rule.note,
      dayOfMonth: rule.dayOfMonth,
      active: rule.active,
      title: names.get(rule.categoryId) || 'ไม่ทราบหมวด',
      text: parts.join(' · '),
    };
  });
}

export function describeRecurringFailure(status, action) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบรายการประจำนี้แล้ว';
  if (status === 409) return 'มีรายการประจำครบ 50 รายการแล้ว ลบอันเก่าก่อนเพิ่มใหม่';
  if (status === 400) return 'ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่ (1-31)';
  return action === 'delete' ? 'ลบไม่สำเร็จ ลองใหม่อีกครั้ง' : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}

export function shouldCloseRecurringEditor(status) {
  return status === 404;
}

export function filterTransactions(transactions, { query = '', categoryId = '', type = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return transactions.filter((item) => {
    if (type && item.type !== type) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (!needle) return true;
    return `${item.categoryName} ${item.note || ''}`.toLowerCase().includes(needle);
  });
}

export function isFilterActive({ query = '', categoryId = '', type = '' } = {}) {
  return Boolean(query.trim() || categoryId || type);
}

export function describeFilterResult(shown, total, truncated) {
  const text = `พบ ${shown} จาก ${total} รายการ`;
  return truncated ? `${text} (ค้นเฉพาะรายการที่แสดง)` : text;
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function thaiMonthShort(month) {
  return THAI_MONTHS[Number(month.split('-')[1]) - 1];
}

export function formatFullThaiDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${Number(day)} ${thaiMonthShort(`${year}-${month}`)} ${Number(year) + 543}`;
}

// ค่าที่มากกว่า 0 แต่เล็กมากต้องยังเห็นเป็นแท่ง ไม่ให้ดูเหมือนไม่มียอด
function barHeight(value, max) {
  if (max === 0 || value <= 0) return 0;
  return Math.max((value / max) * 100, 2);
}

export function trendBars(months) {
  const max = Math.max(0, ...months.flatMap((entry) => [entry.income, entry.expense]));
  return months.map((entry) => {
    const label = thaiMonthShort(entry.month);
    return {
      month: entry.month,
      label,
      income: entry.income,
      expense: entry.expense,
      incomeHeight: barHeight(entry.income, max),
      expenseHeight: barHeight(entry.expense, max),
      description: `${label} รายรับ ${formatBaht(entry.income)} รายจ่าย ${formatBaht(entry.expense)}`,
    };
  });
}

// เทียบเป็นสตางค์เพื่อไม่ให้ทศนิยมลอยตัวทำให้เปอร์เซ็นต์เพี้ยน
export function describeExpenseComparison(months) {
  if (months.length < 2) return { level: 'none', text: '' };
  const current = Math.round(months[months.length - 1].expense * 100);
  const previous = Math.round(months[months.length - 2].expense * 100);
  if (previous === 0) return { level: 'none', text: 'เดือนก่อนไม่มีรายจ่ายให้เทียบ' };
  const diff = current - previous;
  if (diff === 0) return { level: 'same', text: 'รายจ่ายเท่ากับเดือนก่อน' };
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  const amount = formatBaht(Math.abs(diff) / 100);
  return diff > 0
    ? { level: 'up', text: `รายจ่ายมากกว่าเดือนก่อน ${percent}% (+${amount})` }
    : { level: 'down', text: `รายจ่ายน้อยกว่าเดือนก่อน ${percent}% (-${amount})` };
}
