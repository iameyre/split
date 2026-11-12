// 記一筆／編輯一筆（底部彈出面板）。

import { h, field, openSheet, twoStepButton, busy, refresh, toast } from '../ui.js';
import * as store from '../store.js';
import {
  toTwd, isPositiveAmount, splitEqual, splitCustom, remainingAmount,
} from '../calc.js';
import { CURRENCIES, currencyName, formatTWD, formatMoney, todayStr } from '../text.js';

/** 只留數字和一個小數點（全形數字也會轉成半形） */
function cleanNumber(v) {
  let s = String(v).normalize('NFKC').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
}

function numberInput(value, placeholder, onChange) {
  const input = h('input', { type: 'text', inputmode: 'decimal', value: value ?? '', placeholder, autocomplete: 'off', class: 'num' });
  input.addEventListener('input', () => {
    const c = cleanNumber(input.value);
    if (c !== input.value) input.value = c;
    onChange(c);
  });
  return input;
}

export function openExpenseForm(activityId, expenseId) {
  const act = store.getActivity(activityId);
  const exp = expenseId ? store.getExpense(expenseId) : null;
  const members = act.memberIds;
  const rates = act.rates || {};
  const showCurrency = act.travel || (exp && exp.currency && exp.currency !== 'TWD');

  const f = {
    amount: exp?.amount ?? '',
    currency: exp?.currency ?? (act.travel ? (act.lastCurrency || 'TWD') : 'TWD'),
    rate: '',
    payerId: exp?.payerId ?? (members.includes(act.lastPayerId) ? act.lastPayerId : members[0]),
    mode: exp?.mode ?? 'equal',
    participants: new Set(exp && exp.mode !== 'custom' ? exp.participants : members),
    custom: { ...(exp?.mode === 'custom' ? exp.customAmounts : {}) },
  };
  f.rate = exp ? (exp.currency !== 'TWD' ? exp.rate : '') : (f.currency !== 'TWD' ? rates[f.currency] ?? '' : '');

  // ---------- 欄位 ----------
  const title = h('input', { type: 'text', value: exp?.title ?? '', placeholder: '例如 燒肉', autocomplete: 'off', enterkeyhint: 'next' });
  const amount = numberInput(f.amount, '0', (v) => { f.amount = v; update(); });
  const date = h('input', { type: 'date', value: exp?.date ?? todayStr() });

  const rateInput = numberInput(f.rate, '例如 0.21', (v) => { f.rate = v; update(); });
  const rateUnit = h('span', { class: 'rate-unit' });
  const convert = h('p', { class: 'convert num' });
  const rateRow = h('div', { class: 'rate-row' },
    h('div', { class: 'rate-line' }, rateUnit, rateInput, h('span', { class: 'rate-unit' }, '台幣')),
    convert);

  let currencySelect = null;
  if (showCurrency) {
    currencySelect = h('select', { class: 'currency', 'aria-label': '幣別' },
      CURRENCIES.map((c) => h('option', { value: c.code }, `${c.name} ${c.code}`)));
    currencySelect.value = f.currency;
    currencySelect.addEventListener('change', () => {
      f.currency = currencySelect.value;
      f.rate = f.currency === 'TWD' ? '' : rates[f.currency] ?? '';
      rateInput.value = f.rate;
      update();
    });
  }

  // 誰先付
  const payerChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': '誰先付' });
  function drawPayers() {
    payerChips.replaceChildren(...members.map((id) => h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': f.payerId === id ? 'true' : 'false',
      class: `chip${f.payerId === id ? ' on' : ''}`,
      onclick: () => { f.payerId = id; drawPayers(); update(); },
    }, store.friendName(id))));
  }

  // 分法
  const modeEqual = h('button', { type: 'button', class: 'seg', onclick: () => { f.mode = 'equal'; update(); } }, '均分');
  const modeCustom = h('button', { type: 'button', class: 'seg', onclick: () => { f.mode = 'custom'; update(); } }, '指定金額');
  const segment = h('div', { class: 'segment', role: 'group', 'aria-label': '分法' }, modeEqual, modeCustom);

  // 均分
  const toggleAll = h('button', {
    type: 'button',
    class: 'link',
    onclick: () => {
      if (f.participants.size === members.length) f.participants.clear();
      else members.forEach((id) => f.participants.add(id));
      equalRows.forEach((r) => { r.box.checked = f.participants.has(r.id); });
      update();
    },
  });
  const equalRows = members.map((id) => {
    const box = h('input', { type: 'checkbox', checked: f.participants.has(id) });
    box.addEventListener('change', () => {
      if (box.checked) f.participants.add(id);
      else f.participants.delete(id);
      update();
    });
    const share = h('span', { class: 'share num' });
    return { id, box, share, el: h('label', { class: 'check-row' }, box, h('span', { class: 'check-name' }, store.friendName(id)), share) };
  });
  const equalSection = h('div', { class: 'split-section' },
    h('div', { class: 'split-head' }, h('span', { class: 'field-label' }, '誰在內'), toggleAll),
    equalRows.map((r) => r.el));

  // 指定金額
  const customRows = members.map((id) => {
    const input = numberInput(f.custom[id] ?? '', '0', (v) => { f.custom[id] = v; update(); });
    input.setAttribute('aria-label', `${store.friendName(id)} 的金額`);
    const twd = h('span', { class: 'share num' });
    return { id, input, twd, el: h('div', { class: 'custom-row' }, h('span', { class: 'check-name' }, store.friendName(id)), input, twd) };
  });
  const customStatus = h('p', { class: 'custom-status' });
  const customSection = h('div', { class: 'split-section' }, customRows.map((r) => r.el), customStatus);

  const error = h('p', { class: 'form-error', role: 'alert' });

  // ---------- 即時計算 ----------
  function currentTwd() {
    if (!isPositiveAmount(f.amount)) return null;
    if (f.currency === 'TWD') return toTwd(f.amount);
    return isPositiveAmount(f.rate) ? toTwd(f.amount, f.rate) : null;
  }

  function update() {
    const foreign = f.currency !== 'TWD';
    rateRow.hidden = !foreign;
    rateUnit.textContent = `1 ${currencyName(f.currency)} =`;
    const twd = currentTwd();
    if (foreign) {
      convert.textContent = twd !== null ? `換算台幣 ${formatTWD(twd)}` : '輸入金額和匯率後會顯示換算的台幣';
    }

    modeEqual.classList.toggle('on', f.mode === 'equal');
    modeCustom.classList.toggle('on', f.mode === 'custom');
    modeEqual.setAttribute('aria-pressed', String(f.mode === 'equal'));
    modeCustom.setAttribute('aria-pressed', String(f.mode === 'custom'));
    equalSection.hidden = f.mode !== 'equal';
    customSection.hidden = f.mode !== 'custom';

    if (f.mode === 'equal') {
      toggleAll.textContent = f.participants.size === members.length ? '全不選' : '全選';
      const ids = members.filter((id) => f.participants.has(id));
      const shares = twd !== null ? splitEqual(twd, ids, f.payerId) : {};
      for (const r of equalRows) {
        r.share.textContent = f.participants.has(r.id) ? (twd !== null ? formatTWD(shares[r.id]) : '') : '不分';
        r.share.classList.toggle('muted', !f.participants.has(r.id));
      }
    } else {
      const values = members.map((id) => f.custom[id] || '');
      const rest = isPositiveAmount(f.amount) ? remainingAmount(f.amount, values) : null;
      // 剛好分完才套用「差額給先付的人」；還沒分完時先顯示各自換算的台幣
      const shares = twd !== null && rest === '0' ? splitCustom(f.custom, foreign ? f.rate : '1', twd, f.payerId, members) : null;
      customSection.classList.toggle('twd', !foreign);
      for (const r of customRows) {
        const ok = foreign && isPositiveAmount(f.rate) && isPositiveAmount(f.custom[r.id]);
        r.twd.textContent = ok ? `≈ ${formatTWD(shares ? shares[r.id] : toTwd(f.custom[r.id], f.rate))}` : '';
      }
      customStatus.className = 'custom-status';
      if (rest === null) {
        customStatus.textContent = '先輸入上面的總金額';
      } else {
        if (rest === '0') {
          customStatus.textContent = '剛好分完';
          customStatus.classList.add('ok');
        } else if (rest.startsWith('-')) {
          customStatus.textContent = `多分了 ${formatMoney(rest.slice(1), f.currency)}`;
          customStatus.classList.add('bad');
        } else {
          customStatus.textContent = `還差 ${formatMoney(rest, f.currency)} 沒分配`;
          customStatus.classList.add('bad');
        }
      }
    }
    error.textContent = '';
  }

  // ---------- 存檔 ----------
  function fail(msg, focusEl) {
    error.textContent = msg;
    focusEl?.focus();
  }

  const save = h('button', { type: 'button', class: 'primary' }, '儲存');
  save.addEventListener('click', busy(save, async () => {
    const t = title.value.trim();
    const foreign = f.currency !== 'TWD';
    if (!t) return fail('請輸入品項', title);
    if (!isPositiveAmount(f.amount)) return fail('請輸入金額', amount);
    if (foreign && !isPositiveAmount(f.rate)) return fail('請輸入匯率', rateInput);
    const expense = {
      ...(exp || {}),
      activityId,
      title: t,
      amount: f.amount,
      currency: f.currency,
      rate: foreign ? f.rate : '1',
      date: date.value || todayStr(),
      payerId: f.payerId,
      mode: f.mode,
    };
    if (f.mode === 'equal') {
      const ids = members.filter((id) => f.participants.has(id));
      if (!ids.length) return fail('至少要勾選一個人');
      expense.participants = ids;
      delete expense.customAmounts;
    } else {
      if (remainingAmount(f.amount, members.map((id) => f.custom[id] || '')) !== '0') {
        return fail('每個人的金額加起來要剛好等於總金額才能儲存');
      }
      expense.customAmounts = Object.fromEntries(members.filter((id) => isPositiveAmount(f.custom[id])).map((id) => [id, f.custom[id]]));
      delete expense.participants;
    }
    const actPatch = { ...act, rates: { ...rates } };
    if (!exp) actPatch.lastPayerId = f.payerId;
    if (foreign) actPatch.rates[f.currency] = f.rate;
    if (showCurrency && !exp) actPatch.lastCurrency = f.currency;
    await store.saveExpense(expense, actPatch);
    sheet.close();
    toast(exp ? '已更新' : '已記一筆');
    refresh();
  }));

  let deleteArea = null;
  if (exp) {
    deleteArea = h('div', { class: 'danger-zone' }, twoStepButton('刪除這筆', '再按一次刪除', async () => {
      await store.deleteExpense(exp.id);
      sheet.close();
      toast('已刪除');
      refresh();
    }));
  }

  drawPayers();
  update();
  const sheet = openSheet({
    title: exp ? '編輯這筆' : '記一筆',
    body: [
      field('品項', title),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, '金額'),
        h('div', { class: 'amount-line' }, currencySelect, amount),
        rateRow),
      field('日期', date),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, '誰先付'), payerChips),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, '分法'), segment),
      equalSection,
      customSection,
      error,
      deleteArea,
    ],
    footer: save,
  });
  if (!exp) setTimeout(() => title.focus(), 260);
}
