import { $, el, parseKey, DOW, todayKey } from './util.js';
import { getRange, hasDiary } from './db.js';
import { openDay } from './day.js';
import { unlockAudio } from './music.js';

// 달력 아래 "기억 한 장": 지난 기록 중 하나를 무작위로 (다른 기억 ↻로 다음 날)
let url, pool = [], idx = 0;

export async function renderMemory() {
  const all = await getRange();
  const tk = todayKey();
  pool = Object.keys(all).filter(k => k < tk && hasDiary(all[k]));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
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
  const k = pool[idx % pool.length], e = all[k], dt = parseKey(k);
  const when = `${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()} ${DOW[dt.getDay()]}`;
  const thumb = e.media[0]?.thumb;
  if (thumb) url = URL.createObjectURL(thumb);
  const text = e.text.trim() || (e.quote ? `“${e.quote.text}”` : e.song ? `♪ ${e.song.title}` : '그날의 사진');
  const card = el('button', { className: 'mem-card', 'aria-label': `${when} 기록 열기`, onclick: () => { unlockAudio(); openDay(k); } },
    url ? el('img', { src: url, alt: '' }) : el('div', { className: 'ph', textContent: '✎' }),
    el('div', { className: 'body' }, el('div', { className: 'ask-mem', textContent: '이 날을 기억하세요?' }), el('div', { className: 'when', textContent: when }), el('p', { className: 'txt', textContent: text })));
  const head = el('div', { className: 'mem-head' }, el('h3', { textContent: '📖 기억 한 장' }));
  if (pool.length > 1) head.append(el('button', { textContent: '다른 기억 ↻', onclick: () => { idx++; draw(all); } }));
  box.replaceChildren(head, card);
}
