// 인터넷 먼저, 끊기면 저장해 둔 사본으로 (오프라인에서도 열리게)
const CACHE = 'photo-diary-v19';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  ...['main', 'util', 'db', 'calendar', 'day', 'image-editor', 'video-editor', 'recorder', 'music', 'quotes', 'report', 'backup', 'memory', 'quotes-data'].map(n => `js/${n}.js`)];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// GitHub Pages는 파일을 10분 동안 '그대로 써도 됨'으로 보내서, 확인 없이 쓰면 업데이트가 늦게 보임
// → 항상 서버에 바뀌었는지 물어보고(no-cache), 새 버전은 기다리지 않고 바로 자리 잡게
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // 노래 검색·미리듣기·유튜브 같은 바깥 주소는 건드리지 않음
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !FONT_HOSTS.includes(u.hostname))) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
