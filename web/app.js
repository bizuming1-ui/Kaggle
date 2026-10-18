/* =====================================================================
   QTTS — application shell: routing, telemetry, the Voice Laboratory.
   ===================================================================== */
import { QTTSPlayer, FrameReader, FRAME, SR } from './player.js';
import { initChat } from './chat.js';
import { initSimulator } from './simulator.js';

/* ------------------------------------------------------------------ utils */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function toast(msg, kind = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ` toast--${kind}` : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s, transform .4s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 450);
  }, 4200);
}

export async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return { _raw: await res.text(), status: res.status };
  const data = await res.json();
  data._status = res.status;
  return data;
}

export const fmtMs = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
export const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

/* ------------------------------------------------------------------ state */
let simulator = null;

export const state = {
  tab: 'lab',
  health: {},
  config: {},
  profiles: [],
  active: '',
  player: null,
  llmKey: '',
};

/* ------------------------------------------------------------------ tabs */
function showTab(name) {
  state.tab = name;
  $$('.nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('.tabpanel').forEach((p) => {
    if (p.id === `panel-${name}`) p.setAttribute('data-active', '');
    else p.removeAttribute('data-active');
  });
  history.replaceState(null, '', `#${name}`);
  if (name === 'sim') simulator?.refresh();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) showTab(t.dataset.tab);
  const g = e.target.closest('[data-goto]');
  if (g) { e.preventDefault(); showTab(g.dataset.goto); }
});

/* ------------------------------------------------------------------ hero canvas */
function heroCanvas() {
  const c = $('#heroCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const N = 96;
  let bars = [];
  const resize = () => {
    const r = c.getBoundingClientRect();
    c.width = r.width * devicePixelRatio;
    c.height = r.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    bars = new Array(N).fill(0);
  };
  resize();
  addEventListener('resize', resize);
  let t = 0;
  const draw = () => {
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    const lvl = state.player ? Math.min(1, state.player.level * 6) : 0;
    t += 0.016;
    const bw = r.width / N;
    for (let i = 0; i < N; i++) {
      const x = i / N;
      const env = Math.sin(x * Math.PI) ** 0.6;
      const idle = (0.5 + 0.5 * Math.sin(t * 1.1 + i * 0.18)) * (0.06 + 0.05 * env);
      const target = idle + lvl * env * (0.55 + 0.45 * Math.sin(t * 6 + i * 0.9));
      bars[i] += (target - bars[i]) * 0.22;
      const h = Math.max(2, bars[i] * r.height * 0.86);
      const g = ctx.createLinearGradient(0, r.height / 2 - h / 2, 0, r.height / 2 + h / 2);
      g.addColorStop(0, 'rgba(217,255,63,0.0)');
      g.addColorStop(0.5, `rgba(217,255,63,${0.30 + bars[i] * 0.5})`);
      g.addColorStop(1, 'rgba(217,255,63,0.0)');
      ctx.fillStyle = g;
      const y = r.height / 2 - h / 2;
      ctx.fillRect(i * bw + bw * 0.22, y, bw * 0.56, h);
    }
    requestAnimationFrame(draw);
  };
  draw();
}

/* ------------------------------------------------------------------ status */
async function pollStatus() {
  try {
    const h = await api('/api/health');
    state.health = h;
    const ok = h.ok && (h.workers_healthy || 0) > 0;
    const dot = $('#statusDot');
    dot.className = 'dot ' + (ok ? 'dot--live' : 'dot--bad');
    $('#statusText').textContent = ok
      ? `${h.workers_healthy} GPU · RTF ${(h.agg_rtf || 0).toFixed(2)}×`
      : '网关未就绪';
    $('#mGpu').innerHTML = `${h.workers_healthy || 0}<i> / ${(h.workers || []).length || 2}</i>`;
    $('#mRtf').innerHTML = `${(h.agg_rtf || 0).toFixed(2)}<i>×</i>`;
    const p = h.policy || {};
    $('#footInfo').textContent =
      `policy start_fast=${p.start_fast_s}s low=${p.low_s}s high=${p.high_s}s · ${(h.workers || []).length} workers`;
  } catch (e) {
    $('#statusDot').className = 'dot dot--bad';
    $('#statusText').textContent = '无法连接网关';
  }
}

/* ------------------------------------------------------------------ lab */
const lab = {
  files: [],
  jobTimer: null,

  init() {
    const drop = $('#drop');
    const input = $('#file');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.dataset.drag = '1';
    }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.dataset.drag = '0';
    }));
    drop.addEventListener('drop', (e) => {
      const fs = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|flac|m4a|ogg)$/i.test(f.name));
      if (fs.length) lab.setFiles(fs);
      else toast('没有识别到音频文件', 'bad');
    });
    input.addEventListener('change', () => {
      const fs = [...input.files].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|flac|m4a|ogg)$/i.test(f.name));
      if (fs.length) lab.setFiles(fs);
    });

    $('#btnBuild').addEventListener('click', () => lab.build());
    $('#btnSpeak').addEventListener('click', () => lab.speak());
    $('#btnStop').addEventListener('click', () => lab.stop());
    lab.renderWave($('#wavePreview'), 48);
  },

  setFiles(fs) {
    lab.files = fs;
    $('#drop h3').textContent = `已选择 ${fs.length} 个文件`;
    $('#drop p').textContent = fs.map((f) => `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`).join('   |   ');
    $('#pName').value = $('#pName').value || fs[0].name.replace(/\.[^.]+$/, '').slice(0, 24);
  },

  async build() {
    if (!lab.files.length) return toast('请先上传参考音频', 'bad');
    const fd = new FormData();
    for (const f of lab.files) fd.append('files', f, f.name);
    fd.append('name', $('#pName').value || 'my-voice');
    fd.append('language', $('#pLang').value);
    fd.append('ref_text', $('#pText').value || '');
    fd.append('calibrate', $('#pCal').checked ? '1' : '0');
    const btn = $('#btnBuild');
    btn.disabled = true;
    btn.textContent = '处理中…';
    try {
      const r = await api('/api/prep/profiles', { method: 'POST', body: fd });
      if (r.error) throw new Error(r.error);
      lab.pollJob(r.job);
    } catch (e) {
      toast(`生成失败：${e.message}`, 'bad');
      btn.disabled = false;
      btn.textContent = '生成声纹';
    }
  },

  pollJob(jid) {
    const btn = $('#btnBuild');
    clearInterval(lab.jobTimer);
    lab.jobTimer = setInterval(async () => {
      const j = await api(`/api/prep/jobs/${jid}`);
      btn.textContent = j.stage ? `${j.stage} ${Math.round(j.pct || 0)}%` : '处理中…';
      if (j.state === 'done') {
        clearInterval(lab.jobTimer);
        btn.disabled = false;
        btn.textContent = '生成声纹';
        toast(`声纹「${j.profile?.name || ''}」已就绪`, 'good');
        await lab.loadProfiles();
        if (j.profile?.id) lab.activate(j.profile.id);
      } else if (j.state === 'error') {
        clearInterval(lab.jobTimer);
        btn.disabled = false;
        btn.textContent = '生成声纹';
        toast(`生成失败：${j.error || (j.log || []).slice(-1)[0] || '未知错误'}`, 'bad');
      }
    }, 900);
  },

  async loadProfiles() {
    const r = await api('/api/prep/profiles');
    state.profiles = r.profiles || [];
    const active = (await api('/api/profiles')).active || '';
    state.active = active;
    const list = $('#profList');
    $('#profCount').textContent = `${state.profiles.length} 个`;
    $('#profEmpty').hidden = state.profiles.length > 0;
    list.innerHTML = '';
    for (const p of state.profiles) {
      const el = document.createElement('div');
      el.className = 'card card--hover';
      el.style.padding = '17px';
      const q = p.quality || {};
      const f0 = p.f0 || {};
      el.innerHTML = `
        <div class="between" style="gap:12px">
          <div>
            <div class="row gap-2">
              <b style="font-size:15px">${p.name || p.id}</b>
              ${p.id === active ? '<span class="pill pill--good">使用中</span>' : ''}
            </div>
            <div class="small mono" style="margin-top:4px">${p.id} · ${p.language || '—'} ·
              ${(p.stats?.clips || 0)} 段 · F0 ${f0.median ? Math.round(f0.median) + ' Hz' : '—'}</div>
          </div>
          <div class="row gap-1">
            <button class="btn btn--sm" data-act="preview" data-id="${p.id}">试听</button>
            <button class="btn btn--sm ${p.id === active ? '' : 'btn--primary'}" data-act="activate" data-id="${p.id}">
              ${p.id === active ? '已启用' : '启用'}</button>
          </div>
        </div>`;
      list.appendChild(el);
    }
    list.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'activate') {
        const r = await api('/api/profiles/activate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (r.error) return toast(`启用失败：${r.error}`, 'bad');
        toast('已切换音色', 'good');
        lab.loadProfiles();
      } else {
        lab.preview(id);
      }
    }));
  },

  async preview(id) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    const url = `/api/prep/profiles/${id}/audio`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('没有可预览的音频');
      const blob = await res.blob();
      await state.player.playWav(URL.createObjectURL(blob));
      toast('正在试听参考音频', 'good');
    } catch (e) {
      toast(`试听失败：${e.message}`, 'bad');
    }
  },

  async activate(id) {
    const r = await api('/api/profiles/activate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (r.error) return toast(`启用失败：${r.error}`, 'bad');
    toast(`已启用「${id}」`, 'good');
    lab.loadProfiles();
  },

  async speak() {
    const text = $('#tText').value.trim();
    if (!text) return toast('请输入要朗读的文字', 'bad');
    const btn = $('#btnSpeak');
    btn.disabled = true;
    $('#speakInfo').textContent = '合成中…';
    const t0 = performance.now();
    const res = await lab.synth(text, 'read');
    btn.disabled = false;
    if (!res.ok) {
      $('#speakInfo').textContent = '';
      return toast(`合成失败：${res.error}`, 'bad');
    }
    $('#speakInfo').textContent =
      `首包 ${Math.round(res.firstMs)} ms · ${res.audioS.toFixed(1)} s 音频 · ${res.seg} 句 · ${res.rtf.toFixed(2)}×`;
  },

  /* one-shot synthesis that returns the PCM so it can also be measured */
  async synth(text, mode = 'read') {
    const player = state.player;
    player.open();
    const chunks = [];
    let firstMs = 0, seg = 0, total = 0;
    const reader = new FrameReader((type, s, payload) => {
      if (type === FRAME.PCM) {
        if (!firstMs) firstMs = performance.now() - t0();
        total += payload.byteLength / 2 / SR;
        chunks.push(payload.slice());
        player.push(payload);
      } else if (type === FRAME.SEG) seg++;
    });
    const t0 = () => performance.now();
    const started = performance.now();
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode, profile: state.active, language: 'auto' }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        return { ok: false, error: e.error || `HTTP ${res.status}` };
      }
      const reader2 = res.body.getReader();
      for (;;) {
        const { value, done } = await reader2.read();
        if (done) break;
        reader.push(value);
      }
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      player.close();
    }
    const wall = (performance.now() - started) / 1000;
    return {
      ok: true, firstMs: firstMs, seg, audioS: total, rtf: total / Math.max(wall, 1e-6),
      pcm: chunks, text,
    };
  },

  async stop() {
    await api('/api/chat/interrupt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, reason: 'stop' }),
    });
    state.player?.reset();
    $('#speakInfo').textContent = '已停止';
  },

  /* the honest quality report: synthesize, then measure the real output */
  async report(profileId) {
    const text = $('#tText').value.trim() || '你好，很高兴认识你，今天我想和你聊一聊。';
    const r = await lab.synth(text, 'read');
    if (!r.ok) return toast(`无法生成样本：${r.error}`, 'bad');
    const blob = pcmToWav(r.pcm);
    const fd = new FormData();
    fd.append('profile', profileId);
    fd.append('text', text);
    fd.append('file', blob, 'sample.wav');
    const ev = await api('/api/prep/evaluate', { method: 'POST', body: fd });
    if (ev.error) return toast(`评估失败：${ev.error}`, 'bad');
    lab.renderQuality(ev);
  },

  renderQuality(ev) {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('#qCos', ev.speaker_sim_anchor != null ? ev.speaker_sim_anchor.toFixed(3) : '—');
    set('#qCer', ev.cer != null ? `${(ev.cer * 100).toFixed(1)}%` : '—');
    set('#qF0', ev.f0_median_diff_cents != null ? `${Math.round(ev.f0_median_diff_cents)}¢` : '—');
    set('#qRate', ev.rate_ratio != null ? `${ev.rate_ratio.toFixed(2)}×` : '—');
    set('#qSpec', ev.spectral_dist_db != null ? `${ev.spectral_dist_db.toFixed(2)} dB` : '—');
    set('#qFid', ev.fidelity_index != null ? `${ev.fidelity_index.toFixed(1)} / 100` : '—');
    const bar = (id, frac) => { const e = $(id); if (e) e.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; };
    bar('#qSpecBar', 1 - Math.min(1, (ev.spectral_dist_db || 0) / 8));
    bar('#qFidBar', (ev.fidelity_index || 0) / 100);
    const badge = $('#qBadge');
    const fi = ev.fidelity_index ?? 0;
    badge.textContent = ev.speaker_model === 'ecapa' ? `ECAPA · ${fi.toFixed(1)}` : `MFCC 代理 · ${fi.toFixed(1)}`;
    badge.className = 'pill ' + (fi >= 70 ? 'pill--good' : fi >= 50 ? 'pill--warn' : 'pill--bad');
    const p = ev.index_parts || {};
    const rows = Object.entries(p).map(([k, v]) =>
      `<div class="hero__row"><label>${({ speaker: '说话人', pronunciation: '发音', f0: '基频', rate: '语速', spectrum: '频谱', energy: '能量' })[k] || k}</label><output>${(v * 100).toFixed(0)}%</output></div>`).join('');
    let box = $('#qParts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'qParts';
      box.className = 'stack gap-2';
      box.style.marginTop = '16px';
      $('#qStats').parentElement.appendChild(box);
    }
    box.innerHTML = rows;
  },

  renderWave(el, n) {
    if (!el) return;
    el.innerHTML = '';
    for (let i = 0; i < n; i++) el.appendChild(document.createElement('i'));
  },
};

export function pcmToWav(chunks, sr = SR) {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const buf = new ArrayBuffer(44 + total);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + total, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, total, true);
  let off = 44;
  for (const c of chunks) {
    new Uint8Array(buf, off, c.byteLength).set(c);
    off += c.byteLength;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  heroCanvas();

  state.player = new QTTSPlayer({
    onUnderrun: () => { const e = $('#stUnder'); if (e) e.textContent = String(++chatState.underruns); },
  });
  try { await state.player.init(); } catch (e) { console.warn('audio init failed', e); }

  lab.init();
  initChat(state);
  simulator = initSimulator(state);
  simulator.loadBundle();   // prefetch so the Launchpad is instant

  await pollStatus();
  setInterval(pollStatus, 2500);
  setInterval(lab.loadProfiles, 8000);
  lab.loadProfiles();

  const cfg = await api('/api/config');
  state.config = cfg;
  const e = $('#stModel'); if (e) e.textContent = cfg.llm?.model || '—';
  const k = $('#stKey'); if (k) k.textContent = cfg.llm?.key_set ? '已配置' : '未配置';
  const v = $('#stVoice');
  if (v) v.textContent = state.active || '未选择';

  const hash = location.hash.replace('#', '');
  if (['lab', 'chat', 'sim'].includes(hash)) showTab(hash);
}

export const chatState = { underruns: 0 };

boot();
