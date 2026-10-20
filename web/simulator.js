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

/* The paste-safe bootstrap cell: ~1 kB instead of ~230 kB, so a notebook
   paste can never be silently truncated.  Pure Python — no IPython magics,
   no string literals that a cut could leave unterminated. */
const MINI = `# QTTS 一键部署 — 粘贴到 Kaggle 一个单元格（T4 x2 + Internet On）后运行
import urllib.request
URLS = [
    "https://raw.githubusercontent.com/bizuming1-ui/Kaggle/arena/4367c483-kaggle/yuyinkelong",
    "https://github.com/bizuming1-ui/Kaggle/raw/arena/4367c483-kaggle/yuyinkelong",
    "https://cdn.jsdelivr.net/gh/bizuming1-ui/Kaggle@arena/4367c483-kaggle/yuyinkelong",
]
for _u in URLS:
    try:
        _d = urllib.request.urlopen(_u, timeout=120).read()
        open("yuyinkelong", "wb").write(_d)
        print("downloaded", len(_d), "bytes from", _u)
        break
    except Exception as _e:
        print("mirror failed:", _u, "->", _e)
else:
    raise SystemExit("所有镜像均失败——请改用「复制完整部署包」")
exec(compile(open("yuyinkelong", encoding="utf-8").read(), "yuyinkelong", "exec"), {"__name__": "__main__"})`;

function looksRunnable(t) {
  return typeof t === 'string' && t.startsWith('#!/') &&
    t.includes('QTTS BUNDLE START') && t.includes('QTTS BUNDLE END') &&
    t.includes('FILES = {') && t.includes('import base64');
}

async function fingerprint(t) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(buf)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    let h = 0;
    for (let i = 0; i < t.length; i += 97) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  }
}

async function loadInlineBundle() {
  // The complete code is embedded in bundle-inline.js NEXT TO this page.
  // It works with no gateway and no network (static hosting, previews,
  // backend down).  On Kaggle that module is not shipped in the bundle,
  // so the import fails and loadBundle() falls back to sim-bundle.txt and
  // then the gateway copy — the pre-existing verified behaviour there.
  try {
    const mod = await import('./bundle-inline.js');
    return looksRunnable(mod.BUNDLE_TEXT) ? mod.BUNDLE_TEXT : '';
  } catch (_) {
    return '';
  }
}

export function initSimulator(state) {
  let bundle = '';
  let bundleSource = '';
  let loaded = false;

  const codeEl = $('#simCode');
  const shellEl = $('#simShell');
  const miniEl = $('#simMini');
  if (shellEl) shellEl.textContent = SHELL;
  if (miniEl) miniEl.textContent = MINI;

  async function loadBundle(force = false) {
    if (loaded && !force) return bundle;
    try {
      // 1) embedded module next to the page (no gateway, no network)
      let txt = await loadInlineBundle();
      bundleSource = txt ? '已内置于页面' : '';
      // 2) plain-text copy next to the page (module-blocked environments)
      if (!txt) {
        try {
          const r2 = await fetch('sim-bundle.txt', { cache: 'no-store' });
          if (r2.ok) {
            const t2 = await r2.text();
            if (looksRunnable(t2)) { txt = t2; bundleSource = '已内置于页面'; }
          }
        } catch (_) { /* fall through to the gateway copy */ }
      }
      // 3) gateway live copy (the only source on Kaggle)
      if (!txt) {
        const sig = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
          ? AbortSignal.timeout(8000) : undefined;
        const res = await fetch('/deploy/bundle', { cache: 'no-store', signal: sig });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        txt = await res.text();
        bundleSource = '网关实时版本';
      }
      if (!looksRunnable(txt)) throw new Error('内容不是可运行部署包');
      bundle = txt;
      loaded = true;
      if (codeEl) {
        codeEl.textContent = bundle;
        const kb = (bundle.length / 1024).toFixed(0);
        const files = (bundle.match(/^    "[^"]+":/gm) || []).length;
        const fp = await fingerprint(bundle);
        const l = $('#simLen');
        if (l) l.textContent = `${files} 文件 · ${kb} KB · ✓ 可直接运行 · ${bundleSource} · 指纹 ${fp}`;
      }
      step(1, true);
      return bundle;
    } catch (e) {
      loaded = false;
      bundle = '';
      bundleSource = '';
      if (codeEl) codeEl.textContent =
        `# 部署包尚未就绪（${e.message}）\n# 请点「复制完整部署包」重试，或使用上方小引导格（从 GitHub 镜像下载）。`;
      return '';
    }
  }

  function step(n, done) {
    const el = document.querySelector(`.step[data-s="${n}"]`);
    if (el) el.dataset.done = done ? '1' : '0';
  }

  /* ---------------------------------------------------------- copy */
  /* Clipboard in embedded/previews can reject navigator.clipboard; a plain
     execCommand inside the user gesture is the reliable path there.  Only a
     real success shows "✓ 已复制" — otherwise we select the code and tell the
     user to press Ctrl+C. */
  function selectText(el) {
    try {
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      el.scrollIntoView({ block: 'nearest' });
    } catch (_) { /* selection is a best-effort fallback */ }
  }

  async function copySmart(text, preEl) {
    // 1) synchronous path inside the click gesture (works in most iframes)
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) return 'copied';
    } catch (_) { /* fall through */ }
    // 2) modern API (needs permission + focus)
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch (_) { /* fall through */ }
    // 3) last resort: select the visible code so Ctrl+C works
    selectText(preEl);
    return 'selected';
  }

  const copyBtn = $('#btnCopy');
  copyBtn?.addEventListener('click', async () => {
    let text = bundle;
    if (!looksRunnable(text)) {
      copyBtn.innerHTML = '拉取最新…';
      text = await loadBundle(true);
      if (!looksRunnable(text)) text = await loadBundle(true);   // one honest retry
    }
    if (!looksRunnable(text)) {
      // NEVER select the code box here: it may hold placeholder text and
      // the user would unknowingly copy garbage into Kaggle.
      copyBtn.innerHTML = '复制';
      return toast('完整代码暂时加载不到——可先用上方「复制小引导格」（约 1 KB，零依赖），或刷新页面重试', 'bad');
    }
    const fp = await fingerprint(text);
    const how = await copySmart(text, codeEl);
    if (how === 'copied') {
      copyBtn.dataset.done = '1';
      copyBtn.innerHTML = '✓ 已复制';
      step(3, true);
      setTimeout(() => { copyBtn.dataset.done = '0'; copyBtn.innerHTML = '复制'; }, 2200);
      toast(`已复制 ${Math.round(text.length / 1024)} KB 真实部署包（yuyinkelong · 指纹 ${fp}）——粘贴进 Kaggle 一个单元格即可直接运行`, 'good');
    } else {
      copyBtn.innerHTML = '复制';
      toast('浏览器限制了剪贴板——已为你选中代码，请按 Ctrl+C（Mac: ⌘C）复制', 'bad');
    }
    loadBundle(true).catch(() => {});   // keep the cached copy fresh for next time
  });

  const miniBtn = $('#btnCopyMini');
  miniBtn?.addEventListener('click', async () => {
    const how = await copySmart(MINI, miniEl);
    if (how === 'copied') {
      miniBtn.dataset.done = '1';
      miniBtn.innerHTML = '✓ 已复制';
      setTimeout(() => { miniBtn.dataset.done = '0'; miniBtn.innerHTML = '复制小引导格'; }, 2200);
      toast('已复制小引导格（约 1 KB）——粘贴进 Kaggle 一个单元格运行，它会自动下载完整部署包并启动', 'good');
    } else {
      toast('浏览器限制了剪贴板——已为你选中代码，请按 Ctrl+C（Mac: ⌘C）复制', 'bad');
    }
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
      // Embedded copies are authoritative; only a GATEWAY-sourced copy is
      // refreshed, and only ever replaced by another verified-runnable
      // bundle (a 404 body must never clobber good code).
      if (loaded && bundleSource === '网关实时版本') {
        try {
          const res = await fetch('/deploy/bundle', { cache: 'no-store' });
          if (!res.ok) return;
          const txt = await res.text();
          if (looksRunnable(txt) && txt !== bundle) {
            bundle = txt;
            if (codeEl) codeEl.textContent = bundle;
          }
        } catch (_) { /* keep the old copy */ }
      }
    },
    loadBundle,
  };
}
