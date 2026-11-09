import { $, el, toast, audioCtx } from './util.js';

// 노래 찾기: Apple의 무료 iTunes 검색(키 필요 없음, 30초 미리듣기 제공) + 유튜브 링크
// 소리는 Web Audio의 볼륨 조절기(gain)를 거쳐 나감 — 아이폰은 audio.volume을 무시해서 이 방법만 통함
const audio = new Audio();
audio.crossOrigin = 'anonymous'; // 미리듣기 서버가 허용해 줘서 볼륨 조절기에 연결 가능
let gain;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
const DEFAULT_VOL = 40;
export const lastVol = () => { try { return +(localStorage.songVol ?? DEFAULT_VOL); } catch { return DEFAULT_VOL; } };
const saveVol = v => { try { localStorage.songVol = v; } catch {} };

// 손가락으로 누른 그 순간에 불러야, 아이폰이 잠시 뒤 자동 재생을 허락해 줌
export function unlockAudio() {
  const ctx = audioCtx();
  if (!gain) {
    gain = ctx.createGain();
    ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
  }
  if (audio.paused && !want) { audio.src = SILENT; audio.play().catch(() => {}); }
}
let want = false; // 사용자가 노래를 틀어 둔 상태인지 (아이폰이 몰래 끊었을 때 되살리는 기준)
export function playSong(url, vol, loop = false) {
  unlockAudio();
  want = true;
  gain.gain.value = vol / 100;
  audio.loop = loop;
  if (audio.src === url && !audio.paused) return; // 이미 그 노래가 나오는 중이면 그대로 이어서
  pos = 0;
  audio.src = url;
  audio.play().catch(() => {});
}
export function setVolume(v) { if (gain) gain.gain.value = v / 100; }
export const stopSong = () => { want = false; holds = 0; audio.pause(); };

// 녹음·영상을 트는 동안 잠시 멈췄다가(hold) 끝나면 이어서(release)
let holds = 0, resumeAfter = false;
let pos = 0; // 멈춘 자리 (아이폰이 다시 틀 때 처음으로 되감는 경우가 있어서 기억해 둠)
audio.addEventListener('timeupdate', () => { if (audio.currentTime > 0.5) pos = audio.currentTime; });
function resume() {
  audioCtx();
  const at = pos;
  audio.play().then(() => { if (at > 1 && Math.abs(audio.currentTime - at) > 1.5) audio.currentTime = at; }).catch(() => {});
}
export function hold() {
  if (holds++ === 0) { resumeAfter = want && !audio.paused; audio.pause(); }
}
export function release() {
  if (holds === 0) return;
  if (--holds === 0 && resumeAfter && want) resume();
}
// 아이폰은 다른 소리(영상·전화·알림·화면 잠금)가 끼어들면 노래를 몰래 멈춤 → 다음 터치나 앱 복귀 때 이어서 재생
export const revive = () => {
  if (!want || holds) return;
  if (audio.paused) resume(); else audioCtx();
};
// 확인창(지울까요?)이 뜨면 아이폰이 노래를 끊음 → 창이 닫히면 이어서
export const ask = msg => { const r = confirm(msg); revive(); return r; };
document.addEventListener('pointerdown', e => { if (!e.target.closest('.play')) revive(); }, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) revive(); });
audio.addEventListener('ended', () => { if (!audio.loop) want = false; });

// 화면의 ▶/❚❚ 버튼을 실제 재생 상태에 맞추기
const sync = () => {
  for (const b of document.querySelectorAll('.play[data-url]')) b.textContent = !audio.paused && audio.src === b.dataset.url ? '❚❚' : '▶';
};
audio.addEventListener('play', sync);
audio.addEventListener('pause', sync);
audio.addEventListener('ended', sync);

function playBtn(url, getVol, loop) {
  // 처음 표시도 지금 재생 상태대로 (이미 나오고 있는 노래면 ❚❚)
  const b = el('button', { className: 'play', textContent: !audio.paused && audio.src === url ? '❚❚' : '▶', 'aria-label': '미리듣기', 'data-url': url });
  b.onclick = e => {
    e.stopPropagation();
    if (audio.src === url && !audio.paused) { want = false; return audio.pause(); }
    playSong(url, getVol(), loop);
  };
  return b;
}

// 노래 카드. onRemove가 있으면(=일기 안) 빼기 버튼과 볼륨 막대도 보여 줌
export function songCard(s, onRemove, onChange) {
  const vol = () => s.vol ?? lastVol();
  const row = el('div', { className: 'song' },
    el('img', { src: s.art, alt: '', loading: 'lazy' }),
    el('div', { className: 'meta' }, el('div', { className: 't', textContent: s.title }), el('div', { className: 'a', textContent: s.artist })));
  const box = el('div', {}, row);
  if (s.kind === 'itunes' && s.preview) row.append(playBtn(s.preview, onRemove ? vol : lastVol, !!onRemove));
  if (s.kind === 'youtube') {
    const b = el('button', { className: 'play', textContent: '▶', 'aria-label': '유튜브로 듣기' });
    b.onclick = () => {
      b.remove();
      box.append(el('iframe', {
        className: 'yt-frame', title: s.title, allow: 'autoplay; encrypted-media',
        src: `https://www.youtube-nocookie.com/embed/${s.id}?autoplay=1&playsinline=1`,
      }));
    };
    row.append(b);
  }
  if (onRemove) {
    row.append(el('button', { className: 'x', textContent: '✕', 'aria-label': '노래 빼기', onclick: () => { stopSong(); onRemove(); } }));
    if (s.kind === 'itunes') {
      box.append(el('label', { className: 'slider song-vol' }, '🔈 소리',
        el('input', { type: 'range', min: 0, max: 100, value: vol(), 'aria-label': '노래 소리 크기', oninput: e => {
          s.vol = +e.target.value;
          setVolume(s.vol);
          onChange?.();
        } }), '🔊'));
    } else box.append(el('p', { className: 'small muted', textContent: '유튜브 노래는 휴대폰 볼륨 버튼으로 조절해 주세요.' }));
  }
  sync();
  return box;
}

let done;
export function pickSong() {
  return new Promise(res => {
    done = res;
    $('song-results').replaceChildren();
    $('song-q').value = '';
    $('yt-url').value = '';
    $('song-vol').value = lastVol();
    $('songs').showModal();
    // 창 닫힘 알림은 조금 늦게 와서, 그사이 튼 노래를 끄지 않도록 '고르지 않고 닫았을 때'만 처리
    $('songs').addEventListener('close', () => { if (!done) return; stopSong(); done(null); done = null; }, { once: true });
  });
}
function choose(song) {
  const d = done;
  done = null;
  // 미리듣기로 듣던 그 노래를 고르면 끊지 않고 계속(반복) 재생, 아니면 끄기
  if (song.preview && audio.src === song.preview && !audio.paused) { audio.loop = true; want = true; } else stopSong();
  d({ ...song, vol: lastVol() });
  $('songs').close();
}
$('song-vol').oninput = e => { saveVol(+e.target.value); setVolume(+e.target.value); };

$('song-form').onsubmit = async e => {
  e.preventDefault();
  const q = $('song-q').value.trim();
  if (!q) return;
  const list = $('song-results');
  list.replaceChildren(el('li', { className: 'muted', textContent: '찾는 중…' }));
  try {
    const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'song', limit: '25' }) /* media=music을 넣으면 아이폰에서 음악 앱으로 튕겨서 실패함 */}`);
    const { results } = await r.json();
    if (!results.length) return list.replaceChildren(el('li', { className: 'muted', textContent: '검색 결과가 없어요. 영어 제목으로도 찾아보세요.' }));
    list.replaceChildren(...results.map(t => {
      const song = {
        kind: 'itunes', title: t.trackName, artist: t.artistName,
        art: (t.artworkUrl100 || '').replace('100x100', '300x300'), preview: t.previewUrl || '',
      };
      const li = el('li', {}, songCard(song));
      const row = li.querySelector('.song');
      row.onclick = () => choose(song);
      row.setAttribute('aria-label', `${song.title} - ${song.artist} 고르기`);
      return li;
    }));
  } catch {
    list.replaceChildren(el('li', { className: 'muted', textContent: '인터넷 연결을 확인해 주세요.' }));
  }
};

// 유튜브에서 찾기: 아이폰에 유튜브 앱이 있으면 앱으로, 없으면 Safari로 열림
// 일반 링크(a)로 열기: 아이폰 홈 화면 앱에서 window.open으로 나갔다 오면 화면이 멈추는 문제가 있어서
const ytHref = () => { const q = $('song-q').value.trim(); return q ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` : 'https://www.youtube.com/'; };
$('yt-search').addEventListener('pointerdown', () => { $('yt-search').href = ytHref(); });
$('yt-search').addEventListener('focus', () => { $('yt-search').href = ytHref(); });
// 유튜브에서 '공유 → 링크 복사' 하고 돌아와서 한 번에 넣기
$('yt-paste').onclick = async () => {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { return toast('붙여넣기가 막혀 있어요. 아래 칸에 길게 눌러 붙여넣어 주세요'); }
  if (!youtubeId(text)) return toast('복사한 내용이 유튜브 링크가 아니에요');
  $('yt-url').value = text;
  $('yt-form').requestSubmit();
};

export const youtubeId = url => (url.match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/)([\w-]{11})/) || [])[1] || null;
$('yt-form').onsubmit = async e => {
  e.preventDefault();
  const id = youtubeId($('yt-url').value);
  if (!id) return toast('유튜브 링크가 맞는지 확인해 주세요');
  let title = '유튜브 노래', artist = 'YouTube';
  try {
    const o = await (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://youtu.be/' + id)}`)).json();
    title = o.title || title;
    artist = o.author_name || artist;
  } catch { /* 제목 없이도 넣기 */ }
  choose({ kind: 'youtube', id, title, artist, art: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
};

console.assert(youtubeId('https://youtu.be/dQw4w9WgXcQ?si=x') === 'dQw4w9WgXcQ' && youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3') === 'dQw4w9WgXcQ' && !youtubeId('hello'), 'youtubeId');
