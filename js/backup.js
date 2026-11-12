// 備份檔的格式、檢查，以及「該不該提醒備份」。純函式，可以自動測試。

export const BACKUP_APP = 'split-ledger';
export const BACKUP_VERSION = 1;
export const REMIND_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const TABLES = ['friends', 'activities', 'expenses', 'repayments'];

export function makeBackup(data, now = Date.now()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now,
    friends: data.friends,
    activities: data.activities,
    expenses: data.expenses,
    repayments: data.repayments,
  };
}

export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `分帳備份-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** 檢查備份文字；成功回傳 { ok: true, data, stats }，失敗回傳 { ok: false, error } */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(String(text).trim());
  } catch {
    return { ok: false, error: '這不是備份檔的內容（無法讀取）。' };
  }
  if (!obj || obj.app !== BACKUP_APP) return { ok: false, error: '這不是這個 App 的備份檔。' };
  if (obj.version > BACKUP_VERSION) return { ok: false, error: '這個備份檔來自比較新的版本，請先更新 App。' };
  for (const t of TABLES) {
    if (!Array.isArray(obj[t]) || obj[t].some((x) => !x || typeof x.id !== 'string')) {
      return { ok: false, error: '備份檔內容不完整。' };
    }
  }
  if (!obj.friends.some((f) => f.id === 'me')) return { ok: false, error: '備份檔內容不完整（缺少「我」）。' };
  const actIds = new Set(obj.activities.map((a) => a.id));
  if (obj.activities.some((a) => !Array.isArray(a.memberIds) || typeof a.name !== 'string')) {
    return { ok: false, error: '備份檔裡的活動資料有問題。' };
  }
  if ([...obj.expenses, ...obj.repayments].some((x) => !actIds.has(x.activityId))) {
    return { ok: false, error: '備份檔裡有帳目找不到所屬的活動。' };
  }
  const data = {};
  for (const t of TABLES) data[t] = obj[t];
  return {
    ok: true,
    data,
    exportedAt: obj.exportedAt,
    stats: {
      friends: obj.friends.length,
      activities: obj.activities.length,
      expenses: obj.expenses.length,
    },
  };
}

/**
 * 首頁要不要提醒備份：有資料、距離上次備份（沒備份過就從第一次使用算）超過 14 天，
 * 而且最近 14 天內沒按過「知道了」。
 */
export function shouldRemind(meta, hasData, now = Date.now()) {
  if (!hasData) return false;
  const base = meta.lastBackupAt || meta.firstUseAt || now;
  if (now - base < REMIND_DAYS * DAY) return false;
  if (meta.reminderDismissedAt && now - meta.reminderDismissedAt < REMIND_DAYS * DAY) return false;
  return true;
}
