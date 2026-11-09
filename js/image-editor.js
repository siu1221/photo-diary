import { $, el, toast, openScreen, closeScreen, canvasBlob, thumbOf } from './util.js';

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

let img, imgUrl, st, done;
const cv = $('ie-canvas');

export function editImage(blob) {
  return new Promise(async res => {
    imgUrl = URL.createObjectURL(blob);
    img = new Image();
    img.src = imgUrl;
    try { await img.decode(); } catch {
      URL.revokeObjectURL(imgUrl);
      toast('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.');
      return res(null);
    }
    done = res;
    st = blank();
    syncUI();
    document.querySelector('#imgedit [data-tab="crop"]').click(); // 항상 자르기 탭(격자)부터
    openScreen('imgedit');
    requestAnimationFrame(layout);
  });
}

// 회전까지 반영한 사진 크기와 자르는 틀의 비율
const dims = () => (st.rot % 180 ? [img.naturalHeight, img.naturalWidth] : [img.naturalWidth, img.naturalHeight]);
const frameRatio = () => { const [rw, rh] = dims(); return RATIOS[st.ratio] ?? rw / rh; };

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
function drawGrid(c, dpr) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.save();
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
    const stage = $('ie-stage'), R = frameRatio();
    const cssW = Math.min(stage.clientWidth - 20, (stage.clientHeight - 20) * R);
    const dpr = Math.min(2, devicePixelRatio || 1);
    draw(cv, Math.max(50, Math.round(cssW * dpr)));
    if (tab === 'crop') drawGrid(cv, dpr);
    cv.style.width = cssW + 'px';
  });
}
addEventListener('resize', () => { if ($('imgedit').classList.contains('active')) layout(); });

function syncUI() {
  for (const b of $('ie-ratios').children) b.classList.toggle('on', b.dataset.ratio === st.ratio);
  for (const i of document.querySelectorAll('#imgedit [data-k]')) i.value = st[i.dataset.k];
  $('ie-zoom').value = st.zoom;
  [...$('ie-filters').children].forEach((b, i) => b.classList.toggle('on', i === st.filter));
}

// --- 조작
$('ie-filters').append(...FILTERS.map((f, i) => el('button', { textContent: f.name, onclick: () => { st.filter = i; syncUI(); layout(); } })));
$('ie-ratios').onclick = e => {
  const r = e.target.dataset.ratio;
  if (!r) return;
  Object.assign(st, { ratio: r, zoom: 1, ox: 0, oy: 0 });
  syncUI(); layout();
};
$('ie-zoom').oninput = e => { st.zoom = +e.target.value; layout(); };
for (const i of document.querySelectorAll('#imgedit [data-k]')) i.oninput = () => { st[i.dataset.k] = +i.value; layout(); };
$('ie-rotate').onclick = () => { Object.assign(st, { rot: (st.rot + 270) % 360, zoom: 1, ox: 0, oy: 0 }); syncUI(); layout(); };
$('ie-flip').onclick = () => { st.flip = !st.flip; layout(); };
$('ie-reset').onclick = () => { st = blank(); syncUI(); layout(); };
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
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
cv.addEventListener('pointermove', e => {
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
const up = e => { ptrs.delete(e.pointerId); pinch = 0; };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  st.zoom = Math.min(5, Math.max(1, st.zoom * Math.exp(-e.deltaY * 0.001)));
  $('ie-zoom').value = st.zoom;
  layout();
}, { passive: false });

function finish(result) {
  closeScreen('imgedit');
  URL.revokeObjectURL(imgUrl);
  done(result);
}
$('ie-cancel').onclick = () => finish(null);
$('ie-done').onclick = async () => {
  const R = frameRatio(), out = el('canvas');
  draw(out, R >= 1 ? OUT_LONG : Math.round(OUT_LONG * R));
  const blob = await canvasBlob(out, 'image/jpeg', 0.9);
  finish({ type: 'image', blob, thumb: await thumbOf(out, out.width, out.height) });
};
