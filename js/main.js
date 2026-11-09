import { $, openScreen, closeScreen, toast } from './util.js';
import { migrateBlobs } from './db.js';
import { renderCal, fitGrid } from './calendar.js';
import { checkBanner } from './report.js';
import './backup.js';

$('splash-go').onclick = () => {
  closeScreen('splash');
  openScreen('cal');
  fitGrid();
};

// --- 설정: 색 테마 / 화면 모드 / 노래 자동 재생 (이 기기에만 저장)
const root = document.documentElement;
const save = (k, v) => { try { localStorage[k] = v; } catch {} };
function drawSettings() {
  for (const b of document.querySelectorAll('[data-theme-pick]')) b.classList.toggle('on', b.dataset.themePick === root.dataset.theme);
  for (const b of document.querySelectorAll('[data-mode-pick]')) b.classList.toggle('on', b.dataset.modePick === root.dataset.mode);
  $('autoplay').checked = (() => { try { return localStorage.autoplay !== '0'; } catch { return true; } })();
  const dark = root.dataset.mode === 'dark' || (root.dataset.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('themes').style.opacity = dark ? 0.4 : 1; // 다크모드에서는 색 테마가 보이지 않음
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(root).getPropertyValue('--bg').trim();
}
$('themes').onclick = e => {
  const t = e.target.dataset.themePick;
  if (t) { root.dataset.theme = t; save('theme', t); drawSettings(); }
};
$('modes').onclick = e => {
  const m = e.target.closest('[data-mode-pick]')?.dataset.modePick;
  if (m) { root.dataset.mode = m; save('mode', m); drawSettings(); }
};
$('autoplay').onchange = e => save('autoplay', e.target.checked ? '1' : '0');
$('open-menu').onclick = () => { drawSettings(); $('menu').showModal(); };
drawSettings();

migrateBlobs().then(({ broken }) => {
  if (broken) toast(`아이폰 저장 오류로 읽을 수 없게 된 사진·영상이 ${broken}개 있어요. 백업 파일이 있다면 불러와 주세요.`);
}).catch(() => {}).finally(renderCal);
checkBanner();
// 다른 앱(유튜브 등)에 다녀왔을 때 아이폰이 얼어붙은 옛 화면을 되살리면 새로 고침
addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

if (location.protocol !== 'file:') navigator.serviceWorker?.register('sw.js');
