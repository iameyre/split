// App 的資料：開啟時把 IndexedDB 全部讀進記憶體，每次修改先寫進資料庫、成功後再更新記憶體。

import * as db from './db.js';
import { summarize } from './calc.js';

export const state = { friends: [], activities: [], expenses: [], repayments: [], meta: {} };

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function upsert(list, obj) {
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj;
  else list.push(obj);
}

function sortFriends() {
  state.friends.sort((a, b) => (a.id === 'me' ? -1 : b.id === 'me' ? 1 : (a.order ?? 0) - (b.order ?? 0)));
}

export async function load() {
  const [friends, activities, expenses, repayments, metaRows] = await Promise.all([
    ...db.TABLES.map((t) => db.getAll(t)),
    db.getAll('meta'),
  ]);
  Object.assign(state, { friends, activities, expenses, repayments });
  state.meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));

  const ops = [];
  if (!state.friends.some((f) => f.id === 'me')) {
    const me = { id: 'me', name: '我', bank: '', account: '', other: '', order: 0 };
    state.friends.push(me);
    ops.push({ table: 'friends', put: me });
  }
  if (!state.meta.firstUseAt) {
    state.meta.firstUseAt = Date.now();
    ops.push({ table: 'meta', put: { key: 'firstUseAt', value: state.meta.firstUseAt } });
  }
  await db.write(ops);
  sortFriends();
}

// ---------- 讀取 ----------

export const getFriend = (id) => state.friends.find((f) => f.id === id);
export const getActivity = (id) => state.activities.find((a) => a.id === id);
export const getExpense = (id) => state.expenses.find((e) => e.id === id);
export const expensesOf = (activityId) => state.expenses.filter((e) => e.activityId === activityId);
export const repaymentsOf = (activityId) => state.repayments.filter((r) => r.activityId === activityId);

export function friendsById() {
  return Object.fromEntries(state.friends.map((f) => [f.id, f]));
}

export function friendName(id) {
  return getFriend(id)?.name ?? '（已刪除）';
}

/** 名字比對：忽略前後空白、全形半形、英文大小寫 */
export function normalizeName(name) {
  return String(name || '').normalize('NFKC').trim().toLowerCase();
}

export function findFriendByName(name, exceptId) {
  const n = normalizeName(name);
  return state.friends.find((f) => f.id !== exceptId && normalizeName(f.name) === n);
}

export function activitiesUsingFriend(id) {
  return state.activities.filter((a) => a.memberIds.includes(id));
}

/** 這個成員在活動裡有沒有帳目（先付、均分、指定金額、還款都算） */
export function memberHasRecords(activityId, memberId) {
  const inExpense = expensesOf(activityId).some((e) => e.payerId === memberId
    || (e.mode === 'custom' ? memberId in (e.customAmounts || {}) : (e.participants || []).includes(memberId)));
  return inExpense || repaymentsOf(activityId).some((r) => r.from === memberId || r.to === memberId);
}

export function summaryOf(activityId) {
  return summarize(getActivity(activityId), expensesOf(activityId), repaymentsOf(activityId));
}

export function hasData() {
  return state.activities.length > 0 || state.friends.length > 1;
}

// ---------- 修改 ----------

function nextFriendOrder() {
  return state.friends.reduce((m, f) => Math.max(m, f.order ?? 0), 0) + 1;
}

export async function saveFriend(friend) {
  const f = { ...friend };
  if (!f.id) {
    f.id = newId();
    f.order = nextFriendOrder();
  }
  await db.write([{ table: 'friends', put: f }]);
  upsert(state.friends, f);
  sortFriends();
  return f;
}

export async function deleteFriend(id) {
  if (id === 'me' || activitiesUsingFriend(id).length) return;
  await db.write([{ table: 'friends', del: id }]);
  state.friends = state.friends.filter((f) => f.id !== id);
}

/** 存活動；newNames 是這次新輸入的名字，會一起加進朋友清單並放在成員最後 */
export async function saveActivity(activity, newNames = []) {
  const a = { ...activity, memberIds: [...activity.memberIds] };
  if (!a.id) {
    a.id = newId();
    a.createdAt = Date.now();
  }
  const ops = [];
  const created = [];
  let order = nextFriendOrder();
  for (const name of newNames) {
    const f = { id: newId(), name: name.trim(), bank: '', account: '', other: '', order: order++ };
    created.push(f);
    a.memberIds.push(f.id);
    ops.push({ table: 'friends', put: f });
  }
  ops.push({ table: 'activities', put: a });
  await db.write(ops);
  for (const f of created) upsert(state.friends, f);
  sortFriends();
  upsert(state.activities, a);
  return a;
}

export async function deleteActivity(id) {
  const ops = [{ table: 'activities', del: id }];
  for (const e of expensesOf(id)) ops.push({ table: 'expenses', del: e.id });
  for (const r of repaymentsOf(id)) ops.push({ table: 'repayments', del: r.id });
  await db.write(ops);
  state.activities = state.activities.filter((a) => a.id !== id);
  state.expenses = state.expenses.filter((e) => e.activityId !== id);
  state.repayments = state.repayments.filter((r) => r.activityId !== id);
}

/** 存一筆帳，同時更新活動（上次付款的人、各幣別上次的匯率） */
export async function saveExpense(expense, activity) {
  const e = { ...expense };
  if (!e.id) {
    e.id = newId();
    e.createdAt = Date.now();
  }
  e.updatedAt = Date.now();
  await db.write([{ table: 'expenses', put: e }, { table: 'activities', put: activity }]);
  upsert(state.expenses, e);
  upsert(state.activities, activity);
  return e;
}

export async function deleteExpense(id) {
  await db.write([{ table: 'expenses', del: id }]);
  state.expenses = state.expenses.filter((e) => e.id !== id);
}

export async function addRepayment(rep) {
  const r = { ...rep, id: newId(), createdAt: Date.now() };
  await db.write([{ table: 'repayments', put: r }]);
  state.repayments.push(r);
  return r;
}

export async function deleteRepayment(id) {
  await db.write([{ table: 'repayments', del: id }]);
  state.repayments = state.repayments.filter((r) => r.id !== id);
}

export async function setMeta(key, value) {
  await db.write([{ table: 'meta', put: { key, value } }]);
  state.meta[key] = value;
}

export function exportData() {
  return {
    friends: state.friends,
    activities: state.activities,
    expenses: state.expenses,
    repayments: state.repayments,
  };
}

/** 還原：清空四個資料表，換成備份裡的資料 */
export async function replaceAll(data) {
  const ops = [];
  for (const t of db.TABLES) {
    ops.push({ table: t, clear: true });
    for (const row of data[t]) ops.push({ table: t, put: row });
  }
  const now = Date.now();
  ops.push({ table: 'meta', put: { key: 'lastBackupAt', value: now } });
  await db.write(ops);
  for (const t of db.TABLES) state[t] = data[t].map((x) => ({ ...x }));
  state.meta.lastBackupAt = now;
  sortFriends();
}
