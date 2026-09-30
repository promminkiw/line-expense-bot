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

// ปัด % ลงและเทียบเป็นสตางค์ ให้ตรงกับเส้นที่บอทใช้เตือนในแชต
export function budgetRows(budgets) {
  const rows = budgets.map((row) => {
    if (row.budget === null) {
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
