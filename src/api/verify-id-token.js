const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
// ให้ LINE ตรวจลายเซ็นและวันหมดอายุแทน จึงไม่ต้องดูแล key เอง แต่จำกัดเวลารอไว้
const VERIFY_TIMEOUT_MS = 5000;

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

async function readErrorDescription(response) {
  try {
    const body = await response.json();
    return typeof body?.error_description === 'string' ? body.error_description : '';
  } catch {
    return '';
  }
}

function createIdTokenVerifier({ channelId, fetchImpl = fetch }) {
  return async function verifyIdToken(idToken) {
    if (!idToken) {
      throw new AuthError('Missing ID token');
    }
    const response = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      // LINE ล่มหรือจำกัดอัตราไม่ใช่ความผิดของ token จึงไม่ให้กลายเป็น 401
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`LINE verify unavailable, status ${response.status}`);
      }
      const reason = await readErrorDescription(response);
      throw new AuthError(`ID token rejected with status ${response.status}${reason ? `: ${reason}` : ''}`);
    }
    const payload = await response.json();
    if (!payload.sub) {
      throw new AuthError('ID token has no subject');
    }
    return { lineUserId: payload.sub, name: typeof payload.name === 'string' && payload.name ? payload.name : null };
  };
}

module.exports = { createIdTokenVerifier, AuthError };
