// 朋友與收款資訊：自己固定第一個；每個人存銀行、帳號、其他收款方式。

import {
  h, pageHeader, bottomBar, field, openSheet, twoStepButton, busy, refresh, toast, swipeable,
} from '../ui.js';
import * as store from '../store.js';
import { paymentLines } from '../text.js';
import { searchBanks, bankLabel, expandBankCode } from '../banks.js';

export function renderFriends(root) {
  const rows = store.state.friends.map((f) => {
    const pay = paymentLines(f);
    const row = h('button', { type: 'button', class: 'row', onclick: () => openFriendForm(f.id) },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, f.name),
        pay.length
          ? pay.map((line) => h('div', { class: 'row-sub' }, line))
          : h('div', { class: 'row-sub muted' }, '還沒有收款資訊')));
    if (f.id === 'me') return h('li', null, row);
    const used = store.activitiesUsingFriend(f.id);
    return h('li', null, swipeable(row, {
      blockedMessage: used.length ? `${f.name} 已經在「${used.map((a) => a.name).join('」「')}」裡，不能刪除` : null,
      onConfirm: async () => {
        await store.deleteFriend(f.id);
        toast(`已刪除 ${f.name}`);
        refresh();
      },
    }));
  });

  root.replaceChildren(...[
    pageHeader({ back: '#/', backLabel: '活動', title: '朋友與收款資訊' }),
    h('p', { class: 'intro' }, '收款資訊會顯示在結算畫面「誰要轉給誰」裡，方便大家轉帳。'),
    h('ul', { class: 'list' }, rows),
    store.state.friends.length > 1 ? h('p', { class: 'swipe-hint' }, '在朋友上往左或往右滑，可以刪除') : null,
    bottomBar(h('button', { type: 'button', class: 'primary', onclick: () => openFriendForm() }, '新增朋友')),
  ].filter(Boolean));
}

/** 銀行欄位：打代碼或名稱會跳出建議，點一下帶入「013 國泰世華」 */
function bankInput(value, onPicked) {
  const input = h('input', { type: 'text', value, placeholder: '打代碼或名稱，例如 013 或 國泰', autocomplete: 'off' });
  const box = h('div', { class: 'suggest', role: 'listbox', hidden: true });
  let current = [];

  function pick(bank) {
    input.value = bankLabel(bank);
    box.hidden = true;
    onPicked();
  }
  function draw() {
    const v = input.value.trim();
    current = searchBanks(v);
    if (!current.length || current.some((b) => bankLabel(b) === v)) {
      box.hidden = true;
      return;
    }
    box.replaceChildren(...current.map((b) => h('button', {
      type: 'button',
      role: 'option',
      class: 'suggest-item',
      // 用 pointerdown 而不是 click：避免輸入框先失去焦點、清單先消失
      onpointerdown: (e) => { e.preventDefault(); pick(b); },
    }, h('span', { class: 'num suggest-code' }, b[0]), b[1])));
    box.hidden = false;
  }
  input.addEventListener('input', draw);
  input.addEventListener('focus', draw);
  input.addEventListener('blur', () => {
    setTimeout(() => { box.hidden = true; }, 150);
    input.value = expandBankCode(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !box.hidden && current.length) {
      e.preventDefault();
      pick(current[0]);
    }
  });
  return { input, el: h('div', { class: 'suggest-wrap' }, input, box) };
}

/** 新增或編輯一個人；onSaved 會在存檔後呼叫（沒給就重畫目前畫面） */
export function openFriendForm(id, onSaved) {
  const f = id ? store.getFriend(id) : null;
  const isMe = f?.id === 'me';
  const name = h('input', { type: 'text', value: f?.name ?? '', autocomplete: 'off' });
  const account = h('input', { type: 'text', value: f?.account ?? '', placeholder: '銀行帳號', autocomplete: 'off', inputmode: 'numeric' });
  const bank = bankInput(f?.bank ?? '', () => account.focus());
  const other = h('textarea', { rows: 3, value: f?.other ?? '', placeholder: 'LINE Pay 0912345678\n街口支付 …' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  let deleteArea = null;
  if (f && !isMe) {
    const used = store.activitiesUsingFriend(f.id);
    deleteArea = used.length
      ? h('p', { class: 'note' }, `已經在「${used.map((a) => a.name).join('」「')}」裡，不能刪除。`)
      : twoStepButton('刪除這個人', '再按一次刪除', async () => {
        await store.deleteFriend(f.id);
        sheet.close();
        toast('已刪除');
        refresh();
      });
  }

  const save = h('button', { type: 'button', class: 'primary' }, '儲存');
  save.addEventListener('click', busy(save, async () => {
    const n = name.value.trim();
    if (!n) return showError('請輸入名字');
    if (store.findFriendByName(n, f?.id)) return showError(`已經有「${n}」了，名字不能重複`);
    const saved = await store.saveFriend({
      ...(f || {}),
      name: n,
      bank: expandBankCode(bank.input.value),
      account: account.value.trim(),
      other: other.value.replace(/\s+$/, ''),
    });
    sheet.close();
    if (onSaved) onSaved(saved);
    else refresh();
  }));

  function showError(msg) {
    error.textContent = msg;
    name.focus();
  }

  const sheet = openSheet({
    title: f ? (isMe ? '你的收款資訊' : '編輯朋友') : '新增朋友',
    body: [
      field(isMe ? '你的名字（大家在結算上看到的稱呼）' : '名字', name),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, '銀行'), bank.el),
      field('帳號', account, '帳號在圖片裡？點這格後長按，選「掃描文字」用相機掃；或在照片 App 用「原況文字」選取帳號、拷貝後貼上。'),
      field('其他收款方式', other, '一行一種，例如 LINE Pay、街口支付'),
      error,
      deleteArea ? h('div', { class: 'danger-zone' }, deleteArea) : null,
    ],
    footer: save,
  });
  if (!f) setTimeout(() => name.focus(), 260);
}

/** 第一次打開 App：先問使用者叫什麼名字（取代預設的「我」） */
export function openNameSetup() {
  const me = store.getFriend('me');
  const name = h('input', { type: 'text', placeholder: '例如 雅雲', autocomplete: 'off' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { type: 'button', class: 'primary' }, '開始使用');
  save.addEventListener('click', busy(save, async () => {
    const n = name.value.trim();
    if (!n || n === '我') {
      error.textContent = '請輸入你的名字';
      name.focus();
      return;
    }
    if (store.findFriendByName(n, 'me')) {
      error.textContent = `朋友清單裡已經有「${n}」了，請換一個稱呼`;
      return;
    }
    await store.saveFriend({ ...me, name: n });
    sheet.close();
    toast(`嗨，${n}！`);
    refresh();
  }));
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      save.click();
    }
  });
  const sheet = openSheet({
    title: '你的名字',
    body: [
      h('p', { class: 'note' }, '結算時大家會看到這個名字。之後可以在「朋友與收款資訊」修改，也可以在那裡填你的收款帳號。'),
      field('名字', name),
      error,
    ],
    footer: save,
  });
  setTimeout(() => name.focus(), 260);
}
