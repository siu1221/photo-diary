import { $, el, esc, keyOf, pad, MON, DOW, parseKey, toast, openScreen, closeScreen, pickMime, canRecordCanvas, once, cssVar } from './util.js';
import { getRange, getMeta, setMeta, hasDiary } from './db.js';
import { view } from './calendar.js';

// 월간 리포트는 다음 달 1일부터 열림
const ym = (y, m) => `${y}-${pad(m + 1)}`;
const isPast = (y, m) => { const n = new Date(); return y < n.getFullYear() || (y === n.getFullYear() && m < n.getMonth()); };

export async function checkBanner() {
  const n = new Date(), p = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const y = p.getFullYear(), m = p.getMonth(), b = $('report-banner');
  const data = await getRange(keyOf(y, m, 1), keyOf(y, m, 31));
  b.hidden = !!(await getMeta('seen-' + ym(y, m))) || !Object.values(data).some(hasDiary);
  b.textContent = `📮 ${m + 1}월의 월간 리포트가 도착했어요! 열어 보기 ›`;
  b.onclick = () => openReport(y, m);
}

$('open-report').onclick = () => {
  const y = view.getFullYear(), m = view.getMonth();
  if (!isPast(y, m)) {
    const next = new Date(y, m + 1, 1);
    return toast(`${m + 1}월 리포트는 ${next.getMonth() + 1}월 1일에 도착해요 📮`);
  }
  openReport(y, m);
};
$('report-back').onclick = () => { closeScreen('report'); stopReel(); };

// 기록 → 숫자 정리 (화면과 분리해 두어 점검하기 쉽게)
export function summarize(y, m, data) {
  const last = new Date(y, m + 1, 0).getDate();
  const keys = Object.keys(data).filter(k => hasDiary(data[k])).sort();
  const days = keys.map(k => data[k]);
  let streak = 0, run = 0;
  for (let d = 1; d <= last; d++) {
    run = hasDiary(data[keyOf(y, m, d)]) ? run + 1 : 0;
    streak = Math.max(streak, run);
  }
  const slots = [0, 0, 0, 0]; // 새벽 0-6, 아침 6-12, 오후 12-18, 밤 18-24
  for (const d of days) if (d.writtenAt) slots[Math.floor(new Date(d.writtenAt).getHours() / 6)]++;
  const plans = Object.values(data).flatMap(d => d.plans);
  return {
    last, filled: keys.length, pct: Math.round(keys.length / last * 100), streak, slots, keys,
    photos: days.reduce((n, d) => n + d.media.filter(x => x.type === 'image').length, 0),
    videos: days.reduce((n, d) => n + d.media.filter(x => x.type === 'video').length, 0),
    voices: days.reduce((n, d) => n + d.voices.length, 0),
    songs: keys.filter(k => data[k].song).map(k => [k, data[k].song]),
    quotes: keys.filter(k => data[k].quote).map(k => [k, data[k].quote]),
    plansDone: plans.filter(p => p.done).length, plansAll: plans.length,
  };
}

let reelData;
async function openReport(y, m) {
  await setMeta('seen-' + ym(y, m), true);
  $('report-banner').hidden = true;
  const data = await getRange(keyOf(y, m, 1), keyOf(y, m, 31));
  const s = summarize(y, m, data);
  reelData = { y, m, data, s };
  const SLOT = ['새벽', '아침', '오후', '밤'], SLOT_T = ['0~6시', '6~12시', '12~18시', '18~24시'];
  const top = s.slots.indexOf(Math.max(...s.slots)), maxSlot = Math.max(1, ...s.slots);
  const C = 2 * Math.PI * 64;
  const md = k => { const d = parseKey(k); return `${d.getMonth() + 1}.${d.getDate()} ${DOW[d.getDay()]}`; };

  $('report-body').innerHTML = `
    <div class="rp-hero"><div class="m">${MON[m]}</div><div class="y">${y}</div>
      <p>${s.filled ? `이번 달, ${s.filled}번 나를 돌아봤어요 ♡` : '이번 달은 조용히 지나갔어요. 다음 달엔 한 장부터!'}</p></div>
    <section class="card">
      <svg class="ring" viewBox="0 0 160 160" role="img" aria-label="달성률 ${s.pct}%">
        <circle cx="80" cy="80" r="64" fill="none" stroke="var(--acc-l)" stroke-width="14"/>
        <circle cx="80" cy="80" r="64" fill="none" stroke="var(--acc)" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${C * s.pct / 100} ${C}" transform="rotate(-90 80 80)"/>
        <text x="80" y="82" text-anchor="middle" font-size="30" fill="var(--acc-d)" font-weight="600">${s.pct}%</text>
        <text x="80" y="104" text-anchor="middle" font-size="12" fill="var(--soft)">${s.filled} / ${s.last}일</text>
      </svg>
      <div class="stats" style="margin-top:12px">
        <div><b>${s.streak}</b><span>최장 연속 기록</span></div>
        <div><b>${s.photos}</b><span>사진</span></div>
        <div><b>${s.videos}</b><span>영상</span></div>
        <div><b>${s.voices}</b><span>음성 메모</span></div>
        <div><b>${s.songs.length}</b><span>노래</span></div>
        <div><b>${s.plansDone}/${s.plansAll}</b><span>일정 완료</span></div>
      </div>
    </section>
    <section class="card">
      <h3 class="card-title">⏰ 일기를 쓴 시간대</h3>
      <div class="hours">${s.slots.map((n, i) => `<div><span>${SLOT[i]} <small class="muted">${SLOT_T[i]}</small></span><i style="width:${n / maxSlot * 100}%"></i><em>${n}</em></div>`).join('')}</div>
      ${s.filled ? `<p class="small muted">주로 <b>${SLOT[top]}</b>에 하루를 정리했어요.</p>` : ''}
    </section>
    <section class="card reel">
      <h3 class="card-title">🎞 이달의 추억 영상</h3>
      <div id="reel-out"></div>
      <button id="reel-make" class="pill acc">추억 영상 만들기</button>
    </section>
    ${s.songs.length ? `<section class="card"><h3 class="card-title">♪ 이달의 노래</h3><ul class="rp-list">${s.songs.map(([k, so]) => `<li><small>${md(k)}</small><br>${esc(so.title)} · ${esc(so.artist)}</li>`).join('')}</ul></section>` : ''}
    ${s.quotes.length ? `<section class="card"><h3 class="card-title">❀ 나에게 건넨 말들</h3><ul class="rp-list">${s.quotes.map(([k, q]) => `<li><small>${md(k)} · ${esc(q.mood)}</small><br>“${esc(q.text)}”</li>`).join('')}</ul></section>` : ''}
    <p class="muted small" style="text-align:center">한 달 동안 정말 수고했어요. 다음 달도 함께해요 ♡</p>`;
  $('reel-make').onclick = makeReel;
  openScreen('report');
  $('report-body').scrollTop = 0;
}

// --- 추억 영상: 이달의 사진·영상을 이어 붙여 짧은 영상으로 (앱 안에서 직접 녹화)
const W = 720, H = 900, FPS = 30;
let reelUrl, stopFlag = false;
const stopReel = () => { stopFlag = true; };

async function loadMedia(m) {
  const url = URL.createObjectURL(m.blob);
  if (m.type === 'image') {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { kind: 'image', src: img, w: img.naturalWidth, h: img.naturalHeight, url };
  }
  const v = el('video', { muted: true, playsInline: true, preload: 'auto', src: url });
  await once(v, 'loadeddata');
  return { kind: 'video', src: v, w: v.videoWidth, h: v.videoHeight, url };
}

function cover(ctx, src, w, h, zoom = 1) {
  const s = Math.max(W / w, H / h) * zoom;
  ctx.drawImage(src, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
}
function card(ctx, big, small) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, cssVar('--acc-l')); g.addColorStop(1, cssVar('--bg2'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = cssVar('--acc-d');
  ctx.font = '600 110px Fredoka, sans-serif';
  ctx.fillText(big, W / 2, H / 2);
  ctx.fillStyle = cssVar('--soft');
  ctx.font = '36px Jua, sans-serif';
  ctx.fillText(small, W / 2, H / 2 + 70);
}
function caption(ctx, text) {
  ctx.textAlign = 'left';
  ctx.font = '600 40px Fredoka, sans-serif';
  ctx.shadowColor = '#0008';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 36, H - 44);
  ctx.shadowBlur = 0;
}
// 한 장면을 sec초 동안 매 프레임 그리기
const scene = (sec, paint) => new Promise(res => {
  const t0 = performance.now();
  const f = () => {
    const t = (performance.now() - t0) / 1000;
    if (t >= sec || stopFlag) return res();
    paint(t / sec);
    requestAnimationFrame(f);
  };
  f();
});

async function makeReel() {
  if (!canRecordCanvas()) return toast('이 브라우저에서는 영상을 만들 수 없어요');
  const { y, m, data, s } = reelData;
  const items = s.keys.flatMap(k => data[k].media.slice(0, 3).map(media => ({ k, media }))).slice(0, 30);
  if (!items.length) return toast('이번 달에 올린 사진·영상이 없어요');

  stopFlag = false;
  const btn = $('reel-make');
  btn.disabled = true;
  btn.textContent = '만드는 중… (화면을 켜 두세요)';
  const c = el('canvas', { width: W, height: H }), ctx = c.getContext('2d');
  $('reel-out').replaceChildren(c);
  const mime = pickMime(['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']);
  const rec = new MediaRecorder(c.captureStream(FPS), { mimeType: mime || undefined, videoBitsPerSecond: 3_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = once(rec, 'stop');
  rec.start(500);
  try {
    await scene(1.6, () => card(ctx, MON[m], `${y} · ${s.filled}일의 기록`));
    for (const { k, media } of items) {
      if (stopFlag) break;
      const d = parseKey(k), label = `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${DOW[d.getDay()]}`;
      let it;
      try { it = await loadMedia(media); } catch { continue; }
      if (it.kind === 'image') {
        await scene(1.8, p => { cover(ctx, it.src, it.w, it.h, 1 + p * 0.08); caption(ctx, label); fadeIn(ctx, p); });
      } else {
        await it.src.play().catch(() => {});
        await scene(Math.min(2.5, it.src.duration || 2.5), p => { cover(ctx, it.src, it.w, it.h); caption(ctx, label); fadeIn(ctx, p); });
        it.src.pause();
      }
      URL.revokeObjectURL(it.url);
    }
    await scene(1.6, () => card(ctx, '♡', '다음 달도 함께해요'));
  } finally {
    rec.stop();
  }
  await stopped;
  btn.disabled = false;
  btn.textContent = '다시 만들기';
  if (stopFlag) return;
  const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
  if (reelUrl) URL.revokeObjectURL(reelUrl);
  reelUrl = URL.createObjectURL(blob);
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm', name = `하루한장-${ym(y, m)}.${ext}`;
  const save = el('button', { className: 'pill', textContent: '💾 저장하기', onclick: async () => {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { return; }
    }
    el('a', { href: reelUrl, download: name }).click();
  } });
  $('reel-out').replaceChildren(el('video', { src: reelUrl, controls: true, playsInline: true }), save);
}
function fadeIn(ctx, p) {
  if (p > 0.12) return;
  ctx.fillStyle = `rgba(255,248,244,${1 - p / 0.12})`;
  ctx.fillRect(0, 0, W, H);
}
