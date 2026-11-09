import { $, el, parseKey, keyOf, DOW, todayKey } from './util.js';
import { getRange, hasDiary } from './db.js';
import { openDay } from './day.js';
import { unlockAudio } from './music.js';

// 달력 아래 "기억 한 장": 1년 전 오늘 → 한 달 전 오늘 → 어제 → 지난 기록 중 하나 순서로 보여 줌
let url, pool = [], idx = 0;

export async function renderMemory() {
  const all = await getRange();
  const tk = todayKey();
  pool = Object.keys(all).filter(k => k < tk && hasDiary(all[k]));
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
  const ago = (dy, dm, dd) => { // 2월 30일처럼 없는 날은 건너뜀
    const t = new Date(y + dy, m + dm, d + dd);
    return dd || t.getDate() === d ? keyOf(t.getFullYear(), t.getMonth(), t.getDate()) : null;
  };
  const special = [[ago(-1, 0, 0), '1년 전 오늘'], [ago(0, -1, 0), '한 달 전 오늘'], [ago(0, 0, -1), '어제']]
    .filter(([k]) => k && pool.includes(k));
  // 특별한 날을 앞에, 나머지는 섞어서 뒤에
  const rest = pool.filter(k => !special.some(([s]) => s === k)).sort(() => Math.random() - 0.5);
  pool = [...special.map(([k, label]) => ({ k, label })), ...rest.map(k => ({ k, label: null }))];
  idx = 0;
  draw(all);
}

function draw(all) {
  if (url) URL.revokeObjectURL(url);
  url = null;
  const box = $('memory');
  if (!pool.length) {
    box.replaceChildren(el('div', { className: 'mem-head' }, el('h3', { textContent: '📖 기억 한 장' })),
      el('div', { className: 'mem-card' }, el('div', { className: 'ph', textContent: '♡' }),
        el('div', { className: 'body' }, el('p', { className: 'txt muted', textContent: '오늘을 기록해 두면, 힘든 날 여기서 다시 만나 위로가 되어 줄 거예요.' }))));
    return;
  }
  const { k, label } = pool[idx % pool.length], e = all[k], dt = parseKey(k);
  const when = `${label ? label + ' · ' : ''}${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()} ${DOW[dt.getDay()]}`;
  const thumb = e.media[0]?.thumb;
  if (thumb) url = URL.createObjectURL(thumb);
  const text = e.text.trim() || (e.quote ? `“${e.quote.text}”` : e.song ? `♪ ${e.song.title}` : '그날의 사진');
  const card = el('button', { className: 'mem-card', 'aria-label': `${when} 기록 열기`, onclick: () => { unlockAudio(); openDay(k); } },
    url ? el('img', { src: url, alt: '' }) : el('div', { className: 'ph', textContent: '✎' }),
    el('div', { className: 'body' }, el('div', { className: 'when', textContent: when }), el('p', { className: 'txt', textContent: text })));
  const head = el('div', { className: 'mem-head' }, el('h3', { textContent: '📖 기억 한 장' }));
  if (pool.length > 1) head.append(el('button', { textContent: '다른 기억 ↻', onclick: () => { idx++; draw(all); } }));
  box.replaceChildren(head, card);
}
