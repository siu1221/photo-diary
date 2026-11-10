import { $, todayKey, toast, ask } from './util.js';
import { getRange, putDay, delDay, getMeta, setMeta, emptyDay } from './db.js';
import { renderCal } from './calendar.js';

// 백업: 모든 기록(사진·영상·음성 포함)을 JSON 파일 하나로
// shortcut: 영상이 많으면 파일이 커지고 폰 메모리를 많이 씀, 너무 커지면 월별 백업으로 나누기
const toDataURL = b => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => fail(r.error);
  r.readAsDataURL(b);
});
const toBlob = async u => (await fetch(u)).blob();

// 아이폰: 큰 글자 하나로 합치면 메모리가 넘쳐 앱이 죽고, 다운로드 링크는 앱 화면을 떠나 버림
// → 하루씩 글자로 바꿔 조각으로 이어 붙이고, 공유 시트(파일 앱에 저장)로 내보냄
$('export').onclick = async () => {
  toast('백업 파일을 만드는 중이에요…');
  const parts = [`{"app":"photo-diary","version":2,"myQuotes":${JSON.stringify((await getMeta('myQuotes')) || [])},"days":{`];
  const days = await getRange();
  for (const [k, d] of Object.entries(days)) {
    for (const m of d.media) { m.blob = await toDataURL(m.blob); m.thumb = await toDataURL(m.thumb); if (m.orig) m.orig = await toDataURL(m.orig); }
    for (const v of d.voices) v.blob = await toDataURL(v.blob);
    parts.push(`${parts.length > 1 ? ',' : ''}${JSON.stringify(k)}:${JSON.stringify(d)}`);
    delete days[k]; // 다 바꾼 날은 바로 놓아 줘서 메모리 아끼기
  }
  parts.push('}}');
  const file = new File(parts, `하루한장-백업-${todayKey()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    // 오래 걸린 뒤라 폰이 '누른 직후'로 안 쳐 줄 수 있어서 한 번 더 누르게 함
    if (!await ask('백업 파일이 준비됐어요.\n「파일에 저장」을 골라 보관해 주세요.')) return;
    try { await navigator.share({ files: [file] }); } catch (err) { if (err.name !== 'AbortError') toast('저장하지 못했어요. 다시 눌러 주세요.'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// 불러온 파일은 믿지 않고 하나하나 모양을 검사 (이상한 항목은 건너뜀)
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const dataUrl = (v, kinds) => typeof v === 'string' && new RegExp(`^data:(${kinds})(;[\\w=.+-]+)*;base64,[A-Za-z0-9+/=]+$`).test(v);
const IMG = 'image/(jpeg|png|webp)', VID = 'video/(mp4|webm|quicktime)', AUD = 'audio/(mp4|webm|ogg|mpeg|aac|x-m4a|wav)';
const httpsUrl = v => v === '' || (isStr(v, 1000) && /^https:\/\//.test(v));

// 사진 편집값: 정해진 칸만, 숫자 범위 안에서
const EDIT_NUM = { rot: [0, 270], zoom: [1, 5], ox: [-50, 50], oy: [-50, 50], b: [-100, 100], c: [-100, 100], s: [-100, 100], w: [-100, 100], filter: [0, 20] };
const validEdit = e => !!e && typeof e === 'object' && ['orig', '1:1', '4:5', '3:4', '16:9'].includes(e.ratio) && typeof e.flip === 'boolean'
  && Object.entries(EDIT_NUM).every(([k, [lo, hi]]) => typeof e[k] === 'number' && e[k] >= lo && e[k] <= hi);
const pickEdit = e => ({ ratio: e.ratio, flip: e.flip, ...Object.fromEntries(Object.keys(EDIT_NUM).map(k => [k, e[k]])) });

export function validDay(v) {
  if (!v || typeof v !== 'object') return false;
  // 1단계 백업 모양 { photo, text }
  if (!('media' in v)) return isStr(v.text, 200) && (v.photo === null || dataUrl(v.photo, IMG));
  const song = v.song;
  return isStr(v.text, 5000)
    && Array.isArray(v.media) && v.media.length <= 10
    && v.media.every(m => (m.type === 'image' ? dataUrl(m.blob, IMG) : m.type === 'video' && dataUrl(m.blob, VID)) && dataUrl(m.thumb, IMG)
      && (m.orig === undefined || dataUrl(m.orig, IMG)) && (m.edit === undefined || validEdit(m.edit)))
    && Array.isArray(v.voices) && v.voices.length <= 50 && v.voices.every(x => dataUrl(x.blob, AUD) && typeof x.dur === 'number')
    && Array.isArray(v.plans) && v.plans.length <= 100
    && v.plans.every(p => /^(\d\d:\d\d)?$/.test(p.time) && isStr(p.text, 60) && typeof p.done === 'boolean')
    && (v.quote === null || (isStr(v.quote.text, 200) && isStr(v.quote.mood, 40)))
    && (song === null || (['itunes', 'youtube'].includes(song.kind) && isStr(song.title, 300) && isStr(song.artist, 300)
      && httpsUrl(song.art) && httpsUrl(song.preview ?? '') && (song.kind !== 'youtube' || /^[\w-]{11}$/.test(song.id))
      && (song.start === undefined || (typeof song.start === 'number' && song.start >= 0 && song.start <= 36000))
      && (song.vol === undefined || (typeof song.vol === 'number' && song.vol >= 0 && song.vol <= 100))))
    && (v.writtenAt === null || isStr(v.writtenAt, 40));
}

async function revive(v) {
  if (!('media' in v)) {
    const d = emptyDay();
    d.text = v.text;
    if (v.photo) { const b = await toBlob(v.photo); d.media.push({ type: 'image', blob: b, thumb: b }); }
    return d;
  }
  const d = { ...emptyDay(), text: v.text, plans: v.plans.map(({ time, text, done }) => ({ time, text, done })), writtenAt: v.writtenAt, updatedAt: v.updatedAt ?? null };
  d.media = await Promise.all(v.media.map(async m => ({
    type: m.type, blob: await toBlob(m.blob), thumb: await toBlob(m.thumb),
    ...(m.orig ? { orig: await toBlob(m.orig), edit: m.edit && pickEdit(m.edit) } : {}),
  })));
  d.voices = await Promise.all(v.voices.map(async x => ({ blob: await toBlob(x.blob), dur: x.dur })));
  if (v.song) d.song = { kind: v.song.kind, title: v.song.title, artist: v.song.artist, art: v.song.art, preview: v.song.preview ?? '', ...(v.song.id ? { id: v.song.id } : {}), ...(v.song.vol !== undefined ? { vol: v.song.vol } : {}), ...(v.song.start ? { start: v.song.start } : {}) };
  if (v.quote) d.quote = { text: v.quote.text, mood: v.quote.mood };
  return d;
}

$('import').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { return toast('백업 파일이 아니에요'); }
  const entries = Object.entries(data?.days && typeof data.days === 'object' ? data.days : {})
    .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && validDay(v));
  if (!entries.length) return toast('불러올 기록이 없어요');
  if (!await ask(`지금 기록을 모두 백업 파일(${entries.length}일치) 내용으로 바꿀까요?
백업에 없는 날의 기록은 지워져요.`)) return;
  try {
    // 백업을 다 넣은 다음에 백업에 없는 날을 지움 (중간에 실패해도 기록이 다 날아가지 않게)
    for (const [k, v] of entries) await putDay(k, await revive(v));
    const keep = new Set(entries.map(([k]) => k));
    for (const k of Object.keys(await getRange())) if (!keep.has(k)) await delDay(k);
    await setMeta('myQuotes', [...new Set(Array.isArray(data.myQuotes) ? data.myQuotes.filter(q => isStr(q, 120)) : [])]);
  } catch {
    return toast('불러오는 중에 문제가 생겼어요. 저장 공간을 확인해 주세요.');
  }
  $('menu').close();
  renderCal();
  toast(`${entries.length}일치 기록을 불러왔어요`);
};

// 자체 점검: 검사기가 정상/이상 데이터를 가르는지 (개발자 콘솔에 표시)
console.assert(validDay({ photo: null, text: 'hi' }), 'v1 backup');
console.assert(validDay({ ...emptyDay(), text: 'hi', writtenAt: null }), 'v2 backup');
console.assert(!validDay({ ...emptyDay(), media: [{ type: 'image', blob: 'data:image/svg+xml;base64,AA', thumb: '' }] }), 'svg rejected');
console.assert(!validDay({ ...emptyDay(), song: { kind: 'itunes', title: 'a', artist: 'b', art: 'javascript:alert(1)' } }), 'bad url rejected');
