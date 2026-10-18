/* =====================================================================
   QTTS — Launchpad: the browser-side simulator that hands you the exact
   code to run on Kaggle, plus a live self-check of the running system.
   ===================================================================== */
import { $, api, toast } from './app.js';

const SHELL = `# 1. 拉起整栈（等价于 Notebook 里的那一格）
git clone https://github.com/bizuming1-ui/Kaggle.git && cd Kaggle

# 2. 或者直接用单文件部署包
curl -fsSL -o yuyinkelong https://your-tunnel.trycloudflare.com/deploy/bundle
python yuyinkelong            # 自解压 → 装依赖 → 编译 → 起服务

# 3. 本地自检
python tools/selftest.py --quality
python tools/chat_check.py --url http://127.0.0.1:7860`;

export function initSimulator(state) {
  let bundle = '';
  let loaded = false;

  const codeEl = $('#simCode');
  const shellEl = $('#simShell');
  if (shellEl) shellEl.textContent = SHELL;

  async function loadBundle() {
    if (loaded) return bundle;
    try {
      const res = await fetch('/deploy/bundle', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bundle = await res.text();
      loaded = true;
      if (codeEl) {
        codeEl.textContent = bundle;
        const kb = (bundle.length / 1024).toFixed(0);
        const files = (bundle.match(/^    "[^"]+":/gm) || []).length;
        const runnable = bundle.startsWith('#!/') && bundle.includes('QTTS BUNDLE START') &&
          bundle.includes('QTTS BUNDLE END') && bundle.includes('FILES = {');
        const l = $('#simLen');
        if (l) l.textContent = `${files} 文件 · ${kb} KB · ${runnable ? '✓ 可直接运行' : '⚠ 非部署包'}`;
      }
      step(1, true);
      return bundle;
    } catch (e) {
      if (codeEl) codeEl.textContent = `# 部署包尚未就绪（${e.message}）\n# 该服务在 Kaggle 上运行后才会存在。`;
      return '';
    }
  }

  function step(n, done) {
    const el = document.querySelector(`.step[data-s="${n}"]`);
    if (el) el.dataset.done = done ? '1' : '0';
  }

  /* ---------------------------------------------------------- copy */
  const copyBtn = $('#btnCopy');
  copyBtn?.addEventListener('click', async () => {
    if (!loaded) await loadBundle();
    if (!bundle) return toast('部署包暂不可用', 'bad');
    try {
      await navigator.clipboard.writeText(bundle);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = bundle;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copyBtn.dataset.done = '1';
    copyBtn.innerHTML = '✓ 已复制';
    step(3, true);
    setTimeout(() => { copyBtn.dataset.done = '0'; copyBtn.innerHTML = '复制'; }, 2200);
    toast(`已复制 ${Math.round(bundle.length / 1024)} KB 真实部署包（yuyinkelong）——粘贴进 Kaggle 的一个单元格即可直接运行`, 'good');
  });

  /* ---------------------------------------------------------- live self check */
  const consoleEl = $('#simConsole');
  function line(text, cls = '') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    consoleEl.appendChild(d);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  function resetConsole() {
    consoleEl.innerHTML = '';
    line('$ qtts selftest --live');
  }

  $('#btnSimCheck')?.addEventListener('click', async () => {
    resetConsole();
    const t0 = performance.now();
    try {
      const h = await api('/api/health');
      if (!h.ok) throw new Error('gateway not ok');
      line(`gateway  ok  workers=${h.workers_healthy}  agg_rtf=${(h.agg_rtf || 0).toFixed(2)}x`, 'ok');
      const cfg = await api('/api/config');
      line(`tts      ${cfg.model}`, 'ok');
      line(`llm      ${cfg.llm?.model}  key=${cfg.llm?.key_set ? 'yes' : 'no'}  max_tokens=${cfg.llm?.max_tokens}`);
      line(`policy   start_fast=${cfg.policy?.start_fast_s}s  low=${cfg.policy?.low_s}s  high=${cfg.policy?.high_s}s`);
      const ps = await api('/api/prep/profiles');
      const n = (ps.profiles || []).length;
      line(`voices   ${n} profile(s)${cfg.active_profile ? '  active=' + cfg.active_profile : ''}`, n ? 'ok' : 'wr');
      if (!n) line('         → 还没有声音：先到「声音实验室」上传一段参考音频', 'wr');
      step(4, true);

      if (cfg.active_profile) {
        line('probe    synthesizing a probe sentence …');
        const t1 = performance.now();
        const res = await fetch('/api/speak', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '这是一次部署自检。', mode: 'read', profile: cfg.active_profile }),
        });
        const rd = res.body.getReader();
        let bytes = 0, first = 0;
        for (;;) {
          const { value, done } = await rd.read();
          if (done) break;
          if (!first) first = performance.now();
          bytes += value.length;
        }
        const ms = first - t1;
        const audio = bytes / 2 / 24000;
        line(`probe    first_bytes=${ms.toFixed(0)}ms  audio=${audio.toFixed(2)}s`, ms < 3000 ? 'ok' : 'er');
        if (ms > 3000) line(`         → 首包超过 3 s，检查两个 GPU 是否都健康`, 'er');
        else step(2, true);
      }
      line(`done     ${((performance.now() - t0) / 1000).toFixed(1)}s`, 'ok');
    } catch (e) {
      line(`error    ${e.message}`, 'er');
    }
  });

  return {
    async refresh() {
      if (!loaded) loadBundle();
      // the copy target is the source of truth: keep it fresh
      if (loaded) {
        try {
          const res = await fetch('/deploy/bundle', { cache: 'no-store' });
          const txt = await res.text();
          if (txt && txt !== bundle) {
            bundle = txt;
            if (codeEl) codeEl.textContent = bundle;
          }
        } catch (_) { /* keep the old copy */ }
      }
    },
    loadBundle,
  };
}
