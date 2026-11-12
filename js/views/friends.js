// 朋友與收款資訊：「我」固定第一個、可以改名；每個人存銀行、帳號、其他收款方式。

import { h, pageHeader, bottomBar, field, openSheet, twoStepButton, busy, refresh, toast } from '../ui.js';
import * as store from '../store.js';
import { paymentLines } from '../text.js';

export function renderFriends(root) {
  const rows = store.state.friends.map((f) => {
    const pay = paymentLines(f);
    return h('li', null,
      h('button', { type: 'button', class: 'row', onclick: () => openFriendForm(f.id) },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, f.name, f.id === 'me' ? h('span', { class: 'tag' }, '我') : null),
          pay.length
            ? pay.map((line) => h('div', { class: 'row-sub' }, line))
            : h('div', { class: 'row-sub muted' }, '還沒有收款資訊'))));
  });

  root.replaceChildren(
    pageHeader({ back: '#/', backLabel: '活動', title: '朋友與收款資訊' }),
    h('p', { class: 'intro' }, '收款資訊會顯示在結算畫面的「轉給 某某」下面，方便大家轉帳。'),
    h('ul', { class: 'list' }, rows),
    bottomBar(h('button', { type: 'button', class: 'primary', onclick: () => openFriendForm() }, '新增朋友')),
  );
}

/** 新增或編輯一個人；onSaved 會在存檔後呼叫（沒給就重畫目前畫面） */
export function openFriendForm(id, onSaved) {
  const f = id ? store.getFriend(id) : null;
  const name = h('input', { type: 'text', value: f?.name ?? '', autocomplete: 'off', enterkeyhint: 'next' });
  const bank = h('input', { type: 'text', value: f?.bank ?? '', placeholder: '例如 013 國泰世華', autocomplete: 'off' });
  const account = h('input', { type: 'text', value: f?.account ?? '', placeholder: '銀行帳號', autocomplete: 'off', inputmode: 'numeric' });
  const other = h('textarea', { rows: 3, value: f?.other ?? '', placeholder: 'LINE Pay 0912345678\n街口支付 …' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  let deleteArea = null;
  if (f && f.id !== 'me') {
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
      bank: bank.value.trim(),
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
    title: f ? (f.id === 'me' ? '我的收款資訊' : '編輯朋友') : '新增朋友',
    body: [
      field(f?.id === 'me' ? '名字（別人看到的稱呼）' : '名字', name),
      field('銀行', bank),
      field('帳號', account),
      field('其他收款方式', other, '一行一種，例如 LINE Pay、街口支付'),
      error,
      deleteArea ? h('div', { class: 'danger-zone' }, deleteArea) : null,
    ],
    footer: save,
  });
  if (!f) setTimeout(() => name.focus(), 260);
}
