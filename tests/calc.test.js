// 計算規則的自動測試。在專案資料夾執行：npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toTwd, splitEqual, splitCustom, settle, summarize, activityStatus, remainingAmount, compareDecimal,
  multiplyDecimal, splitEqualDetailed, splitCustomDetailed,
} from '../js/calc.js';

const MEMBERS = ['me', 'ming', 'hua', 'mei']; // 我、小明、阿華、小美

function acceptanceExpenses() {
  return [
    { id: 'e1', title: '燒肉', amount: '3280', currency: 'TWD', date: '2026-11-06', payerId: 'me', mode: 'equal', participants: ['me', 'ming', 'hua', 'mei'], createdAt: 1 },
    { id: 'e2', title: '飲料', amount: '240', currency: 'TWD', date: '2026-11-06', payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua'], createdAt: 2 },
    { id: 'e3', title: 'KTV', amount: '1800', currency: 'TWD', date: '2026-11-06', payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua', 'mei'], createdAt: 3 },
  ];
}

const sortT = (ts) => [...ts].sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`));

test('驗收：燒肉／飲料／KTV → 阿華轉我 1350、小美轉我 580、小美轉小明 690', () => {
  const s = summarize({ memberIds: MEMBERS }, acceptanceExpenses(), []);
  assert.equal(s.total, 5320);
  assert.deepEqual(s.nets, { me: 1930, ming: 690, hua: -1350, mei: -1270 });
  assert.deepEqual(sortT(s.transfers), sortT([
    { from: 'hua', to: 'me', amount: 1350 },
    { from: 'mei', to: 'me', amount: 580 },
    { from: 'mei', to: 'ming', amount: 690 },
  ]));
  // 畫面上依「誰要付」照成員順序排
  assert.deepEqual(s.transfers, [
    { from: 'hua', to: 'me', amount: 1350 },
    { from: 'mei', to: 'me', amount: 580 },
    { from: 'mei', to: 'ming', amount: 690 },
  ]);
  // 配對過程：沒有金額相同的，三步都是最大對最大
  assert.deepEqual(s.settlement.steps.map((x) => [x.kind, x.from, x.to, x.amount, x.fromLeft, x.toLeft]), [
    ['largest', 'hua', 'me', 1350, 0, 580],
    ['largest', 'mei', 'ming', 690, 580, 0],
    ['largest', 'mei', 'me', 580, 0, 0],
  ]);
});

test('記錄已還後：付款人淨額加、收款人淨額減，結算重算', () => {
  const s = summarize({ memberIds: MEMBERS }, acceptanceExpenses(), [
    { id: 'r1', activityId: 'a', from: 'hua', to: 'me', amount: 1350, createdAt: 10 },
  ]);
  assert.equal(s.nets.hua, 0);
  assert.equal(s.nets.me, 580);
  assert.equal(s.people.hua.repaidOut, 1350);
  assert.equal(s.people.me.repaidIn, 1350);
  assert.deepEqual(sortT(s.transfers), sortT([
    { from: 'mei', to: 'me', amount: 580 },
    { from: 'mei', to: 'ming', amount: 690 },
  ]));
});

test('規則 1：金額 × 匯率四捨五入成台幣整數（用整數運算，沒有小數誤差）', () => {
  assert.equal(toTwd('3280'), 3280);
  assert.equal(toTwd('1234.5', '0.2134'), 263); // 263.4423
  assert.equal(toTwd('1', '0.5'), 1); // 0.5 → 1
  assert.equal(toTwd('3', '0.5'), 2); // 1.5 → 2
  assert.equal(toTwd('1.005', '100'), 101); // 100.5 → 101（一般小數運算會算成 100.49999…）
  assert.equal(toTwd('10000', '0.0013'), 13);
  assert.equal(toTwd('1,280', '1'), 1280);
  assert.equal(toTwd('99.99', '31.85'), 3185); // 3184.6815
});

test('規則 2：均分零頭由先付的人先吸收，再依成員順序', () => {
  const p = ['a', 'b', 'c'];
  assert.deepEqual(splitEqual(101, p, 'a'), { a: 34, b: 34, c: 33 });
  assert.deepEqual(splitEqual(101, p, 'b'), { a: 34, b: 34, c: 33 });
  assert.deepEqual(splitEqual(101, p, 'c'), { a: 34, b: 33, c: 34 });
  assert.deepEqual(splitEqual(100, p, 'c'), { a: 33, b: 33, c: 34 });
  assert.deepEqual(splitEqual(101, p, 'z'), { a: 34, b: 34, c: 33 }); // 先付的人不在名單：照成員順序
  assert.deepEqual(splitEqual(90, p, 'b'), { a: 30, b: 30, c: 30 });
});

test('規則 3：指定金額的差額加到先付的人；他不在名單就加到金額最大的人', () => {
  const order = ['a', 'b', 'c'];
  // 10.5→11、20.5→21，合計 32，總額 31，差 -1
  assert.deepEqual(splitCustom({ a: '10.5', b: '20.5' }, '1', 31, 'a', order), { a: 10, b: 21 });
  assert.deepEqual(splitCustom({ a: '10.5', b: '20.5' }, '1', 31, 'c', order), { a: 11, b: 20 });
  // 日圓：333、333、334 × 0.21 → 70、70、70，剛好 210
  assert.deepEqual(splitCustom({ a: '333', b: '333', c: '334' }, '0.21', 210, 'a', order), { a: 70, b: 70, c: 70 });
  // 先付的人不在名單、而且同樣大：取成員順序在前的
  // 0.5→1、0.5→1，合計 2，總額 1，差 -1 → b、c 一樣大，加到成員順序在前的 b
  assert.deepEqual(splitCustom({ b: '0.5', c: '0.5' }, '1', 1, 'a', order), { b: 0, c: 1 });
  // 空白或 0 不算在名單內
  assert.deepEqual(splitCustom({ a: '', b: '0', c: '100' }, '1', 100, 'a', order), { c: 100 });
});

test('規則 5：金額剛好相同的先配對，剩下最大對最大', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  const t = settle({ a: 700, b: 300, c: -300, d: -400, e: -300 }, order);
  assert.ok(t.some((x) => x.from === 'c' && x.to === 'b' && x.amount === 300), '金額相同的 c→b 要先配對');
  assert.equal(t.length, 3);
  assert.deepEqual(settle({ a: 0, b: 0 }, ['a', 'b']), []);
});

test('計算過程需要的細節：精確乘法、均分餘數、指定金額差額', () => {
  assert.equal(multiplyDecimal('3000', '0.21'), '630');
  assert.equal(multiplyDecimal('1234.5', '0.2134'), '263.4423');
  assert.deepEqual(splitEqualDetailed(101, ['a', 'b', 'c'], 'c'), { shares: { a: 34, b: 33, c: 34 }, base: 33, rest: 2, bonus: ['c', 'a'] });
  const d = splitCustomDetailed({ b: '0.5', c: '0.5' }, '1', 1, 'a', ['a', 'b', 'c']);
  assert.deepEqual([d.rounded, d.diff, d.target, d.targetReason], [{ b: 1, c: 1 }, -1, 'b', 'largest']);
});

test('首頁狀態文字', () => {
  const act = { memberIds: MEMBERS };
  assert.equal(activityStatus(summarize(act, [], [])).text, '還沒記帳');
  assert.equal(activityStatus(summarize(act, acceptanceExpenses(), [])).text, '待轉帳 3 筆');
  const even = [{ id: 'x', amount: '100', currency: 'TWD', payerId: 'me', mode: 'equal', participants: ['me'] }];
  assert.equal(activityStatus(summarize(act, even, [])).text, '已結清');
});

test('指定金額的「還差／多分」計算', () => {
  assert.equal(remainingAmount('1000', ['300', '200.5']), '499.5');
  assert.equal(remainingAmount('100', ['100']), '0');
  assert.equal(remainingAmount('100', ['150', '']), '-50');
  assert.equal(remainingAmount('0.3', ['0.1', '0.2']), '0');
  assert.equal(compareDecimal('10.50', '10.5'), 0);
});

// ---------- 隨機資料測試 ----------

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function centsStr(c) {
  return (c / 100).toFixed(2).replace(/\.?0+$/, '');
}

test('隨機資料 3000 組：淨額加總為 0、照建議轉帳後每人歸零、轉帳筆數不超過人數減一', () => {
  const r = rng(20261112);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let iter = 0; iter < 3000; iter++) {
    const n = int(2, 9);
    const members = Array.from({ length: n }, (_, i) => 'p' + i);
    const expenses = [];
    for (let k = int(0, 15); k > 0; k--) {
      const foreign = r() < 0.4;
      const cents = foreign ? int(1, 5000000) : int(1, 3000) * 100 + (r() < 0.2 ? int(0, 99) : 0);
      const rate = foreign ? String((int(1, 400000) / 10000)) : '1';
      const payerId = members[int(0, n - 1)];
      const e = { id: `e${k}`, amount: centsStr(cents), currency: foreign ? 'JPY' : 'TWD', rate, payerId, date: '2026-11-12' };
      if (r() < 0.5) {
        e.mode = 'equal';
        e.participants = members.filter(() => r() < 0.7);
        if (!e.participants.length) e.participants = [members[int(0, n - 1)]];
      } else {
        e.mode = 'custom';
        const who = members.filter(() => r() < 0.6);
        if (!who.length) who.push(members[0]);
        let left = cents;
        e.customAmounts = {};
        who.forEach((id, i) => {
          const part = i === who.length - 1 ? left : int(0, left);
          left -= part;
          if (part > 0) e.customAmounts[id] = centsStr(part);
        });
        if (!Object.keys(e.customAmounts).length) e.customAmounts[who[0]] = centsStr(cents);
      }
      expenses.push(e);
    }
    const repayments = [];
    for (let k = int(0, 3); k > 0; k--) {
      repayments.push({ id: `r${k}`, from: members[int(0, n - 1)], to: members[int(0, n - 1)], amount: int(1, 2000), createdAt: k });
    }

    const s = summarize({ memberIds: members }, expenses, repayments);

    for (const e of expenses) {
      const b = s.breakdowns.get(e.id);
      const sum = Object.values(b.shares).reduce((x, y) => x + y, 0);
      assert.equal(sum, b.twd, `第 ${iter} 組：每筆分攤加總要等於台幣金額`);
      assert.ok(Object.values(b.shares).every(Number.isInteger));
    }
    assert.equal(Object.values(s.nets).reduce((x, y) => x + y, 0), 0, `第 ${iter} 組：淨額加總要是 0`);

    const after = { ...s.nets };
    for (const t of s.transfers) {
      assert.ok(Number.isInteger(t.amount) && t.amount > 0);
      assert.notEqual(t.from, t.to);
      after[t.from] += t.amount;
      after[t.to] -= t.amount;
    }
    assert.ok(Object.values(after).every((v) => v === 0), `第 ${iter} 組：照建議轉帳後要每人歸零`);
    assert.ok(s.transfers.length <= n - 1, `第 ${iter} 組：轉帳筆數 ${s.transfers.length} 超過人數減一`);
  }
});
