import { $, el, DOW, parseKey, fmtSec, toast, openScreen, closeScreen } from './util.js';
import { getDay, putDay, delDay, emptyDay, hasAny } from './db.js';
import { renderCal } from './calendar.js';
import { editImages } from './image-editor.js';
import { editVideo } from './video-editor.js';
import { recordVoice } from './recorder.js';
import { pickSong, songCard, stopSong, playSong, lastVol, hold, release, ask } from './music.js';
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
  // 유튜브는 바로 틀어 보기만 시도 (아이폰이 소리 있는 자동 재생을 막으면 재생 버튼이 보이는 상태로 대기)
  if (existed && s?.kind === 'youtube' && autoplayOn()) $('song-view').querySelector('.yt-start')?.click();
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
  track.style.removeProperty('--ar'); // 첫 칸 사진 비율로 다시 맞춤 (기본 4:5)
  if (!day.media.length) {
    track.replaceChildren(el('label', { className: 'media-empty' },
      '오늘을 담은 사진이나 영상을 올려 보세요\n(여러 장, 최대 10개 · 영상은 1분까지)',
      el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onchange: onPick })));
    track.firstChild.style.whiteSpace = 'pre-line';
  } else {
    track.replaceChildren(...day.media.map((m, i) => {
      // 칸 비율과 안 맞는 사진은 검은 띠 대신 같은 사진을 흐리게 깔아 채움
      const item = el('div', { className: 'media-item' }, el('img', { className: 'bg', src: blobUrl(m.thumb), alt: '' }));
      const fit = (w, h) => { if (i === 0 && w && h) track.style.setProperty('--ar', Math.min(1.91, Math.max(0.75, w / h))); };
      if (m.type === 'video') {
        const v = songAware(el('video', { src: blobUrl(m.blob), poster: blobUrl(m.thumb), controls: true, playsInline: true, preload: 'metadata' }));
        v.onloadedmetadata = () => fit(v.videoWidth, v.videoHeight);
        // 칸을 꽉 채우느라 잘리는 위아래 중 어디를 보일지 (0 = 맨 위, 100 = 맨 아래)
        const show = () => { v.style.objectPosition = `50% ${m.pos ?? 50}%`; };
        const pos = el('input', { type: 'range', className: 'pos', min: 0, max: 100, value: m.pos ?? 50, hidden: true, 'aria-label': '영상에서 보일 위치 (위·아래)',
          oninput: () => { m.pos = +pos.value; show(); touch(); }, onpointerdown: e => e.stopPropagation() });
        show();
        item.append(v, pos);
        item.togglePos = () => { pos.hidden = !pos.hidden; };
      } else {
        const img = el('img', { src: blobUrl(m.blob), alt: `${i + 1}번째 사진`, decoding: 'async' });
        img.onload = () => fit(img.naturalWidth, img.naturalHeight);
        item.append(img);
      }
      item.append(el('div', { className: 'tools' },
        ...(item.togglePos ? [el('button', { textContent: '↕', 'aria-label': '보일 위치 조절', onclick: item.togglePos })] : []),
        el('button', { textContent: '✎', 'aria-label': '편집', onclick: () => reEdit(i) }),
        el('button', { textContent: '✕', 'aria-label': '삭제', onclick: () => removeMedia(i) })));
      return item;
    }));
  }
  $('media-count').textContent = day.media.length ? `${day.media.length} / ${MAX_MEDIA}` : '';
  $('media-track').scrollLeft = focus * $('media-track').clientWidth;
  shown = focus;
  drawDots();
  drawArrows();
}
function drawDots() {
  const n = day.media.length, track = $('media-track');
  const at = Math.round(track.scrollLeft / (track.clientWidth || 1));
  $('media-dots').replaceChildren(...(n > 1 ? day.media.map((_, i) => el('i', { className: i === at ? 'on' : '' })) : []));
}
// 넘기는 동안은 아무것도 하지 않고, 보이는 칸이 바뀔 때만 점·화살표 갱신 (버벅임 방지)
let shown = -1, ticking = false;
$('media-track').addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const t = $('media-track'), at = Math.round(t.scrollLeft / (t.clientWidth || 1));
    if (at === shown) return;
    shown = at;
    [...$('media-dots').children].forEach((d, i) => d.classList.toggle('on', i === at));
    drawArrows();
    pauseHidden();
  });
}, { passive: true });

// 옆으로 넘기면 화면에서 벗어난 영상은 멈춤
function pauseHidden() {
  const t = $('media-track'), at = Math.round(t.scrollLeft / (t.clientWidth || 1));
  [...t.children].forEach((item, i) => { const v = item.querySelector('video'); if (v && i !== at && !v.paused) v.pause(); });
}
// 영상·음성 메모를 트는 동안 배경 노래는 잠시 멈췄다가, 끝나면 이어서
function songAware(media) {
  let held = false;
  media.addEventListener('play', () => {
    if (!held) { held = true; hold(); }
    // 영상·음성 메모도 나중에 튼 것 하나만 나오게
    [player, ...$('media-track').querySelectorAll('video')].forEach(x => { if (x !== media && !x.paused) x.pause(); });
  });
  const off = () => { if (held) { held = false; release(); } };
  media.addEventListener('pause', off);
  media.addEventListener('ended', off);
  media.addEventListener('emptied', off);
  media.songOff = off; // 멈춤 버튼을 누른 그 순간에 바로 부르려고
  return media;
}
songAware(player);
// 노래를 새로 틀면 나오던 영상·음성 메모는 멈춤
addEventListener('songstart', () => { player.pause(); $('media-track').querySelectorAll('video').forEach(v => v.pause()); });

// 화면 왼쪽 끝에서 오른쪽으로 밀면 뒤로 (아이폰 홈 화면 앱에는 기본 '밀어서 뒤로'가 없음)
{
  const s = $('day');
  let x0 = null, dx = 0;
  s.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = e.touches.length === 1 && t.clientX < 30 ? t.clientX : null; dx = 0; }, { passive: true });
  s.addEventListener('touchmove', e => {
    if (x0 === null) return;
    dx = Math.max(0, e.touches[0].clientX - x0);
    s.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  const slideTo = (x, then) => {
    s.style.transition = 'transform .28s cubic-bezier(.2, .8, .2, 1)';
    s.style.transform = x ? `translateX(${x}px)` : '';
    setTimeout(() => { s.style.transition = ''; then?.(); }, 280);
  };
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    if (dx <= 80) return slideTo(0);
    // 저장 안 한 게 없으면 끝까지 밀려 나가며 닫힘, 있으면 제자리로 돌아와 확인창
    if (!dirty) slideTo(innerWidth, () => { closeDay(); s.style.transform = ''; });
    else slideTo(0, () => $('day-back').click());
  };
  s.addEventListener('touchend', end);
  s.addEventListener('touchcancel', end);
}

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
  const room = MAX_MEDIA - day.media.length;
  if (files.length > room) toast(`사진·영상은 하루에 ${MAX_MEDIA}개까지라 ${room}개만 올릴게요`);
  const pick = files.slice(0, room);
  // 사진은 한꺼번에 편집, 영상은 하나씩 자르기. 올라가는 순서는 처음 고른 순서 그대로
  // (사진끼리는 편집 화면에서 바꾼 순서가 그 사진 자리들에 차례로 들어감)
  const isVid = f => f.type.startsWith('video/');
  const images = pick.filter(f => !isVid(f));
  const edited = images.length ? (await editImages(images.map(src => ({ src })))) || [] : [];
  const slots = [];
  for (const f of pick) {
    if (!isVid(f)) { if (edited.length) slots.push(edited.shift()); continue; }
    const item = await withHold(() => editVideo(f));
    if (item) slots.push(item);
  }
  if (slots.length) { day.media.push(...slots); touch(); renderMedia(day.media.length - slots.length); }
}
$('media-input').onchange = onPick;

async function reEdit(i) {
  // 그날 사진·영상 전부를 한 편집 화면에 띄움 → 아래 줄에서 꾹 눌러 순서 바꾸기, 영상 칸에선 영상 자르기
  const items = await editImages(day.media.map(x => (x.type === 'video' ? { src: x.thumb, keep: x } : { src: x.orig || x.blob, edit: x.orig && x.edit })), i,
    blob => withHold(() => editVideo(blob)));
  if (items?.length === day.media.length) { day.media = items; touch(); }
  else if (items) toast('열 수 없는 사진이 있어서 바꾸지 않았어요');
  renderMedia(i);
}
async function removeMedia(i) {
  if (!await ask('이 사진(영상)을 뺄까요?')) return;
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
// 글 높이는 숨은 복사본으로 잼: 칸을 'auto'로 줄였다 늘리면 화면이 위로 튀어서
const meas = Object.assign($('diary').cloneNode(), { id: 'diary-m', tabIndex: -1, placeholder: '' });
meas.setAttribute('aria-hidden', 'true');
$('diary').after(meas);
const textH = s => { meas.style.width = $('diary').offsetWidth + 'px'; meas.value = s; return meas.scrollHeight; };
function autoGrow() {
  const t = $('diary');
  t.style.height = Math.max(224, textH(t.value)) + 'px';
}
// 아이폰은 칸이 길어질 때 쓰는 줄을 키보드·윗줄 밑에 둔 채로 둬서, 직접 보이는 곳까지 굴림
function showCaret() {
  const t = $('diary');
  if (document.activeElement !== t) return;
  const box = t.closest('.scroll'), r = box.getBoundingClientRect(), vv = window.visualViewport;
  const y = t.getBoundingClientRect().top + textH(t.value.slice(0, t.selectionEnd)); // 쓰는 줄의 아래끝
  const top = Math.max(r.top, vv ? vv.offsetTop : 0) + 8, bottom = Math.min(r.bottom, vv ? vv.offsetTop + vv.height : innerHeight) - 24;
  if (y > bottom) box.scrollTop += y - bottom;
  else if (y - 32 < top) box.scrollTop -= top - (y - 32);
}
$('diary').addEventListener('input', () => { touch(); autoGrow(); requestAnimationFrame(showCaret); });
window.visualViewport?.addEventListener('resize', () => setTimeout(showCaret, 50)); // 키보드가 올라온 뒤
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
      if (player.dataset.i === String(i) && !player.paused) { player.pause(); player.songOff(); return; }
      player.src = blobUrl(v.blob);
      player.dataset.i = i;
      player.play().catch(() => {}); // 다른 소리 때문에 중간에 끊겨도 오류 창 안 띄움
      for (const b of $('voice-list').querySelectorAll('.play')) b.textContent = '▶';
      btn.textContent = '❚❚';
      player.ontimeupdate = () => bars.style.setProperty('--p', (player.currentTime / v.dur * 100) + '%');
      player.onpause = player.onended = () => { btn.textContent = '▶'; };
    };
    return el('li', {}, btn, bars, el('span', { className: 'small', textContent: fmtSec(v.dur) }),
      el('button', { className: 'x', textContent: '✕', 'aria-label': '음성 삭제', onclick: async () => {
        if (!await ask('이 음성을 지울까요?')) return;
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
  const first = !day.writtenAt; // 처음 저장할 때만 "수고했어요"
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
  toast(!hasAny(day) ? '비어 있어서 저장하지 않았어요' : first ? '오늘도 수고했어요 ♡' : '저장되었어요');
};
$('day-back').onclick = async () => {
  if (dirty && !await ask('저장하지 않고 나갈까요?')) return;
  closeDay();
};
$('day-delete').onclick = async () => {
  if (!await ask('이 날의 사진, 글, 음성, 일정을 모두 지울까요?')) return;
  await delDay(key);
  closeDay();
  renderCal();
  toast('지웠어요');
};
