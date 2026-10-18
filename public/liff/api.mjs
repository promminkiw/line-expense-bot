// กันหน้าเว็บค้างที่ "กำลังโหลด" ตลอดเมื่อเครือข่ายช้าหรือ server ไม่ตอบ
export const REQUEST_TIMEOUT_MS = 15000;
// อ่านใบเสร็จต้องอัปโหลดรูปและรอ Claude ซึ่งฝั่ง server รอได้ถึง 30 วินาที
export const RECEIPT_TIMEOUT_MS = 60000;

// ngrok free แสดงหน้าเตือนแทน server เรา header นี้ข้ามได้ (ไม่มีผลถ้าไม่ใช้ ngrok)
export const NGROK_SKIP_WARNING_HEADERS = { 'ngrok-skip-browser-warning': '1' };

export class ApiError extends Error {
  constructor(status, error) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

export function createApi({ fetchImpl, getIdToken }) {
  async function request(path, { contentType = 'application/json', timeoutMs = REQUEST_TIMEOUT_MS, ...options } = {}) {
    const response = await fetchImpl(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${getIdToken()}`,
        ...NGROK_SKIP_WARNING_HEADERS,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      throw new ApiError(response.status, body?.error);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    listCategories: () => request('/categories'),
    createCategory: (body) => request('/categories', { method: 'POST', body: JSON.stringify(body) }),
    updateCategory: (id, body) =>
      request(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    listTransactions: (month) => request(`/transactions?month=${encodeURIComponent(month)}`),
    getTrend: (month) => request(`/trend?month=${encodeURIComponent(month)}`),
    getProfile: () => request('/profile'),
    updateTransaction: (id, body) =>
      request(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteTransaction: (id) => request(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createExport: (month) => request('/exports', { method: 'POST', body: JSON.stringify({ month }) }),
    listBudgets: (month) => request(`/budgets?month=${encodeURIComponent(month)}`),
    setBudget: (categoryId, body) =>
      request(`/budgets/${encodeURIComponent(categoryId)}`, { method: 'PUT', body: JSON.stringify(body) }),
    listRecurring: () => request('/recurring'),
    createRecurring: (body) => request('/recurring', { method: 'POST', body: JSON.stringify(body) }),
    updateRecurring: (id, body) =>
      request(`/recurring/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteRecurring: (id) => request(`/recurring/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getFriends: () => request('/friends'),
    lookupFriend: (code) => request('/friends/lookup', { method: 'POST', body: JSON.stringify({ code }) }),
    addFriend: (code) => request('/friends', { method: 'POST', body: JSON.stringify({ code }) }),
    removeFriend: (id) => request(`/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    regenerateFriendCode: () => request('/friends/code', { method: 'POST' }),
    listBills: () => request('/bills'),
    createBill: (body) => request('/bills', { method: 'POST', body: JSON.stringify(body) }),
    // server ตรวจชนิดรูปจากเนื้อไฟล์ จึงไม่ต้องเชื่อ type ที่ browser ให้มา
    readReceipt: (file) =>
      request('/bills/read-receipt', { method: 'POST', body: file, contentType: 'application/octet-stream', timeoutMs: RECEIPT_TIMEOUT_MS }),
    cancelBill: (id) => request(`/bills/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    setBillPaid: (id, memberId, paid) =>
      request(`/bills/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/paid`, {
        method: 'POST',
        body: JSON.stringify({ paid }),
      }),
    confirmBill: (id) => request(`/bills/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
    declineBill: (id) => request(`/bills/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
  };
}
