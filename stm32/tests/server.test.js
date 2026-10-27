import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createStm32Server } from '../server.js';

const require = createRequire(import.meta.url);
const iconv = require('iconv-lite');

let server;
let root;
let base;
let host;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'f103-studio-test-'));
  server = await createStm32Server({ projectRoot: root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  host = `127.0.0.1:${address.port}`;
  base = `http://${host}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (root) await fs.rm(root, { recursive: true, force: true });
});

async function responseJson(response) {
  const body = await response.json();
  return { response, body };
}

test('workbench serves its real UI and reports the fixed MCU target', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
  const html = await page.text();
  assert.match(html, /STM32F103C8T6/);
  assert.match(html, /保存到项目/);
  assert.match(html, /不是浏览器临时存储/);

  const { response, body } = await responseJson(await fetch(`${base}/api/health`));
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.storage.persistent, true);
  assert.equal(body.storage.codePath, 'stm32/project/code');
  assert.equal(body.target.mcu, 'STM32F103C8T6');
  assert.equal(body.target.flashKB, 64);
  assert.equal(body.simulation.configured, false);
});

test('project is empty until an explicit save request writes a file', async () => {
  const initial = await responseJson(await fetch(`${base}/api/files`));
  assert.deepEqual(initial.body.files, []);
  assert.equal(await fileExists('code/Core/Src/main.c'), false);

  const original = iconv.encode('#include "stm32f10x.h"\r\n// 中文注释：PC13 指示灯\r\nint main(void) {\r\n\treturn 0;\r\n}\r\n', 'gb18030');
  const { response, body } = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/Core/Src/main.c')}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: original,
  }));
  assert.equal(response.status, 201);
  assert.equal(body.persisted, true);
  assert.equal(body.verified, true);
  assert.equal(body.file.kind, 'code');
  assert.equal(body.file.sha256.length, 64);
  assert.deepEqual(await fs.readFile(path.join(root, 'code/Core/Src/main.c')), original);
  assert.equal(await fileExists('code/Core/Src/main.c'), true);

  const listed = await responseJson(await fetch(`${base}/api/files`));
  assert.equal(listed.body.total, 1);
  assert.equal(listed.body.files[0].path, 'code/Core/Src/main.c');
  assert.equal(listed.body.files[0].sha256, body.file.sha256);
});

test('source reader detects GB18030 and preserves CRLF when edited', async () => {
  const opened = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/Core/Src/main.c')}`));
  assert.equal(opened.response.status, 200);
  assert.equal(opened.body.encoding, 'GB18030');
  assert.equal(opened.body.lineEnding, 'CRLF');
  assert.match(opened.body.content, /中文注释：PC13 指示灯/);
  assert.equal(opened.body.content.includes('\r'), false);

  const edited = `${opened.body.content}// 新增中文：保存后不能乱码\n`;
  const { response, body } = await responseJson(await fetch(`${base}/api/files/text?path=${encodeURIComponent('code/Core/Src/main.c')}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: edited, encoding: opened.body.encoding, lineEnding: 'CRLF', expectedSha: opened.body.sha256 }),
  }));
  assert.equal(response.status, 200);
  assert.equal(body.persisted, true);
  const disk = await fs.readFile(path.join(root, 'code/Core/Src/main.c'));
  const decoded = iconv.decode(disk, 'gb18030');
  assert.match(decoded, /新增中文：保存后不能乱码/);
  assert.match(decoded, /\r\n/);
  assert.equal(/(?<!\r)\n/.test(decoded), false);
});

test('same-name overwrite and stale editor versions are not silently allowed', async () => {
  const conflict = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/Core/Src/main.c')}`, {
    method: 'PUT', body: Buffer.from('int main(void) {}\n'),
  }));
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.code, 'FILE_EXISTS');

  const stale = await responseJson(await fetch(`${base}/api/files/text?path=${encodeURIComponent('code/Core/Src/main.c')}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'int main(void) { return 1; }\n', encoding: 'UTF-8', lineEnding: 'LF', expectedSha: '0'.repeat(64) }),
  }));
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.code, 'VERSION_CONFLICT');
  assert.match(iconv.decode(await fs.readFile(path.join(root, 'code/Core/Src/main.c')), 'gb18030'), /新增中文/);
});

test('path traversal, unsupported source types and UTF-16 are rejected', async () => {
  for (const badPath of ['code/../server.js', 'code/../../escape.c', '/absolute/main.c', '.workspace/history.c']) {
    const { response } = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent(badPath)}`, {
      method: 'PUT', body: Buffer.from('int x;\n'),
    }));
    assert.ok([400, 415].includes(response.status), badPath);
  }
  const wrongExtension = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/malware.js')}`, {
    method: 'PUT', body: Buffer.from('alert(1)'),
  }));
  assert.equal(wrongExtension.response.status, 415);
  assert.equal(wrongExtension.body.code, 'UNSUPPORTED_EXTENSION');

  const utf16 = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/utf16.c')}`, {
    method: 'PUT', body: Buffer.from('int x;\n', 'utf16le'),
  }));
  assert.equal(utf16.response.status, 415);
  assert.equal(utf16.body.code, 'BINARY_SOURCE');
  assert.equal(await fileExists('code/utf16.c'), false);
  assert.equal(await fileExists('code/utf16.c.upload-any.tmp'), false);
});

test('video is persisted as bytes and supports HTTP Range playback', async () => {
  const video = Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom', 'ascii'),
    Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2avc1mp41', 'ascii'),
    Buffer.from('reference-video-payload', 'ascii'),
  ]);
  const saved = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('videos/reference/demo.mp4')}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: video,
  }));
  assert.equal(saved.response.status, 201);
  assert.equal(saved.body.file.kind, 'video');
  assert.deepEqual(await fs.readFile(path.join(root, 'videos/reference/demo.mp4')), video);

  const range = await fetch(`${base}/api/files/raw?path=${encodeURIComponent('videos/reference/demo.mp4')}`, {
    headers: { Range: 'bytes=4-10' },
  });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), `bytes 4-10/${video.length}`);
  assert.equal(range.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await range.arrayBuffer()).toString('ascii'), 'ftypiso');
});

test('same-origin proxy writes work and cross-origin writes are blocked', async () => {
  const sameOrigin = await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/origin.h')}`, {
    method: 'PUT', headers: { Origin: `https://${host}`, 'Sec-Fetch-Site': 'same-origin' }, body: Buffer.from('#pragma once\n'),
  });
  assert.equal(sameOrigin.status, 201);
  await sameOrigin.arrayBuffer();

  const crossOrigin = await responseJson(await fetch(`${base}/api/files/content?path=${encodeURIComponent('code/blocked.h')}`, {
    method: 'PUT', headers: { Origin: 'https://attacker.invalid', 'Sec-Fetch-Site': 'cross-site' }, body: Buffer.from('#pragma once\n'),
  }));
  assert.equal(crossOrigin.response.status, 403);
  assert.equal(await fileExists('code/blocked.h'), false);
});

test('audit log records real hashes and deletion removes the project file', async () => {
  const history = await responseJson(await fetch(`${base}/api/history`));
  assert.equal(history.response.status, 200);
  assert.ok(history.body.history.length >= 3);
  assert.ok(history.body.history.some((entry) => entry.path === 'videos/reference/demo.mp4' && entry.sha256.length === 64));

  const deleted = await responseJson(await fetch(`${base}/api/files?path=${encodeURIComponent('code/origin.h')}`, { method: 'DELETE' }));
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.equal(await fileExists('code/origin.h'), false);
  const afterDelete = await responseJson(await fetch(`${base}/api/history`));
  assert.equal(afterDelete.body.history[0].action, 'deleted');
  assert.equal(afterDelete.body.history[0].path, 'code/origin.h');
});

test('front end never uses localStorage or sessionStorage as a persistence shortcut', async () => {
  const javascript = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(javascript, /localStorage|sessionStorage|indexedDB/);
  assert.match(javascript, /method: 'PUT'/);
  assert.match(javascript, /SHA-256 回读校验/);
});

async function fileExists(relative) {
  try { await fs.access(path.join(root, relative)); return true; } catch { return false; }
}
