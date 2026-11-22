import { createSvgIcon } from './icons.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

// label/title เป็น getter อ่านภาษาตอนใช้ ไม่ใช่ตอนโหลด module เพราะภาษาอาจเปลี่ยนหลังได้คำตอบจาก server
function tab(id, icon, showMonth) {
  return {
    id,
    icon,
    showMonth,
    get label() {
      return t(getLang(), `web.nav.${id}`);
    },
    get title() {
      return t(getLang(), `web.title.${id}`);
    },
  };
}

export const TABS = [
  tab('list', 'tab-list', true),
  tab('summary', 'tab-chart', true),
  tab('budgets', 'tab-budget', true),
  tab('goals', 'tab-goal', false),
  tab('profile', 'tab-user', false),
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

export function createTabController({ doc, nav, titleEl, monthEl, panelFor, onChange = () => {}, onBeforeChange = () => {} }) {
  let current = null;

  // force ใช้ตอนกลับจากหน้าย่อยที่ซ่อน panel ของแท็บปัจจุบันไป
  function select(id, { force = false } = {}) {
    const tab = findTab(id);
    if (tab.id === current && !force) return;
    // force มาจากการกลับจากหน้าย่อย ตำแหน่งตอนนั้นเป็นของหน้าย่อย ไม่ใช่ของแท็บ
    if (current && !force) onBeforeChange(current);
    current = tab.id;
    for (const button of nav.querySelectorAll('button[data-tab]')) {
      if (button.dataset.tab === tab.id) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
    for (const other of TABS) {
      const panel = panelFor(other.id);
      if (panel) panel.hidden = other.id !== tab.id;
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

  // ใช้หลังเปลี่ยนภาษา หัวข้อเขียนเฉพาะเมื่ออยู่ที่แท็บ ผู้เรียกที่เปิดหน้าย่อยอยู่ต้องตั้งหัวข้อของหน้านั้นเอง
  function relabel() {
    for (const button of nav.querySelectorAll('button[data-tab]')) {
      button.querySelector('span').textContent = findTab(button.dataset.tab).label;
    }
    if (current) titleEl.textContent = findTab(current).title;
  }

  return {
    select,
    relabel,
    get current() {
      return current;
    },
  };
}
