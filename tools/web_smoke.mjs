/* Headless smoke test for the QTTS web app: loads index.html in jsdom,
   runs the real ES modules against a stubbed gateway, and fails loudly on
   any uncaught error, missing element or bad API contract. */
import vm from 'node:vm';
import { createRequire } from 'node:module';

// jsdom is a dev-only dependency:  npm i  (see package.json)
// QTTS_JSDOM=/path/to/node_modules allows pointing at an existing install.
const require_ = createRequire(import.meta.url);
let JSDOM, VirtualConsole, ResourceLoader;
try {
  ({ JSDOM, VirtualConsole, ResourceLoader } = require_('jsdom'));
} catch (e) {
  const alt = process.env.QTTS_JSDOM;
  if (!alt) {
    console.error('jsdom is not installed.  Run:  npm install   (or set QTTS_JSDOM=/path/to/node_modules)');
    process.exit(2);
  }
  ({ JSDOM, VirtualConsole, ResourceLoader } = require_(alt + '/jsdom'));
}
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..', 'web');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', () => {});
vc.on('log', () => {});

const SIMPAGE = process.argv.includes('--sim');
const html = readFileSync(path.join(WEB, SIMPAGE ? 'sim.html' : 'index.html'), 'utf8');

class LocalOnly extends ResourceLoader {
  fetch(url) {
    if (url.startsWith('http://127.0.0.1:7860/')) {
      const rel = url.replace('http://127.0.0.1:7860/', '').split('?')[0] || 'index.html';
      try { return Promise.resolve(readFileSync(path.join(WEB, rel))); }
      catch (e) { return Promise.reject(e); }
    }
    return null;   // block external resources (fonts, etc.)
  }
}

const dom = new JSDOM(html, {
  url: SIMPAGE ? 'http://127.0.0.1:7860/sim.html' : 'http://127.0.0.1:7860/',
  runScripts: 'dangerously',
  resources: new LocalOnly(),
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
        status, headers: { 'content-type': 'application/json' },
      });
      if (u.startsWith('/api/health')) {
        return json({
          ok: true, workers_healthy: 2, agg_rtf: 1.82, active_profile: 'demo-voice',
          policy: { start_fast_s: 0.3, low_s: 5, high_s: 42, start_s: 2 },
          workers: [{ id: 0 }, { id: 1 }],
        });
      }
      if (u.startsWith('/api/config')) {
        return json({
          model: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base', sample_rate: 24000, version: '2.0.0',
          active_profile: 'demo-voice', analyst: 'http://127.0.0.1:7010',
          llm: { model: 'deepseek-flash', key_set: true, max_tokens: 4096, base: 'https://api.deepseek.com' },
          policy: { start_fast_s: 0.3, low_s: 5, high_s: 42, start_s: 2 },
          workers: ['http://127.0.0.1:7001', 'http://127.0.0.1:7002'],
        });
      }
      if (u.startsWith('/api/profiles')) {
        return json({ active: 'demo-voice', profiles: [{ id: 'demo-voice', name: '演示声音' }] });
      }
      if (u.startsWith('/api/prep/profiles')) {
        return json({
          profiles: [{
            id: 'demo-voice', name: '演示声音', language: 'Chinese', created: '2026-01-01',
            stats: { clips: 8 }, f0: { median: 132.4 }, quality: { speaker_model: 'ecapa' },
          }],
        });
      }
      if (u.startsWith('/deploy/bundle')) {
        return new Response('import base64\nFILES = {\n  "MEMO.md": ("abc", (\n    "xyz"\n  )),\n}\n', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (u.startsWith('/api/speak')) {
        // a real frame stream: [type u8][seg u32][len u32][payload]
        const pcm = new Uint8Array(24000 * 2);
        const frames = [];
        const mk = (type, seg, payload) => {
          const b = new Uint8Array(9 + payload.length);
          const dv = new DataView(b.buffer);
          dv.setUint8(0, type); dv.setUint32(1, seg, true); dv.setUint32(5, payload.length, true);
          b.set(payload, 9);
          frames.push(b);
        };
        mk(3, 0, new TextEncoder().encode(JSON.stringify({ t: '你好。' })));
        mk(1, 0, pcm);
        mk(5, 0, new TextEncoder().encode(JSON.stringify({ segments: 1, overall_rtf_x: 2.4 })));
        const all = new Uint8Array(frames.reduce((a, f) => a + f.length, 0));
        let o = 0; for (const f of frames) { all.set(f, o); o += f.length; }
        return new Response(all, { headers: { 'content-type': 'application/octet-stream' } });
      }
      if (u.startsWith('/api/chat/asr')) {
        return json({ text: '你好', language: 'zh', duration_s: 1.2 });
      }
      return json({ error: 'not stubbed: ' + u }, 404);
    };
    window.URL.createObjectURL = () => 'blob:stub';
    window.URL.revokeObjectURL = () => {};
    window.HTMLCanvasElement.prototype.getContext = () => ({
      setTransform() {}, clearRect() {}, createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, fillStyle: '', beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      arc() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    });
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.navigator.clipboard = { writeText: async () => {} };
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLElement.prototype.play = () => Promise.resolve();
  },
});

const w = dom.window;
w.addEventListener('error', (e) => errors.push('window.error: ' + (e.error?.stack || e.message)));
w.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + (e.reason?.stack || e.reason)));

// jsdom cannot execute type=module scripts, so we link and evaluate the
// real ES modules inside the jsdom realm with vm.SourceTextModule.
const ctx = dom.getInternalVMContext();
const cache = new Map();
function getModule(file) {
  if (cache.has(file)) return cache.get(file);
  const src = readFileSync(path.join(WEB, file), 'utf8');
  const m = new vm.SourceTextModule(src, { context: ctx, identifier: file });
  cache.set(file, m);
  return m;
}
try {
  const app = getModule('app.js');
  await app.link((spec) => getModule(spec.replace(/^\.\//, '')));
  await app.evaluate();
} catch (e) {
  errors.push('evaluate app.js failed: ' + (e.stack || e.message));
}

await new Promise((r) => setTimeout(r, 2500));

/* ---------------- assertions ---------------- */
const problems = [];
const must = (cond, msg) => { if (!cond) problems.push(msg); };

const doc = w.document;
const WANT_RTF = SIMPAGE ? '2.41' : '1.82';
must(doc.querySelectorAll('.nav button').length === 3, 'nav must have 3 tabs');
must(doc.querySelector('#panel-lab')?.hasAttribute('data-active'), 'lab panel must be active by default');
must(doc.querySelector('#statusText')?.textContent?.includes('GPU'), 'status must show the GPU count');
must(doc.querySelector('#mRtf')?.textContent?.includes(WANT_RTF), `hero RTF must be ${WANT_RTF}`);
must(doc.querySelector('#stModel')?.textContent === 'deepseek-flash', 'LLM model must be rendered');
must(doc.querySelector('#profList')?.children.length >= (SIMPAGE ? 2 : 1), 'the profile list must render');
must(SIMPAGE ? !!doc.querySelector('.simchip') : !doc.querySelector('.simchip'),
  SIMPAGE ? 'the simulator chip must be present in sim mode' : 'no simulator chip on the real site');

// tab switching
doc.querySelector('[data-tab="chat"]').dispatchEvent(new w.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 120));
must(doc.querySelector('#panel-chat')?.hasAttribute('data-active'), 'chat panel must activate');
must(doc.querySelector('#panel-lab')?.hasAttribute('data-active') === false, 'lab panel must deactivate');
must(doc.querySelectorAll('.pipe__st').length === 5, 'the pipeline must have 5 stages');
must(doc.querySelectorAll('#level i').length === 22, 'the level meter must be built');

doc.querySelector('[data-tab="sim"]').dispatchEvent(new w.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 120));
must(doc.querySelector('#panel-sim')?.hasAttribute('data-active'), 'sim panel must activate');
await new Promise((r) => setTimeout(r, 500));
must(doc.querySelector('#simCode')?.textContent?.includes('import base64'), 'the bundle must be loaded');
must(doc.querySelector('#simLen')?.textContent?.includes('文件'), 'the bundle stats must be rendered');

// the copy button must actually copy the bundle
let copied = null;
w.navigator.clipboard.writeText = async (t) => { copied = t; };
doc.querySelector('#btnCopy').dispatchEvent(new w.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
must(copied && copied.includes('import base64'), 'the copy button must copy the bundle');

// the lab speak button must synthesise and report the first-audio time
doc.querySelector('[data-tab="lab"]').dispatchEvent(new w.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
doc.querySelector('#btnSpeak').dispatchEvent(new w.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 900));
const info = doc.querySelector('#speakInfo')?.textContent || '';
must(info.includes('首包'), 'the speak button must report the first-audio latency: ' + info);

// the self-check console must run
doc.querySelector('[data-tab="sim"]').dispatchEvent(new w.Event('click', { bubbles: true }));
doc.querySelector('#btnSimCheck').dispatchEvent(new w.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 900));
const log = doc.querySelector('#simConsole')?.textContent || '';
must(log.includes('gateway'), 'the self-check must print a gateway line');
must(log.includes('probe'), 'the self-check must run a synthesis probe');

/* ---------------- report ---------------- */
const all = [...problems, ...errors];
if (all.length) {
  console.log(`✗ DOM smoke test FAILED (${SIMPAGE ? 'simulator page' : 'site page'})`);
  for (const p of all) console.log('   - ' + p);
  process.exit(1);
}
console.log(`✓ DOM smoke test passed (${SIMPAGE ? 'simulator page · sim-data.js backend' : 'site page · stub gateway'}): ` + [
  '3 tabs', 'status', 'hero metrics', 'profile list', 'bundle load', 'copy',
  'pipeline', 'level meter', 'speak latency', 'self-check', 'sim chip',
].join(', '));
process.exit(0);
