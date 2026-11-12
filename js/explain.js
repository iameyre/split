// 「計算過程」：把每一步怎麼算出來的寫成文字，方便人工核對。純函式，可以自動測試。

import { multiplyDecimal, orderIds } from './calc.js';
import { formatTWD, formatMoney, groupDigits, expenseDateTime, sortExpensesAsc } from './text.js';

const num = (v) => groupDigits(v);

function sumText(parts, total) {
  if (!parts.length) return '0';
  return parts.map(num).join(' + ') + (parts.length > 1 ? ` = ${num(total)}` : '');
}

/** 回傳 [{ title, note?, items: [{ head, lines: [] }] }] */
export function explainActivity(activity, summary, expenses, friendsById) {
  const name = (id) => friendsById[id]?.name ?? '（已刪除）';
  const order = activity.memberIds;
  const sorted = sortExpensesAsc(expenses);
  const sections = [];

  // ---------- 每筆帳 ----------
  const expenseItems = sorted.map((e) => {
    const b = summary.breakdowns.get(e.id);
    const d = b.detail;
    const foreign = e.currency && e.currency !== 'TWD';
    const lines = [];
    if (foreign) {
      lines.push(`${formatMoney(e.amount, e.currency)} × 匯率 ${e.rate} = ${num(multiplyDecimal(e.amount, e.rate))}，四捨五入 ${formatTWD(b.twd)}`);
    }
    lines.push(`${name(e.payerId)} 先付 ${formatTWD(b.twd)}`);
    if (e.mode === 'custom') {
      const ids = orderIds(Object.keys(d.rounded), order);
      for (const id of ids) {
        const amt = e.customAmounts[id];
        lines.push(foreign
          ? `${name(id)}：${formatMoney(amt, e.currency)} × ${e.rate} = ${num(multiplyDecimal(amt, e.rate))}，四捨五入 ${num(d.rounded[id])}`
          : `${name(id)}：${num(d.rounded[id])}`);
      }
      const sum = ids.reduce((s, id) => s + d.rounded[id], 0);
      if (d.diff === 0) {
        lines.push(`合計 ${num(sum)}，剛好等於總額`);
      } else {
        const who = d.targetReason === 'payer' ? '先付的人' : '金額最大的人';
        lines.push(`合計 ${num(sum)}，跟總額差 ${d.diff > 0 ? '+' : '−'}${Math.abs(d.diff)} 元，加到${who} ${name(d.target)}，變成 ${num(b.shares[d.target])}`);
      }
    } else {
      const ids = orderIds(Object.keys(b.shares), order);
      if (d.rest === 0) {
        lines.push(`${num(b.twd)} ÷ ${ids.length} 人 = 每人 ${num(d.base)}`);
      } else {
        lines.push(`${num(b.twd)} ÷ ${ids.length} 人 = 每人 ${num(d.base)}，餘 ${d.rest} 元`);
        lines.push(`餘數由先付的人先拿、再照成員順序，每人加 1 元：${d.bonus.map(name).join('、')}`);
      }
      lines.push(`分攤：${ids.map((id) => `${name(id)} ${num(b.shares[id])}`).join('、')}`);
    }
    return { head: `${e.title}　${expenseDateTime(e)}`, lines };
  });
  sections.push({ title: '每筆帳怎麼分', items: expenseItems.length ? expenseItems : [{ head: null, lines: ['還沒有記帳。'] }] });

  // ---------- 每個人 ----------
  const peopleItems = order.map((id) => {
    const p = summary.people[id];
    const paidParts = sorted.filter((e) => e.payerId === id).map((e) => summary.breakdowns.get(e.id).twd);
    const owedParts = sorted.map((e) => summary.breakdowns.get(e.id).shares[id]).filter((v) => v);
    let formula = `${num(p.paid)} − ${num(p.owed)}`;
    if (p.repaidOut) formula += ` + 已還 ${num(p.repaidOut)}`;
    if (p.repaidIn) formula += ` − 已收 ${num(p.repaidIn)}`;
    const result = p.net > 0 ? `應收 ${formatTWD(p.net)}` : p.net < 0 ? `應付 ${formatTWD(-p.net)}` : '打平';
    return {
      head: name(id),
      lines: [
        `先付：${sumText(paidParts, p.paid)}`,
        `分攤：${sumText(owedParts, p.owed)}`,
        `淨額：${formula} = ${p.net > 0 ? '+' : p.net < 0 ? '−' : ''}${num(Math.abs(p.net))}（${result}）`,
      ],
    };
  });
  sections.push({ title: '每個人的淨額', note: '淨額 = 先付 − 分攤（有還款時再 + 已還 − 已收）', items: peopleItems });

  // ---------- 配對 ----------
  const st = summary.settlement;
  const list = (arr) => (arr.length ? arr.map((x) => `${name(x.id)} ${num(x.amt)}`).join('、') : '沒有');
  const lines = [`應收：${list(st.creditors)}`, `應付：${list(st.debtors)}`];
  const exact = st.steps.filter((s) => s.kind === 'exact');
  const largest = st.steps.filter((s) => s.kind === 'largest');
  lines.push(`① 應付和應收金額剛好相同的先配對：${exact.length ? '' : '沒有'}`);
  for (const s of exact) lines.push(`　${name(s.from)} → ${name(s.to)} ${num(s.amount)}`);
  if (largest.length) {
    lines.push('② 剩下的，用最大應付配最大應收：');
    for (const s of largest) {
      const left = [];
      if (s.fromLeft) left.push(`${name(s.from)} 還要付 ${num(s.fromLeft)}`);
      if (s.toLeft) left.push(`${name(s.to)} 還要收 ${num(s.toLeft)}`);
      lines.push(`　${name(s.from)} → ${name(s.to)} ${num(s.amount)}${left.length ? `（${left.join('，')}）` : ''}`);
    }
  }
  sections.push({ title: '轉帳怎麼配對', items: [{ head: null, lines }] });
  return sections;
}
