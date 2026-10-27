#!/usr/bin/env node
/**
 * STM32 browser workbench server.
 *
 * The browser stages File objects locally. Nothing is persisted until the
 * user explicitly invokes one of the PUT endpoints. Files are streamed to a
 * temporary file, fsynced, atomically renamed, then hashed again from disk.
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const iconv = require('iconv-lite');
const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DEFAULT_PUBLIC = path.join(HERE, 'public');
const DEFAULT_PROJECT = path.join(HERE, 'project');

const CODE_EXTENSIONS = new Set(['.c', '.h']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv']);
const VIDEO_MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
};
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
};
const LIMITS = Object.freeze({ code: 2 * 1024 * 1024, video: 500 * 1024 * 1024 });
const MAX_HISTORY = 200;
// JSON escaping and GB18030→Unicode can make the text request larger than
// the original 2 MB source bytes, so the transport limit has headroom.
const MAX_JSON_BODY = 8 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function assertRequest(condition, status, message, code, details) {
  if (!condition) throw new HttpError(status, message, code, details);
}

function json(res, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function errorResponse(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status === 500) console.error('[stm32] request failed:', error);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  json(res, status, {
    ok: false,
    error: error instanceof HttpError ? error.message : '服务器内部错误，请查看服务端日志。',
    code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
    ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function normalizedProjectPath(input) {
  assertRequest(typeof input === 'string' && input.length > 0, 400, '缺少文件路径。', 'PATH_REQUIRED');
  assertRequest(input.length <= 500, 400, '文件路径过长（最多 500 个字符）。', 'PATH_TOO_LONG');
  assertRequest(!input.includes('\0') && !input.includes('\\'), 400, '文件路径包含非法字符。', 'INVALID_PATH');
  assertRequest(!/[<>:"|?*\u0000-\u001f]/.test(input), 400, '文件路径包含 Windows 保留字符。', 'INVALID_PATH');
  assertRequest(!input.startsWith('/'), 400, '文件路径必须是项目内相对路径。', 'INVALID_PATH');

  const segments = input.split('/');
  assertRequest(segments.length >= 2 && segments.length <= 12, 400, '文件必须位于 code/ 或 videos/ 目录中。', 'INVALID_PATH');
  for (const segment of segments) {
    assertRequest(segment && segment !== '.' && segment !== '..', 400, '不允许路径穿越或空目录名。', 'INVALID_PATH');
    assertRequest(!segment.startsWith('.'), 400, '不允许写入隐藏目录或隐藏文件。', 'INVALID_PATH');
    assertRequest(!/[. ]$/.test(segment), 400, '目录或文件名不能以点号/空格结尾。', 'INVALID_PATH');
    assertRequest(!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(segment.split('.')[0]), 400,
      '文件名是 Windows 保留名称。', 'INVALID_PATH');
  }

  const kind = segments[0] === 'code' ? 'code' : segments[0] === 'videos' ? 'video' : null;
  assertRequest(kind, 400, '仅允许写入 code/ 或 videos/。', 'INVALID_ROOT');
  const ext = path.extname(segments.at(-1)).toLowerCase();
  const allowed = kind === 'code' ? CODE_EXTENSIONS : VIDEO_EXTENSIONS;
  assertRequest(allowed.has(ext), 415,
    kind === 'code' ? '代码文件仅支持 .c 和 .h。' : '视频仅支持 MP4、WebM、MOV、M4V、AVI、MKV。',
    'UNSUPPORTED_EXTENSION');

  const normalized = segments.join('/');
  assertRequest(path.posix.normalize(normalized) === normalized, 400, '文件路径不规范。', 'INVALID_PATH');
  return { normalized, kind, ext, name: segments.at(-1) };
}

function detectLineEnding(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  if (crlf === 0 && lf === 0) return 'LF';
  return crlf >= lf ? 'CRLF' : 'LF';
}

function decodeCode(buffer) {
  assertRequest(!buffer.includes(0), 415,
    '检测到 NUL 字节。请将 UTF-16 源码在 Keil 中转换为 UTF-8 或 GB18030 后再上传。',
    'BINARY_SOURCE');
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  let text;
  let encoding;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    encoding = hasBom ? 'UTF-8 BOM' : 'UTF-8';
  } catch {
    encoding = 'GB18030';
    text = iconv.decode(buffer, 'gb18030');
  }
  return {
    content: text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    encoding,
    lineEnding: detectLineEnding(text),
  };
}

function encodeCode(content, encoding, lineEnding) {
  const normalized = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const withLineEndings = lineEnding === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized;
  if (encoding === 'UTF-8' || encoding === 'UTF-8 BOM') {
    const body = Buffer.from(withLineEndings, 'utf8');
    return encoding === 'UTF-8 BOM'
      ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
  }
  if (encoding === 'GB18030' || encoding === 'GBK') {
    const iconvEncoding = encoding.toLowerCase();
    const body = iconv.encode(withLineEndings, iconvEncoding);
    const roundTrip = iconv.decode(body, iconvEncoding);
    assertRequest(roundTrip === withLineEndings, 422,
      `${encoding} 无法无损表示部分字符；请将编码改为 UTF-8 后保存。`, 'ENCODING_ROUNDTRIP_FAILED');
    return body;
  }
  throw new HttpError(400, '不支持的源码编码。', 'UNSUPPORTED_ENCODING');
}

async function readJson(req, limit = MAX_JSON_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    assertRequest(size <= limit, 413, '请求内容超过大小限制。', 'PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求正文不是有效 JSON。', 'INVALID_JSON');
  }
}

async function streamToTemp(req, destination, limit) {
  const temp = `${destination}.upload-${process.pid}-${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const handle = await fs.open(temp, 'wx');
  const hash = crypto.createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) {
        throw new HttpError(413, `文件超过 ${formatBytes(limit)} 限制。`, 'FILE_TOO_LARGE', { limit });
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
    throw error;
  }
  await handle.close();
  return { temp, size, sha256: hash.digest('hex') };
}

async function assertSafeParent(projectRoot, destination) {
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  const [realRoot, realParent] = await Promise.all([fs.realpath(projectRoot), fs.realpath(parent)]);
  assertRequest(realParent === realRoot || realParent.startsWith(`${realRoot}${path.sep}`), 403,
    '目标目录越出了项目工作区。', 'PATH_ESCAPE');
  if (await exists(destination)) {
    const stat = await fs.lstat(destination);
    assertRequest(!stat.isSymbolicLink() && stat.isFile(), 409,
      '目标路径不是普通文件，已拒绝覆盖。', 'INVALID_EXISTING_FILE');
  }
}

async function listFiles(projectRoot) {
  const output = [];
  async function walk(relativeDirectory = '') {
    const absolute = path.join(projectRoot, relativeDirectory);
    let entries;
    try { entries = await fs.readdir(absolute, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (relative === 'code' || relative === 'videos' || relativeDirectory) await walk(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      let info;
      try { info = normalizedProjectPath(relative); } catch { continue; }
      const full = path.join(projectRoot, ...relative.split('/'));
      const stat = await fs.stat(full);
      output.push({
        path: relative,
        name: info.name,
        kind: info.kind,
        extension: info.ext,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        sha256: info.kind === 'code' ? await sha256File(full) : null,
        saved: true,
      });
    }
  }
  await walk();
  return output.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

async function getFileRecord(projectRoot, relative) {
  const files = await listFiles(projectRoot);
  const found = files.find((file) => file.path === relative);
  assertRequest(found, 404, '文件不存在。', 'FILE_NOT_FOUND');
  return found;
}

async function readHistory(historyFile) {
  try {
    const value = JSON.parse(await fs.readFile(historyFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[stm32] unable to read history:', error.message);
    return [];
  }
}

export async function createStm32Server(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.env.STM32_PROJECT_ROOT || DEFAULT_PROJECT);
  const publicRoot = path.resolve(options.publicRoot || DEFAULT_PUBLIC);
  const historyFile = path.join(projectRoot, '.workspace', 'history.json');
  await Promise.all([
    fs.mkdir(path.join(projectRoot, 'code'), { recursive: true }),
    fs.mkdir(path.join(projectRoot, 'videos'), { recursive: true }),
    fs.mkdir(path.dirname(historyFile), { recursive: true }),
  ]);
  let historyQueue = Promise.resolve();
  let gitCache = { branch: 'unknown', commit: '' };
  try {
    const [branch, commit] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, timeout: 3000 }),
      execFileAsync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: REPO_ROOT, timeout: 3000 }),
    ]);
    gitCache = { branch: branch.stdout.trim(), commit: commit.stdout.trim() };
  } catch { /* The workbench also runs outside a Git checkout. */ }

  function appendHistory(entry) {
    const operation = historyQueue.then(async () => {
      const history = await readHistory(historyFile);
      history.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
      const temp = `${historyFile}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(history.slice(0, MAX_HISTORY), null, 2)}\n`, 'utf8');
      await fs.rename(temp, historyFile);
    });
    historyQueue = operation.catch(() => {});
    return operation;
  }

  function resolveFile(input) {
    const info = normalizedProjectPath(input);
    const absolute = path.resolve(projectRoot, ...info.normalized.split('/'));
    assertRequest(absolute.startsWith(`${projectRoot}${path.sep}`), 403, '目标路径越出工作区。', 'PATH_ESCAPE');
    return { info, absolute };
  }

  async function commitTempFile({ req, res, input, overwrite, expectedSha, textBody = null }) {
    const { info, absolute } = resolveFile(input);
    const previouslyExisted = await exists(absolute);
    await assertSafeParent(projectRoot, absolute);

    if (previouslyExisted) {
      const currentSha = await sha256File(absolute);
      if (expectedSha) {
        assertRequest(currentSha === expectedSha, 409,
          '磁盘上的文件已被其他操作修改。为避免覆盖新内容，请重新打开后再保存。',
          'VERSION_CONFLICT', { currentSha });
      } else {
        assertRequest(overwrite, 409, '项目中已存在同名文件。确认覆盖后才能保存。',
          'FILE_EXISTS', { path: info.normalized });
      }
    }

    let staged;
    if (textBody) {
      const { content, encoding = 'UTF-8', lineEnding = 'LF' } = textBody;
      assertRequest(typeof content === 'string', 400, '源码内容必须是字符串。', 'INVALID_CONTENT');
      assertRequest(lineEnding === 'LF' || lineEnding === 'CRLF', 400, '换行格式仅支持 LF 或 CRLF。', 'INVALID_LINE_ENDING');
      const bytes = encodeCode(content, encoding, lineEnding);
      assertRequest(bytes.length <= LIMITS.code, 413, `代码文件超过 ${formatBytes(LIMITS.code)} 限制。`, 'FILE_TOO_LARGE');
      const pseudoReq = (async function* () { yield bytes; })();
      staged = await streamToTemp(pseudoReq, absolute, LIMITS.code);
    } else {
      staged = await streamToTemp(req, absolute, LIMITS[info.kind]);
      try {
        assertRequest(staged.size > 0, 400, '空文件不会写入项目。', 'EMPTY_FILE');
        if (info.kind === 'code') decodeCode(await fs.readFile(staged.temp));
      } catch (error) {
        await fs.unlink(staged.temp).catch(() => {});
        throw error;
      }
    }

    try {
      await fs.rename(staged.temp, absolute);
    } catch (error) {
      await fs.unlink(staged.temp).catch(() => {});
      throw error;
    }
    const verifiedSha = await sha256File(absolute);
    assertRequest(verifiedSha === staged.sha256, 500, '落盘校验失败，文件摘要与写入内容不一致。', 'VERIFY_FAILED');
    const stat = await fs.stat(absolute);
    const record = {
      path: info.normalized,
      name: info.name,
      kind: info.kind,
      extension: info.ext,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: verifiedSha,
      saved: true,
    };
    let audited = true;
    try {
      await appendHistory({
        action: previouslyExisted ? 'updated' : 'created',
        path: info.normalized,
        kind: info.kind,
        size: stat.size,
        sha256: verifiedSha,
      });
    } catch (error) {
      audited = false;
      console.error('[stm32] file saved but audit append failed:', error);
    }
    json(res, previouslyExisted ? 200 : 201, {
      ok: true,
      persisted: true,
      verified: true,
      audited,
      file: record,
      projectRelativePath: `stm32/project/${info.normalized}`,
      message: `已写入项目并校验：${info.normalized}`,
    });
  }

  async function serveRaw(req, res, url) {
    const { info, absolute } = resolveFile(url.searchParams.get('path'));
    const realRoot = await fs.realpath(projectRoot);
    let realFile;
    try { realFile = await fs.realpath(absolute); }
    catch (error) { throw new HttpError(error.code === 'ENOENT' ? 404 : 400, '文件不存在。', 'FILE_NOT_FOUND'); }
    assertRequest(realFile === realRoot || realFile.startsWith(`${realRoot}${path.sep}`), 403,
      '目标路径越出工作区。', 'PATH_ESCAPE');
    const stat = await fs.lstat(realFile);
    assertRequest(stat.isFile() && !(await fs.lstat(absolute)).isSymbolicLink(), 404, '文件不存在。', 'FILE_NOT_FOUND');

    const download = url.searchParams.get('download') === '1';
    const mime = info.kind === 'video' ? VIDEO_MIME[info.ext] : 'text/plain; charset=utf-8';
    const headers = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(info.name)}`,
    };
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      assertRequest(match, 416, '不支持该 Range 请求。', 'INVALID_RANGE');
      if (match[1] === '' && match[2] !== '') {
        const suffix = Number(match[2]);
        assertRequest(Number.isSafeInteger(suffix) && suffix > 0, 416, '无效的 Range。', 'INVALID_RANGE');
        start = Math.max(0, stat.size - suffix);
      } else {
        start = Number(match[1] || 0);
        if (match[2]) end = Math.min(Number(match[2]), stat.size - 1);
      }
      assertRequest(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < stat.size,
        416, '请求的 Range 超出文件大小。', 'INVALID_RANGE');
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(realFile, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  async function serveStatic(req, res, pathname) {
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    assertRequest(!requested.includes('\0'), 400, '无效资源路径。', 'INVALID_PATH');
    const absolute = path.resolve(publicRoot, requested);
    assertRequest(absolute.startsWith(`${publicRoot}${path.sep}`), 404, '页面不存在。', 'NOT_FOUND');
    let stat;
    try { stat = await fs.stat(absolute); }
    catch { throw new HttpError(404, '页面不存在。', 'NOT_FOUND'); }
    assertRequest(stat.isFile(), 404, '页面不存在。', 'NOT_FOUND');
    const ext = path.extname(absolute).toLowerCase();
    const headers = {
      'Content-Type': STATIC_MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(absolute).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://stm32.local');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin) {
          let originHost = '';
          try { originHost = new URL(origin).host; } catch { /* rejected below */ }
          const allowedHosts = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean);
          assertRequest(originHost && allowedHosts.includes(originHost), 403,
            '拒绝跨来源写入项目。', 'ORIGIN_MISMATCH');
        }
        assertRequest(req.headers['sec-fetch-site'] !== 'cross-site', 403, '拒绝跨站写入项目。', 'CROSS_SITE_WRITE');
      }

      if (pathname === '/api/health' && req.method === 'GET') {
        const files = await listFiles(projectRoot);
        return json(res, 200, {
          ok: true,
          service: 'stm32-workbench',
          target: {
            mcu: 'STM32F103C8T6', architecture: 'ARM Cortex-M3', frequencyMHz: 72,
            flashKB: 64, sramKB: 20, package: 'LQFP48', ide: 'Keil MDK / µVision5',
          },
          storage: {
            persistent: true,
            projectRelativePath: 'stm32/project',
            codePath: 'stm32/project/code',
            videoPath: 'stm32/project/videos',
          },
          limits: LIMITS,
          accepted: { code: [...CODE_EXTENSIONS], video: [...VIDEO_EXTENSIONS] },
          counts: {
            code: files.filter((f) => f.kind === 'code').length,
            video: files.filter((f) => f.kind === 'video').length,
          },
          git: gitCache,
          simulation: { configured: false, state: 'awaiting_firmware' },
          serverTime: new Date().toISOString(),
        });
      }
      if (pathname === '/api/files' && req.method === 'GET') {
        const files = await listFiles(projectRoot);
        return json(res, 200, { ok: true, files, total: files.length });
      }
      if (pathname === '/api/files/content' && req.method === 'GET') {
        const { info, absolute } = resolveFile(url.searchParams.get('path'));
        assertRequest(info.kind === 'code', 400, '只有源码支持文本读取。', 'NOT_SOURCE_FILE');
        const buffer = await fs.readFile(absolute).catch((error) => {
          throw new HttpError(error.code === 'ENOENT' ? 404 : 400, '源码文件不存在。', 'FILE_NOT_FOUND');
        });
        assertRequest(buffer.length <= LIMITS.code, 413, '源码文件过大。', 'FILE_TOO_LARGE');
        const decoded = decodeCode(buffer);
        return json(res, 200, {
          ok: true, path: info.normalized, ...decoded,
          sha256: await sha256File(absolute), size: buffer.length,
        });
      }
      if (pathname === '/api/files/content' && req.method === 'PUT') {
        return await commitTempFile({
          req, res, input: url.searchParams.get('path'),
          overwrite: url.searchParams.get('overwrite') === '1',
          expectedSha: url.searchParams.get('expectedSha') || '',
        });
      }
      if (pathname === '/api/files/text' && req.method === 'PUT') {
        const body = await readJson(req);
        return await commitTempFile({
          req, res, input: url.searchParams.get('path'),
          overwrite: body.overwrite === true,
          expectedSha: typeof body.expectedSha === 'string' ? body.expectedSha : '',
          textBody: body,
        });
      }
      if (pathname === '/api/files/raw' && (req.method === 'GET' || req.method === 'HEAD')) {
        return await serveRaw(req, res, url);
      }
      if (pathname === '/api/files' && req.method === 'DELETE') {
        const { info, absolute } = resolveFile(url.searchParams.get('path'));
        const before = await getFileRecord(projectRoot, info.normalized);
        const stat = await fs.lstat(absolute);
        assertRequest(stat.isFile() && !stat.isSymbolicLink(), 400, '只能删除普通文件。', 'INVALID_FILE');
        await fs.unlink(absolute);
        await appendHistory({ action: 'deleted', path: info.normalized, kind: info.kind,
          size: before.size, sha256: before.sha256 });
        return json(res, 200, { ok: true, deleted: true, path: info.normalized });
      }
      if (pathname === '/api/history' && req.method === 'GET') {
        return json(res, 200, { ok: true, history: await readHistory(historyFile) });
      }
      if (pathname.startsWith('/api/')) throw new HttpError(404, 'API 不存在。', 'API_NOT_FOUND');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '不支持的请求方法。', 'METHOD_NOT_ALLOWED');
      return await serveStatic(req, res, pathname);
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 15 * 60_000;
  server.on('clientError', (error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.STM32_PORT || process.env.PORT || 3000);
  const server = await createStm32Server();
  server.listen(port, '0.0.0.0', () => {
    console.log(`\nSTM32 Workbench ready`);
    console.log(`  Target:   STM32F103C8T6 / Keil µVision5`);
    console.log(`  Listen:   0.0.0.0:${port}`);
    console.log(`  Persist:  ${path.resolve(process.env.STM32_PROJECT_ROOT || DEFAULT_PROJECT)}`);
    console.log(`  Uploads:  staged until “保存到项目” is clicked\n`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
