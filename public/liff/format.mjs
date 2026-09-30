export function formatBaht(amount) {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท`;
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
