// 複製文字格式、日期格式、計算過程、銀行代碼、備份檢查的自動測試。在專案資料夾執行：npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../js/calc.js';
import {
  formatTWD, formatMoney, formatDate, formatDateTime, expenseDateTime, cleanAccount, paymentLines,
  settlementText, fullDetailText, sortExpensesDesc,
} from '../js/text.js';
import { explainActivity } from '../js/explain.js';
import { BANKS, searchBanks, expandBankCode } from '../js/banks.js';
import { makeBackup, parseBackup, shouldRemind, backupFileName } from '../js/backup.js';

const friendsById = {
  me: { id: 'me', name: '雅雲', bank: '013 國泰世華', account: '1234-567-890', other: 'LINE Pay 0912345678' },
  ming: { id: 'ming', name: '小明', bank: '822 中國信託', account: '987654321000', other: '' },
  hua: { id: 'hua', name: '阿華', bank: '', account: '', other: '' },
  mei: { id: 'mei', name: '小美', bank: '', account: '', other: '' },
};
const activity = { id: 'a1', name: '週五燒肉', memberIds: ['me', 'ming', 'hua', 'mei'] };
const expenses = [
  { id: 'e1', activityId: 'a1', title: '燒肉', amount: '3280', currency: 'TWD', rate: '1', date: '2026-11-06', time: '19:05', payerId: 'me', mode: 'equal', participants: ['me', 'ming', 'hua', 'mei'], createdAt: 1 },
  { id: 'e2', activityId: 'a1', title: '飲料', amount: '240', currency: 'TWD', rate: '1', date: '2026-11-06', time: '20:30', payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua'], createdAt: 2 },
  { id: 'e3', activityId: 'a1', title: 'KTV', amount: '1800', currency: 'TWD', rate: '1', date: '2026-11-07', time: '01:10', payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua', 'mei'], createdAt: 3 },
];

test('複製轉帳文字：每筆寫清楚誰轉給誰、多少錢，帳號自己一行', () => {
  const s = summarize(activity, expenses, []);
  const expected = [
    '【週五燒肉】結算',
    '總支出 NT$5,320，共 3 筆',
    '',
    '阿華 → 雅雲　NT$1,350',
    '013 國泰世華',
    '1234567890',
    'LINE Pay 0912345678',
    '',
    '小美 → 雅雲　NT$580',
    '013 國泰世華',
    '1234567890',
    'LINE Pay 0912345678',
    '',
    '小美 → 小明　NT$690',
    '822 中國信託',
    '987654321000',
  ].join('\n');
  assert.equal(settlementText(activity, s, friendsById), expected);
});

test('複製轉帳文字：沒填收款資訊、沒有要轉帳', () => {
  const noInfo = { ...friendsById, me: { id: 'me', name: '雅雲' } };
  const s = summarize(activity, expenses, []);
  assert.match(settlementText(activity, s, noInfo), /阿華 → 雅雲　NT\$1,350\n（還沒有收款資訊）\n/);
  assert.match(settlementText(activity, summarize(activity, [], []), friendsById), /還沒有記帳。$/);
});

test('複製明細文字：日期時間、每筆、每個人、已還款、轉帳', () => {
  const foreign = {
    id: 'e4', activityId: 'a1', title: '拉麵', amount: '3000', currency: 'JPY', rate: '0.21', date: '2026-11-07', time: '12:00',
    payerId: 'hua', mode: 'custom', customAmounts: { hua: '1000', mei: '2000' }, createdAt: 4,
  };
  const reps = [{ id: 'r1', activityId: 'a1', from: 'hua', to: 'me', amount: 1000, createdAt: new Date(2026, 10, 8, 9, 5).getTime() }];
  const all = [...expenses, foreign];
  const s = summarize(activity, all, reps);
  const lines = fullDetailText(activity, s, all, reps, friendsById).split('\n');
  assert.equal(lines[0], '【週五燒肉】完整明細');
  assert.equal(lines[1], '總支出 NT$5,950，共 4 筆');
  assert.ok(lines.includes('2026/11/06'));
  assert.ok(lines.includes('19:05 燒肉　NT$3,280'));
  assert.ok(lines.includes('　雅雲 先付；雅雲、小明、阿華、小美 均分'));
  assert.ok(lines.includes('12:00 拉麵　NT$630（日圓 3,000）'));
  assert.ok(lines.includes('　阿華 先付；阿華 NT$210、小美 NT$420'));
  assert.ok(lines.includes('雅雲　先付 NT$3,280　分攤 NT$1,350'));
  assert.ok(lines.includes('阿華 → 雅雲　NT$1,000（2026/11/08 09:05）'));
  assert.ok(lines.indexOf('誰要轉給誰') > lines.indexOf('已還款'));
  // 同一天裡 KTV（01:10）在拉麵（12:00）前面
  assert.ok(lines.indexOf('01:10 KTV　NT$1,800') < lines.indexOf('12:00 拉麵　NT$630（日圓 3,000）'));
});

test('日期一律「2026/11/11 14:22」24 小時制', () => {
  assert.equal(formatDate('2026-11-08'), '2026/11/08');
  assert.equal(formatDateTime(new Date(2026, 10, 11, 14, 22)), '2026/11/11 14:22');
  assert.equal(formatDateTime(new Date(2026, 0, 2, 9, 5)), '2026/01/02 09:05');
  assert.equal(expenseDateTime(expenses[2]), '2026/11/07 01:10');
  // 舊資料沒有時間：用建立時間
  assert.equal(expenseDateTime({ date: '2026-11-12', createdAt: new Date(2026, 10, 12, 21, 7).getTime() }), '2026/11/12 21:07');
  assert.deepEqual(sortExpensesDesc(expenses).map((e) => e.id), ['e3', 'e2', 'e1']);
});

test('計算過程：均分、外幣、指定金額、淨額、配對都寫得出來', () => {
  const foreign = {
    id: 'e4', activityId: 'a1', title: '拉麵', amount: '1001', currency: 'JPY', rate: '0.21', date: '2026-11-07', time: '12:00',
    payerId: 'hua', mode: 'custom', customAmounts: { hua: '500.5', mei: '500.5' }, createdAt: 4,
  };
  const odd = {
    id: 'e5', activityId: 'a1', title: '計程車', amount: '1001', currency: 'TWD', rate: '1', date: '2026-11-07', time: '13:00',
    payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua'], createdAt: 5,
  };
  const all = [...expenses, foreign, odd];
  const s = summarize(activity, all, []);
  const [each, people, match] = explainActivity(activity, s, all, friendsById);
  const flat = (sec) => sec.items.flatMap((i) => [i.head, ...i.lines]).filter(Boolean);
  const e = flat(each);
  assert.ok(e.includes('燒肉　2026/11/06 19:05'));
  assert.ok(e.includes('3,280 ÷ 4 人 = 每人 820'));
  assert.ok(e.includes('1,001 ÷ 3 人 = 每人 333，餘 2 元'));
  assert.ok(e.includes('餘數由先付的人先拿、再照成員順序，每人加 1 元：小明、雅雲'));
  assert.ok(e.includes('日圓 1,001 × 匯率 0.21 = 210.21，四捨五入 NT$210'));
  // 500.5 × 0.21 = 105.105 → 105，兩人合計 210，剛好
  assert.ok(e.includes('阿華：日圓 500.5 × 0.21 = 105.105，四捨五入 105'));
  assert.ok(e.includes('合計 210，剛好等於總額'));
  const p = flat(people);
  assert.ok(p.includes('先付：3,280'));
  assert.ok(p.includes('分攤：820 + 80 + 450 + 334 = 1,684'));
  assert.ok(p.some((l) => l.startsWith('淨額：3,280 − 1,684 = +1,596')));
  const m = flat(match);
  assert.ok(m.includes('① 應付和應收金額剛好相同的先配對：沒有'));
  assert.ok(m.some((l) => l.startsWith('② 剩下的')));
});

test('金額格式', () => {
  assert.equal(formatTWD(5320), 'NT$5,320');
  assert.equal(formatTWD(1234567), 'NT$1,234,567');
  assert.equal(formatTWD(0), 'NT$0');
  assert.equal(formatMoney('12345.5', 'JPY'), '日圓 12,345.5');
  assert.equal(formatMoney('580', 'TWD'), 'NT$580');
});

test('複製帳號去掉空格和連字號', () => {
  assert.equal(cleanAccount('1234-5678 9012'), '123456789012');
  assert.equal(cleanAccount(' 0912－345－678 '), '0912345678');
});

test('收款資訊行', () => {
  assert.deepEqual(paymentLines(friendsById.me), ['013 國泰世華 1234-567-890', 'LINE Pay 0912345678']);
  assert.deepEqual(paymentLines({ other: '街口 123\n\n LINE Pay 456 ' }), ['街口 123', 'LINE Pay 456']);
  assert.deepEqual(paymentLines({}), []);
});

test('銀行代碼：代碼不重複、可以用代碼或名稱找', () => {
  const codes = BANKS.map((b) => b[0]);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((c) => /^\d{3}$/.test(c)));
  assert.deepEqual(searchBanks('013').map((b) => b[0]), ['013']);
  assert.deepEqual(searchBanks('82').map((b) => b[0]), ['822', '823', '824', '826']);
  assert.equal(searchBanks('國泰')[0][0], '013');
  assert.equal(searchBanks('郵局')[0][0], '700');
  assert.equal(searchBanks('line bank')[0][0], '824');
  assert.equal(expandBankCode('822'), '822 中國信託');
  assert.equal(expandBankCode('822 中國信託'), '822 中國信託');
  assert.equal(expandBankCode('某某農會'), '某某農會');
});

test('備份：匯出後可以還原；格式不對會擋下來', () => {
  const data = { friends: Object.values(friendsById), activities: [activity], expenses, repayments: [] };
  const text = JSON.stringify(makeBackup(data, 1000));
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, data);
  assert.deepEqual(r.stats, { friends: 4, activities: 1, expenses: 3 });
  assert.equal(parseBackup('hello').ok, false);
  assert.equal(parseBackup('{"app":"other"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ ...makeBackup(data), friends: [] })).ok, false);
  const orphan = { ...makeBackup(data), expenses: [{ ...expenses[0], activityId: 'nope' }] };
  assert.equal(parseBackup(JSON.stringify(orphan)).ok, false);
  assert.match(backupFileName(new Date(2026, 10, 12)), /^分帳備份-2026-11-12\.json$/);
});

test('備份提醒：超過 14 天沒備份才提醒，按「知道了」後 14 天內不再提醒', () => {
  const DAY = 86400000;
  const now = 100 * DAY;
  assert.equal(shouldRemind({ firstUseAt: now - 20 * DAY }, false, now), false);
  assert.equal(shouldRemind({ firstUseAt: now - 13 * DAY }, true, now), false);
  assert.equal(shouldRemind({ firstUseAt: now - 15 * DAY }, true, now), true);
  assert.equal(shouldRemind({ firstUseAt: now - 40 * DAY, lastBackupAt: now - 3 * DAY }, true, now), false);
  assert.equal(shouldRemind({ lastBackupAt: now - 20 * DAY, reminderDismissedAt: now - 1 * DAY }, true, now), false);
  assert.equal(shouldRemind({ lastBackupAt: now - 30 * DAY, reminderDismissedAt: now - 15 * DAY }, true, now), true);
});
