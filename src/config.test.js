import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
};

describe('loadConfig', () => {
  it('returns LINE, Claude and Supabase settings from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000', CLAUDE_MODEL: 'claude-sonnet-5-5' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
      anthropicApiKey: 'sk-ant-test',
      claudeModel: 'claude-sonnet-5-5',
      supabaseUrl: 'https://abc.supabase.co',
      supabaseServiceRoleKey: 'sb_secret_test',
    });
  });

  it('defaults port to 3000 and model to claude-haiku-4-5', () => {
    const config = loadConfig(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.claudeModel).toBe('claude-haiku-4-5');
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(
      'Missing environment variables: SUPABASE_SERVICE_ROLE_KEY'
    );
  });
});
