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
  if (audio.paused) { audio.src = SILENT; audio.play().catch(() => {}); }
}
export function playSong(url, vol, loop = false) {
  unlockAudio();
  gain.gain.value = vol / 100;
  audio.loop = loop;
  audio.src = url;
  audio.play().catch(() => {});
}
export function setVolume(v) { if (gain) gain.gain.value = v / 100; }
export const stopSong = () => audio.pause();

// 화면의 ▶/❚❚ 버튼을 실제 재생 상태에 맞추기
const sync = () => {
  for (const b of document.querySelectorAll('.play[data-url]')) b.textContent = !audio.paused && audio.src === b.dataset.url ? '❚❚' : '▶';
};
audio.addEventListener('play', sync);
audio.addEventListener('pause', sync);
audio.addEventListener('ended', sync);

function playBtn(url, getVol, loop) {
  const b = el('button', { className: 'play', textContent: '▶', 'aria-label': '미리듣기', 'data-url': url });
  b.onclick = e => {
    e.stopPropagation();
    if (audio.src === url && !audio.paused) return audio.pause();
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
    row.append(el('button', { className: 'x', textContent: '✕', 'aria-label': '노래 빼기', onclick: () => { audio.pause(); onRemove(); } }));
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
    $('songs').addEventListener('close', () => { audio.pause(); done?.(null); done = null; }, { once: true });
  });
}
function choose(song) {
  const d = done;
  done = null;
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
    const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '25' })}`);
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
