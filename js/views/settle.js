// 結算分頁：怎麼轉帳（適合截圖）、複製按鈕、每個人、還款紀錄。

import { h, copyText, twoStepButton, busy, refresh, toast } from '../ui.js';
import * as store from '../store.js';
import {
  formatTWD, cleanAccount, settlementText, fullDetailText,
} from '../text.js';
import { openFriendForm } from './friends.js';

export function renderSettle(container, act, s) {
  const friends = store.friendsById();
  const name = (id) => store.friendName(id);

  // ---------- 怎麼轉帳 ----------
  const transfer = h('section', { class: 'section settle-transfer' }, h('h2', null, '怎麼轉帳'));
  if (s.count === 0) {
    transfer.append(h('p', { class: 'empty' }, '還沒有記帳。'));
  } else if (!s.groups.length) {
    transfer.append(h('p', { class: 'empty' }, '大家都打平了，不用轉帳。'));
  } else {
    for (const g of s.groups) {
      const f = friends[g.to] || {};
      const bank = (f.bank || '').trim();
      const account = (f.account || '').trim();
      const others = String(f.other || '').split('\n').map((x) => x.trim()).filter(Boolean);
      const info = [];
      if (bank || account) {
        info.push(h('div', { class: 'pay-line' },
          h('span', { class: 'pay-text' }, bank, bank && account ? ' ' : '', account ? h('span', { class: 'num account' }, account) : null),
          account ? h('button', {
            type: 'button',
            class: 'small',
            onclick: () => copyText(cleanAccount(account), `已複製帳號 ${cleanAccount(account)}`),
          }, '複製帳號') : null));
      }
      for (const line of others) info.push(h('div', { class: 'pay-line' }, h('span', { class: 'pay-text' }, line)));
      if (!info.length) {
        info.push(h('div', { class: 'pay-line muted' },
          h('span', { class: 'pay-text' }, '還沒有收款資訊'),
          h('button', { type: 'button', class: 'link', onclick: () => openFriendForm(g.to) }, '補上')));
      }

      transfer.append(h('div', { class: 'pay-group' },
        h('div', { class: 'pay-head' },
          h('h3', null, '轉給 ', h('strong', null, name(g.to))),
          g.items.length > 1 ? h('span', { class: 'pay-total num' }, `共 ${formatTWD(g.total)}`) : null),
        h('div', { class: 'pay-info' }, info),
        h('ul', { class: 'pay-items' }, g.items.map((t) => {
          const paid = h('button', { type: 'button', class: 'small' }, '已還');
          // busy：處理中按鈕先停用，避免連按兩下記成兩筆
          paid.addEventListener('click', busy(paid, async () => {
            await store.addRepayment({ activityId: act.id, from: t.from, to: t.to, amount: t.amount });
            toast(`已記錄：${name(t.from)} 還 ${name(t.to)} ${formatTWD(t.amount)}`);
            refresh();
          }));
          return h('li', null,
            h('span', { class: 'pay-from' }, name(t.from)),
            h('span', { class: 'pay-amount num' }, formatTWD(t.amount)),
            paid);
        }))));
    }
  }

  // ---------- 複製 ----------
  const copyRow = h('div', { class: 'button-row' },
    h('button', {
      type: 'button',
      class: 'secondary',
      onclick: () => copyText(settlementText(act, store.summaryOf(act.id), store.friendsById()), '已複製結算，可以貼到 LINE'),
    }, '複製結算'),
    h('button', {
      type: 'button',
      class: 'secondary',
      onclick: () => copyText(fullDetailText(act, store.summaryOf(act.id), store.expensesOf(act.id), store.repaymentsOf(act.id), store.friendsById(), new Date().getFullYear()), '已複製完整明細'),
    }, '複製完整明細'));

  // ---------- 每個人 ----------
  const people = h('section', { class: 'section' }, h('h2', null, '每個人'),
    h('ul', { class: 'list' }, act.memberIds.map((id) => {
      const p = s.people[id];
      let result;
      if (p.net > 0) result = h('span', { class: 'net pos num' }, `應收 ${formatTWD(p.net)}`);
      else if (p.net < 0) result = h('span', { class: 'net neg num' }, `應付 ${formatTWD(-p.net)}`);
      else result = h('span', { class: 'net even' }, '打平');
      const detail = [`先付 ${formatTWD(p.paid)}`, `分攤 ${formatTWD(p.owed)}`];
      if (p.repaidOut) detail.push(`已還 ${formatTWD(p.repaidOut)}`);
      if (p.repaidIn) detail.push(`已收 ${formatTWD(p.repaidIn)}`);
      return h('li', { class: 'row static' },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, name(id)),
          h('div', { class: 'row-sub num' }, detail.join('・'))),
        result);
    })));

  // ---------- 還款紀錄 ----------
  const reps = store.repaymentsOf(act.id).sort((a, b) => b.createdAt - a.createdAt);
  const history = reps.length
    ? h('section', { class: 'section' }, h('h2', null, '還款紀錄'),
      h('ul', { class: 'list' }, reps.map((r) => {
        const d = new Date(r.createdAt);
        return h('li', { class: 'row static' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, `${name(r.from)} → ${name(r.to)}`),
            h('div', { class: 'row-sub' }, `${d.getMonth() + 1}/${d.getDate()} 記錄`)),
          h('div', { class: 'row-right' },
            h('div', { class: 'row-amount num' }, formatTWD(r.amount)),
            twoStepButton('復原', '再按一次復原', async () => {
              await store.deleteRepayment(r.id);
              toast('已復原');
              refresh();
            }, 'small')));
      })))
    : null;

  container.append(...[transfer, s.count ? copyRow : null, people, history].filter(Boolean));
}
