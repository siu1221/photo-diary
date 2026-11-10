// ?명꽣??癒쇱?, ?딄린硫???ν빐 ???щ낯?쇰줈 (?ㅽ봽?쇱씤?먯꽌???대━寃?
const CACHE = 'photo-diary-v21';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  ...['main', 'util', 'db', 'calendar', 'day', 'image-editor', 'video-editor', 'recorder', 'music', 'quotes', 'report', 'backup', 'memory', 'quotes-data'].map(n => `js/${n}.js`)];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// GitHub Pages???뚯씪??10遺??숈븞 '洹몃?濡??⑤룄 ???쇰줈 蹂대궡?? ?뺤씤 ?놁씠 ?곕㈃ ?낅뜲?댄듃媛 ??쾶 蹂댁엫
// ????긽 ?쒕쾭??諛붾뚯뿀?붿? 臾쇱뼱蹂닿퀬(no-cache), ??踰꾩쟾? 湲곕떎由ъ? ?딄퀬 諛붾줈 ?먮━ ?↔쾶
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // ?몃옒 寃?됀룸?由щ뱽湲걔룹쑀?쒕툕 媛숈? 諛붽묑 二쇱냼??嫄대뱶由ъ? ?딆쓬
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !FONT_HOSTS.includes(u.hostname))) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
