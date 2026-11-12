// 進入點：讀取資料、依網址 # 後面的路徑切換畫面、註冊 service worker（離線可用）。

import * as store from './store.js';
import { requestPersist } from './db.js';
import { h, setRenderer } from './ui.js';
import { renderHome } from './views/home.js';
import { renderFriends, openNameSetup } from './views/friends.js';
import { renderActivity } from './views/activity.js';
import { renderBackup } from './views/backup-view.js';

const app = document.getElementById('app');
let lastRoute = null;

function render() {
  const route = location.hash.replace(/^#\/?/, '');
  const [page, id, sub] = route.split('/');
  if (page === 'friends') renderFriends(app);
  else if (page === 'backup') renderBackup(app);
  else if (page === 'a' && store.getActivity(id)) renderActivity(app, id, sub === 'settle' ? 'settle' : 'list');
  else renderHome(app);

  // 換到別的畫面才捲回最上面；同一個畫面重畫（例如存檔後）保留捲動位置
  const base = page === 'a' ? `a/${id}` : page;
  if (base !== lastRoute) window.scrollTo(0, 0);
  lastRoute = base;
}

async function start() {
  try {
    await store.load();
  } catch (err) {
    console.error(err);
    app.replaceChildren(h('p', { class: 'empty' }, '無法開啟資料庫。如果在 Safari 開了「私密瀏覽」，請改用一般模式。'));
    return;
  }
  requestPersist();
  setRenderer(render);
  window.addEventListener('hashchange', render);
  render();
  // 還沒設定自己的名字（還是預設的「我」）就先問
  if (store.getFriend('me')?.name === '我') openNameSetup();

  // 在電腦上預覽（localhost）時預設不啟用離線快取，改檔案後重新整理就看得到；網址加 ?sw 可以測試離線功能
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!isLocal || location.search.includes('sw'))) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('service worker 註冊失敗', err));
  }
}

start();
