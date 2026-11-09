import { $, pad, toast, openScreen, closeScreen, pickMime, cssVar, audioCtx } from './util.js';

const MAX_MS = 10 * 60 * 1000; // 한 번에 최대 10분
const wave = $('rec-wave');
let state = 'idle', mr, stream, analyser, buf, levels = [], elapsed = 0, t0 = 0, lastPush = 0, raf;
let result = null, audioUrl, done, curChunks = [], peekUrl;

export function recordVoice() {
  return new Promise(res => {
    done = res;
    reset();
    openScreen('rec');
  });
}

function reset() {
  stopStream();
  state = 'idle';
  levels = [];
  elapsed = 0;
  result = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  $('rec-review').hidden = true;
  hidePeek();
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

async function start() {
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
  const chunks = curChunks = [];
  r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  r.onstop = () => {
    r.stream.getTracks().forEach(t => t.stop());
    if (r.discarded) return; // '다시 녹음'·취소로 버린 녹음 (다음 녹음과 섞이지 않게 녹음기마다 표시)
    cancelAnimationFrame(raf);
    hidePeek();
    result = { blob: new Blob(chunks, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] }), dur: elapsed / 1000 };
    audioUrl = URL.createObjectURL(result.blob);
    $('rec-audio').src = audioUrl;
    $('rec-review').hidden = false;
    $('rec-controls').hidden = true;
    $('rec-done').disabled = false;
    $('rec-status').textContent = '들어 보고 마음에 들면 등록해 주세요';
  };
  mr.start(250);
  state = 'rec';
  t0 = performance.now();
  $('rec-status').textContent = '녹음 중이에요. 편하게 이야기해 주세요';
  ui();
  loop();
}

function stopStream() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
}

function now() { return elapsed + (state === 'rec' ? performance.now() - t0 : 0); }

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
  if (t >= MAX_MS) { toast('10분이 되어 녹음을 멈췄어요'); return stop(); }
  raf = requestAnimationFrame(loop);
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

function stop() {
  if (state === 'idle' || state === 'done') return;
  if (state === 'rec') elapsed += performance.now() - t0;
  state = 'done';
  ui();
  mr.stop();
}

$('rec-main').onclick = () => {
  if (state === 'idle') return start();
  if (state === 'rec') {
    elapsed += performance.now() - t0;
    mr.pause();
    state = 'paused';
    $('rec-status').textContent = '잠깐 멈췄어요. 들어 보거나, 가운데 버튼으로 이어서 녹음해요';
    peek();
  } else if (state === 'paused') {
    hidePeek();
    t0 = performance.now();
    mr.resume();
    state = 'rec';
    $('rec-status').textContent = '녹음 중이에요. 편하게 이야기해 주세요';
  }
  ui();
};
$('rec-stop').onclick = stop;
$('rec-redo').onclick = () => {
  if (!confirm('지금까지 녹음한 걸 지우고 처음부터 다시 할까요?')) return;
  throwAway();
  reset();
  start();
};
function throwAway() {
  if (mr && mr.state !== 'inactive') { mr.discarded = true; mr.stop(); }
}
$('rec-retake').onclick = () => { $('rec-audio').pause(); reset(); };

function close(value) {
  $('rec-audio').pause();
  throwAway();
  stopStream();
  closeScreen('rec');
  done(value);
}
$('rec-cancel').onclick = () => {
  if (state !== 'idle' && !confirm('녹음을 저장하지 않고 나갈까요?')) return;
  close(null);
};
$('rec-done').onclick = $('rec-use').onclick = () => { if (result) close(result); };

// 일시정지 중에 지금까지 녹음한 부분 들어 보기
function peek() {
  const r = mr;
  r.addEventListener('dataavailable', () => {
    if (state !== 'paused' || r !== mr) return;
    if (peekUrl) URL.revokeObjectURL(peekUrl);
    peekUrl = URL.createObjectURL(new Blob(curChunks, { type: (r.mimeType || 'audio/webm').split(';')[0] }));
    $('rec-peek-audio').src = peekUrl;
    $('rec-peek').hidden = false;
  }, { once: true });
  r.requestData(); // 쌓인 녹음 조각을 지금 바로 받아 옴
}
function hidePeek() {
  $('rec-peek-audio').pause();
  $('rec-peek').hidden = true;
}
