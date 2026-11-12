// Service worker：第一次開啟時把所有檔案存到手機，之後沒有網路也能打開。
// ★ 每次修改任何檔案、要更新到手機上時，把下面的版本號加 1（例如 v1 → v2），手機才會換成新版。
const VERSION = 'v2';
const CACHE = `split-ledger-${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/db.js',
  './js/store.js',
  './js/calc.js',
  './js/text.js',
  './js/backup.js',
  './js/banks.js',
  './js/explain.js',
  './js/image.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/friends.js',
  './js/views/activity-form.js',
  './js/views/activity.js',
  './js/views/expense-form.js',
  './js/views/settle.js',
  './js/views/backup-view.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('split-ledger-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 打開 App（任何頁面網址）都給存好的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((res) => res || fetch(req)));
    return;
  }
  // 其他檔案：先用手機裡存好的，沒有才上網抓
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((res) => res || fetch(req)));
});
