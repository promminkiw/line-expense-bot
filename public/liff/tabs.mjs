import { createSvgIcon } from './icons.mjs';

export const TABS = [
  { id: 'list', label: 'รายการ', title: 'รายการของฉัน', icon: 'tab-list', showMonth: true },
  { id: 'summary', label: 'สรุป', title: 'สรุปรายเดือน', icon: 'tab-chart', showMonth: true },
  { id: 'budgets', label: 'จัดการงบ', title: 'จัดการงบประมาณ', icon: 'tab-budget', showMonth: true },
  { id: 'recurring', label: 'รอบเดือน', title: 'รายการประจำ', icon: 'tab-repeat', showMonth: false },
  { id: 'profile', label: 'โปรไฟล์', title: 'โปรไฟล์', icon: 'tab-user', showMonth: false },
];

export const DEFAULT_TAB = 'list';

export function findTab(id) {
  return TABS.find((tab) => tab.id === id) ?? TABS[0];
}

function buildButton(doc, tab) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'nav-button';
  button.dataset.tab = tab.id;
  const label = doc.createElement('span');
  label.textContent = tab.label;
  button.append(createSvgIcon(doc, tab.icon), label);
  return button;
}

export function createTabController({ doc, nav, titleEl, monthEl, panelFor, onChange = () => {} }) {
  let current = null;

  function select(id) {
    const tab = findTab(id);
    if (tab.id === current) return;
    current = tab.id;
    for (const button of nav.querySelectorAll('button[data-tab]')) {
      if (button.dataset.tab === tab.id) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
    for (const other of TABS) {
      panelFor(other.id).hidden = other.id !== tab.id;
    }
    titleEl.textContent = tab.title;
    monthEl.hidden = !tab.showMonth;
    onChange(tab.id);
  }

  nav.replaceChildren(...TABS.map((tab) => buildButton(doc, tab)));
  nav.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (button) select(button.dataset.tab);
  });

  return {
    select,
    get current() {
      return current;
    },
  };
}
