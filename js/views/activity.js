// 活動頁：大字總支出、「明細」「結算」兩個分頁、底部「記一筆」。

import { h, pageHeader, bottomBar } from '../ui.js';
import * as store from '../store.js';
import { formatTWD, formatMoney, formatDate } from '../text.js';
import { openActivityForm } from './activity-form.js';
import { openExpenseForm } from './expense-form.js';
import { renderSettle } from './settle.js';

export function renderActivity(root, id, tab) {
  const act = store.getActivity(id);
  const s = store.summaryOf(id);

  const tabs = h('nav', { class: 'tabs', role: 'tablist' },
    tabLink('明細', `#/a/${id}`, tab === 'list'),
    tabLink('結算', `#/a/${id}/settle`, tab === 'settle'));

  const content = h('div', { class: 'tab-content' });
  if (tab === 'settle') renderSettle(content, act, s);
  else renderList(content, act, s);

  root.replaceChildren(
    pageHeader({
      back: '#/',
      backLabel: '活動',
      title: act.name,
      right: h('button', { type: 'button', class: 'head-link', onclick: () => openActivityForm(id) }, '編輯'),
      sub: h('div', { class: 'hero' },
        h('div', { class: 'hero-amount num' }, formatTWD(s.total)),
        h('div', { class: 'hero-sub' }, `總支出・共 ${s.count} 筆・${act.memberIds.length} 人${act.travel ? '・旅行模式' : ''}`)),
    }),
    tabs,
    content,
    bottomBar(h('button', { type: 'button', class: 'primary', onclick: () => openExpenseForm(id) }, '記一筆')),
  );
}

function tabLink(label, href, active) {
  return h('a', {
    class: `tab${active ? ' active' : ''}`,
    href,
    role: 'tab',
    'aria-selected': active ? 'true' : 'false',
    onclick: (e) => {
      // 切換分頁不要堆疊瀏覽紀錄
      e.preventDefault();
      location.replace(href);
    },
  }, label);
}

function renderList(container, act, s) {
  const expenses = store.expensesOf(act.id).sort((a, b) => (a.date === b.date
    ? (b.createdAt ?? 0) - (a.createdAt ?? 0)
    : a.date < b.date ? 1 : -1));
  if (!expenses.length) {
    container.append(h('p', { class: 'empty' }, '還沒有記帳。按下方「記一筆」開始。'));
    return;
  }
  const groups = [];
  for (const e of expenses) {
    if (!groups.length || groups[groups.length - 1].date !== e.date) groups.push({ date: e.date, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  for (const g of groups) {
    container.append(
      h('h3', { class: 'date-head' }, formatDate(g.date)),
      h('ul', { class: 'list' }, g.items.map((e) => {
        const b = s.breakdowns.get(e.id);
        const how = e.mode === 'custom' ? '指定金額' : `${Object.keys(b.shares).length} 人均分`;
        const foreign = e.currency && e.currency !== 'TWD';
        return h('li', null,
          h('button', { type: 'button', class: 'row', onclick: () => openExpenseForm(act.id, e.id) },
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, e.title),
              h('div', { class: 'row-sub' }, `${store.friendName(e.payerId)} 先付，${how}`)),
            h('div', { class: 'row-right' },
              h('div', { class: 'row-amount num' }, formatTWD(b.twd)),
              foreign ? h('div', { class: 'row-sub num' }, formatMoney(e.amount, e.currency)) : null)));
      })),
    );
  }
}
