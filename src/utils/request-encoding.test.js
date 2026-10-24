import { describe, it, expect, vi } from 'vitest';
import { rejectUnsupportedEncoding } from './request-encoding.js';

function run(header) {
  const req = { headers: header === undefined ? {} : { 'content-encoding': header } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  rejectUnsupportedEncoding(req, res, next);
  return { res, next };
}

describe('rejectUnsupportedEncoding', () => {
  it.each([undefined, 'identity', 'gzip', 'deflate', 'GZIP', ' gzip ', 'gzip, deflate'])(
    'lets %j through',
    (header) => {
      const { res, next } = run(header);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    }
  );

  // รวมค่าที่เสียรูป: token ว่างถือว่าไม่รองรับ เพราะ body-parser ไม่แยก token เอง จึงห้ามปล่อยให้ผ่านโดยบังเอิญ
  it.each(['br', 'BR', 'br ', 'zstd', 'compress', 'gzip, br', 'unknown', ',br', 'gzip,,br', 'identity, br', 'gzip,\tbr', ',', ', ,', ''])(
    'rejects %j with 415',
    (header) => {
      const { res, next } = run(header);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported encoding' });
    }
  );
});
