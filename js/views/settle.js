// 結算分頁：誰要轉給誰（每筆附帳號，適合截圖）、圖片與複製、每個人、還款紀錄、計算過程。

import {
  h, copyText, twoStepButton, busy, refresh, toast, openSheet, swipeable,
} from '../ui.js';
import * as store from '../store.js';
import {
  formatTWD, cleanAccount, otherLines, settlementText, fullDetailText, formatDateTime, noTransferText,
} from '../text.js';
import { explainActivity } from '../explain.js';
import { showImage, settlementBlocks, detailBlocks } from '../image.js';
import { openFriendForm } from './friends.js';

export function renderSettle(container, act, s) {
  const friends = store.friendsById();
  const name = (id) => store.friendName(id);

  // ---------- 誰要轉給誰 ----------
  const transfer = h('section', { class: 'section' }, h('h2', null, '誰要轉給誰'));
  if (!s.transfers.length) {
    transfer.append(h('p', { class: 'empty' }, noTransferText(s)));
  } else {
    transfer.append(h('ul', { class: 'transfers' }, s.transfers.map((t) => {
      const f = friends[t.to] || {};
      const bank = (f.bank || '').trim();
      const account = (f.account || '').trim();
      const info = [];
      if (bank || account) {
        info.push(h('div', { class: 'pay-line' },
          h('span', { class: 'pay-text' },
            bank ? h('span', { class: 'pay-bank' }, bank) : null,
            account ? h('span', { class: 'num account' }, account) : null),
          account ? h('button', {
            type: 'button',
            class: 'small',
            onclick: () => copyText(cleanAccount(account), `已複製 ${name(t.to)} 的帳號 ${cleanAccount(account)}`),
          }, '複製帳號') : null));
      }
      for (const line of otherLines(f)) info.push(h('div', { class: 'pay-line' }, h('span', { class: 'pay-text' }, line)));
      if (!info.length) {
        info.push(h('div', { class: 'pay-line muted' },
          h('span', { class: 'pay-text' }, `${name(t.to)} 還沒有收款資訊`),
          h('button', { type: 'button', class: 'link', onclick: () => openFriendForm(t.to) }, '補上')));
      }

      const paid = h('button', { type: 'button', class: 'small' }, '已還');
      // busy：處理中按鈕先停用，避免連按兩下記成兩筆
      paid.addEventListener('click', busy(paid, async () => {
        await store.addRepayment({ activityId: act.id, from: t.from, to: t.to, amount: t.amount });
        toast(`已記錄：${name(t.from)} 還 ${name(t.to)} ${formatTWD(t.amount)}`);
        refresh();
      }));

      return h('li', { class: 'transfer' },
        h('div', { class: 'transfer-head' },
          h('div', { class: 'transfer-who' },
            h('strong', null, name(t.from)),
            h('span', { class: 'arrow', 'aria-label': '轉給' }, ' → '),
            h('strong', null, name(t.to))),
          h('div', { class: 'transfer-amount num' }, formatTWD(t.amount))),
        h('div', { class: 'pay-info' }, info),
        h('div', { class: 'transfer-foot' }, paid));
    })));
  }

  // ---------- 圖片與複製 ----------
  const fileBase = act.name.replace(/[\\/:*?"<>|]/g, '_');
  const shareArea = s.count ? h('div', { class: 'share-area' },
    h('div', { class: 'button-row' },
      h('button', {
        type: 'button',
        class: 'secondary',
        onclick: () => showImage(settlementBlocks(act, store.summaryOf(act.id), store.friendsById()), `${fileBase}-結算.png`),
      }, '結算圖片'),
      h('button', {
        type: 'button',
        class: 'secondary',
        onclick: () => showImage(detailBlocks(act, store.summaryOf(act.id), store.expensesOf(act.id), store.repaymentsOf(act.id), store.friendsById()), `${fileBase}-明細.png`),
      }, '明細圖片')),
    h('button', {
      type: 'button',
      class: 'secondary wide',
      onclick: () => copyText(settlementText(act, store.summaryOf(act.id), store.friendsById()), '已複製，可以貼到 LINE'),
    }, '複製轉帳文字（含帳號）')) : null;

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
        const undo = async () => {
          await store.deleteRepayment(r.id);
          toast('已復原');
          refresh();
        };
        const row = h('div', { class: 'row static' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, `${name(r.from)} → ${name(r.to)}`),
            h('div', { class: 'row-sub num' }, `${formatDateTime(r.createdAt)} 記錄`)),
          h('div', { class: 'row-right' },
            h('div', { class: 'row-amount num' }, formatTWD(r.amount)),
            twoStepButton('復原', '再按一次復原', undo, 'small')));
        return h('li', null, swipeable(row, { label: '復原', confirmLabel: '確定復原', onConfirm: undo }));
      })))
    : null;

  // ---------- 不顯眼的小連結 ----------
  const footLinks = s.count ? h('div', { class: 'quiet-links' },
    h('button', { type: 'button', class: 'quiet', onclick: () => openExplain(act) }, '查看計算過程'),
    h('span', { 'aria-hidden': 'true' }, '・'),
    h('button', {
      type: 'button',
      class: 'quiet',
      onclick: () => copyText(fullDetailText(act, store.summaryOf(act.id), store.expensesOf(act.id), store.repaymentsOf(act.id), store.friendsById()), '已複製明細文字'),
    }, '複製明細文字')) : null;

  container.append(...[transfer, shareArea, people, history, footLinks].filter(Boolean));
}

/** 計算過程：每一步怎麼算，方便人工核對 */
function openExplain(act) {
  const sections = explainActivity(act, store.summaryOf(act.id), store.expensesOf(act.id), store.friendsById());
  openSheet({
    title: '計算過程',
    body: sections.map((sec) => h('section', { class: 'explain' },
      h('h3', null, sec.title),
      sec.note ? h('p', { class: 'field-hint' }, sec.note) : null,
      sec.items.map((item) => h('div', { class: 'explain-item' },
        item.head ? h('div', { class: 'explain-head' }, item.head) : null,
        item.lines.map((line) => h('div', { class: 'explain-line num' }, line)))))),
  });
}
