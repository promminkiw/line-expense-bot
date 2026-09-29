// จำกัดเวลาทุก request ไป Supabase ไม่ให้ค้างเกินช่วง reply token ของ LINE
function createFetchWithTimeout(timeoutMs, baseFetch = fetch) {
  return (url, options = {}) => {
    const signals = [AbortSignal.timeout(timeoutMs), options.signal].filter(Boolean);
    return baseFetch(url, { ...options, signal: AbortSignal.any(signals) });
  };
}

module.exports = { createFetchWithTimeout };
