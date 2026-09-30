// กันหน้าเว็บค้างที่ "กำลังโหลด" ตลอดเมื่อเครือข่ายช้าหรือ server ไม่ตอบ
export const REQUEST_TIMEOUT_MS = 15000;

// ngrok free แสดงหน้าเตือนแทน server เรา header นี้ข้ามได้ (ไม่มีผลถ้าไม่ใช้ ngrok)
export const NGROK_SKIP_WARNING_HEADERS = { 'ngrok-skip-browser-warning': '1' };

export class ApiError extends Error {
  constructor(status) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function createApi({ fetchImpl, getIdToken }) {
  async function request(path, options = {}) {
    const response = await fetchImpl(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getIdToken()}`,
        ...NGROK_SKIP_WARNING_HEADERS,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ApiError(response.status);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    listCategories: () => request('/categories'),
    listTransactions: (month) => request(`/transactions?month=${encodeURIComponent(month)}`),
    updateTransaction: (id, body) =>
      request(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteTransaction: (id) => request(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createExport: (month) => request('/exports', { method: 'POST', body: JSON.stringify({ month }) }),
    listBudgets: (month) => request(`/budgets?month=${encodeURIComponent(month)}`),
    setBudget: (categoryId, body) =>
      request(`/budgets/${encodeURIComponent(categoryId)}`, { method: 'PUT', body: JSON.stringify(body) }),
  };
}
