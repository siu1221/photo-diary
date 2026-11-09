import { $, el, toast, openScreen, closeScreen, fmtSec, thumbOf, pickMime, canRecordCanvas, once, audioCtx } from './util.js';

const MAX = 60;       // 영상 최대 길이(초)
const OUT_LONG = 720; // 저장 영상 긴 변(px) — 용량 절약
const v = $('ve-video');
let url, st, done, audio, busy = false;

// 볼륨을 100% 넘게 키우려면 Web Audio를 거쳐야 함 (영상 요소 하나당 한 번만 연결 가능)
function audioGraph() {
  if (!audio) {
    const ctx = audioCtx();
    const src = ctx.createMediaElementSource(v), gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    audio = { ctx, gain };
  }
  audio.gain.gain.value = st.muted ? 0 : st.vol / 100;
  audioCtx();
  return audio;
}

// MediaRecorder로 만든 webm은 길이가 Infinity로 나올 때가 있어 끝까지 한 번 찾아가서 알아냄
async function realDuration() {
  if (isFinite(v.duration)) return v.duration;
  v.currentTime = 1e9;
  await once(v, 'durationchange').catch(() => {});
  const d = v.duration;
  v.currentTime = 0;
  return isFinite(d) ? d : 0;
}

export function editVideo(blob) {
  return new Promise(async res => {
    url = URL.createObjectURL(blob);
    v.src = url;
    try { await once(v, 'loadedmetadata'); } catch {
      URL.revokeObjectURL(url);
      toast('이 영상은 열 수 없어요');
      return res(null);
    }
    const dur = await realDuration();
    if (!dur) { URL.revokeObjectURL(url); toast('영상 길이를 알 수 없어요'); return res(null); }
    done = res;
    st = { dur, start: 0, end: Math.min(dur, MAX), muted: false, vol: 100, blob };
    $('ve-mute').textContent = '🔊 소리 켜짐';
    $('ve-vol').value = 100;
    $('ve-progress').hidden = true;
    openScreen('videdit');
    drawTrim();
    if (dur > MAX) toast('1분이 넘는 영상이에요. 올릴 구간을 골라 주세요.');
    makeStrip(blob, dur);
  });
}

function drawTrim() {
  const { start, end, dur } = st;
  $('ve-sel').style.left = (start / dur * 100) + '%';
  $('ve-sel').style.width = ((end - start) / dur * 100) + '%';
  $('ve-info').textContent = `${fmtSec(Math.round(start))} – ${fmtSec(Math.round(end))} · ${Math.round(end - start)}초 (최대 ${MAX}초)`;
}

// 구간 막대 밑에 깔 장면 8개 (실패해도 편집은 가능)
async function makeStrip(blob, dur) {
  const box = $('ve-thumbs');
  box.replaceChildren();
  const tv = el('video', { muted: true, playsInline: true, preload: 'auto', src: URL.createObjectURL(blob) });
  try {
    await once(tv, 'loadeddata');
    for (let i = 0; i < 8; i++) {
      tv.currentTime = Math.min(dur - 0.05, (i + 0.5) * dur / 8);
      await once(tv, 'seeked');
      const c = el('canvas', { width: 80, height: 80 });
      const s = Math.max(80 / tv.videoWidth, 80 / tv.videoHeight);
      c.getContext('2d').drawImage(tv, (80 - tv.videoWidth * s) / 2, (80 - tv.videoHeight * s) / 2, tv.videoWidth * s, tv.videoHeight * s);
      box.append(c);
    }
  } catch { /* 장면 미리보기 없이 진행 */ }
  URL.revokeObjectURL(tv.src);
}

// 구간 막대 조작
// - 양쪽 손잡이를 잡고 끌기: 잡은 손잡이만 움직이고, 반대쪽은 그대로 (1분이 넘으면 거기서 멈춤)
// - 막대 아무 곳이나 길게 꾹 누르기: 그 장면 확인 (누른 채로 좌우로 움직이면 따라감), 구간은 안 바뀜
// - 짧게 톡 누르기: 아무 일도 없음
const strip = $('ve-strip');
const GRAB_PX = 28, HOLD_MS = 400;
let mode = null, holdTimer, downX;
const timeAt = x => { const r = strip.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * st.dur; };
const xOf = t => { const r = strip.getBoundingClientRect(); return r.left + t / st.dur * r.width; };
strip.addEventListener('pointerdown', e => {
  strip.setPointerCapture(e.pointerId);
  downX = e.clientX;
  const ds = Math.abs(e.clientX - xOf(st.start)), de = Math.abs(e.clientX - xOf(st.end));
  if (Math.min(ds, de) <= GRAB_PX) { mode = ds <= de ? 'start' : 'end'; return; }
  mode = 'wait';
  holdTimer = setTimeout(() => { mode = 'scrub'; strip.classList.add('scrubbing'); scrub(e.clientX); }, HOLD_MS);
});
strip.addEventListener('pointermove', e => {
  if (mode === 'start' || mode === 'end') moveHandle(timeAt(e.clientX));
  else if (mode === 'scrub') scrub(e.clientX);
  else if (mode === 'wait' && Math.abs(e.clientX - downX) > 10) { clearTimeout(holdTimer); mode = null; }
});
const release = () => { clearTimeout(holdTimer); mode = null; strip.classList.remove('scrubbing'); };
strip.addEventListener('pointerup', release);
strip.addEventListener('pointercancel', release);
strip.addEventListener('contextmenu', e => e.preventDefault()); // 길게 누를 때 폰 메뉴 안 뜨게

function scrub(x) {
  v.pause();
  v.currentTime = timeAt(x);
  $('ve-head').style.left = (v.currentTime / st.dur * 100) + '%';
}
export function clampTrim(s, which, t) {
  const minLen = Math.min(1, s.dur);
  if (which === 'start') s.start = Math.min(Math.max(t, 0, s.end - MAX), s.end - minLen);
  else s.end = Math.max(Math.min(t, s.dur, s.start + MAX), s.start + minLen);
  return s;
}
function moveHandle(t) {
  clampTrim(st, mode, t);
  v.pause();
  v.currentTime = mode === 'start' ? st.start : st.end;
  drawTrim();
}
// 자체 점검: 시작 10초에 두고 끝을 맨 뒤로 끌면 끝은 70초에서 멈추고 시작은 그대로
{
  const s = clampTrim({ dur: 200, start: 10, end: 30 }, 'end', 200);
  console.assert(s.start === 10 && s.end === 70, 'trim end clamp', s);
  const s2 = clampTrim({ dur: 200, start: 100, end: 130 }, 'start', 0);
  console.assert(s2.start === 70 && s2.end === 130, 'trim start clamp', s2);
}

// 미리보기 재생: 고른 구간만
$('ve-play').onclick = () => {
  if (busy) return;
  if (!v.paused) return v.pause();
  audioGraph();
  if (v.currentTime < st.start || v.currentTime >= st.end - 0.05) v.currentTime = st.start;
  v.play();
};
v.addEventListener('play', () => $('ve-play').classList.add('playing'));
v.addEventListener('pause', () => $('ve-play').classList.remove('playing'));
v.addEventListener('click', () => $('ve-play').click());
v.addEventListener('timeupdate', () => {
  if (!st) return;
  $('ve-head').style.left = (v.currentTime / st.dur * 100) + '%';
  if (!busy && !v.paused && v.currentTime >= st.end) { v.pause(); v.currentTime = st.start; }
});
$('ve-mute').onclick = () => {
  st.muted = !st.muted;
  $('ve-mute').textContent = st.muted ? '🔇 소리 끔' : '🔊 소리 켜짐';
  if (audio) audioGraph();
};
$('ve-vol').oninput = e => { st.vol = +e.target.value; if (audio) audioGraph(); };

function finish(result) {
  v.pause();
  closeScreen('videdit');
  v.removeAttribute('src');
  v.load();
  URL.revokeObjectURL(url);
  done(result);
}
$('ve-cancel').onclick = () => { if (!busy) finish(null); };

// 적용: 고른 구간을 캔버스에 그리면서 실시간으로 다시 녹화 (720p로 줄여 저장 공간 절약)
$('ve-done').onclick = async () => {
  if (busy) return;
  const { start, end, dur, muted, vol, blob } = st;
  const untouched = start === 0 && end >= dur - 0.05 && !muted && vol === 100;
  // 자르거나 소리를 바꾸지 않았으면 다시 만들지 않고 바로 등록 (기다림 없음)
  // shortcut: 원본 그대로라 화질 좋은 대신 용량이 큼, 저장 공간이 부족해지면 여기서도 줄이기
  if (untouched && dur <= MAX + 0.5) return finish({ type: 'video', blob, thumb: await frameThumb(0) });
  if (!canRecordCanvas()) return toast('이 브라우저에서는 영상 자르기를 할 수 없어요');
  busy = true;
  showProgress(0, end - start);
  $('ve-progress').hidden = false;
  $('videdit').classList.add('encoding');
  try {
    finish(await reencode());
  } catch (err) {
    console.error(err);
    toast('영상을 만들지 못했어요. 다시 시도해 주세요.');
  } finally {
    busy = false;
    $('ve-progress').hidden = true;
    $('videdit').classList.remove('encoding');
  }
};
// 진행 막대 + 퍼센트 + 남은 시간 (자른 구간 길이만큼 실시간으로 만들어서 걸리는 시간이 정해져 있음)
function showProgress(p, total) {
  $('ve-progress').querySelector('progress').value = p;
  $('ve-pct').textContent = Math.floor(p * 100) + '%';
  $('ve-left').textContent = `약 ${Math.max(1, Math.ceil(total * (1 - p)))}초 남았어요`;
}

async function frameThumb(t) {
  v.currentTime = t;
  await once(v, 'seeked');
  return thumbOf(v, v.videoWidth, v.videoHeight);
}

async function reencode() {
  const { start, end, muted, vol } = st;
  const s = Math.min(1, OUT_LONG / Math.max(v.videoWidth, v.videoHeight));
  const c = el('canvas', { width: Math.round(v.videoWidth * s / 2) * 2, height: Math.round(v.videoHeight * s / 2) * 2 });
  const ctx = c.getContext('2d');
  const thumb = await frameThumb(start);
  ctx.drawImage(v, 0, 0, c.width, c.height);

  const stream = c.captureStream(30);
  const { ctx: actx, gain } = audioGraph();
  let dest;
  if (!muted && vol > 0) {
    dest = actx.createMediaStreamDestination();
    gain.disconnect();
    gain.connect(dest); // 만드는 동안은 스피커로 안 나가게
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  const mime = pickMime(['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']);
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 2_500_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = once(rec, 'stop');
  rec.start(500);
  await v.play();
  await new Promise(resolve => {
    const tick = () => {
      ctx.drawImage(v, 0, 0, c.width, c.height);
      showProgress(Math.min(1, (v.currentTime - start) / (end - start)), end - start);
      if (v.currentTime >= end || v.ended) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  v.pause();
  rec.stop();
  await stopped;
  if (dest) { gain.disconnect(); gain.connect(actx.destination); }
  return { type: 'video', blob: new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] }), thumb };
}
