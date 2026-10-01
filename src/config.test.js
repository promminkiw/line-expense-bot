import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  LIFF_ID: '1234567890-AbCdEfGh',
  LINE_LOGIN_CHANNEL_ID: '1234567890',
  CRON_SECRET: 'cron-secret-789-0123456789-0123456789-abcdefg',
};

describe('loadConfig', () => {
  it('returns LINE, Claude, Supabase and LIFF settings from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000', CLAUDE_MODEL: 'claude-sonnet-5-5' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
      anthropicApiKey: 'sk-ant-test',
      claudeModel: 'claude-sonnet-5-5',
      supabaseUrl: 'https://abc.supabase.co',
      supabaseServiceRoleKey: 'sb_secret_test',
      liffId: '1234567890-AbCdEfGh',
      lineLoginChannelId: '1234567890',
      cronSecret: 'cron-secret-789-0123456789-0123456789-abcdefg',
    });
  });

  it('defaults port to 3000 and model to claude-haiku-4-5', () => {
    const config = loadConfig(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.claudeModel).toBe('claude-haiku-4-5');
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFF_ID, LINE_LOGIN_CHANNEL_ID, CRON_SECRET'
    );
  });

  it('rejects a CRON_SECRET shorter than 32 characters without echoing it', () => {
    const short = 'a'.repeat(31);
    expect(() => loadConfig({ ...VALID_ENV, CRON_SECRET: short })).toThrow(
      new Error('CRON_SECRET must be at least 32 characters')
    );
  });

  it('accepts a CRON_SECRET of exactly 32 characters', () => {
    expect(loadConfig({ ...VALID_ENV, CRON_SECRET: 'a'.repeat(32) }).cronSecret).toBe('a'.repeat(32));
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, LINE_LOGIN_CHANNEL_ID: '' })).toThrow(
      'Missing environment variables: LINE_LOGIN_CHANNEL_ID'
    );
  });
});
