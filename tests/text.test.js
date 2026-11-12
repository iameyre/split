// 複製文字格式、金額格式、備份檢查的自動測試。在專案資料夾執行：npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../js/calc.js';
import {
  formatTWD, formatMoney, formatDate, cleanAccount, paymentLines, settlementText, fullDetailText,
} from '../js/text.js';
import { makeBackup, parseBackup, shouldRemind, backupFileName } from '../js/backup.js';

const friendsById = {
  me: { id: 'me', name: 'Eyre', bank: '013 國泰世華', account: '1234567890', other: 'LINE Pay 0912345678' },
  ming: { id: 'ming', name: '小明', bank: '822 中國信託', account: '987654321000', other: '' },
  hua: { id: 'hua', name: '阿華', bank: '', account: '', other: '' },
  mei: { id: 'mei', name: '小美', bank: '', account: '', other: '' },
};
const activity = { id: 'a1', name: '週五燒肉', memberIds: ['me', 'ming', 'hua', 'mei'] };
const expenses = [
  { id: 'e1', activityId: 'a1', title: '燒肉', amount: '3280', currency: 'TWD', rate: '1', date: '2026-11-06', payerId: 'me', mode: 'equal', participants: ['me', 'ming', 'hua', 'mei'], createdAt: 1 },
  { id: 'e2', activityId: 'a1', title: '飲料', amount: '240', currency: 'TWD', rate: '1', date: '2026-11-06', payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua'], createdAt: 2 },
  { id: 'e3', activityId: 'a1', title: 'KTV', amount: '1800', currency: 'TWD', rate: '1', date: '2026-11-07', payerId: 'ming', mode: 'equal', participants: ['me', 'ming', 'hua', 'mei'], createdAt: 3 },
];

test('複製結算：跟規格裡的範例一字不差', () => {
  const s = summarize(activity, expenses, []);
  const expected = [
    '【週五燒肉】結算',
    '總支出 NT$5,320，共 3 筆',
    '',
    '轉給 Eyre　共 NT$1,930',
    '013 國泰世華 1234567890',
    'LINE Pay 0912345678',
    '　阿華　NT$1,350',
    '　小美　NT$580',
    '',
    '轉給 小明',
    '822 中國信託 987654321000',
    '　小美　NT$690',
  ].join('\n');
  assert.equal(settlementText(activity, s, friendsById), expected);
});

test('複製結算：沒填收款資訊、沒有要轉帳', () => {
  const noInfo = { ...friendsById, me: { id: 'me', name: 'Eyre' } };
  const s = summarize(activity, expenses, []);
  assert.match(settlementText(activity, s, noInfo), /轉給 Eyre　共 NT\$1,930\n（還沒有收款資訊）\n/);
  assert.match(settlementText(activity, summarize(activity, [], []), friendsById), /還沒有記帳。$/);
});

test('複製完整明細：每筆、每個人、已還款、轉帳區塊', () => {
  const foreign = {
    id: 'e4', activityId: 'a1', title: '拉麵', amount: '3000', currency: 'JPY', rate: '0.21', date: '2026-11-07',
    payerId: 'hua', mode: 'custom', customAmounts: { hua: '1000', mei: '2000' }, createdAt: 4,
  };
  const reps = [{ id: 'r1', activityId: 'a1', from: 'hua', to: 'me', amount: 1000, createdAt: new Date(2026, 10, 8).getTime() }];
  const all = [...expenses, foreign];
  const s = summarize(activity, all, reps);
  const text = fullDetailText(activity, s, all, reps, friendsById, 2026);
  const lines = text.split('\n');
  assert.equal(lines[0], '【週五燒肉】完整明細');
  assert.equal(lines[1], '總支出 NT$5,950，共 4 筆');
  assert.ok(lines.includes('11/6（五）'));
  assert.ok(lines.includes('燒肉　NT$3,280'));
  assert.ok(lines.includes('　Eyre 先付；Eyre、小明、阿華、小美 均分'));
  assert.ok(lines.includes('　小明 先付；Eyre、小明、阿華 均分'));
  assert.ok(lines.includes('拉麵　NT$630（日圓 3,000）'));
  assert.ok(lines.includes('　阿華 先付；阿華 NT$210、小美 NT$420'));
  assert.ok(lines.includes('Eyre　先付 NT$3,280　分攤 NT$1,350'));
  assert.ok(lines.includes('阿華　先付 NT$630　分攤 NT$1,560'));
  assert.ok(lines.includes('已還款'));
  assert.ok(lines.includes('阿華 → Eyre　NT$1,000（11/8）'));
  assert.ok(lines.indexOf('怎麼轉帳') > lines.indexOf('已還款'));
  // 日期舊的在前
  assert.ok(lines.indexOf('11/6（五）') < lines.indexOf('11/7（六）'));
});

test('金額與日期格式', () => {
  assert.equal(formatTWD(5320), 'NT$5,320');
  assert.equal(formatTWD(1234567), 'NT$1,234,567');
  assert.equal(formatTWD(0), 'NT$0');
  assert.equal(formatMoney('12345.5', 'JPY'), '日圓 12,345.5');
  assert.equal(formatMoney('580', 'TWD'), 'NT$580');
  assert.equal(formatDate('2026-11-12', 2026), '11/12（四）');
  assert.equal(formatDate('2025-12-31', 2026), '2025/12/31（三）');
});

test('複製帳號去掉空格和連字號', () => {
  assert.equal(cleanAccount('1234-5678 9012'), '123456789012');
  assert.equal(cleanAccount(' 0912－345－678 '), '0912345678');
});

test('收款資訊行', () => {
  assert.deepEqual(paymentLines(friendsById.me), ['013 國泰世華 1234567890', 'LINE Pay 0912345678']);
  assert.deepEqual(paymentLines({ other: '街口 123\n\n LINE Pay 456 ' }), ['街口 123', 'LINE Pay 456']);
  assert.deepEqual(paymentLines({}), []);
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
  assert.equal(shouldRemind({ firstUseAt: now - 20 * DAY }, false, now), false); // 沒資料
  assert.equal(shouldRemind({ firstUseAt: now - 13 * DAY }, true, now), false);
  assert.equal(shouldRemind({ firstUseAt: now - 15 * DAY }, true, now), true);
  assert.equal(shouldRemind({ firstUseAt: now - 40 * DAY, lastBackupAt: now - 3 * DAY }, true, now), false);
  assert.equal(shouldRemind({ lastBackupAt: now - 20 * DAY, reminderDismissedAt: now - 1 * DAY }, true, now), false);
  assert.equal(shouldRemind({ lastBackupAt: now - 30 * DAY, reminderDismissedAt: now - 15 * DAY }, true, now), true);
});
