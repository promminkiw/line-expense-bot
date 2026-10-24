import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const root = new URL('../', import.meta.url);
const yaml = readFileSync(new URL('render.yaml', root), 'utf8');
const configSource = readFileSync(new URL('src/config.js', root), 'utf8');

// อ่านรายชื่อตัวแปรที่ server บังคับจาก config.js เพื่อไม่ให้ render.yaml ตกหล่นเมื่อเพิ่มตัวแปรใหม่
const requiredKeys = [...configSource.match(/REQUIRED_KEYS = \[([\s\S]*?)\]/)[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

// แยก envVars เป็นบล็อกต่อ key
const envBlocks = yaml
  .split(/\n\s*- key: /)
  .slice(1)
  .map((block) => {
    const [name, ...rest] = block.split('\n');
    return { name: name.trim(), body: rest.join('\n') };
  });

describe('render.yaml', () => {
  it('describes one Node web service on the free plan in Singapore', () => {
    expect(yaml).toMatch(/^\s*- type: web$/m);
    expect(yaml).toMatch(/^\s*runtime: node$/m);
    expect(yaml).toMatch(/^\s*region: singapore$/m);
    expect(yaml).toMatch(/^\s*plan: free$/m);
    expect(yaml.match(/- type: /g)).toHaveLength(1);
  });

  it('installs with npm ci, starts with npm start and checks /health', () => {
    expect(yaml).toMatch(/^\s*buildCommand: npm ci$/m);
    expect(yaml).toMatch(/^\s*startCommand: npm start$/m);
    expect(yaml).toMatch(/^\s*healthCheckPath: \/health$/m);
  });

  // security release 2026-10-21 แก้ Brotli decoder (CVE-2026-111497) ใน 24.22.1 จึงห้ามปักต่ำกว่านี้
  it('pins Node 24.22.1 or newer on Render, the same major CI tests with', () => {
    const node = envBlocks.find((block) => block.name === 'NODE_VERSION');
    const ci = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');
    const pinned = node.body.match(/value: "(\d+)\.(\d+)\.(\d+)"/);

    expect(pinned, 'NODE_VERSION must be an exact x.y.z').not.toBeNull();
    const [major, minor, patch] = pinned.slice(1).map(Number);
    expect(major).toBe(24);
    expect(minor > 22 || (minor === 22 && patch >= 1), `NODE_VERSION ${major}.${minor}.${patch} is older than 24.22.1`).toBe(true);
    expect(ci).toMatch(/^\s*node-version: 24$/m);
  });

  it('declares every required variable and asks for its value at creation (sync: false)', () => {
    expect(requiredKeys.length).toBeGreaterThan(0);
    for (const key of requiredKeys) {
      const block = envBlocks.find((candidate) => candidate.name === key);
      expect(block, `missing ${key}`).toBeDefined();
      expect(block.body, `${key} must be sync: false`).toMatch(/sync: false/);
    }
  });

  it('never puts a secret value in the file', () => {
    for (const key of requiredKeys) {
      const block = envBlocks.find((candidate) => candidate.name === key);
      expect(block.body, `${key} must not have a value`).not.toMatch(/value:/);
    }
  });

  it('does not set PORT because Render provides it', () => {
    expect(envBlocks.some((block) => block.name === 'PORT')).toBe(false);
  });
});
