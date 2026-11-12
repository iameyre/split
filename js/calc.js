// 分帳計算核心：全部是純函式，不碰畫面也不碰資料庫，所以可以直接拿來做自動測試。
// 金額一律用「十進位整數」運算（BigInt），避免 JavaScript 小數誤差（例如 0.1 + 0.2）讓四捨五入差 1 元。

/** 把 "1,234.50" 這類字串拆成 { n: 123450n, scale: 2 }；格式不對回傳 null */
function parseExact(value) {
  const s = String(value ?? '').trim().replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const frac = m[2] || '';
  return { n: BigInt(m[1] + frac), scale: frac.length };
}

function scaleTo(p, scale) {
  return p.n * 10n ** BigInt(scale - p.scale);
}

function formatScaled(n, scale) {
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(scale + 1, '0');
  const int = digits.slice(0, digits.length - scale);
  const frac = scale ? digits.slice(digits.length - scale).replace(/0+$/, '') : '';
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

/** 是不是大於 0 的有效金額 */
export function isPositiveAmount(value) {
  const p = parseExact(value);
  return p !== null && p.n > 0n;
}

/** 有效的數字（可以是 0），空白不算 */
export function isNumber(value) {
  return parseExact(value) !== null;
}

/** 比較兩個十進位數字：a > b 回傳 1，相等 0，小於 -1（無效值當 0） */
export function compareDecimal(a, b) {
  const pa = parseExact(a) || { n: 0n, scale: 0 };
  const pb = parseExact(b) || { n: 0n, scale: 0 };
  const scale = Math.max(pa.scale, pb.scale);
  const d = scaleTo(pa, scale) - scaleTo(pb, scale);
  return d > 0n ? 1 : d < 0n ? -1 : 0;
}

/** total 減掉 parts 加總，回傳字串（例如 "300"、"-12.5"、"0"）；空白或無效的部分當 0 */
export function remainingAmount(total, parts) {
  const all = [total, ...parts].map((v) => parseExact(v) || { n: 0n, scale: 0 });
  const scale = Math.max(...all.map((p) => p.scale));
  let rest = scaleTo(all[0], scale);
  for (const p of all.slice(1)) rest -= scaleTo(p, scale);
  return formatScaled(rest, scale);
}

/** 規則 1：金額 × 匯率後四捨五入成台幣整數（台幣匯率為 1） */
export function toTwd(amount, rate = '1') {
  const a = parseExact(amount);
  const r = parseExact(rate);
  if (!a || !r) return 0;
  const den = 10n ** BigInt(a.scale + r.scale);
  // floor(x + 0.5)，金額都是正數，所以就是四捨五入
  return Number((a.n * r.n * 2n + den) / (2n * den));
}

/** 依成員順序排列 id（不在成員裡的排在最後，維持原本順序） */
export function orderIds(ids, memberOrder) {
  const pos = new Map(memberOrder.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (pos.get(a) ?? Infinity) - (pos.get(b) ?? Infinity));
}

/**
 * 規則 2：均分。除不盡的零頭：先付的人在名單內就由他先多 1 元，
 * 再依成員順序每人多 1 元，直到零頭分完。
 * participants 要已經照成員順序排好。
 */
export function splitEqual(totalTwd, participants, payerId) {
  const shares = {};
  const n = participants.length;
  if (!n) return shares;
  const base = Math.floor(totalTwd / n);
  let rest = totalTwd - base * n;
  for (const id of participants) shares[id] = base;
  const queue = participants.includes(payerId)
    ? [payerId, ...participants.filter((id) => id !== payerId)]
    : participants;
  for (let i = 0; rest > 0; i++, rest--) shares[queue[i]] += 1;
  return shares;
}

/**
 * 規則 3：指定金額。每人換算台幣後四捨五入，
 * 跟總額的差額加到先付的人；他不在名單就加到（原幣）金額最大的人，同樣大取成員順序在前的。
 */
export function splitCustom(customAmounts, rate, totalTwd, payerId, memberOrder) {
  const ids = orderIds(
    Object.keys(customAmounts).filter((id) => isPositiveAmount(customAmounts[id])),
    memberOrder,
  );
  const shares = {};
  let sum = 0;
  for (const id of ids) {
    shares[id] = toTwd(customAmounts[id], rate);
    sum += shares[id];
  }
  const diff = totalTwd - sum;
  if (diff !== 0 && ids.length) {
    let target = payerId;
    if (!ids.includes(payerId)) {
      target = ids[0];
      for (const id of ids) {
        if (compareDecimal(customAmounts[id], customAmounts[target]) > 0) target = id;
      }
    }
    shares[target] += diff;
  }
  return shares;
}

/** 一筆帳的台幣總額和每人分攤 */
export function expenseBreakdown(expense, memberOrder) {
  const rate = expense.currency && expense.currency !== 'TWD' ? expense.rate : '1';
  const twd = toTwd(expense.amount, rate);
  let shares;
  if (expense.mode === 'custom') {
    shares = splitCustom(expense.customAmounts || {}, rate, twd, expense.payerId, memberOrder);
  } else {
    shares = splitEqual(twd, orderIds(expense.participants || [], memberOrder), expense.payerId);
  }
  return { twd, shares };
}

/**
 * 規則 5：結算。先把應付、應收金額剛好相同的兩人配對，
 * 剩下的用「最大應付對最大應收」逐一配對（同樣大取成員順序在前的）。
 * nets：{ 成員id: 淨額 }，正數＝應收、負數＝應付。
 */
export function settle(nets, memberOrder) {
  const ids = orderIds(Object.keys(nets), memberOrder);
  const debtors = [];
  const creditors = [];
  for (const id of ids) {
    if (nets[id] < 0) debtors.push({ id, amt: -nets[id] });
    else if (nets[id] > 0) creditors.push({ id, amt: nets[id] });
  }
  const transfers = [];
  for (const d of debtors) {
    const c = creditors.find((x) => x.amt > 0 && x.amt === d.amt);
    if (c) {
      transfers.push({ from: d.id, to: c.id, amount: d.amt });
      c.amt = 0;
      d.amt = 0;
    }
  }
  const pickMax = (list) => list.reduce((best, x) => (x.amt > 0 && (!best || x.amt > best.amt) ? x : best), null);
  for (;;) {
    const d = pickMax(debtors);
    const c = pickMax(creditors);
    if (!d || !c) break;
    const amount = Math.min(d.amt, c.amt);
    transfers.push({ from: d.id, to: c.id, amount });
    d.amt -= amount;
    c.amt -= amount;
  }
  return transfers;
}

/** 把轉帳依收款人分組：收款人和付款人都照成員順序 */
export function groupTransfers(transfers, memberOrder) {
  const byTo = new Map();
  for (const t of transfers) {
    if (!byTo.has(t.to)) byTo.set(t.to, []);
    byTo.get(t.to).push(t);
  }
  return orderIds([...byTo.keys()], memberOrder).map((to) => {
    const items = byTo.get(to);
    const order = orderIds(items.map((t) => t.from), memberOrder);
    items.sort((a, b) => order.indexOf(a.from) - order.indexOf(b.from));
    return { to, total: items.reduce((s, t) => s + t.amount, 0), items };
  });
}

/**
 * 一個活動的完整結算。
 * 規則 4：每人淨額 = 先付總額 − 分攤總額；記「已還」時付款人淨額加、收款人淨額減。
 */
export function summarize(activity, expenses, repayments = []) {
  const order = activity.memberIds;
  const people = {};
  const ensure = (id) => (people[id] ??= { paid: 0, owed: 0, repaidOut: 0, repaidIn: 0, net: 0 });
  for (const id of order) ensure(id);

  let total = 0;
  const breakdowns = new Map();
  for (const e of expenses) {
    const b = expenseBreakdown(e, order);
    breakdowns.set(e.id, b);
    total += b.twd;
    ensure(e.payerId).paid += b.twd;
    for (const [id, v] of Object.entries(b.shares)) ensure(id).owed += v;
  }
  for (const r of repayments) {
    ensure(r.from).repaidOut += r.amount;
    ensure(r.to).repaidIn += r.amount;
  }
  const nets = {};
  for (const [id, p] of Object.entries(people)) {
    p.net = p.paid - p.owed + p.repaidOut - p.repaidIn;
    nets[id] = p.net;
  }
  const transfers = settle(nets, order);
  return {
    total,
    count: expenses.length,
    people,
    nets,
    breakdowns,
    transfers,
    groups: groupTransfers(transfers, order),
  };
}

/** 首頁狀態：還沒記帳／待轉帳 N 筆／已結清 */
export function activityStatus(summary) {
  if (summary.count === 0) return { kind: 'empty', text: '還沒記帳' };
  if (summary.transfers.length > 0) return { kind: 'pending', text: `待轉帳 ${summary.transfers.length} 筆` };
  return { kind: 'settled', text: '已結清' };
}
