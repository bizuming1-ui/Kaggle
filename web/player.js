/* =====================================================================
   QTTS player — an AudioWorklet ring buffer with honest telemetry.

   Everything the UI claims (first-audio latency, buffer depth, underruns)
   is measured here, not guessed:
     * first audio  = time between the first PCM frame arriving and the
                     worklet actually rendering the first non-zero sample
     * underrun     = the ring buffer ran dry while the stream was still open
                     (a stream that simply ended is *not* an underrun)
   ===================================================================== */

const WORKLET_SRC = `
class QTTSProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap  = 1 << 18;            // 262144 samples (~11 s @ 24 kHz)
    this.buf  = new Float32Array(this.cap);
    this.w = 0; this.r = 0;
    this.eos = false; this.done = false;
    this.t0 = 0; this.frames = 0;
    // ---- priming state machine --------------------------------------
    // Rendering used to start on the very first 128-sample block, so the
    // first ~250 ms chunk played out and the stream audibly stalled
    // ("one word, pause, then it continues").  Now a jitter cushion is
    // pre-rolled before anything renders, and if the ring ever runs dry
    // mid-stream we re-prime with a growing cushion instead of sputtering
    // on every late chunk — generation and playback overlap smoothly.
    this.started = false;           // currently rendering audio
    this.emptyAt = 0;               // when the ring first ran dry (grace timer)
    this.firstPcmAt = 0;            // currentTime of first PCM since (re)prime
    this.primeNeed = 24000;         // samples to cushion before starting: 1.0 s
    this.announcedFirst = false;    // 'first' sent for this stream
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'pcm') {
        const src = m.data;
        if (!this.firstPcmAt) this.firstPcmAt = currentTime;
        const free = this.cap - this.queued();
        if (src.length > free) {          // overflow: drop the oldest audio
          this.r = (this.r + (src.length - free)) % this.cap;
        }
        for (let i = 0; i < src.length; i++) {
          this.buf[(this.w + i) % this.cap] = src[i];
        }
        this.w = (this.w + src.length) % this.cap;
      } else if (m.type === 'eos') {
        this.eos = true;
      } else if (m.type === 'reset') {
        this.w = this.r = 0; this.eos = false; this.done = false;
        this.started = false; this.firstPcmAt = 0; this.announcedFirst = false;
        this.emptyAt = 0;
        this.primeNeed = 24000;
        this.t0 = 0; this.frames = 0;
      }
    };
  }

  queued() { return (this.w - this.r + this.cap) % this.cap; }

  process(inputs, outputs) {
    const out = outputs[0][0];
    const n = out.length;
    const avail = this.queued();
    if (!this.started) {
      // Start when: cushion full, OR we have waited 900 ms since the first
      // PCM (keeps first-audio latency low on slow starts), OR the stream
      // already ended.  All three stay far inside the 3 s first-audio cap.
      const waited = this.firstPcmAt ? (currentTime - this.firstPcmAt) : 0;
      if (avail >= this.primeNeed || (avail > 0 && waited >= 0.9) || (this.eos && avail > 0)) {
        this.started = true;
      } else {
        out.fill(0);
        return true;
      }
    }
    if (avail < n) {
      if (avail > 0) { for (let i = 0; i < avail; i++) out[i] = this.buf[(this.r + i) % this.cap]; }
      out.fill(0, avail);
      this.r = this.w;
      if (this.eos) {
        if (!this.done) { this.done = true; this.port.postMessage({ type: 'drained', at: currentTime }); }
        this.started = false; this.firstPcmAt = 0; this.primeNeed = 24000; this.emptyAt = 0;
        return true;
      }
      // Not end-of-stream: give the producer a 120 ms grace period before
      // calling it an underrun (the END frame often lands a few ms after
      // the last PCM).  A shortfall inside the grace window is inaudible
      // scheduling noise, not a stall.
      if (!this.emptyAt) { this.emptyAt = currentTime; return true; }
      if (currentTime - this.emptyAt < 0.12) return true;
      // Truly ran dry mid-stream: report ONE underrun and re-prime with a
      // bigger cushion (1.0 -> 1.4 -> 2.0 s cap), then resume smoothly.
      this.port.postMessage({ type: 'underrun', at: currentTime });
      this.started = false;
      this.firstPcmAt = 0;
      this.emptyAt = 0;
      this.done = false;
      this.primeNeed = Math.min(48000, Math.round(this.primeNeed * 1.4));
      return true;
    }
    this.emptyAt = 0;
    for (let i = 0; i < n; i++) out[i] = this.buf[(this.r + i) % this.cap];
    this.r = (this.r + n) % this.cap;
    this.frames += n;
    if (!this.announcedFirst) {
      this.announcedFirst = true;
      this.t0 = currentTime;
      this.port.postMessage({ type: 'first', at: currentTime });
    }
    if ((this.frames / n | 0) % 3 === 0) {
      let s = 0;
      for (let i = 0; i < n; i++) s += out[i] * out[i];
      this.port.postMessage({ type: 'level', rms: Math.sqrt(s / n), at: currentTime,
                              queued: this.queued() });
    }
    return true;
  }
}
registerProcessor('qtts-processor', QTTSProcessor);
`;

export const SR = 24000;

export class QTTSPlayer {
  constructor(opts = {}) {
    this.opts = opts;
    this.ctx = null;
    this.node = null;
    this.ready = false;
    this.streamOpen = false;
    this.firstAudioAt = 0;
    this.startedAt = 0;
    this.underruns = 0;
    this.queued = 0;
    this.resampleRatio = 1;
    this._tail = new Float32Array(0);
    this._level = 0;
  }

  async init() {
    if (this.ready) return this;
    const AC = window.AudioContext || window.webkitAudioContext;
    try {
      this.ctx = new AC({ sampleRate: SR, latencyHint: 'interactive' });
    } catch (_) {
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.node = new AudioWorkletNode(this.ctx, 'qtts-processor', { outputChannelCount: [1] });
    this.node.connect(this.ctx.destination);
    this.node.port.onmessage = (e) => this._onWorklet(e.data);
    this.resampleRatio = this.ctx.sampleRate / SR;
    this.ctx.onstatechange = () => this.opts.onStateChange?.(this.ctx.state);
    // Page load is not a user gesture, so this resume() usually leaves the
    // context 'suspended' (Chrome autoplay policy). unlock() re-runs it
    // inside a real gesture; without it the worklet never renders.
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (_) { /* needs gesture */ } }
    this.ready = true;
    return this;
  }

  /* Call from ANY user gesture (click / keydown / send / mic). Idempotent
     and safe when audio is unavailable (jsdom, very old browsers). */
  async unlock() {
    try {
      await this.init();
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      this.opts.onStateChange?.(this.ctx?.state);
      return this.ctx?.state || 'unavailable';
    } catch (_) {
      return 'unavailable';
    }
  }

  get state() { return this.ctx?.state || 'unavailable'; }

  _onWorklet(m) {
    if (m.type === 'level') {
      this._level = m.rms;
      this.queued = m.queued / SR;
      this.opts.onLevel?.(m.rms);
    } else if (m.type === 'first') {
      this.firstAudioAt = m.at;
      this._firstMsgAt = performance.now();
      this.opts.onFirstAudio?.(m.at);
    } else if (m.type === 'underrun') {
      this.underruns++;
      this.opts.onUnderrun?.();
    } else if (m.type === 'drained') {
      this.opts.onDrained?.();
    }
  }

  /* ---- stream control ---- */
  open() {
    this.streamOpen = true;
    this.underruns = 0;
    this.firstAudioAt = 0;
    this._firstMsgAt = 0;
    this.startedAt = performance.now();
    this.node?.port.postMessage({ type: 'reset' });
  }

  close() {
    this.streamOpen = false;
    this.node?.port.postMessage({ type: 'eos' });
  }

  reset() {
    this.node?.port.postMessage({ type: 'reset' });
  }

  /* Push raw little-endian int16 mono PCM @24 kHz. */
  push(pcm16) {
    if (!this.ready) return;
    const n = pcm16.byteLength >> 1;
    const view = new DataView(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = view.getInt16(i * 2, true) / 32768;
    this._send(f);
  }

  _send(f32) {
    let data = f32;
    if (Math.abs(this.resampleRatio - 1) > 1e-6) {
      const r = this.resampleRatio;
      const tail = this._tail;
      const total = tail.length + f32.length;
      const outLen = Math.floor(total * r);
      const out = new Float32Array(outLen);
      const buf = new Float32Array(total);
      buf.set(tail, 0); buf.set(f32, tail.length);
      for (let i = 0; i < outLen; i++) {
        const x = i / r;
        const i0 = Math.floor(x);
        const i1 = Math.min(total - 1, i0 + 1);
        const fr = x - i0;
        out[i] = buf[i0] * (1 - fr) + buf[i1] * fr;
      }
      const consumed = Math.floor(outLen / r);
      this._tail = buf.slice(consumed);
      data = out;
    }
    this.node.port.postMessage({ type: 'pcm', data }, [data.buffer]);
  }

  /* Play a WAV (used for the voice-profile previews). */
  async playWav(url) {
    await this.init();
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = this.ctx;
    const dec = await ctx.decodeAudioData(buf);
    const src = ctx.createBufferSource();
    src.buffer = dec;
    src.connect(ctx.destination);
    src.start();
    return dec.duration;
  }

  get level() { return this._level; }
  get elapsedMs() { return performance.now() - this.startedAt; }
  get firstAudioMs() {
    // One clock only (performance.now): the worklet's currentTime runs on
    // the audio clock and must never be mixed with the page clock.
    if (!this._firstMsgAt) return 0;
    return Math.max(0, this._firstMsgAt - this.startedAt);
  }
}

/* ---------------- frame codec (gateway -> browser) ---------------- */
export const FRAME = {
  PCM: 1, SEG: 2, TEXT: 3, STATS: 4, END: 5, ERROR: 6, POLICY: 7, EVENT: 8,
};

export class FrameReader {
  constructor(onFrame) {
    this.buf = new Uint8Array(0);
    this.onFrame = onFrame;
  }
  push(chunk) {
    if (this.buf.length + chunk.length < 9) {
      const merged = new Uint8Array(this.buf.length + chunk.length);
      merged.set(this.buf); merged.set(chunk, this.buf.length);
      this.buf = merged;
      return;
    }
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf); merged.set(chunk, this.buf.length);
    this.buf = merged;
    const dv = new DataView(this.buf.buffer);
    let off = 0;
    while (this.buf.length - off >= 9) {
      const type = dv.getUint8(off);
      const seg = dv.getUint32(off + 1, true);
      const len = dv.getUint32(off + 5, true);
      if (this.buf.length - off < 9 + len) break;
      const payload = this.buf.slice(off + 9, off + 9 + len);
      this.onFrame(type, seg, payload);
      off += 9 + len;
    }
    this.buf = this.buf.slice(off);
  }
}

/* ---------------- microphone capture with energy VAD ---------------- */
const MIC_SRC = `
class MICTap extends AudioWorkletProcessor {
  constructor() { super(); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let s = 0;
    for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
    const rms = Math.sqrt(s / ch.length);
    const copy = new Float32Array(ch);
    this.port.postMessage({ type: 'frame', rms, data: copy }, [copy.buffer]);
    return true;
  }
}
registerProcessor('mic-tap', MICTap);
`;

export class MicCapture {
  // Microphone tap: energy level + the raw frames, so we can build a WAV.

  constructor(opts = {}) {
    this.opts = opts;
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.chunks = [];
    this.recording = false;
    this.active = false;
    this.rate = 48000;
  }

  async start() {
    if (this.active) return this;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const blob = new Blob([MIC_SRC], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try { await this.ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    }
    this.rate = this.ctx.sampleRate;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'mic-tap', { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m.type !== 'frame') return;
      this.opts.onLevel?.(m.rms);
      if (this.recording) this.chunks.push(m.data);
    };
    src.connect(this.node);
    this.active = true;
    this.opts.onState?.('live');
    return this;
  }

  begin() {
    this.chunks = [];
    this.recording = true;
  }

  end() {
    this.recording = false;
    return this.chunks;
  }

  stop() {
    this.recording = false;
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.node?.disconnect(); } catch (_) { /* already gone */ }
    this.node = null;
  }
}

/* ---------------- WAV helpers ---------------- */
export function encodeWav(chunks, sampleRate = 16000) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const data = new Int16Array(total);
  let off = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const v = Math.max(-1, Math.min(1, c[i]));
      data[off++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
  }
  const buf = new ArrayBuffer(44 + data.length * 2);
  const dv = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + data.length * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, data.length * 2, true);
  new Int16Array(buf, 44).set(data);
  return new Blob([buf], { type: 'audio/wav' });
}

export function resampleTo16k(chunks, inRate) {
  const out = [];
  for (const c of chunks) {
    const ratio = inRate / 16000;
    const n = Math.floor(c.length / ratio);
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * ratio;
      const i0 = Math.floor(x);
      const i1 = Math.min(c.length - 1, i0 + 1);
      const f = x - i0;
      o[i] = c[i0] * (1 - f) + c[i1] * f;
    }
    out.push(o);
  }
  return out;
}
