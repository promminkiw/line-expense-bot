import { describe, it, expect, beforeEach, vi } from 'vitest';

// state อยู่ระดับ module จึง import ใหม่ทุกเทสต์ ไม่ให้ภาษาจากเทสต์ก่อนรั่วมา
async function load() {
  vi.resetModules();
  return import('./current.mjs');
}

describe('current page language', () => {
  let current;
  beforeEach(async () => {
    current = await load();
  });

  it('starts in Thai', () => {
    expect(current.getLang()).toBe('th');
  });

  it('remembers the language that was set and returns it', () => {
    expect(current.setLang('en')).toBe('en');
    expect(current.getLang()).toBe('en');
  });

  it('treats an unsupported language as Thai', () => {
    current.setLang('en');

    expect(current.setLang('fr')).toBe('th');
    expect(current.getLang()).toBe('th');
  });
});
