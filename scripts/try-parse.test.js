import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const script = fileURLToPath(new URL('./try-parse.js', import.meta.url));

// รันใน temp dir ที่ไม่มี .env และไม่ส่ง key ใดๆ จึงไม่มีทางเรียก Claude จริง
function run(...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    encoding: 'utf8',
  });
}

describe('try-parse script', () => {
  it('shows the usage for a message of only spaces', () => {
    const result = run('   ', ' ');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: npm run try-parse');
    expect(result.stderr).not.toContain('Missing environment variables');
  });

  it('does not print the dotenv banner', () => {
    const result = run();

    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('Usage: npm run try-parse -- "<message>"');
  });
});
