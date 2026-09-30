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

// รวมเป็นสตางค์เพื่อไม่ให้ทศนิยมของ JavaScript คลาดเคลื่อน
export function totals(transactions) {
  let income = 0;
  let expense = 0;
  for (const item of transactions) {
    const satang = Math.round(item.amount * 100);
    if (item.type === 'income') {
      income += satang;
    } else {
      expense += satang;
    }
  }
  return { income: income / 100, expense: expense / 100 };
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
  return rows.map((row) => ({
    category: row.category,
    total: row.total,
    // ปัดเป็นจำนวนเต็มให้อ่านง่าย ผลรวมอาจไม่ครบ 100 พอดี
    share: Math.round((row.total / sum) * 100),
    // แท่งที่ยอดสูงสุดยาวเต็ม แท่งอื่นเทียบกับแท่งนี้
    width: (row.total / max) * 100,
  }));
}

export function describeExportFailure(status) {
  return status === 401 ? LOGIN_REQUIRED_MESSAGE : 'Export ไม่สำเร็จ ลองใหม่อีกครั้ง';
}
