// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TABS, DEFAULT_TAB, findTab, createTabController } from './tabs.mjs';

function setup() {
  document.body.replaceChildren();
  const nav = document.createElement('nav');
  const titleEl = document.createElement('h1');
  const monthEl = document.createElement('input');
  const panels = new Map();
  for (const tab of TABS) {
    const panel = document.createElement('div');
    panel.id = `panel-${tab.id}`;
    document.body.append(panel);
    panels.set(tab.id, panel);
  }
  const onChange = vi.fn();
  const controller = createTabController({ doc: document, nav, titleEl, monthEl, panelFor: (id) => panels.get(id), onChange });
  return { nav, titleEl, monthEl, panels, onChange, controller };
}

describe('TABS', () => {
  it('has the five tabs in order', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['list', 'summary', 'budgets', 'recurring', 'profile']);
    expect(TABS.map((tab) => tab.label)).toEqual(['รายการ', 'สรุป', 'จัดการงบ', 'รอบเดือน', 'โปรไฟล์']);
    expect(DEFAULT_TAB).toBe('list');
  });

  it('falls back to the list tab for an unknown id', () => {
    expect(findTab('nope').id).toBe('list');
  });
});

describe('createTabController', () => {
  let ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('renders one button per tab with an icon and a label', () => {
    const buttons = ctx.nav.querySelectorAll('button[data-tab]');

    expect([...buttons].map((button) => button.dataset.tab)).toEqual(TABS.map((tab) => tab.id));
    expect(buttons[1].textContent).toBe('สรุป');
    expect(buttons[1].querySelector('use').getAttribute('href')).toBe('#tab-chart');
  });

  it('selecting a tab shows only its panel, marks the button, sets the title and notifies', () => {
    ctx.controller.select('budgets');

    expect([...ctx.panels].filter(([, panel]) => !panel.hidden).map(([id]) => id)).toEqual(['budgets']);
    expect(ctx.nav.querySelector('[aria-current="page"]').dataset.tab).toBe('budgets');
    expect(ctx.nav.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(ctx.titleEl.textContent).toBe(findTab('budgets').title);
    expect(ctx.onChange).toHaveBeenCalledWith('budgets');
    expect(ctx.controller.current).toBe('budgets');
  });

  it('hides the month picker on tabs that do not depend on a month', () => {
    ctx.controller.select('summary');
    expect(ctx.monthEl.hidden).toBe(false);

    ctx.controller.select('recurring');
    expect(ctx.monthEl.hidden).toBe(true);

    ctx.controller.select('profile');
    expect(ctx.monthEl.hidden).toBe(true);

    ctx.controller.select('list');
    expect(ctx.monthEl.hidden).toBe(false);
  });

  it('does not notify when the same tab is selected again', () => {
    ctx.controller.select('summary');
    ctx.onChange.mockClear();

    ctx.controller.select('summary');

    expect(ctx.onChange).not.toHaveBeenCalled();
  });

  it('ignores a tab whose panel is missing', () => {
    const nav = document.createElement('nav');
    const controller = createTabController({
      doc: document,
      nav,
      titleEl: document.createElement('h1'),
      monthEl: document.createElement('input'),
      panelFor: (id) => (id === 'list' ? document.createElement('div') : null),
    });

    expect(() => controller.select('profile')).not.toThrow();
    expect(controller.current).toBe('profile');
  });

  it('switches when a nav button is clicked', () => {
    ctx.nav.querySelector('button[data-tab="profile"]').click();

    expect(ctx.controller.current).toBe('profile');
    expect(ctx.panels.get('profile').hidden).toBe(false);
  });
});
