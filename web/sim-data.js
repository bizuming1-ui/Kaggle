/* =====================================================================
   QTTS — browser simulator backend (sim-data.js)
   ---------------------------------------------------------------------
   The simulator page (sim.html) is byte-identical to the site the Kaggle
   deployment serves.  This module supplies the *data* those pages fetch:
   when installed it answers every /api/* and /deploy/bundle request with
   realistic deployment state, so the browser shows the same content as a
   live 2×T4 Kaggle run — no GPU, no gateway, no network required.

   Wire format (gateway → browser), identical to go/gateway/session.go:
     frame = [type u8][seg u32 LE][len u32 LE][payload]
     PCM 1 · SEG 2 · TEXT 3 · STATS 4 · END 5 · ERROR 6 · POLICY 7 · EVENT 8

   All responses are realm-safe shims (no dependency on window.Response or
   ReadableStream) so the same code runs in browsers and in the jsdom smoke
   harness.  The app only reads: ok, status, headers.get, json, text, blob,
   body.getReader — exactly what these shims provide.
   ===================================================================== */

const SR = 24000;
const FRAME = { PCM: 1, SEG: 2, TEXT: 3, STATS: 4, END: 5, ERROR: 6, POLICY: 7, EVENT: 8 };

const ACTIVE = { id: 'demo-076f2' };
const PROFILES = [
  {
    id: 'demo-076f2', name: '演示声音', language: 'Chinese', lang_code: 'zh',
    created: '2026-10-18T12:37:48', anchor: 'anchor_0.wav', anchor_candidate: 0,
    ref_text: '这是一段用来测试的声音样本，希望系统能够记住我的音色。',
    stats: { clips: 6, duration_s: 42.5 }, f0: { median: 186.2 },
    quality: { speaker_model: 'ecapa', fidelity_index: 82.4 },
  },
  {
    id: 'warm-9c31a', name: '温暖女声', language: 'Chinese', lang_code: 'zh',
    created: '2026-10-18T13:02:11', anchor: 'anchor_0.wav', anchor_candidate: 1,
    ref_text: '晚上好，今天过得怎么样？',
    stats: { clips: 4, duration_s: 28.0 }, f0: { median: 210.7 },
    quality: { speaker_model: 'ecapa', fidelity_index: 79.8 },
  },
];

const POLICY = { start_fast_s: 0.30, start_s: 1.3, low_s: 3.5, high_s: 36, agg_rtf: 2.41 };

const CONFIG = {
  model: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base', sample_rate: SR, version: '2.0.0',
  active_profile: ACTIVE.id, analyst: 'http://127.0.0.1:7010',
  llm: { model: 'deepseek-flash', key_set: true, max_tokens: 4096, base: 'https://api.deepseek.com' },
  policy: POLICY,
  workers: ['http://127.0.0.1:7001', 'http://127.0.0.1:7002'],
};

const WORKERS = [
  { id: 0, url: 'http://127.0.0.1:7001', healthy: true, ready: true, busy: false, failed: 0,
    served: 23, audio_s: 91.2, first_chunk_ms: 612, rtf_x: 2.46, last_error: '',
    worker: { busy: false, dtype: 'float16', gpu: 'Tesla T4', vram_used_mb: 2874 } },
  { id: 1, url: 'http://127.0.0.1:7002', healthy: true, ready: true, busy: false, failed: 0,
    served: 21, audio_s: 84.7, first_chunk_ms: 645, rtf_x: 2.37, last_error: '',
    worker: { busy: false, dtype: 'float16', gpu: 'Tesla T4', vram_used_mb: 2871 } },
];

const CHAT_REPLIES = [
  '你好！我是运行在两块 T4 上的克隆语音助手，现在你听到的每一个字都来自你上传的参考音色。',
  '这个问题很有意思。整套系统用 Qwen3-TTS 做流式合成，DeepSeek 负责对话内容，第一句话不到一秒就能开口。',
  '当然可以。你随时可以打断我说话，我也会立刻停下来听你讲。',
  '根据目前的实测数据，首包延迟在一秒以内，合成速度大约是实时的两倍多，长时间朗读也不会掉队。',
  '我的记忆里保留了最近的对话，你可以继续追问，也可以换一个话题重新开始。',
];
let replyTurn = 0;

const ASR_LINES = [
  { text: '你好，请介绍一下你自己。', language: 'zh', duration_s: 2.1 },
  { text: '请用我的声音朗读一段文字。', language: 'zh', duration_s: 1.8 },
  { text: '你能在多快的时间内开口说话？', language: 'zh', duration_s: 2.4 },
];
let asrTurn = 0;

/* ------------------------------------------------- realm-safe responses */
const utf8 = (str) => {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
};

class ShimStream {
  constructor() { this.queue = []; this.waiters = []; this.ended = false; }
  enqueue(bytes) {
    const w = this.waiters.shift();
    if (w) w({ value: bytes, done: false });
    else this.queue.push(bytes);
  }
  close() {
    this.ended = true;
    while (this.waiters.length) this.waiters.shift()({ value: undefined, done: true });
  }
  getReader() {
    return {
      read: () => {
        if (this.queue.length) return Promise.resolve({ value: this.queue.shift(), done: false });
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise((res) => this.waiters.push(res));
      },
      cancel: () => { this.close(); return Promise.resolve(); },
    };
  }
}

function shimResp({ status = 200, ct = 'application/json', json, text, blob, stream } = {}) {
  const bodyText = text !== undefined ? text : (json !== undefined ? JSON.stringify(json) : '');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? ct : null) },
    json: async () => (typeof json === 'object' ? json : JSON.parse(bodyText)),
    text: async () => bodyText,
    blob: async () => blob,
    arrayBuffer: async () => (blob ? blob.arrayBuffer() : utf8(bodyText).buffer),
    body: stream || null,
  };
}

const jsonResp = (obj, status = 200) => shimResp({ status, json: obj });
const textResp = (t, ct = 'text/plain; charset=utf-8') => shimResp({ ct, text: t });

/* ----------------------------------------------------------- frame codec */
function frame(type, seg, payload) {
  const b = new Uint8Array(9 + payload.length);
  const dv = new DataView(b.buffer);
  dv.setUint8(0, type);
  dv.setUint32(1, seg, true);
  dv.setUint32(5, payload.length, true);
  b.set(payload, 9);
  return b;
}
const jsonPayload = (o) => utf8(JSON.stringify(o));

/* speech-like PCM: harmonic stack + syllabic envelope + breath noise */
function synthPCM(seconds, seed) {
  const n = Math.round(seconds * SR);
  const out = new Int16Array(n);
  const f0 = 170 + (seed % 7) * 9;
  let rng = ((seed + 1) * 9301 + 49297) % 233280;
  const rnd = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.02 * Math.sin(2 * Math.PI * 5.2 * t);
    const s =
      0.62 * Math.sin(2 * Math.PI * f0 * vib * t) +
      0.31 * Math.sin(2 * Math.PI * f0 * 2 * vib * t + 0.6) +
      0.16 * Math.sin(2 * Math.PI * f0 * 3 * vib * t + 1.2) +
      0.10 * Math.sin(2 * Math.PI * (f0 * 4.2) * t);
    const syll = 0.30 + 0.70 * Math.pow(Math.abs(Math.sin(Math.PI * t / 0.29 + seed)), 0.55);
    const env = syll * Math.min(1, t * 30) * Math.min(1, (seconds - t) * 30);
    out[i] = Math.max(-32767, Math.min(32767, Math.round(9000 * env * (s * 0.55 + 0.10 * rnd()))));
  }
  return out;
}

function wavBlob(pcm16) {
  const total = pcm16.byteLength;
  const buf = new ArrayBuffer(44 + total);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + total, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, total, true);
  new Uint8Array(buf, 44, total).set(new Uint8Array(pcm16.buffer, pcm16.byteOffset, total));
  return new Blob([buf], { type: 'audio/wav' });
}

/* ------------------------------------------------------- speak streaming */
const liveStreams = new Set();

function speakResponse(body, signal) {
  const chat = body.mode === 'chat';
  const reply = chat ? CHAT_REPLIES[replyTurn++ % CHAT_REPLIES.length] : (body.text || '你好。');
  const sentences = reply.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
  const segs = sentences.length ? sentences : [reply];
  const stream = new ShimStream();
  let done = false;
  const timers = new Set();

  const entry = {
    finish(interrupted) {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      liveStreams.delete(entry);
      if (interrupted) {
        try {
          stream.enqueue(frame(FRAME.EVENT, 0, jsonPayload({ phase: 'interrupted' })));
          stream.enqueue(frame(FRAME.END, 0, jsonPayload({ interrupted: true, segments: segs.length })));
        } catch (_) { /* ignore */ }
      }
      stream.close();
    },
  };
  liveStreams.add(entry);

  const emit = (bytes) => { if (!done) stream.enqueue(bytes); };
  const at = (ms, fn) => {
    const t = setTimeout(() => { timers.delete(t); if (!done) fn(); }, ms);
    timers.add(t);
  };

  if (chat) {
    emit(frame(FRAME.EVENT, 0, jsonPayload({ phase: 'thinking' })));
    at(300, () => emit(frame(FRAME.EVENT, 0, jsonPayload({ phase: 'answering' }))));
  }
  let clock = chat ? 340 : 110;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  segs.forEach((text, si) => {
    if (chat) at(clock, () => emit(frame(FRAME.TEXT, si, jsonPayload({ t: text }))));
    const audioS = 0.55 + 0.22 * (text.length % 7);
    const chunkS = 0.15;
    const chunkMs = 28;                       // ~5x realtime: snappy demo pacing
    let sent = 0;
    for (let off = 0; off < audioS - 1e-3; off += chunkS) {
      const dur = Math.min(chunkS, audioS - off);
      const pcm = synthPCM(dur, si * 13 + Math.round(off * 100) + 3);
      at(clock + Math.round(off / chunkS) * chunkMs, () => {
        emit(frame(FRAME.PCM, si, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)));
        sent += dur;
      });
    }
    const segDone = clock + Math.ceil(audioS / chunkS) * chunkMs + 30;
    at(segDone, () => emit(frame(FRAME.SEG, si, jsonPayload({ seg: si + 1, audio_s: +sent.toFixed(3) }))));
    clock = segDone + (chat ? 50 : 15);
  });
  at(clock + 25, () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const wall = (now - t0) / 1000;
    const audio = segs.reduce((a, s) => a + 0.55 + 0.22 * (s.length % 7), 0);
    emit(frame(FRAME.STATS, 0, jsonPayload({ overall_rtf_x: 2.41 })));
    emit(frame(FRAME.END, 0, jsonPayload({
      segments: segs.length, wall_s: +wall.toFixed(3), audio_s: +audio.toFixed(3),
      overall_rtf_x: 2.41, first_chunk_ms: 340, interrupted: false,
    })));
    entry.finish(false);
  });

  if (signal) {
    if (signal.aborted) entry.finish(true);
    else if (signal.addEventListener) signal.addEventListener('abort', () => entry.finish(true));
  }
  return shimResp({ ct: 'application/octet-stream', stream });
}

/* ---------------------------------------------------- the real deploy bundle */
/* The copy button must yield the REAL runnable `yuyinkelong` — the single-cell
   Kaggle script.  Sources are tried in order; every candidate is validated by
   its self-extracting markers before it is accepted.  If none works the route
   answers 502 and the UI says so — it never shows fake "code" to copy. */
function looksRunnable(t) {
  return typeof t === 'string' && t.startsWith('#!/') &&
    t.includes('QTTS BUNDLE START') && t.includes('QTTS BUNDLE END') &&
    t.includes('FILES = {') && t.includes('import base64');
}

const utf8Decode = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) s += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63));
    else if (b < 0xf0) s += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    else {
      const cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      const u = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023));
    }
  }
  return s;
};
const b64Decode = (b64) => {
  const bin = atob(String(b64).replace(/[\n\r]/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return utf8Decode(u);
};

async function fetchRunnableBundle(realFetch) {
  const sources = [
    { url: '/deploy/bundle' },                       // live gateway (preview & Kaggle)
    { url: '../yuyinkelong' },                       // repo checkout served statically
    { url: 'sim-bundle.txt' },                       // byte copy next to the console
    { url: 'https://raw.githubusercontent.com/bizuming1-ui/Kaggle/arena/4367c483-kaggle/yuyinkelong' },
    { url: 'https://github.com/bizuming1-ui/Kaggle/raw/arena/4367c483-kaggle/yuyinkelong' },
    {
      url: 'https://api.github.com/repos/bizuming1-ui/Kaggle/contents/yuyinkelong?ref=arena/4367c483-kaggle',
      api: true,
    },
  ];
  for (const s of sources) {
    try {
      const sig = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
        ? AbortSignal.timeout(8000) : undefined;
      const r = await realFetch(s.url, { cache: 'no-store', signal: sig });
      if (!r || !r.ok) continue;
      const t = s.api ? b64Decode(((await r.json()) || {}).content || '') : await r.text();
      if (looksRunnable(t)) return t;
    } catch (_) { /* try the next source */ }
  }
  return null;
}

/* ------------------------------------------------------------- the router */
const jobs = new Map();

function route(url, opts, realFetch) {
  const u = new URL(String(url).startsWith('http') ? String(url) : location.origin + url, location.href);
  const path = u.pathname;
  const method = (opts.method || 'GET').toUpperCase();

  if (path === '/api/health') {
    return jsonResp({
      ok: true, workers_healthy: 2, agg_rtf: POLICY.agg_rtf,
      active_profile: ACTIVE.id, active_sessions: liveStreams.size ? 1 : 0,
      llm_key_set: true, llm_model: CONFIG.llm.model,
      policy: POLICY, workers: WORKERS,
    });
  }
  if (path === '/api/config') return jsonResp({ ...CONFIG, active_profile: ACTIVE.id });

  if (path === '/api/prep/profiles' && method === 'GET') return jsonResp({ profiles: PROFILES });

  if (path === '/api/prep/profiles' && method === 'POST') {
    const id = 'sim-' + Math.random().toString(16).slice(2, 7);
    let name = '模拟音色';
    try { name = (opts.body && opts.body.get && opts.body.get('name')) || name; } catch (_) { /* ignore */ }
    jobs.set(id, { n: 0, id, name });
    return jsonResp({ job: id });
  }
  if (path.startsWith('/api/prep/jobs/')) {
    const id = path.split('/').pop();
    const j = jobs.get(id) || { n: 9, id, name: '模拟音色' };
    j.n = (j.n || 0) + 1;
    jobs.set(id, j);
    if (j.n === 1) return jsonResp({ state: 'running', stage: '切分参考音频', pct: 28 });
    if (j.n === 2) return jsonResp({ state: 'running', stage: '提取声纹', pct: 67 });
    return jsonResp({ state: 'done', stage: '完成', pct: 100, profile: { id: j.id, name: j.name } });
  }

  if (path.startsWith('/api/prep/profiles/') && path.endsWith('/audio')) {
    return shimResp({ ct: 'audio/wav', blob: wavBlob(synthPCM(2.2, 5)) });
  }

  if (path === '/api/prep/evaluate') {
    return jsonResp({
      cer: 0.031, f0_median_diff_cents: 8.4, rate_ratio: 1.03, spectral_dist_db: 2.41,
      fidelity_index: 81.6, speaker_model: 'ecapa',
      index_parts: { speaker: 0.42, pronunciation: 0.18, f0: 0.12, rate: 0.08, spectrum: 0.14, energy: 0.06 },
    });
  }

  if (path === '/api/profiles' && method === 'GET') return jsonResp({ active: ACTIVE.id });
  if (path === '/api/profiles/activate') {
    let id = ACTIVE.id;
    try { id = JSON.parse(opts.body).id || id; } catch (_) { /* form or empty */ }
    ACTIVE.id = id;
    CONFIG.active_profile = id;
    return jsonResp({ ok: true, active: id });
  }

  if (path === '/api/speak' && method === 'POST') {
    let body = {};
    try { body = JSON.parse(opts.body); } catch (_) { /* empty */ }
    return speakResponse(body, opts.signal);
  }

  if (path === '/api/chat/interrupt') {
    const n = liveStreams.size;
    for (const s of [...liveStreams]) s.finish(true);
    return jsonResp({ ok: true, interrupted: n });
  }
  if (path === '/api/chat/asr') return jsonResp(ASR_LINES[asrTurn++ % ASR_LINES.length]);
  if (path === '/api/chat/state') return jsonResp({ sessions: [], count: 0 });
  if (path === '/api/llm/models') {
    return jsonResp({ models: ['deepseek-flash', 'deepseek-v4-pro'], active: CONFIG.llm.model });
  }

  if (path === '/deploy/bundle') {
    // Always the REAL yuyinkelong so “复制 → Kaggle 运行” works for real.
    return fetchRunnableBundle(realFetch).then((t) => (t
      ? textResp(t)
      : shimResp({ status: 502, text: 'error: 部署包暂不可用（本机、网关、GitHub 均未取到真实 yuyinkelong）' })));
  }

  // unknown route: pass through to the real network when there is one
  try {
    return Promise.resolve(realFetch(url, opts)).catch(() => jsonResp({ error: 'sim: unknown endpoint ' + path }, 404));
  } catch (_) {
    return jsonResp({ error: 'sim: unknown endpoint ' + path }, 404);
  }
}

export function installMockFetch() {
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    try {
      return Promise.resolve(route(String(url), opts || {}, realFetch));
    } catch (e) {
      return Promise.resolve(jsonResp({ error: String((e && e.message) || e) }, 500));
    }
  };
  return true;
}

export const simInfo = {
  profiles: PROFILES,
  policy: POLICY,
  get active() { return ACTIVE.id; },
};
