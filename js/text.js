// 金額格式、日期格式，以及「複製結算」「複製完整明細」的文字。全部是純函式，可以自動測試。

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

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** "2026-11-08" → "11/8（日）"；不是今年就加年份 */
export function formatDate(dateStr, currentYear = new Date().getFullYear()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y === currentYear ? '' : y + '/'}${m}/${d}（${wd}）`;
}

/** 今天的日期字串（手機的當地時間） */
export function todayStr(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 複製帳號時去掉空格和連字號 */
export function cleanAccount(account) {
  return String(account || '').replace(/[\s\-－‐–—]/g, '');
}

/** 一個人的收款資訊，一行一行；完全沒填回傳空陣列 */
export function paymentLines(friend) {
  const lines = [];
  const bank = (friend?.bank || '').trim();
  const account = (friend?.account || '').trim();
  if (bank || account) lines.push([bank, account].filter(Boolean).join(' '));
  for (const line of String(friend?.other || '').split('\n')) {
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

function nameFn(friendsById) {
  return (id) => friendsById[id]?.name ?? '（已刪除）';
}

/** 「轉給 某某」區塊的文字（沒有要轉帳時回傳空陣列） */
export function transferBlockLines(summary, friendsById) {
  const name = nameFn(friendsById);
  const lines = [];
  summary.groups.forEach((g, i) => {
    if (i > 0) lines.push('');
    lines.push(`轉給 ${name(g.to)}` + (g.items.length > 1 ? `　共 ${formatTWD(g.total)}` : ''));
    const pay = paymentLines(friendsById[g.to]);
    if (pay.length) lines.push(...pay);
    else lines.push('（還沒有收款資訊）');
    for (const t of g.items) lines.push(`　${name(t.from)}　${formatTWD(t.amount)}`);
  });
  return lines;
}

function headerLines(activity, summary, suffix) {
  return [`【${activity.name}】${suffix}`, `總支出 ${formatTWD(summary.total)}，共 ${summary.count} 筆`];
}

function noTransferLine(summary) {
  return summary.count === 0 ? '還沒有記帳。' : '大家都打平了，不用轉帳。';
}

/** 複製結算 */
export function settlementText(activity, summary, friendsById) {
  const lines = headerLines(activity, summary, '結算');
  const block = transferBlockLines(summary, friendsById);
  lines.push('', ...(block.length ? block : [noTransferLine(summary)]));
  return lines.join('\n');
}

/** 明細裡第二行：「某某 先付；誰誰 均分」或「某某 先付；某某 NT$x、某某 NT$y」 */
export function splitDescription(expense, breakdown, memberOrder, friendsById) {
  const name = nameFn(friendsById);
  const ids = memberOrder.filter((id) => id in breakdown.shares)
    .concat(Object.keys(breakdown.shares).filter((id) => !memberOrder.includes(id)));
  const who = expense.mode === 'custom'
    ? ids.map((id) => `${name(id)} ${formatTWD(breakdown.shares[id])}`).join('、')
    : ids.map(name).join('、') + ' 均分';
  return `${name(expense.payerId)} 先付；${who}`;
}

/** 依日期排序（舊的在前，同一天照記帳順序） */
export function sortExpensesAsc(expenses) {
  return [...expenses].sort((a, b) => (a.date === b.date ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : a.date < b.date ? -1 : 1));
}

/** 複製完整明細 */
export function fullDetailText(activity, summary, expenses, repayments, friendsById, currentYear) {
  const name = nameFn(friendsById);
  const order = activity.memberIds;
  const lines = headerLines(activity, summary, '完整明細');

  let lastDate = null;
  for (const e of sortExpensesAsc(expenses)) {
    if (e.date !== lastDate) {
      lines.push('', formatDate(e.date, currentYear));
      lastDate = e.date;
    }
    const b = summary.breakdowns.get(e.id);
    const foreign = e.currency && e.currency !== 'TWD' ? `（${formatMoney(e.amount, e.currency)}）` : '';
    lines.push(`${e.title}　${formatTWD(b.twd)}${foreign}`);
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
      const d = new Date(r.createdAt);
      lines.push(`${name(r.from)} → ${name(r.to)}　${formatTWD(r.amount)}（${d.getMonth() + 1}/${d.getDate()}）`);
    }
  }

  const block = transferBlockLines(summary, friendsById);
  lines.push('', '怎麼轉帳', ...(block.length ? block : [noTransferLine(summary)]));
  return lines.join('\n');
}
