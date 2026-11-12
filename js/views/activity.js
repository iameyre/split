// 活動頁：大字總支出、「明細」「結算」兩個分頁、底部「記一筆」。

import { h, pageHeader, bottomBar, swipeable, tag, twoStepButton, toast, refresh } from '../ui.js';
import * as store from '../store.js';
import {
  formatTWD, formatMoney, formatDate, currencyName, expenseTime, sortExpensesDesc,
} from '../text.js';
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

  const deleteBtn = twoStepButton('刪除活動', '確定刪除？', async () => {
    await store.deleteActivity(id);
    toast(`已刪除「${act.name}」`);
    location.hash = '#/';
  }, 'head-link head-danger');

  root.replaceChildren(
    pageHeader({
      back: '#/',
      backLabel: '活動',
      title: act.name,
      right: h('div', { class: 'head-actions' },
        deleteBtn,
        h('button', { type: 'button', class: 'head-link', onclick: () => openActivityForm(id) }, '編輯')),
      sub: h('div', { class: 'hero' },
        h('div', { class: 'hero-amount num' }, formatTWD(s.total)),
        h('div', { class: 'row-tags' },
          tag(`共 ${s.count} 筆`),
          tag(`${act.memberIds.length} 人`),
          act.travel ? tag('旅行模式') : null)),
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
  const expenses = sortExpensesDesc(store.expensesOf(act.id));
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
      h('h3', { class: 'date-head num' }, formatDate(g.date)),
      h('ul', { class: 'list' }, g.items.map((e) => {
        const b = s.breakdowns.get(e.id);
        const foreign = e.currency && e.currency !== 'TWD';
        const count = Object.keys(b.shares).length;
        const row = h('button', { type: 'button', class: 'row', onclick: () => openExpenseForm(act.id, e.id) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, e.title),
            h('div', { class: 'row-sub' },
              h('span', { class: 'num' }, expenseTime(e)), `・${store.friendName(e.payerId)} 先付`,
              e.mode === 'custom' ? '' : `・${count} 人均分`),
            (e.mode === 'custom' || foreign)
              ? h('div', { class: 'row-tags' },
                e.mode === 'custom' ? tag('指定金額', 'primary') : null,
                foreign ? tag(currencyName(e.currency)) : null)
              : null),
          h('div', { class: 'row-right' },
            h('div', { class: 'row-amount num' }, formatTWD(b.twd)),
            foreign ? h('div', { class: 'row-sub num' }, formatMoney(e.amount, e.currency)) : null));
        return h('li', null, swipeable(row, {
          onConfirm: async () => {
            await store.deleteExpense(e.id);
            toast(`已刪除「${e.title}」`);
            refresh();
          },
        }));
      })),
    );
  }
  container.append(h('p', { class: 'swipe-hint' }, '在帳目上往左或往右滑，可以刪除'));
}
