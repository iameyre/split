// 金額格式、日期格式，以及「複製轉帳文字」「複製明細文字」的內容。全部是純函式，可以自動測試。

export const CURRENCIES = [
  { code: 'TWD', name: '台幣' },
  { code: 'JPY', name: '日圓' },
  { code: 'KRW', name: '韓元' },
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '歐元' },
  { code: 'HKD', name: '港幣' },
  { code: 'CNY', name: '人民幣' },
  { code: 'THB', name: '泰銖' },
  { code: 'SGD', name: '新加坡幣' },
  { code: 'GBP', name: '英鎊' },
  { code: 'VND', name: '越南盾' },
  { code: 'AUD', name: '澳幣' },
];

export function currencyName(code) {
  return CURRENCIES.find((c) => c.code === code)?.name ?? code;
}

/** 整數或小數字串加上千分位：5320 → "5,320"、"12345.5" → "12,345.5" */
export function groupDigits(value) {
  const s = String(value);
  const neg = s.startsWith('-');
  const [int, frac] = (neg ? s.slice(1) : s).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + (frac ? '.' + frac : '');
}

/** 台幣：NT$5,320 */
export function formatTWD(n) {
  return 'NT$' + groupDigits(Math.round(n));
}

/** 任一幣別：台幣用 NT$，外幣寫「日圓 5,600」 */
export function formatMoney(amount, currency) {
  if (!currency || currency === 'TWD') return 'NT$' + groupDigits(amount);
  return `${currencyName(currency)} ${groupDigits(amount)}`;
}

// ---------- 日期：一律「2026/11/11 14:22」，24 小時制 ----------

const pad2 = (n) => String(n).padStart(2, '0');

/** "2026-11-08" → "2026/11/08" */
export function formatDate(dateStr) {
  return String(dateStr || '').replace(/-/g, '/');
}

/** 時間戳記或 Date → "2026/11/12 21:30" */
export function formatDateTime(value = Date.now()) {
  const d = new Date(value);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 今天的日期字串 "2026-11-12"（手機的當地時間） */
export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 現在的時間 "21:30" */
export function timeStr(now = new Date()) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** 一筆帳的時間；舊資料沒有時間的話用建立時間 */
export function expenseTime(e) {
  if (e.time) return e.time;
  return e.createdAt ? timeStr(new Date(e.createdAt)) : '00:00';
}

/** 一筆帳的完整日期時間 "2026/11/12 14:22" */
export function expenseDateTime(e) {
  return `${formatDate(e.date)} ${expenseTime(e)}`;
}

function expenseKey(e) {
  return `${e.date} ${expenseTime(e)}`;
}

/** 依日期時間排序（舊的在前） */
export function sortExpensesAsc(expenses) {
  return [...expenses].sort((a, b) => {
    const ka = expenseKey(a);
    const kb = expenseKey(b);
    return ka === kb ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : ka < kb ? -1 : 1;
  });
}

/** 依日期時間排序（新的在前） */
export function sortExpensesDesc(expenses) {
  return sortExpensesAsc(expenses).reverse();
}

// ---------- 收款資訊 ----------

/** 複製帳號時去掉空格和連字號 */
export function cleanAccount(account) {
  return String(account || '').replace(/[\s\-－‐–—]/g, '');
}

/** 其他收款方式，一行一種 */
export function otherLines(friend) {
  return String(friend?.other || '').split('\n').map((x) => x.trim()).filter(Boolean);
}

/** 收款資訊（朋友列表用）：銀行和帳號同一行 */
export function paymentLines(friend) {
  const lines = [];
  const bank = (friend?.bank || '').trim();
  const account = (friend?.account || '').trim();
  if (bank || account) lines.push([bank, account].filter(Boolean).join(' '));
  return lines.concat(otherLines(friend));
}

/** 收款資訊（轉帳文字用）：銀行一行、帳號自己一行（去掉空格連字號，方便長按複製） */
export function transferPaymentLines(friend) {
  const lines = [];
  const bank = (friend?.bank || '').trim();
  const account = cleanAccount(friend?.account);
  if (bank) lines.push(bank);
  if (account) lines.push(account);
  return lines.concat(otherLines(friend));
}

function nameFn(friendsById) {
  return (id) => friendsById[id]?.name ?? '（已刪除）';
}

// ---------- 複製的文字 ----------

/** 「誰要轉給誰」區塊：每筆一段，段落之間空一行 */
export function transferBlockLines(summary, friendsById) {
  const name = nameFn(friendsById);
  const lines = [];
  summary.transfers.forEach((t, i) => {
    if (i > 0) lines.push('');
    lines.push(`${name(t.from)} → ${name(t.to)}　${formatTWD(t.amount)}`);
    const pay = transferPaymentLines(friendsById[t.to]);
    lines.push(...(pay.length ? pay : ['（還沒有收款資訊）']));
  });
  return lines;
}

function headerLines(activity, summary, suffix) {
  return [`【${activity.name}】${suffix}`, `總支出 ${formatTWD(summary.total)}，共 ${summary.count} 筆`];
}

export function noTransferText(summary) {
  return summary.count === 0 ? '還沒有記帳。' : '大家都打平了，不用轉帳。';
}

/** 複製轉帳文字 */
export function settlementText(activity, summary, friendsById) {
  const lines = headerLines(activity, summary, '結算');
  const block = transferBlockLines(summary, friendsById);
  lines.push('', ...(block.length ? block : [noTransferText(summary)]));
  return lines.join('\n');
}

/** 「某某 先付；誰誰 均分」或「某某 先付；某某 NT$x、某某 NT$y」 */
export function splitDescription(expense, breakdown, memberOrder, friendsById) {
  const name = nameFn(friendsById);
  const ids = memberOrder.filter((id) => id in breakdown.shares)
    .concat(Object.keys(breakdown.shares).filter((id) => !memberOrder.includes(id)));
  const who = expense.mode === 'custom'
    ? ids.map((id) => `${name(id)} ${formatTWD(breakdown.shares[id])}`).join('、')
    : ids.map(name).join('、') + ' 均分';
  return `${name(expense.payerId)} 先付；${who}`;
}

/** 複製明細文字 */
export function fullDetailText(activity, summary, expenses, repayments, friendsById) {
  const name = nameFn(friendsById);
  const order = activity.memberIds;
  const lines = headerLines(activity, summary, '完整明細');

  let lastDate = null;
  for (const e of sortExpensesAsc(expenses)) {
    if (e.date !== lastDate) {
      lines.push('', formatDate(e.date));
      lastDate = e.date;
    }
    const b = summary.breakdowns.get(e.id);
    const foreign = e.currency && e.currency !== 'TWD' ? `（${formatMoney(e.amount, e.currency)}）` : '';
    lines.push(`${expenseTime(e)} ${e.title}　${formatTWD(b.twd)}${foreign}`);
    lines.push('　' + splitDescription(e, b, order, friendsById));
  }

  lines.push('', '每個人');
  for (const id of order) {
    const p = summary.people[id];
    lines.push(`${name(id)}　先付 ${formatTWD(p.paid)}　分攤 ${formatTWD(p.owed)}`);
  }

  if (repayments.length) {
    lines.push('', '已還款');
    for (const r of [...repayments].sort((a, b) => a.createdAt - b.createdAt)) {
      lines.push(`${name(r.from)} → ${name(r.to)}　${formatTWD(r.amount)}（${formatDateTime(r.createdAt)}）`);
    }
  }

  const block = transferBlockLines(summary, friendsById);
  lines.push('', '誰要轉給誰', ...(block.length ? block : [noTransferText(summary)]));
  return lines.join('\n');
}
