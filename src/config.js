const REQUIRED_KEYS = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LIFF_ID',
  'LINE_LOGIN_CHANNEL_ID',
  'CRON_SECRET',
];
const MIN_CRON_SECRET_LENGTH = 32;
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5';

function loadConfig(env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  if (env.CRON_SECRET.length < MIN_CRON_SECRET_LENGTH) {
    throw new Error(`CRON_SECRET must be at least ${MIN_CRON_SECRET_LENGTH} characters`);
  }

  return {
    port: Number(env.PORT) || 3000,
    lineChannelSecret: env.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeModel: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    liffId: env.LIFF_ID,
    lineLoginChannelId: env.LINE_LOGIN_CHANNEL_ID,
    cronSecret: env.CRON_SECRET,
  };
}

module.exports = { loadConfig };
