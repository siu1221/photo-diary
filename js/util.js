export const $ = id => document.getElementById(id);
export const pad = n => String(n).padStart(2, '0');
export const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m은 0부터(1월=0)
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const todayKey = () => { const n = new Date(); return keyOf(n.getFullYear(), n.getMonth(), n.getDate()); };
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtSec = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
export const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-') || k.startsWith('data-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  e.append(...kids);
  return e;
}

export const openScreen = id => $(id).classList.add('active');
export const closeScreen = id => $(id).classList.remove('active');

let toastTimer;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export const canvasBlob = (c, type = 'image/jpeg', q = 0.9) => new Promise(r => c.toBlob(r, type, q));

// 작은 썸네일(달력 칸·리포트용)
export async function thumbOf(source, w, h, long = 360) {
  const s = Math.min(1, long / Math.max(w, h));
  const c = el('canvas', { width: Math.round(w * s), height: Math.round(h * s) });
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return canvasBlob(c, 'image/jpeg', 0.8);
}

// 이 브라우저가 녹화할 수 있는 형식 중 첫 번째
export const pickMime = list => list.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
export const canRecordCanvas = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);

export const once = (target, ev) => new Promise((ok, fail) => {
  target.addEventListener(ev, ok, { once: true });
  target.addEventListener('error', () => fail(new Error(ev + ' failed')), { once: true });
});

// 옆으로 넘기는 줄(.scroll-x): 폰은 손가락으로, PC는 마우스 끌기·휠로
for (const row of document.querySelectorAll('.scroll-x')) {
  let sx = null, start = 0, moved = false;
  row.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { sx = e.clientX; start = row.scrollLeft; moved = false; } });
  addEventListener('pointermove', e => {
    if (sx === null || row.dataset.lock) return; // lock: 그 줄이 지금 순서 바꾸기 중
    if (Math.abs(e.clientX - sx) > 5) moved = true;
    row.scrollLeft = start - (e.clientX - sx);
  });
  addEventListener('pointerup', () => { sx = null; });
  row.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true); // 끌기 끝에 버튼이 눌리지 않게
  row.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }, { passive: false });
}

// 확인창: await ask('지울까요?') → true/false
export function ask(msg) {
  return new Promise(res => {
    const d = $('ask');
    $('ask-msg').textContent = msg;
    const done = v => { if (d.open) d.close(); res(v); };
    $('ask-yes').onclick = () => done(true);
    $('ask-no').onclick = () => done(false);
    d.oncancel = e => { e.preventDefault(); done(false); };
    d.onclick = e => { if (e.target === d) done(false); };
    d.showModal();
    $('ask-yes').focus();
  });
}

// 시트(아래에서 올라오는 창) 바깥을 누르거나 × 누르면 닫기
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}

// 지금 테마의 색 (캔버스에 그릴 때 사용)
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 앱 전체가 함께 쓰는 소리 엔진 하나 (아이폰은 여러 개 만들면 잘 안 됨)
let actx;
export function audioCtx() {
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state !== 'running') actx.resume().catch(() => {}); // 기다리지 않음: 손가락 누른 순간에만 풀리는 경우가 있어서
  return actx;
}

// 아이폰에 소리 쓰는 방식 알리기 ('play-and-record' 녹음 중 / 'playback' 그냥 재생). 이 앱에만 적용되고 폰 설정은 안 바뀜
export function setSession(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* 지원 안 하면 무시 */ } }
