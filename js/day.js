import { $, el, DOW, parseKey, fmtSec, toast, openScreen, closeScreen } from './util.js';
import { getDay, putDay, delDay, emptyDay, hasAny } from './db.js';
import { renderCal } from './calendar.js';
import { editImage } from './image-editor.js';
import { editVideo } from './video-editor.js';
import { recordVoice } from './recorder.js';
import { pickSong, songCard, stopSong, playSong, lastVol, hold, release } from './music.js';
import { pickQuote, randomQuote } from './quotes.js';

const MAX_MEDIA = 10;
let key, day, existed, dirty, urls = [];
const player = new Audio(); // 음성 메모 재생용 하나
const touch = () => { dirty = true; };
const blobUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };

export async function openDay(k) {
  key = k;
  const saved = await getDay(k);
  existed = !!saved;
  day = saved || emptyDay();
  dirty = false;
  const d = parseKey(k);
  $('day-title').innerHTML = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} <b>${DOW[d.getDay()]}</b>`;
  $('diary').value = day.text;
  $('day-delete').hidden = !existed;
  renderAll();
  openScreen('day');
  $('day').querySelector('.scroll').scrollTop = 0;
  autoGrow();
  // 다 쓴 일기를 다시 열면 그날 노래가 배경음악처럼 (설정에서 끌 수 있음)
  const s = day.song;
  if (existed && s?.kind === 'itunes' && s.preview && autoplayOn()) playSong(s.preview, s.vol ?? lastVol(), true);
}
export const autoplayOn = () => { try { return localStorage.autoplay !== '0'; } catch { return true; } };

function closeDay() {
  player.pause();
  stopSong();
  closeScreen('day');
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $('media-track').replaceChildren(); // 재생 중인 영상 멈추기
  $('song-view').replaceChildren();
}

function renderAll() { renderMedia(); renderSong(); renderVoices(); renderPlans(); renderQuote(); }

// --- 사진·영상 (인스타 게시물처럼 옆으로 넘기기)
function renderMedia(focus = 0) { // focus: 다 그린 뒤 보여 줄 칸 (방금 올리거나 고친 사진)
  const track = $('media-track');
  if (!day.media.length) {
    track.replaceChildren(el('label', { className: 'media-empty' },
      '오늘을 담은 사진이나 영상을 올려 보세요\n(여러 장, 최대 10개 · 영상은 1분까지)',
      el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onchange: onPick })));
    track.firstChild.style.whiteSpace = 'pre-line';
  } else {
    track.replaceChildren(...day.media.map((m, i) => {
      const view = m.type === 'video'
        ? songAware(el('video', { src: blobUrl(m.blob), poster: blobUrl(m.thumb), controls: true, playsInline: true, preload: 'metadata' }))
        : el('img', { src: blobUrl(m.blob), alt: `${i + 1}번째 사진` });
      const tools = el('div', { className: 'tools' });
      if (i > 0) tools.append(el('button', { textContent: '◀', 'aria-label': '앞으로 옮기기 (첫 번째가 달력 표지)', onclick: () => move(i) }));
      tools.append(
        el('button', { textContent: '✎', 'aria-label': '편집', onclick: () => reEdit(i) }),
        el('button', { textContent: '✕', 'aria-label': '삭제', onclick: () => removeMedia(i) }));
      return el('div', { className: 'media-item' }, view, tools);
    }));
  }
  $('media-count').textContent = day.media.length ? `${day.media.length} / ${MAX_MEDIA}` : '';
  $('media-track').scrollLeft = focus * $('media-track').clientWidth;
  drawDots();
  drawArrows();
}
function drawDots() {
  const n = day.media.length, track = $('media-track');
  const at = Math.round(track.scrollLeft / (track.clientWidth || 1));
  $('media-dots').replaceChildren(...(n > 1 ? day.media.map((_, i) => el('i', { className: i === at ? 'on' : '' })) : []));
}
$('media-track').addEventListener('scroll', () => { drawDots(); drawArrows(); pauseHidden(); }, { passive: true });

// 옆으로 넘기면 화면에서 벗어난 영상은 멈춤
function pauseHidden() {
  const t = $('media-track'), at = Math.round(t.scrollLeft / (t.clientWidth || 1));
  [...t.children].forEach((item, i) => { const v = item.querySelector('video'); if (v && i !== at && !v.paused) v.pause(); });
}
// 영상·음성 메모를 트는 동안 배경 노래는 잠시 멈췄다가, 끝나면 이어서
function songAware(media) {
  let held = false;
  media.addEventListener('play', () => { if (!held) { held = true; hold(); } });
  const off = () => { if (held) { held = false; release(); } };
  media.addEventListener('pause', off);
  media.addEventListener('ended', off);
  media.addEventListener('emptied', off);
  return media;
}
songAware(player);

// 여러 장일 때: 반투명 화살표 + PC에서는 마우스로 끌어서 넘기기 (폰은 손가락으로 밀면 넘어감)
function drawArrows() {
  const t = $('media-track'), at = Math.round(t.scrollLeft / (t.clientWidth || 1));
  $('media-prev').hidden = day.media.length < 2 || at <= 0;
  $('media-next').hidden = day.media.length < 2 || at >= day.media.length - 1;
}
const slide = dir => { const t = $('media-track'); t.scrollBy({ left: dir * t.clientWidth, behavior: 'smooth' }); };
$('media-prev').onclick = () => slide(-1);
$('media-next').onclick = () => slide(1);
{
  const t = $('media-track');
  let sx = null;
  t.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && !e.target.closest('button, video')) sx = e.clientX; });
  addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) slide(dx < 0 ? 1 : -1);
  });
  t.addEventListener('dragstart', e => e.preventDefault()); // 사진이 끌려 나가지 않게
}

const withHold = async fn => { hold(); try { return await fn(); } finally { release(); } };

async function onPick(e) {
  const files = [...e.target.files];
  e.target.value = '';
  for (const f of files) {
    if (day.media.length >= MAX_MEDIA) { toast(`사진·영상은 하루에 ${MAX_MEDIA}개까지예요`); break; }
    const item = f.type.startsWith('video/') ? await withHold(() => editVideo(f)) : await editImage(f);
    if (item) { day.media.push(item); touch(); renderMedia(day.media.length - 1); }
  }
}
$('media-input').onchange = onPick;

async function reEdit(i) {
  const m = day.media[i];
  const item = m.type === 'video' ? await withHold(() => editVideo(m.blob)) : await editImage(m.blob);
  if (item) { day.media[i] = item; touch(); }
  renderMedia(i);
}
function move(i) {
  [day.media[i - 1], day.media[i]] = [day.media[i], day.media[i - 1]];
  touch(); renderMedia(i - 1);
}
function removeMedia(i) {
  if (!confirm('이 사진(영상)을 뺄까요?')) return;
  day.media.splice(i, 1);
  touch(); renderMedia(Math.max(0, Math.min(i, day.media.length - 1)));
}

// --- 노래
function renderSong() {
  $('song-view').replaceChildren(day.song
    ? songCard(day.song, () => { day.song = null; touch(); renderSong(); }, touch)
    : el('button', { className: 'add-song', textContent: '＋ 오늘 하루와 어울리는 노래 고르기', onclick: chooseSong }));
}
async function chooseSong() {
  const s = await pickSong();
  if (s) { day.song = s; touch(); renderSong(); }
}

// --- 일기 + 음성 메모
function autoGrow() {
  const t = $('diary');
  t.style.height = 'auto';
  t.style.height = Math.max(224, t.scrollHeight) + 'px';
}
$('diary').addEventListener('input', () => { touch(); autoGrow(); });
$('open-rec').onclick = async () => {
  hold(); // 녹음하는 동안 노래 잠시 멈춤
  const v = await recordVoice();
  release();
  if (v) { day.voices.push(v); touch(); renderVoices(); }
};
function renderVoices() {
  $('voice-list').replaceChildren(...day.voices.map((v, i) => {
    const bars = el('span', { className: 'bars' });
    const btn = el('button', { className: 'play', textContent: '▶', 'aria-label': `음성 ${i + 1} 재생` });
    btn.onclick = () => {
      if (player.dataset.i === String(i) && !player.paused) { player.pause(); return; }
      player.src = blobUrl(v.blob);
      player.dataset.i = i;
      player.play();
      for (const b of $('voice-list').querySelectorAll('.play')) b.textContent = '▶';
      btn.textContent = '❚❚';
      player.ontimeupdate = () => bars.style.setProperty('--p', (player.currentTime / v.dur * 100) + '%');
      player.onpause = player.onended = () => { btn.textContent = '▶'; };
    };
    return el('li', {}, btn, bars, el('span', { className: 'small', textContent: fmtSec(v.dur) }),
      el('button', { className: 'x', textContent: '✕', 'aria-label': '음성 삭제', onclick: () => {
        if (!confirm('이 음성을 지울까요?')) return;
        player.pause(); day.voices.splice(i, 1); touch(); renderVoices();
      } }));
  }));
}

// --- 일정
function renderPlans() {
  day.plans.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  $('plan-list').replaceChildren(...day.plans.map((p, i) => {
    const li = el('li', { className: p.done ? 'done' : '' },
      el('input', { type: 'checkbox', checked: p.done, 'aria-label': '완료', onchange: e => { p.done = e.target.checked; touch(); renderPlans(); } }),
      el('span', { className: 'time', textContent: p.time }),
      el('span', { className: 'txt', textContent: p.text }),
      el('button', { className: 'x', textContent: '✕', 'aria-label': '일정 삭제', onclick: () => { day.plans.splice(i, 1); touch(); renderPlans(); } }));
    return li;
  }));
}
$('plan-form').onsubmit = e => {
  e.preventDefault();
  const text = $('plan-text').value.trim();
  if (!text) return;
  day.plans.push({ time: $('plan-time').value, text, done: false });
  $('plan-text').value = '';
  $('plan-time').value = '';
  touch(); renderPlans();
};

// --- 오늘의 한 마디
function renderQuote(pop) {
  const q = day.quote;
  $('quote-view').replaceChildren(q
    ? el('figure', { className: 'quote-show' + (pop ? ' pop' : '') }, `“${q.text}”`, el('small', { textContent: q.mood }),
      el('button', { className: 'x', textContent: '✕', 'aria-label': '문구 빼기', onclick: () => { day.quote = null; touch(); renderQuote(); } }))
    : el('p', { className: 'muted small', textContent: '하루를 마무리하며 듣고 싶은 말을 골라 담아요.' }));
}
$('quote-random').onclick = async () => { day.quote = await randomQuote(); touch(); renderQuote(true); };
$('quote-pick').onclick = async () => {
  const q = await pickQuote();
  if (q) { day.quote = q; touch(); renderQuote(true); }
};

// --- 저장 / 나가기 / 지우기
$('day-save').onclick = async () => {
  day.text = $('diary').value;
  try {
    if (!hasAny(day)) { if (existed) await delDay(key); }
    else {
      const t = new Date().toISOString();
      day.writtenAt ||= t; // 리포트의 "주로 쓰는 시간대"는 처음 쓴 시각 기준
      day.updatedAt = t;
      await putDay(key, day);
    }
  } catch {
    return toast('저장하지 못했어요. 기기 저장 공간을 확인해 주세요.');
  }
  closeDay();
  renderCal();
  toast(hasAny(day) ? '오늘도 수고했어요 ♡' : '비어 있어서 저장하지 않았어요');
};
$('day-back').onclick = () => {
  if (dirty && !confirm('저장하지 않고 나갈까요?')) return;
  closeDay();
};
$('day-delete').onclick = async () => {
  if (!confirm('이 날의 사진, 글, 음성, 일정을 모두 지울까요?')) return;
  await delDay(key);
  closeDay();
  renderCal();
  toast('지웠어요');
};
