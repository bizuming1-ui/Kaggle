import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { File } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createStm32Server } from '../server.js';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

async function waitFor(predicate, message, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${message}`);
}

test('real DOM workflow: select -> not persisted -> click save -> persisted -> edit', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'f103-studio-ui-'));
  const server = await createStm32Server({ projectRoot });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const virtualConsole = new VirtualConsole();
  const browserErrors = [];
  virtualConsole.on('jsdomError', (error) => browserErrors.push(error));
  virtualConsole.on('error', (error) => browserErrors.push(error));

  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: `${base}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.fetch = (url, options) => fetch(new URL(url, base), options);
  window.scrollTo = () => {};
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;
  window.File = File;
  window.Blob = Blob;
  window.URL.createObjectURL = URL.createObjectURL;
  window.URL.revokeObjectURL = URL.revokeObjectURL;
  window.document.execCommand = (command) => {
    if (command !== 'copy') return false;
    const helpers = [...window.document.querySelectorAll('textarea[readonly]')];
    const helper = helpers.at(-1);
    if (!helper) return false;
    window.__copiedCode = helper.value;
    return true;
  };

  t.after(async () => {
    window.close();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  window.eval(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'));
  await waitFor(() => window.document.querySelector('#sideConnectionText').textContent === '项目服务已连接', 'workbench connected');
  assert.equal(window.document.querySelectorAll('.board-svg').length, 2);
  assert.equal(window.document.querySelector('#fatalBanner').hidden, true);
  assert.equal(window.document.querySelector('#pendingCount').hidden, true);
  const firmwareLink = window.document.querySelector('a[href="/firmware.hex"]');
  assert.ok(firmwareLink, 'hardware view exposes the verified Proteus HEX');
  assert.equal(firmwareLink.getAttribute('download'), 'stm32f103-matrix-8mhz.hex');
  assert.match(firmwareLink.textContent, /下载已验证 HEX/);
  const behaviorNotice = window.document.querySelector('#firmwareBehaviorNotice');
  assert.ok(behaviorNotice, 'hardware view explains the exact 1..8 button behavior');
  assert.match(behaviorNotice.textContent, /PA4 升到 8/);
  assert.match(behaviorNotice.textContent, /PA5 降到 1/);
  assert.match(behaviorNotice.textContent, /PA6 暂停/);
  assert.match(behaviorNotice.textContent, /立即看到 2/);

  const source = '#include "stm32f10x.h"\r\n// 浏览器按钮真实保存测试\r\nint main(void) { return 0; }\r\n';
  await window.eval(`stageEntries([{ file: new File([${JSON.stringify(source)}], 'main.c', { type: 'text/plain' }), relativePath: 'main.c' }])`);
  assert.equal(window.document.querySelectorAll('.queue-item').length, 1);
  assert.equal(window.document.querySelector('#pendingCount').textContent, '1');
  const mainPath = path.join(projectRoot, 'code/main.c');
  await assert.rejects(fs.access(mainPath), 'selecting a file must not persist it before the save button');

  window.document.querySelector('#saveAllButton').click();
  await waitFor(async () => {
    try { await fs.access(mainPath); return true; } catch { return false; }
  }, 'clicking save writes code/main.c');
  await waitFor(() => window.document.querySelectorAll('.queue-item').length === 0, 'saved item leaves the pending queue');
  await waitFor(() => window.document.querySelector('#recentFileBody').textContent.includes('main.c'), 'backend directory scan refreshes the project table');
  await waitFor(() => window.document.querySelector('#saveState').textContent.includes('所有更改已落盘'), 'save refresh and notification finish before teardown');
  assert.equal(await fs.readFile(mainPath, 'utf8'), source);
  assert.match(window.document.querySelector('#recentFileBody').textContent, /main\.c/);
  assert.match(window.document.querySelector('#recentFileBody').textContent, /已落盘/);
  assert.match(window.document.querySelector('#saveState').textContent, /所有更改已落盘/);

  await window.eval('openCode("code/main.c")');
  assert.equal(window.document.querySelector('#editorWorkspace').hidden, false);
  assert.match(window.document.querySelector('#codeEditor').value, /真实保存测试/);
  window.document.querySelector('#copyCurrent').click();
  assert.match(window.__copiedCode, /int main\(void\)/, 'copy button copies the actual editor content for Keil');
  const editor = window.document.querySelector('#codeEditor');
  editor.value = editor.value.replace('return 0', 'return 42');
  editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(window.document.querySelector('#pendingCount').textContent, '1');
  window.document.querySelector('#saveCurrent').click();
  await waitFor(async () => (await fs.readFile(mainPath, 'utf8')).includes('return 42'), 'Ctrl/S save-current path persists edits');
  await waitFor(() => window.document.querySelector('#pendingCount').hidden, 'draft is cleared after verified save');
  await waitFor(() => window.document.querySelector('#saveState').textContent.includes('所有更改已落盘'), 'edited-file refresh and notification finish before teardown');
  assert.match(await fs.readFile(mainPath, 'utf8'), /return 42/);
  assert.deepEqual(browserErrors, []);
});
