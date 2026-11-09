// 기기 안 IndexedDB.
// days: 'YYYY-MM-DD' → 하루 기록 / meta: 리포트 읽음 표시, 내 문구 등
const dbReady = new Promise((ok, fail) => {
  const r = indexedDB.open('photo-diary', 2);
  r.onupgradeneeded = e => {
    if (e.oldVersion < 1) r.result.createObjectStore('days');
    if (e.oldVersion < 2) r.result.createObjectStore('meta');
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error);
});

async function tx(name, mode, fn) {
  const db = await dbReady;
  return new Promise((ok, fail) => {
    const t = db.transaction(name, mode);
    const out = fn(t.objectStore(name));
    t.oncomplete = () => ok(out);
    t.onerror = () => fail(t.error);
    t.onabort = () => fail(t.error);
  });
}

export const emptyDay = () => ({
  media: [],   // [{ type: 'image'|'video', blob, thumb }]
  song: null,  // { kind: 'itunes'|'youtube', title, artist, art, preview?, id? }
  text: '',
  voices: [],  // [{ blob, dur }]
  plans: [],   // [{ time: 'HH:MM'|'', text, done }]
  quote: null, // { text, mood }
  writtenAt: null, updatedAt: null,
});

// 1단계 때 저장한 { photo: dataURL, text } 기록도 새 모양으로 읽기
async function normalize(v) {
  if (v.media) return { ...emptyDay(), ...v };
  const d = emptyDay();
  d.text = v.text || '';
  if (v.photo) {
    const b = await (await fetch(v.photo)).blob();
    d.media.push({ type: 'image', blob: b, thumb: b });
  }
  return d;
}

export async function getRange(lo, hi) {
  const raw = await tx('days', 'readonly', s => {
    const out = {};
    s.openCursor(lo ? IDBKeyRange.bound(lo, hi) : undefined).onsuccess = e => {
      const c = e.target.result;
      if (c) { out[c.key] = c.value; c.continue(); }
    };
    return out;
  });
  for (const k in raw) raw[k] = await normalize(raw[k]);
  return raw;
}
export const getDay = async k => (await getRange(k, k))[k] || null;
export const putDay = (k, v) => tx('days', 'readwrite', s => { s.put(v, k); });
export const delDay = k => tx('days', 'readwrite', s => { s.delete(k); });
export const getMeta = k => tx('meta', 'readonly', s => {
  const o = {};
  s.get(k).onsuccess = e => { o.v = e.target.result; };
  return o;
}).then(o => o.v);
export const setMeta = (k, v) => tx('meta', 'readwrite', s => { s.put(v, k); });

// "채운 날" = 일정만 있는 날 말고, 일기(사진·글·음성·노래·문구)가 있는 날
export const hasDiary = d => !!d && !!(d.media.length || d.text.trim() || d.voices.length || d.song || d.quote);
export const hasAny = d => hasDiary(d) || !!d?.plans.length;

navigator.storage?.persist?.(); // 공간이 부족할 때 브라우저가 기록을 지우지 않게 요청
