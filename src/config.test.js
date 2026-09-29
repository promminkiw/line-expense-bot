import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
};

describe('loadConfig', () => {
  it('returns LINE credentials from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
    });
  });

  it('defaults port to 3000 when PORT is missing', () => {
    expect(loadConfig(VALID_ENV).port).toBe(3000);
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN'
    );
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, LINE_CHANNEL_SECRET: '' })).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET'
    );
  });
});
