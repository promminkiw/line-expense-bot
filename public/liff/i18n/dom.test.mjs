// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as NodeUrl } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTranslations } from './dom.mjs';
import th from './messages/th.mjs';
import en from './messages/en.mjs';

const indexHtml = readFileSync(new NodeUrl('../index.html', import.meta.url), 'utf8');

function parseAttrSpec(spec) {
  return spec.split(';').filter(Boolean).map((pair) => pair.split(':').map((part) => part.trim()));
}

describe('applyTranslations', () => {
  beforeEach(() => {
    document.documentElement.lang = 'th';
    document.body.innerHTML = `
      <h1 data-i18n="web.editor.title">แก้ไขรายการ</h1>
      <button data-i18n-attr="aria-label:web.common.close; title:web.nav.label" aria-label="ปิด" title="เมนูหลัก"></button>
    `;
  });

  it('swaps text and attributes to English and sets the page language', () => {
    applyTranslations(document, 'en');

    expect(document.querySelector('h1').textContent).toBe(en['web.editor.title']);
    const button = document.querySelector('button');
    expect(button.getAttribute('aria-label')).toBe(en['web.common.close']);
    expect(button.getAttribute('title')).toBe(en['web.nav.label']);
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches back to Thai', () => {
    applyTranslations(document, 'en');
    applyTranslations(document, 'th');

    expect(document.querySelector('h1').textContent).toBe('แก้ไขรายการ');
    expect(document.querySelector('button').getAttribute('aria-label')).toBe('ปิด');
    expect(document.documentElement.lang).toBe('th');
  });

  it('treats an unknown language as Thai', () => {
    applyTranslations(document, 'fr');

    expect(document.querySelector('h1').textContent).toBe('แก้ไขรายการ');
    expect(document.documentElement.lang).toBe('th');
  });

  it('only touches elements inside the given root, including the root itself', () => {
    document.body.innerHTML = `
      <section id="a" data-i18n-attr="aria-label:web.nav.label"><p data-i18n="web.editor.title">แก้ไขรายการ</p></section>
      <p id="b" data-i18n="web.editor.title">แก้ไขรายการ</p>
    `;

    applyTranslations(document.getElementById('a'), 'en');

    expect(document.querySelector('#a p').textContent).toBe(en['web.editor.title']);
    expect(document.getElementById('a').getAttribute('aria-label')).toBe(en['web.nav.label']);
    expect(document.getElementById('b').textContent).toBe('แก้ไขรายการ');
  });
});

describe('index.html translation keys', () => {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');

  it('annotates the page title', () => {
    expect(doc.querySelector('title').dataset.i18n).toBe('web.page.title');
  });

  // ข้อความไทยใน HTML เป็นค่าตั้งต้นตอนโหลดไม่สำเร็จ จึงต้องตรงกับ catalog เสมอ ไม่งั้นสลับกลับไทยแล้วข้อความเปลี่ยน
  it('keeps the Thai text of every annotated element equal to the th catalog', () => {
    const elements = doc.querySelectorAll('[data-i18n]');
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      const key = el.dataset.i18n;
      expect(th[key], key).toBeDefined();
      expect(el.textContent.trim(), key).toBe(th[key]);
    }
  });

  it('keeps every annotated attribute equal to the th catalog', () => {
    const elements = doc.querySelectorAll('[data-i18n-attr]');
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      for (const [attr, key] of parseAttrSpec(el.dataset.i18nAttr)) {
        expect(th[key], key).toBeDefined();
        expect(el.getAttribute(attr), `${attr} ${key}`).toBe(th[key]);
      }
    }
  });
});
