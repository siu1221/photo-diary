import { $, pad, toast, openScreen, closeScreen, pickMime, cssVar, audioCtx } from './util.js';
import { ask } from './music.js';

// 녹음은 "일시정지할 때마다 한 토막씩" 끝내서 저장하고, 끝낼 때 토막들을 이어 붙인다.
// 이유: 아이폰은 마이크가 켜진 채로 들어 보기(재생)를 하면 이어지는 녹음이 소리 없이 저장되는 문제가 있어서,
//       멈출 때 마이크를 완전히 끄고, 이어서 녹음할 때 새로 켠다.
const MAX_MS = 10 * 60 * 1000; // 한 번에 최대 10분
const wave = $('rec-wave');
let state = 'idle'; // idle → rec ⇄ paused → done
let mr, analyser, buf, raf, levels = [], elapsed = 0, t0 = 0, lastPush = 0;
let segments = [], result = null, done, urls = [];
const blobUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };

export function recordVoice() {
  return new Promise(res => {
    done = res;
    reset();
    openScreen('rec');
  });
}

function reset() {
  throwAway();
  cancelAnimationFrame(raf);
  state = 'idle';
  levels = [];
  segments = [];
  elapsed = 0;
  result = null;
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $('rec-review').hidden = true;
  $('rec-peek').hidden = true;
  $('rec-controls').hidden = false;
  $('rec-done').disabled = true;
  $('rec-status').textContent = '가운데 버튼을 누르면 녹음이 시작돼요';
  $('rec-time').textContent = '00:00';
  ui();
  drawWave();
}

function ui() {
  const main = $('rec-main');
  main.classList.toggle('recording', state === 'rec');
  main.setAttribute('aria-label', state === 'rec' ? '일시정지' : state === 'paused' ? '이어서 녹음' : '녹음 시작');
  $('rec-redo').disabled = $('rec-stop').disabled = state === 'idle';
}

// 새 토막 녹음 시작 (처음 시작, 이어서 녹음 둘 다)
async function startSegment() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return toast('마이크 사용을 허용해 주세요 (설정 → Safari → 마이크)');
  }
  const actx = audioCtx();
  analyser = actx.createAnalyser();
  analyser.fftSize = 1024;
  buf = new Float32Array(analyser.fftSize);
  actx.createMediaStreamSource(stream).connect(analyser);

  const mime = pickMime(['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']);
  const r = mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  r.stopped = new Promise(ok => {
    r.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); // 마이크 완전히 끄기
      if (!r.discarded && chunks.length) segments.push(new Blob(chunks, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] }));
      ok();
    };
  });
  r.start(250);
  state = 'rec';
  t0 = performance.now();
  $('rec-peek').hidden = true;
  $('rec-peek-audio').pause();
  $('rec-status').textContent = '녹음 중이에요. 편하게 이야기해 주세요';
  ui();
  cancelAnimationFrame(raf);
  loop();
}

// 지금 토막을 끝내고 저장될 때까지 기다림
async function endSegment() {
  const r = mr;
  mr = null;
  if (r && r.state !== 'inactive') { r.stop(); await r.stopped; }
}

const now = () => elapsed + (state === 'rec' ? performance.now() - t0 : 0);

// 목소리 크기를 막대로 쌓아서 오른쪽에서 왼쪽으로 흘려보냄 (아이폰 음성 메모처럼)
function loop() {
  const t = now();
  $('rec-time').textContent = `${pad(Math.floor(t / 60000))}:${pad(Math.floor(t / 1000) % 60)}`;
  if (state === 'rec' && performance.now() - lastPush > 60) {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += x * x;
    levels.push(Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6)); // 작은 소리도 보이게 루트 한 번 더
    lastPush = performance.now();
    drawWave();
  }
  if (state === 'rec' && t >= MAX_MS) { toast('10분이 되어 녹음을 멈췄어요'); stop(); return; }
  if (state === 'rec') raf = requestAnimationFrame(loop);
}

function drawWave() {
  const dpr = devicePixelRatio || 1, W = wave.clientWidth * dpr, H = wave.clientHeight * dpr;
  wave.width = W;
  wave.height = H;
  const ctx = wave.getContext('2d'), step = 5 * dpr, bw = 3 * dpr, n = Math.floor(W / step);
  ctx.fillStyle = cssVar('--line');
  ctx.fillRect(0, H / 2 - dpr / 2, W, dpr);
  ctx.fillStyle = cssVar('--acc-d');
  const shown = levels.slice(-n);
  shown.forEach((lv, i) => {
    const h = Math.max(2 * dpr, lv * H * 0.9), x = W - (shown.length - i) * step;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, (H - h) / 2, bw, h, bw / 2) : ctx.rect(x, (H - h) / 2, bw, h);
    ctx.fill();
  });
}

// 토막들을 하나로: 한 토막이면 그대로, 여러 토막이면 소리를 풀어서 이어 붙인 뒤 WAV로
async function joined() {
  if (segments.length === 1) return segments[0];
  const ctx = audioCtx();
  const parts = await Promise.all(segments.map(async b => ctx.decodeAudioData(await b.arrayBuffer())));
  const RATE = 22050; // 목소리엔 충분, 용량은 절반
  const total = parts.reduce((n, p) => n + p.duration, 0);
  const off = new OfflineAudioContext(1, Math.ceil(total * RATE), RATE);
  let at = 0;
  for (const p of parts) {
    const s = off.createBufferSource();
    s.buffer = p;
    s.connect(off.destination);
    s.start(at);
    at += p.duration;
  }
  return toWav(await off.startRendering());
}
export function toWav(ab) {
  const data = ab.getChannelData(0), n = data.length, out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, ab.sampleRate, true); out.setUint32(28, ab.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
}

async function pause() {
  elapsed += performance.now() - t0;
  state = 'paused'; // 먼저 바꿔서 화면이 바로 반응
  ui();
  $('rec-status').textContent = '잠깐 멈췄어요. 들어 보거나, 가운데 버튼으로 이어서 녹음해요';
  await endSegment();
  if (state !== 'paused' || !segments.length) return;
  try {
    $('rec-peek-audio').src = blobUrl(await joined());
    $('rec-peek').hidden = false;
  } catch { /* 들어 보기는 못 해도 녹음은 계속 가능 */ }
}

async function stop() {
  if (state !== 'rec' && state !== 'paused') return;
  if (state === 'rec') elapsed += performance.now() - t0;
  state = 'done';
  ui();
  await endSegment();
  $('rec-peek').hidden = true;
  $('rec-peek-audio').pause();
  if (!segments.length) { toast('녹음된 소리가 없어요'); return reset(); }
  $('rec-status').textContent = '정리하는 중…';
  try {
    result = { blob: await joined(), dur: elapsed / 1000 };
  } catch {
    toast('녹음을 정리하지 못했어요. 다시 녹음해 주세요');
    return reset();
  }
  $('rec-audio').src = blobUrl(result.blob);
  $('rec-review').hidden = false;
  $('rec-controls').hidden = true;
  $('rec-done').disabled = false;
  $('rec-status').textContent = '들어 보고 마음에 들면 등록해 주세요';
}

$('rec-main').onclick = () => {
  if (state === 'idle' || state === 'paused') return startSegment();
  if (state === 'rec') pause();
};
$('rec-stop').onclick = stop;
$('rec-redo').onclick = () => {
  if (!ask('지금까지 녹음한 걸 지우고 처음부터 다시 할까요?')) return;
  reset();
  startSegment();
};
function throwAway() {
  if (mr && mr.state !== 'inactive') { mr.discarded = true; mr.stop(); }
  mr = null;
}
$('rec-retake').onclick = () => { $('rec-audio').pause(); reset(); };

function close(value) {
  $('rec-audio').pause();
  $('rec-peek-audio').pause();
  throwAway();
  cancelAnimationFrame(raf);
  state = 'idle';
  closeScreen('rec');
  done(value);
}
$('rec-cancel').onclick = () => {
  if (state !== 'idle' && !ask('녹음을 저장하지 않고 나갈까요?')) return;
  close(null);
};
$('rec-done').onclick = $('rec-use').onclick = () => { if (result) close(result); };
