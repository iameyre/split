// 建立／編輯活動（底部彈出面板）。

import { h, field, openSheet, twoStepButton, busy, refresh, toast } from '../ui.js';
import * as store from '../store.js';
import { formatDateTime } from '../text.js';

export function openActivityForm(activityId) {
  const act = activityId ? store.getActivity(activityId) : null;
  const selected = new Set(act ? act.memberIds : ['me']);
  const locked = new Set(act ? act.memberIds.filter((id) => store.memberHasRecords(act.id, id)) : []);
  let newNames = [];

  const name = h('input', { type: 'text', value: act?.name ?? '', placeholder: act ? '' : formatDateTime(), autocomplete: 'off' });
  const travel = h('input', { type: 'checkbox', class: 'switch', checked: !!act?.travel });
  const chips = h('div', { class: 'chips' });
  const memberHint = h('p', { class: 'field-hint' });
  const newInput = h('input', { type: 'text', placeholder: '輸入新名字，空格隔開可一次加多人', autocomplete: 'off' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  function drawChips() {
    const items = store.state.friends.map((f) => {
      const on = selected.has(f.id);
      const isLocked = on && locked.has(f.id);
      return h('button', {
        type: 'button',
        class: `chip${on ? ' on' : ''}${isLocked ? ' locked' : ''}`,
        'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          if (isLocked) {
            toast(`${f.name} 已有帳目，不能移除`);
            return;
          }
          if (on) selected.delete(f.id);
          else selected.add(f.id);
          drawChips();
        },
      }, f.name);
    });
    for (const n of newNames) {
      items.push(h('button', {
        type: 'button',
        class: 'chip on new',
        'aria-label': `移除 ${n}`,
        onclick: () => {
          newNames = newNames.filter((x) => x !== n);
          drawChips();
        },
      }, n, h('span', { class: 'chip-x', 'aria-hidden': 'true' }, ' ×')));
    }
    chips.replaceChildren(...items);
    const count = selected.size + newNames.length;
    memberHint.textContent = `已選 ${count} 人` + (newNames.length ? `，其中 ${newNames.length} 位新朋友會在存檔時加入朋友清單` : '');
  }

  function addNames() {
    const names = newInput.value.split(/[\s　]+/).map((s) => s.trim()).filter(Boolean);
    for (const n of names) {
      const existing = store.findFriendByName(n);
      if (existing) selected.add(existing.id);
      else if (!newNames.some((x) => store.normalizeName(x) === store.normalizeName(n))) newNames.push(n);
    }
    newInput.value = '';
    drawChips();
  }
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addNames();
    }
  });

  const save = h('button', { type: 'button', class: 'primary' }, act ? '儲存' : '建立');
  save.addEventListener('click', busy(save, async () => {
    if (newInput.value.trim()) addNames();
    // 沒填名稱就用現在的日期時間，例如「2026/11/12 21:45」
    const n = name.value.trim() || (act ? act.name : formatDateTime());
    if (selected.size + newNames.length < 2) {
      error.textContent = '至少要兩個人';
      return;
    }
    // 成員順序：原本的順序保留，新勾選的照朋友清單順序接在後面，最後是新名字
    const kept = act ? act.memberIds.filter((id) => selected.has(id)) : [];
    const added = store.state.friends.map((f) => f.id).filter((id) => selected.has(id) && !kept.includes(id));
    const saved = await store.saveActivity({
      ...(act || { rates: {} }),
      name: n,
      travel: travel.checked,
      memberIds: [...kept, ...added],
    }, newNames);
    sheet.close();
    if (act) refresh();
    else location.hash = `#/a/${saved.id}`;
  }));

  let deleteArea = null;
  if (act) {
    deleteArea = h('div', { class: 'danger-zone' },
      twoStepButton('刪除活動', '再按一次刪除（帳目會一起刪掉）', async () => {
        await store.deleteActivity(act.id);
        sheet.close();
        toast('已刪除活動');
        location.hash = '#/';
      }));
  }

  drawChips();
  const sheet = openSheet({
    title: act ? '編輯活動' : '建立活動',
    body: [
      field('活動名稱', name, act ? null : '空白的話，會用現在的日期時間當名稱'),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, '成員'),
        chips,
        h('div', { class: 'inline-add' }, newInput, h('button', { type: 'button', class: 'secondary', onclick: addNames }, '加入')),
        memberHint),
      h('label', { class: 'switch-row' },
        h('span', null, h('span', { class: 'switch-title' }, '旅行模式'), h('span', { class: 'field-hint' }, '記帳時可以選外幣、輸入匯率')),
        travel),
      error,
      deleteArea,
    ],
    footer: save,
  });
  if (!act) setTimeout(() => name.focus(), 260);
}
