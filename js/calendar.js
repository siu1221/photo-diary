import { $, el, keyOf, MON, todayKey } from './util.js';
import { getRange, hasDiary } from './db.js';
import { openDay } from './day.js';
import { unlockAudio } from './music.js';
import { renderMemory } from './memory.js';

const now = new Date();
export const view = new Date(now.getFullYear(), now.getMonth(), 1);
let renderId = 0, urls = [];

const CHEER = [
  [0, '오늘부터 한 장씩 채워 볼까요?'],
  [1, '좋은 시작이에요 ✿'],
  [30, '차곡차곡 쌓이고 있어요'],
  [60, '벌써 절반을 넘었어요!'],
  [90, '거의 다 왔어요, 힘내요!'],
  [100, '한 달을 꽉 채웠어요 🎉'],
];

export async function renderCal() {
  const y = view.getFullYear(), m = view.getMonth(), id = ++renderId;
  $('mon').textContent = MON[m];
  $('yr').textContent = y;
  const last = new Date(y, m + 1, 0).getDate();
  const data = await getRange(keyOf(y, m, 1), keyOf(y, m, 31));
  if (id !== renderId) return; // 달을 빠르게 넘기면 늦게 온 옛 결과는 버림

  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const tk = todayKey(), cells = [];
  let filled = 0;
  for (let i = new Date(y, m, 1).getDay(); i > 0; i--) cells.push(el('span'));
  for (let d = 1; d <= last; d++) {
    const k = keyOf(y, m, d), e = data[k], dow = new Date(y, m, d).getDay();
    const b = el('button', { className: 'cell' }, el('span', { className: 'num', textContent: d }));
    if (dow === 0) b.classList.add('sun');
    if (dow === 6) b.classList.add('sat');
    if (k === tk) b.classList.add('today');
    if (k > tk) b.classList.add('future');
    const diary = hasDiary(e);
    if (diary) { filled++; b.classList.add('filled'); }
    const thumb = e?.media[0]?.thumb;
    if (thumb) {
      const u = URL.createObjectURL(thumb);
      urls.push(u);
      b.style.backgroundImage = `url("${u}")`;
      b.classList.add('has-photo');
    } else if (diary) b.append(el('span', { className: 'sticker', textContent: '♥' }));
    const badges = [];
    if (e?.song) badges.push('♪');
    if (e?.voices.length) badges.push('🎙');
    if (e?.plans.length) badges.push('✓');
    if (badges.length) b.append(el('span', { className: 'badges' }, ...badges.map(t => el('span', { textContent: t }))));
    b.setAttribute('aria-label', `${m + 1}월 ${d}일${diary ? ', 기록 있음' : ''}${e?.plans.length ? `, 일정 ${e.plans.length}개` : ''}`);
    b.onclick = () => { unlockAudio(); openDay(k); }; // 누른 순간 소리 잠금 해제 → 저장된 노래 자동 재생 가능
    cells.push(b);
  }
  $('grid').replaceChildren(...cells);
  fitGrid();

  const pct = Math.round(filled / last * 100);
  $('gauge-fill').style.width = pct + '%';
  $('gauge').setAttribute('aria-valuenow', pct);
  $('gauge-count').textContent = `${filled} / ${last}`;
  $('gauge-pct').textContent = pct + '%';
  $('gauge-msg').textContent = CHEER.filter(([p]) => pct >= p).pop()[1];
  renderMemory();
}

// 달력이 화면 아래까지 꽉 차도록 칸 높이 맞추기 (사진이 크게 보이게)
export function fitGrid() {
  const g = $('grid');
  if (!g.offsetParent) return; // 달력이 아직 안 보이면 나중에
  const rows = Math.ceil(g.children.length / 7), gap = 2;
  const top = g.getBoundingClientRect().top + $('cal').scrollTop + 6;
  const avail = innerHeight - top - 14 - rows * gap;
  const colW = (g.clientWidth - 4 - 6 * gap) / 7;
  g.style.gridAutoRows = Math.max(colW * 1.75, avail / rows) + 'px';
}
addEventListener('resize', fitGrid);

export function goMonth(y, m) {
  view.setFullYear(y, m, 1);
  renderCal();
}

// 달력 좌우로 밀어서 달 넘기기
let sx = null;
$('grid').addEventListener('pointerdown', e => { sx = e.clientX; });
$('grid').addEventListener('pointerup', e => {
  if (sx === null) return;
  const dx = e.clientX - sx;
  sx = null;
  if (Math.abs(dx) > 70) goMonth(view.getFullYear(), view.getMonth() + (dx < 0 ? 1 : -1));
});

// --- 연·월 고르기 창: 처음엔 1~12월, 연도를 누르면 그 해 이전 12년
let pkYear, pkAnchor, pkMode;
function drawPicker() {
  const grid = $('pk-grid');
  if (pkMode === 'month') {
    $('pk-year').textContent = `${pkYear} ▾`;
    $('pk-year').setAttribute('aria-label', `${pkYear}년. 눌러서 연도 바꾸기`);
    grid.replaceChildren(...MON.map((name, i) => {
      const b = el('button', {}, el('b', { textContent: i + 1 }), el('small', { textContent: name }));
      if (pkYear === view.getFullYear() && i === view.getMonth()) b.classList.add('on');
      b.setAttribute('aria-label', `${pkYear}년 ${i + 1}월`);
      b.onclick = () => { $('picker').close(); goMonth(pkYear, i); };
      return b;
    }));
  } else {
    $('pk-year').textContent = `${pkAnchor} ▴`;
    $('pk-year').setAttribute('aria-label', '월 고르기로 돌아가기');
    const years = Array.from({ length: 12 }, (_, i) => pkAnchor - 12 + i); // 예: 2026 → 2014~2025
    grid.replaceChildren(...years.map(yr => {
      const b = el('button', { textContent: yr });
      if (yr === view.getFullYear()) b.classList.add('on');
      b.onclick = () => { pkYear = yr; pkMode = 'month'; drawPicker(); };
      return b;
    }));
  }
}
$('ym').onclick = () => {
  pkYear = view.getFullYear();
  pkMode = 'month';
  drawPicker();
  $('picker').showModal();
};
$('pk-year').onclick = () => {
  if (pkMode === 'month') { pkAnchor = pkYear; pkMode = 'year'; } else pkMode = 'month';
  drawPicker();
};
$('pk-today').onclick = () => {
  $('picker').close();
  const n = new Date();
  goMonth(n.getFullYear(), n.getMonth());
};
