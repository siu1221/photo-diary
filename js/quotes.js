import { $, el, toast } from './util.js';
import { getMeta, setMeta } from './db.js';

import { MOODS } from './quotes-data.js';
export { MOODS };

const MINE = '내 문구';
const myQuotes = async () => (await getMeta('myQuotes')) || [];

export async function randomQuote() {
  const all = MOODS.flatMap(m => m.list.map(text => ({ text, mood: m.name })))
    .concat((await myQuotes()).map(text => ({ text, mood: MINE })));
  return all[Math.floor(Math.random() * all.length)];
}

let done, mood = 0;
export function pickQuote() {
  return new Promise(res => {
    done = res;
    drawChips();
    drawList();
    $('quotes').showModal();
    $('quotes').addEventListener('close', () => { done?.(null); done = null; }, { once: true });
  });
}

function drawChips() {
  const names = [...MOODS.map(m => `${m.icon} ${m.name}`), `✏️ ${MINE}`];
  $('mood-chips').replaceChildren(...names.map((n, i) => el('button', {
    textContent: n, className: i === mood ? 'on' : '',
    onclick: () => { mood = i; drawChips(); drawList(); },
  })));
}

async function drawList() {
  const isMine = mood === MOODS.length;
  $('myquote-form').hidden = !isMine;
  const texts = isMine ? await myQuotes() : MOODS[mood].list;
  const name = isMine ? MINE : MOODS[mood].name;
  if (!texts.length) return $('quote-list').replaceChildren(el('li', { className: 'muted small', textContent: '나에게 해 주고 싶은 말을 위에 적어 모아 보세요.' }));
  $('quote-list').replaceChildren(...texts.map((text, i) => {
    const li = el('li', {}, el('button', { className: 'q', textContent: text, onclick: () => {
      const d = done;
      done = null;
      d({ text, mood: name });
      $('quotes').close();
    } }));
    if (isMine) li.append(el('button', { className: 'x', textContent: '✕', 'aria-label': '내 문구 삭제', onclick: async () => {
      const list = await myQuotes();
      list.splice(i, 1);
      await setMeta('myQuotes', list);
      drawList();
    } }));
    return li;
  }));
}

$('myquote-form').onsubmit = async e => {
  e.preventDefault();
  const t = $('myquote').value.trim();
  if (!t) return;
  const list = await myQuotes();
  list.unshift(t);
  await setMeta('myQuotes', list);
  $('myquote').value = '';
  toast('내 문구에 담았어요');
  drawList();
};
