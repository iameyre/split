// 備份與還原：下載備份檔、複製備份文字；選檔或貼上文字還原（按兩次確認，會覆蓋全部資料）。

import { h, pageHeader, copyText, twoStepButton, toast } from '../ui.js';
import * as store from '../store.js';
import { makeBackup, parseBackup, backupFileName } from '../backup.js';

function formatDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function renderBackup(root) {
  const last = h('p', { class: 'note' });
  function drawLast() {
    const t = store.state.meta.lastBackupAt;
    last.textContent = t ? `上次備份：${formatDateTime(t)}` : '還沒有備份過。';
  }
  drawLast();

  async function markBackedUp() {
    await store.setMeta('lastBackupAt', Date.now());
    drawLast();
  }

  async function download() {
    const now = new Date();
    const text = JSON.stringify(makeBackup(store.exportData(), now.getTime()), null, 2);
    const name = backupFileName(now);
    const file = new File([text], name, { type: 'application/json' });
    // iPhone：用分享選單，選「儲存到檔案」
    if (isIOS() && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        await markBackedUp();
        toast('已備份');
      } catch (err) {
        if (err?.name !== 'AbortError') toast('沒有成功分享，請改用「複製備份文字」');
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    await markBackedUp();
    toast('已下載備份檔');
  }

  async function copyBackup() {
    const text = JSON.stringify(makeBackup(store.exportData()));
    await copyText(text, '已複製備份文字，請貼到備忘錄或傳給自己保存');
    await markBackedUp();
  }

  // ---------- 還原 ----------
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json,text/plain', class: 'visually-hidden', id: 'restore-file' });
  const pasteArea = h('textarea', { rows: 5, placeholder: '或把備份文字貼在這裡', class: 'copy-area' });
  const check = h('p', { class: 'note' });
  let parsed = null;

  const restoreBtn = twoStepButton('還原（會覆蓋全部資料）', '再按一次：目前的資料會全部被覆蓋', async () => {
    if (!parsed?.ok) return;
    await store.replaceAll(parsed.data);
    toast('已還原');
    location.hash = '#/';
  });

  function validate() {
    const text = pasteArea.value.trim();
    parsed = text ? parseBackup(text) : null;
    restoreBtn.disabled = !parsed?.ok;
    check.className = 'note';
    if (!parsed) {
      check.textContent = '';
    } else if (!parsed.ok) {
      check.textContent = parsed.error;
      check.classList.add('bad');
    } else {
      const s = parsed.stats;
      const when = parsed.exportedAt ? `${formatDateTime(parsed.exportedAt)} 的備份：` : '';
      check.textContent = `${when}${s.activities} 個活動、${s.expenses} 筆帳目、${s.friends} 個人。`;
    }
  }
  pasteArea.addEventListener('input', validate);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    pasteArea.value = await file.text();
    fileInput.value = '';
    validate();
  });
  validate();

  root.replaceChildren(
    pageHeader({ back: '#/', backLabel: '活動', title: '備份與還原' }),
    h('p', { class: 'intro' }, '資料只存在這支手機的瀏覽器裡，不會上傳到任何地方。刪掉主畫面的 App 圖示、或清除 Safari 的網站資料，資料就會消失，建議定期備份。'),
    h('section', { class: 'section' },
      h('h2', null, '備份'),
      last,
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'secondary', onclick: download }, '下載備份檔'),
        h('button', { type: 'button', class: 'secondary', onclick: copyBackup }, '複製備份文字')),
      h('p', { class: 'field-hint' }, 'iPhone 按「下載備份檔」會打開分享選單，選「儲存到檔案」即可。')),
    h('section', { class: 'section' },
      h('h2', null, '還原'),
      h('p', { class: 'note' }, '還原會用備份裡的資料取代目前全部的資料。'),
      h('label', { class: 'secondary file-button', for: 'restore-file' }, '選擇備份檔'),
      fileInput,
      pasteArea,
      check,
      h('div', { class: 'danger-zone' }, restoreBtn)),
  );
}
