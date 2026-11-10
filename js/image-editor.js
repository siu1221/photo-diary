import { $, el, toast, openScreen, closeScreen, canvasBlob, thumbOf } from './util.js';
import { ask } from './music.js';

const RATIOS = { orig: null, '1:1': 1, '4:5': 4 / 5, '3:4': 3 / 4, '16:9': 16 / 9 };
const FILTERS = [
  { name: '기본', f: {} },
  { name: '포근', f: { w: 25, s: 10, b: 5 } },
  { name: '청량', f: { w: -25, c: 10, b: 5 } },
  { name: '몽글', f: { c: -20, b: 10, fade: 25 } },
  { name: '선명', f: { s: 35, c: 15 } },
  { name: '필름', f: { sepia: 35, c: -5, fade: 15 } },
  { name: '흑백', f: { gray: 100, c: 10 } },
];
const OUT_LONG = 1080; // 저장 사진 긴 변
const blank = () => ({ ratio: 'orig', rot: 0, flip: false, zoom: 1, ox: 0, oy: 0, b: 0, c: 0, s: 0, w: 0, filter: 0 });

// 여러 장을 한 번에 편집: 옆으로 넘기며 각각 고치고, ✓ 한 번에 모두 등록
// 사진마다 원본(orig)과 편집값(edit)을 같이 저장해서, 다시 편집해도 보정이 겹쳐 쌓이지 않음
const ORIG_LONG = 2048; // 다시 편집용 원본 긴 변
let photos = [], cur = 0, img, st, done, trimVideo;
const cv = $('ie-canvas');

// list: [{ src: 원본 Blob/File, edit?: 지난 편집값 }]
// trim: 영상 칸에서 '영상 자르기'를 누르면 부를 함수 (영상 Blob → 새 영상 항목)
export async function editImages(list, start = 0, trim) {
  trimVideo = trim;
  const loaded = [];
  for (const { src, edit, keep } of list) {
    const url = URL.createObjectURL(src), im = new Image();
    im.src = url;
    try { await im.decode(); } catch { URL.revokeObjectURL(url); toast('열 수 없는 사진은 건너뛰었어요'); continue; }
    loaded.push({ img: im, url, src, keep, isFile: !edit, st: { ...blank(), ...edit } }); // keep: 영상(순서만 바꾸고 그대로 돌려줌)
  }
  if (!loaded.length) return null;
  photos = loaded;
  document.querySelector('#imgedit [data-tab="crop"]').click(); // 항상 자르기 탭(격자)부터
  openScreen('imgedit');
  drawThumbs();
  select(start);
  return new Promise(res => { done = res; });
}

const setTitle = () => { $('ie-title').textContent = `${photos[cur].keep ? '영상' : '사진'} 편집${photos.length > 1 ? ` ${cur + 1} / ${photos.length}` : ''}`; };
$('ie-vtrim').onclick = async () => {
  const p = photos[cur], item = await trimVideo?.(p.keep.blob);
  if (!item) return;
  p.keep = item;
  URL.revokeObjectURL(p.url);
  p.url = URL.createObjectURL(item.thumb);
  p.img = new Image();
  p.img.src = p.url;
  await p.img.decode().catch(() => {});
  drawThumbs();
  select(cur);
};

function select(i) {
  cur = Math.max(0, Math.min(photos.length - 1, i));
  ({ img, st } = photos[cur]);
  $('imgedit').classList.toggle('keep', !!photos[cur].keep);
  setTitle();
  $('ie-prev').hidden = cur === 0;
  $('ie-next').hidden = cur === photos.length - 1;
  [...$('ie-thumbs').children].forEach((b, k) => b.classList.toggle('on', k === cur));
  $('ie-thumbs').children[cur]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  syncUI();
  layout();
}
// 사진 순서 줄: 번호가 곧 올라갈 순서. 누르면 그 사진 편집, 꾹 누른 채 옆으로 끌면 순서 바꾸기
function drawThumbs() {
  $('ie-thumbs').hidden = photos.length < 2;
  $('ie-thumbs').replaceChildren(...photos.map((p, k) =>
    el('button', { 'aria-label': `${k + 1}번째 사진. 꾹 눌러 끌면 순서 바꾸기`, 'data-k': k, onclick: () => { if (!dragged) select(k); } },
      el('img', { src: p.url, alt: '', draggable: false }), el('span', { className: 'num', textContent: p.keep ? `${k + 1} ▶` : k + 1 }))));
  [...$('ie-thumbs').children].forEach((b, k) => b.classList.toggle('on', k === cur));
}
let drag = null, dragged = false, holdT, holdX = 0;
const strip = $('ie-thumbs');
strip.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  dragged = false;
  holdX = e.clientX;
  holdT = setTimeout(() => { drag = { from: +b.dataset.k }; strip.dataset.lock = '1'; b.classList.add('lift'); navigator.vibrate?.(15); }, 380);
});
strip.addEventListener('pointermove', e => { if (!drag && Math.abs(e.clientX - holdX) > 8) clearTimeout(holdT); }); // 그냥 넘기는 중이면 꾹 누르기 취소
strip.addEventListener('pointermove', e => {
  if (!drag) return;
  // 손가락 아래 칸 번호를 찾아 그 자리로 옮김
  const over = document.elementFromPoint(e.clientX, strip.getBoundingClientRect().top + 20)?.closest('[data-k]');
  if (!over || +over.dataset.k === drag.from) return;
  const to = +over.dataset.k, curPhoto = photos[cur];
  photos.splice(to, 0, ...photos.splice(drag.from, 1));
  drag.from = to;
  dragged = true;
  cur = photos.indexOf(curPhoto);
  drawThumbs();
  strip.children[to].classList.add('lift');
  setTitle();
});
const endDrag = () => {
  clearTimeout(holdT);
  if (drag) { drag = null; delete strip.dataset.lock; setTimeout(() => { dragged = false; }, 0); select(cur); }
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
strip.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false }); // 끄는 동안 줄이 스크롤되지 않게
strip.addEventListener('contextmenu', e => e.preventDefault());
$('ie-prev').onclick = () => select(cur - 1);
$('ie-next').onclick = () => select(cur + 1);

// 회전까지 반영한 사진 크기와 자르는 틀의 비율
const dims = () => (st.rot % 180 ? [img.naturalHeight, img.naturalWidth] : [img.naturalWidth, img.naturalHeight]);
const frameRatio = () => { const [rw, rh] = dims(); return RATIOS[st.ratio] ?? (st.ratio === 'free' ? st.fr : rw / rh); };
const freeMode = () => st.ratio === 'free' && tab === 'crop';

// 자유 자르기: 사진 위 사각형(x,y,w,h = 사진 대비 0~1) ↔ 원래 쓰던 값(틀 비율 fr, zoom, ox, oy)
// 그래서 저장·다시 편집·다른 탭 미리보기는 고치지 않고 그대로 씀
const MIN_CROP = 0.2; // zoom 최대 5배와 맞춤
function toRect() {
  const [rw, rh] = dims(), R = frameRatio(), cover = Math.max(1 / rw, 1 / R / rh) * st.zoom;
  const w = 1 / (rw * cover), h = 1 / R / (rh * cover);
  return { x: 0.5 - st.ox / (rw * cover) - w / 2, y: 0.5 - st.oy / (rh * cover) - h / 2, w, h };
}
function fromRect(r) {
  const [rw, rh] = dims();
  st.fr = (r.w * rw) / (r.h * rh);
  st.zoom = 1 / Math.max(r.w, r.h);
  const cover = Math.max(1 / rw, 1 / st.fr / rh) * st.zoom;
  st.ox = (0.5 - (r.x + r.w / 2)) * rw * cover;
  st.oy = (0.5 - (r.y + r.h / 2)) * rh * cover;
}
console.assert((() => { const s0 = st; img = { naturalWidth: 400, naturalHeight: 300 }; st = { ...blank(), ratio: 'free', fr: 4 / 3 };
  const r = { x: 0.1, y: 0.3, w: 0.5, h: 0.4 }; fromRect(r); const q = toRect(); st = s0; img = undefined;
  return ['x', 'y', 'w', 'h'].every(k => Math.abs(q[k] - r[k]) < 1e-9); })(), 'free crop rect round trip');

// 틀 밖으로 빈 곳이 보이지 않게 위치 제한 (틀 너비 = 1 기준)
function clamp() {
  const [rw, rh] = dims(), R = frameRatio();
  const cover = Math.max(1 / rw, 1 / R / rh) * st.zoom;
  const mx = Math.max(0, (rw * cover - 1) / 2), my = Math.max(0, (rh * cover - 1 / R) / 2);
  st.ox = Math.min(mx, Math.max(-mx, st.ox));
  st.oy = Math.min(my, Math.max(-my, st.oy));
}

function draw(canvas, W) {
  const R = frameRatio(), H = Math.round(W / R), [rw, rh] = dims();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sc = Math.max(W / rw, H / rh) * st.zoom;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + st.ox * W, H / 2 + st.oy * W);
  ctx.rotate(st.rot * Math.PI / 180);
  ctx.scale(st.flip ? -1 : 1, 1);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -img.naturalWidth * sc / 2, -img.naturalHeight * sc / 2, img.naturalWidth * sc, img.naturalHeight * sc);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const f = FILTERS[st.filter].f;
  adjust(ctx, W, H, {
    b: st.b + (f.b || 0), c: st.c + (f.c || 0), s: st.s + (f.s || 0), w: st.w + (f.w || 0),
    gray: f.gray || 0, sepia: f.sepia || 0, fade: f.fade || 0,
  });
}

// 밝기·대비·채도·따뜻함·흑백·세피아·바랜 느낌을 픽셀마다 계산
// (Safari는 canvas filter를 지원하지 않아서 직접 계산)
export function adjust(ctx, W, H, { b, c, s, w, gray, sepia, fade }) {
  if (!(b || c || s || w || gray || sepia || fade)) return;
  const d = ctx.getImageData(0, 0, W, H), a = d.data;
  const C = Math.max(-254, Math.min(254, c * 1.28)), cf = (259 * (C + 255)) / (255 * (259 - C));
  const bf = b * 1.0, sf = Math.max(0, 1 + s / 100) * (1 - gray / 100), sp = sepia / 100, fd = fade / 100, wm = w * 0.35;
  for (let i = 0; i < a.length; i += 4) {
    let r = cf * (a[i] - 128) + 128 + bf, g = cf * (a[i + 1] - 128) + 128 + bf, bl = cf * (a[i + 2] - 128) + 128 + bf;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = l + (r - l) * sf; g = l + (g - l) * sf; bl = l + (bl - l) * sf;
    r += wm; bl -= wm;
    if (sp) {
      const tr = 0.393 * r + 0.769 * g + 0.189 * bl, tg = 0.349 * r + 0.686 * g + 0.168 * bl, tb = 0.272 * r + 0.534 * g + 0.131 * bl;
      r += (tr - r) * sp; g += (tg - g) * sp; bl += (tb - bl) * sp;
    }
    if (fd) { r = r * (1 - fd * 0.25) + 45 * fd; g = g * (1 - fd * 0.25) + 40 * fd; bl = bl * (1 - fd * 0.25) + 45 * fd; }
    a[i] = r; a[i + 1] = g; a[i + 2] = bl; // Uint8ClampedArray가 0~255로 알아서 자름
  }
  ctx.putImageData(d, 0, 0);
}

// 미리보기: 화면 크기에 맞춰 다시 그리기
let queued = false, tab = 'crop';
// 아이폰 사진 앱처럼 3×3 격자 (미리보기에만, 저장되는 사진엔 안 들어감)
function drawGrid(c, dpr, X = 0, Y = 0, W = c.width, H = c.height) {
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.translate(X, Y);
  ctx.strokeStyle = '#ffffffb3';
  ctx.lineWidth = dpr;
  ctx.shadowColor = '#0006';
  ctx.shadowBlur = 2 * dpr;
  ctx.beginPath();
  for (const f of [1 / 3, 2 / 3]) {
    ctx.moveTo(W * f, 0); ctx.lineTo(W * f, H);
    ctx.moveTo(0, H * f); ctx.lineTo(W, H * f);
  }
  ctx.stroke();
  // 네 모서리 굵은 꺾쇠
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = '#fff';
  const L = Math.min(W, H) * 0.08, o = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(o, L); ctx.lineTo(o, o); ctx.lineTo(L, o);
  ctx.moveTo(W - L, o); ctx.lineTo(W - o, o); ctx.lineTo(W - o, L);
  ctx.moveTo(W - o, H - L); ctx.lineTo(W - o, H - o); ctx.lineTo(W - L, H - o);
  ctx.moveTo(L, H - o); ctx.lineTo(o, H - o); ctx.lineTo(o, H - L);
  ctx.stroke();
  ctx.restore();
}
function layout() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    clamp();
    const free = freeMode(), [rw, rh] = dims();
    const stage = $('ie-stage'), R = free ? rw / rh : frameRatio();
    const cssW = Math.min(stage.clientWidth - 20, (stage.clientHeight - 20) * R);
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (free) {
      // 사진 전체를 보여 주고 그 위에 자를 틀: 틀 밖은 어둡게
      const keep = st, r = toRect();
      st = { ...st, ratio: 'orig', zoom: 1, ox: 0, oy: 0 };
      draw(cv, Math.max(50, Math.round(cssW * dpr)));
      st = keep;
      const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
      ctx.fillStyle = '#000a';
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(r.x * W, r.y * H, r.w * W, r.h * H); ctx.fill('evenodd');
      drawGrid(cv, dpr, r.x * W, r.y * H, r.w * W, r.h * H);
    } else {
      draw(cv, Math.max(50, Math.round(cssW * dpr)));
      if (tab === 'crop') drawGrid(cv, dpr);
    }
    cv.style.width = cssW + 'px';
  });
}
addEventListener('resize', () => { if ($('imgedit').classList.contains('active')) layout(); });

function syncUI() {
  for (const b of $('ie-ratios').children) b.classList.toggle('on', b.dataset.ratio === st.ratio);
  for (const i of document.querySelectorAll('#imgedit [data-k]')) i.value = st[i.dataset.k];
  showPct();
  $('ie-zoom').value = st.zoom;
  $('ie-zoom').closest('label').hidden = st.ratio === 'free'; // 자유는 틀 크기로 확대
  [...$('ie-filters').children].forEach((b, i) => b.classList.toggle('on', i === st.filter));
}

// --- 조작
$('ie-filters').append(...FILTERS.map((f, i) => el('button', { textContent: f.name, onclick: () => { st.filter = i; syncUI(); layout(); } })));
$('ie-ratios').onclick = e => {
  const r = e.target.dataset.ratio;
  if (!r) return;
  Object.assign(st, { ratio: r, zoom: 1, ox: 0, oy: 0 });
  if (r === 'free') { const [rw, rh] = dims(); st.fr = rw / rh; } // 처음엔 사진 전체
  syncUI(); layout();
};
$('ie-zoom').oninput = e => { st.zoom = +e.target.value; layout(); };
for (const i of document.querySelectorAll('#imgedit [data-k]')) i.oninput = () => { st[i.dataset.k] = +i.value; showPct(); layout(); };
// 보정값을 숫자로 (+20%, -15%)
function showPct() {
  for (const o of document.querySelectorAll('#imgedit [data-o]')) { const v = st[o.dataset.o]; o.textContent = (v > 0 ? '+' : '') + v + '%'; }
}
$('ie-adj-reset').onclick = () => { Object.assign(st, { b: 0, c: 0, s: 0, w: 0 }); syncUI(); layout(); };
$('ie-rotate').onclick = () => {
  Object.assign(st, { rot: (st.rot + 270) % 360, zoom: 1, ox: 0, oy: 0 });
  if (st.ratio === 'free') { const [rw, rh] = dims(); st.fr = rw / rh; }
  syncUI(); layout();
};
$('ie-flip').onclick = () => { st.flip = !st.flip; layout(); };
$('ie-reset').onclick = () => { Object.assign(st, blank()); syncUI(); layout(); };
for (const t of document.querySelectorAll('#imgedit .tabs button')) {
  t.onclick = () => {
    tab = t.dataset.tab;
    layout();
    for (const x of document.querySelectorAll('#imgedit .tabs button')) x.classList.toggle('on', x === t);
    for (const p of document.querySelectorAll('#imgedit .ie-panel')) p.hidden = p.dataset.panel !== t.dataset.tab;
  };
}

// 한 손가락: 위치 이동 / 두 손가락: 확대·축소 / PC 마우스 휠: 확대·축소
const ptrs = new Map();
let pinch = 0;
// (사진 위에서 밀어도 다음 사진으로 넘어가지 않음: 자르기·위치 조정과 헷갈려서 화살표·번호로만 이동)
cv.addEventListener('pointerdown', e => {
  if (photos[cur]?.keep) return; // 영상 칸은 편집 안 함
  cv.setPointerCapture(e.pointerId);
  if (freeMode()) { grabCrop(e); return; }
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  pinch = 0;
});
// 자유 자르기: 틀의 변·모서리를 잡으면 그 변만 움직이고, 틀 안을 잡으면 틀째 옮김
let grab = null;
function grabCrop(e) {
  const b = cv.getBoundingClientRect(), r = toRect();
  const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height, tx = 28 / b.width, ty = 28 / b.height;
  const inX = px > r.x - tx && px < r.x + r.w + tx, inY = py > r.y - ty && py < r.y + r.h + ty;
  let ed = '';
  if (inY && Math.abs(px - r.x) < tx) ed += 'l'; else if (inY && Math.abs(px - r.x - r.w) < tx) ed += 'r';
  if (inX && Math.abs(py - r.y) < ty) ed += 't'; else if (inX && Math.abs(py - r.y - r.h) < ty) ed += 'b';
  if (!ed && inX && inY) ed = 'm';
  grab = ed && { ed, r, x0: e.clientX, y0: e.clientY, b };
}
function moveCrop(e) {
  const { ed, r, b } = grab, dx = (e.clientX - grab.x0) / b.width, dy = (e.clientY - grab.y0) / b.height, n = { ...r };
  const lim = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (ed === 'm') { n.x = lim(r.x + dx, 0, 1 - r.w); n.y = lim(r.y + dy, 0, 1 - r.h); }
  if (ed.includes('l')) { n.x = lim(r.x + dx, 0, r.x + r.w - MIN_CROP); n.w = r.x + r.w - n.x; }
  if (ed.includes('r')) n.w = lim(r.w + dx, MIN_CROP, 1 - r.x);
  if (ed.includes('t')) { n.y = lim(r.y + dy, 0, r.y + r.h - MIN_CROP); n.h = r.y + r.h - n.y; }
  if (ed.includes('b')) n.h = lim(r.h + dy, MIN_CROP, 1 - r.y);
  fromRect(n);
  layout();
}
cv.addEventListener('pointermove', e => {
  if (grab) { moveCrop(e); return; }
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const w = cv.clientWidth;
  if (ptrs.size === 1) {
    st.ox += (e.clientX - p[0]) / w;
    st.oy += (e.clientY - p[1]) / w;
  }
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) st.zoom = Math.min(5, Math.max(1, st.zoom * dist / pinch));
    pinch = dist;
    $('ie-zoom').value = st.zoom;
  }
  layout();
});
const up = e => { ptrs.delete(e.pointerId); pinch = 0; grab = null; };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (freeMode()) return;
  st.zoom = Math.min(5, Math.max(1, st.zoom * Math.exp(-e.deltaY * 0.001)));
  $('ie-zoom').value = st.zoom;
  layout();
}, { passive: false });

function finish(result) {
  closeScreen('imgedit');
  for (const p of photos) URL.revokeObjectURL(p.url);
  photos = [];
  done(result);
}
$('ie-cancel').onclick = async () => {
  if (photos.length > 1 && !await ask('편집을 그만둘까요?\n바꾼 내용은 저장되지 않아요.')) return;
  finish(null);
};
$('ie-done').onclick = async () => {
  const btn = $('ie-done');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const items = [];
    for (let k = 0; k < photos.length; k++) {
      if (photos.length > 1) toast(`등록하는 중… ${k + 1} / ${photos.length}`);
      if (photos[k].keep) { items.push(photos[k].keep); continue; }
      ({ img, st } = photos[k]);
      clamp();
      const R = frameRatio(), out = el('canvas');
      draw(out, R >= 1 ? OUT_LONG : Math.round(OUT_LONG * R));
      items.push({
        type: 'image', blob: await canvasBlob(out, 'image/jpeg', 0.9), thumb: await thumbOf(out, out.width, out.height),
        orig: photos[k].isFile ? await shrinkOrig(img) : photos[k].src, edit: { ...st },
      });
    }
    finish(items);
  } finally {
    btn.disabled = false;
  }
};
// 원본은 다시 편집할 때 쓰려고 2048px로 줄여서 보관
function shrinkOrig(im) {
  const s = Math.min(1, ORIG_LONG / Math.max(im.naturalWidth, im.naturalHeight));
  const c = el('canvas', { width: Math.round(im.naturalWidth * s), height: Math.round(im.naturalHeight * s) });
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return canvasBlob(c, 'image/jpeg', 0.92);
}
