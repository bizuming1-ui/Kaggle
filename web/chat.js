/* =====================================================================
   QTTS — voice conversation: mic → VAD → ASR → DeepSeek → 2×TTS → speaker
   with real barge-in: speaking while the assistant talks cuts it off.
   ===================================================================== */
import { MicCapture, FrameReader, FRAME, SR, encodeWav, resampleTo16k } from './player.js';
import { $, api, toast, fmtMs } from './app.js';

const VAD = {
  openThreshold: 0.012,   // rms above this = speech
  closeThreshold: 0.007,  // below this for silenceMs -> end of utterance
  silenceMs: 800,
  minUtteranceMs: 320,
  maxUtteranceMs: 15000,
};

export function initChat(state) {
  const log = $('#chatLog');
  const mic = new MicCapture({
    onLevel: (rms) => onLevel(rms),
    onState: (s) => { $('#micHint').textContent = s === 'live' ? '麦克风已就绪 · 点击或按空格开始' : '点击开始 · 空格键切换'; },
  });

  const ui = {
    listening: false,
    speaking: false,     // the user is talking
    assistantTalking: false,
    utterStart: 0,
    lastVoice: 0,
    silenceAt: 0,
    abort: null,
    history: [],
    busy: false,
    levelBars: [],
  };

  /* ---------------------------------------------------------- level meter */
  const levelBox = $('#level');
  for (let i = 0; i < 22; i++) {
    const b = document.createElement('i');
    levelBox.appendChild(b);
    ui.levelBars.push(b);
  }
  function onLevel(rms) {
    const hot = Math.min(1, rms / 0.06);
    ui.levelBars.forEach((b, i) => {
      const c = 0.55 + 0.45 * Math.sin(i * 0.7 + performance.now() / 260);
      b.style.height = `${3 + hot * 24 * c}px`;
      b.dataset.on = hot > 0.18 ? '1' : '0';
    });
    $('#hpAsrBar').style.width = `${Math.min(100, hot * 100)}%`;
    if (!ui.listening) return;

    const now = performance.now();
    if (rms >= VAD.openThreshold) {
      if (!ui.speaking) {
        ui.speaking = true;
        ui.utterStart = now;
        mic.begin();
        $('#micHint').textContent = '聆听中…';
        if (ui.assistantTalking) bargeIn(' vad');
      }
      ui.lastVoice = now;
      ui.silenceAt = 0;
    } else if (ui.speaking && rms < VAD.closeThreshold) {
      if (!ui.silenceAt) ui.silenceAt = now;
      if (now - ui.silenceAt > VAD.silenceMs) endUtterance();
    }
    if (ui.speaking && now - ui.utterStart > VAD.maxUtteranceMs) endUtterance();
  }

  async function endUtterance() {
    ui.speaking = false;
    ui.silenceAt = 0;
    const dur = performance.now() - ui.utterStart;
    const chunks = mic.end();
    if (dur < VAD.minUtteranceMs || !chunks.length) {
      $('#micHint').textContent = '太短了，再试一次';
      return;
    }
    $('#micHint').textContent = '转写中…';
    pipe('asr', '进行中');
    const wav = encodeWav(resampleTo16k(chunks, mic.rate), 16000);
    const fd = new FormData();
    fd.append('file', wav, 'mic.wav');
    try {
      const r = await api('/api/chat/asr', { method: 'POST', body: fd });
      pipe('asr', r.error ? '失败' : '完成');
      if (r.error) { toast(`ASR 失败：${r.error}`, 'bad'); return; }
      const text = (r.text || '').trim();
      if (!text) { $('#micHint').textContent = '没有听清，请再说一次'; return; }
      addMsg('me', text, { lang: r.language });
      ui.history.push({ role: 'user', content: text });
      respond(text);
    } catch (e) {
      pipe('asr', '失败');
      toast(`ASR 失败：${e.message}`, 'bad');
    } finally {
      $('#micHint').textContent = '聆听中… 点击停止';
    }
  }

  /* ---------------------------------------------------------- barge-in */
  async function bargeIn(reason) {
    if (!ui.assistantTalking) return;
    $('#barge').dataset.on = '1';
    pipe('tts', '已打断');
    try {
      await api('/api/chat/interrupt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, reason }),
      });
    } catch (_) { /* the stream abort below is the real guarantee */ }
    ui.abort?.abort();
    state.player?.reset();
    ui.assistantTalking = false;
    setTimeout(() => { $('#barge').dataset.on = '0'; }, 2600);
  }

  /* ---------------------------------------------------------- responding */
  async function respond(text) {
    if (ui.busy) { await bargeIn(' new turn'); }
    ui.busy = true;
    const player = state.player;
    player.open();
    ui.assistantTalking = true;
    const bubble = addMsg('bot', '', { streaming: true });
    const t0 = performance.now();
    let firstMs = 0, seg = 0, audioS = 0, txt = '';
    const reader = new FrameReader((type, s, payload) => {
      if (type === FRAME.PCM) {
        if (!firstMs) { firstMs = performance.now() - t0; pipe('tts', '首包'); }
        audioS += payload.byteLength / 2 / SR;
        player.push(payload);
        pipe('play', `${player.queued.toFixed(1)} s`);
        $('#stBuf').textContent = `${player.queued.toFixed(1)} s`;
        $('#stBufBar').style.width = `${Math.min(100, player.queued * 12)}%`;
      } else if (type === FRAME.TEXT) {
        txt += JSON.parse(new TextDecoder().decode(payload)).t || '';
        bubble.querySelector('.msg__bub').innerHTML = escapeHtml(txt) + '<i class="caret"></i>';
        bubble.scrollIntoView({ block: 'end', behavior: 'smooth' });
        pipe('llm', `${txt.length} 字`);
        $('#hpLlmBar').style.width = `${Math.min(100, txt.length / 3)}%`;
      } else if (type === FRAME.SEG) {
        seg++;
        pipe('seg', `${seg} 句`);
        $('#hpSegBar').style.width = `${Math.min(100, seg * 25)}%`;
      } else if (type === FRAME.EVENT) {
        const ev = JSON.parse(new TextDecoder().decode(payload));
        if (ev.phase === 'thinking') pipe('llm', '思考中');
      } else if (type === FRAME.END) {
        const end = JSON.parse(new TextDecoder().decode(payload));
        bubble.querySelector('.msg__bub').innerHTML = escapeHtml(txt);
        const wall = (performance.now() - t0) / 1000;
        const rtf = audioS / Math.max(wall, 1e-6);
        bubble.meta = `首包 ${Math.round(firstMs)} ms · ${audioS.toFixed(1)} s · ${rtf.toFixed(2)}× · ${end.segments || seg} 句`;
        bubble.querySelector('.msg__meta').innerHTML = `<span>${bubble.meta}</span>`;
        $('#stFirst').textContent = fmtMs(firstMs);
        $('#stRtf').textContent = `${(1 / Math.max(rtf, 1e-6)).toFixed(2)}× (rtf)`;
        $('#mFirst').innerHTML = `${Math.round(firstMs)}<i> ms</i>`;
        $('#mRtf').innerHTML = `${rtf.toFixed(2)}<i>×</i>`;
        $('#mSeg').textContent = String(end.segments || seg);
        pipe('play', '完成');
      } else if (type === FRAME.ERROR) {
        const e = JSON.parse(new TextDecoder().decode(payload));
        bubble.classList.add('msg--err');
        bubble.querySelector('.msg__bub').textContent = e.error || '出错了';
        toast(e.error || '出错了', 'bad');
      }
    });

    ui.abort = new AbortController();
    try {
      const body = {
        text,
        mode: 'chat',
        profile: state.active,
        language: $('#chatLang').value,
        tone: $('#chatTone').value,
      };
      if ($('#optHist').checked && ui.history.length) body.history = ui.history.slice(-8);
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ui.abort.signal,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      pipe('llm', '流式');
      const rd = res.body.getReader();
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        reader.push(value);
      }
      ui.history.push({ role: 'assistant', content: txt });
    } catch (e) {
      if (e.name !== 'AbortError') {
        bubble.classList.add('msg--err');
        bubble.querySelector('.msg__bub').textContent = e.message;
        toast(e.message, 'bad');
      }
    } finally {
      player.close();
      ui.assistantTalking = false;
      ui.busy = false;
      ui.abort = null;
      setTimeout(() => { if (!ui.assistantTalking) pipe('tts', '待机'); }, 1200);
    }
  }

  /* ---------------------------------------------------------- pipeline UI */
  function pipe(key, value) {
    const row = $(`.pipe__st[data-k="${key}"]`);
    if (!row) return;
    row.dataset.on = '1';
    row.querySelector('.pipe__v').textContent = value;
    const map = { asr: '#hpAsr', llm: '#hpLlm', seg: '#hpSeg', tts: '#hpTts', play: '#hpPlay' };
    const bar = $(map[key] + 'Bar');
    if (bar) bar.style.width = `${Math.min(100, parseFloat(row.querySelector('.meter > i')?.style.width || '0') + 20)}%`;
    const lbl = $(map[key]);
    if (lbl) lbl.textContent = value;
  }

  /* ---------------------------------------------------------- messages */
  function addMsg(who, text, opt = {}) {
    const el = document.createElement('div');
    el.className = `msg msg--${who === 'me' ? 'me' : 'bot'}`;
    el.innerHTML = `
      <div class="msg__av">${who === 'me' ? '你' : 'AI'}</div>
      <div>
        <div class="msg__bub">${escapeHtml(text) || (opt.streaming ? '<i class="caret"></i>' : '')}</div>
        <div class="msg__meta"><span>${who === 'me' ? '你' : '克隆音色'}</span></div>
      </div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  /* ---------------------------------------------------------- controls */
  async function toggleMic() {
    if (!ui.listening) {
      try {
        await mic.start();
        ui.listening = true;
        $('#btnMic').dataset.rec = '1';
        $('#micHint').textContent = '聆听中… 点击停止';
        ui.speaking = false;
        mic.begin();
        setTimeout(() => { if (ui.speaking) endUtterance(); }, 400);
      } catch (e) {
        toast(`无法访问麦克风：${e.message}`, 'bad');
      }
    } else {
      ui.listening = false;
      $('#btnMic').dataset.rec = '0';
      mic.stop();
      $('#micHint').textContent = '点击开始 · 空格键切换';
      if (ui.speaking) endUtterance();
    }
  }

  $('#btnMic').addEventListener('click', toggleMic);
  $('#btnBarge').addEventListener('click', () => bargeIn(' manual'));
  $('#btnSend').addEventListener('click', () => {
    const ta = $('#chatInput');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    addMsg('me', text);
    ui.history.push({ role: 'user', content: text });
    respond(text);
  });
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#btnSend').click(); }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggleMic(); }
  });

  // keep the voice panel in sync with the lab
  setInterval(async () => {
    const v = $('#stVoice');
    if (v) v.textContent = state.active || '未选择';
  }, 2000);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
