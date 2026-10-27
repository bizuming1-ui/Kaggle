const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const CODE_EXTENSIONS = new Set(['c', 'h']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv']);
const DEFAULT_LIMITS = { code: 2 * 1024 * 1024, video: 500 * 1024 * 1024 };
const VIEW_NAMES = ['workspace', 'files', 'videos', 'simulation', 'history'];

const state = {
  health: null,
  connected: false,
  files: [],
  staged: new Map(),
  documents: new Map(),
  drafts: new Map(),
  currentKey: null,
  selectedVideoKey: null,
  currentView: 'workspace',
  busy: false,
  limits: { ...DEFAULT_LIMITS },
};

function icon(name, className = '') {
  return `<svg${className ? ` class="${className}"` : ''} aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value, includeDate = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', includeDate
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
}

function extensionOf(name) {
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function baseName(key) {
  return key.split('/').at(-1);
}

function rawUrl(key, download = false) {
  return `/api/files/raw?path=${encodeURIComponent(key)}${download ? '&download=1' : ''}`;
}

function savedFile(key) {
  return state.files.find((file) => file.path === key);
}

function pendingCount() {
  let count = state.staged.size;
  for (const key of state.drafts.keys()) if (!state.staged.has(key)) count += 1;
  return count;
}

function toast(title, message = '', type = 'success', duration = 5000) {
  const region = $('#toastRegion');
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  const iconName = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check';
  element.innerHTML = `<span>${icon(iconName)}</span><div><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div><button aria-label="关闭通知">${icon('x')}</button>`;
  const remove = () => element.remove();
  $('button', element).addEventListener('click', remove);
  region.append(element);
  while (region.children.length > 4) region.firstElementChild.remove();
  if (duration) setTimeout(remove, type === 'error' ? Math.max(duration, 8000) : duration);
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store', ...options });
  } catch (error) {
    setConnected(false, error);
    throw new Error('无法连接项目后端。请确认服务仍在运行。');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`后端返回了无法解析的响应（HTTP ${response.status}）。`); }
  if (!response.ok) {
    const error = new Error(data.error || `请求失败（HTTP ${response.status}）。`);
    error.code = data.code;
    error.status = response.status;
    error.details = data.details;
    throw error;
  }
  return data;
}

function setConnected(connected, error = null) {
  state.connected = connected;
  $('#sideConnectionDot').className = `connection-dot ${connected ? 'online' : 'offline'}`;
  $('#sideConnectionText').textContent = connected ? '项目服务已连接' : '项目服务未连接';
  $('#storageBar').style.width = connected ? '100%' : '0';
  $('#fatalBanner').hidden = connected;
  if (!connected && error) $('#fatalMessage').textContent = `${error.message || error}。已选择的文件不会自动视为已保存。`;
  updateSaveState();
}

function updateSaveState() {
  const count = pendingCount();
  const saveState = $('#saveState');
  const label = $('span:last-child', saveState);
  saveState.className = 'save-state';
  if (!state.connected) {
    saveState.classList.add('error');
    label.textContent = '后端未连接';
  } else if (state.busy) {
    saveState.classList.add('saving');
    label.textContent = '正在写入并校验';
  } else if (count) {
    saveState.classList.add('dirty');
    label.textContent = `${count} 项等待保存`;
  } else {
    label.textContent = '所有更改已落盘';
  }
  $('#pendingCount').hidden = count === 0;
  $('#pendingCount').textContent = count;
  $('#flowSaveHint').textContent = state.busy ? '正在写入项目，请勿关闭页面' : count ? `${count} 项更改尚未写入磁盘` : '当前没有待保存的更改';
  $('#saveAllButton').disabled = state.busy || !state.connected;
  $('#flowSaveButton').disabled = state.busy || !state.connected;
  $('#saveCurrent').disabled = state.busy || !state.connected;
  $('#clearQueue').hidden = state.staged.size === 0 || state.busy;
  $('#queueCountLabel').textContent = `${state.staged.size} 个文件`;
  const busyText = state.busy ? '正在保存…' : '保存到项目';
  $('#saveAllButton > span:nth-child(2)').textContent = busyText;
  $('#flowSaveButton').lastChild.textContent = busyText;
  if (!state.busy) $('#globalProgress').style.width = '0';
}

function boardMarkup(id) {
  const pinsLeft = ['VBAT', 'C13', 'C14', 'C15', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B10', 'B11'];
  const pinsRight = ['3V3', 'GND', '5V', 'B9', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3', 'A15', 'A12', 'A11', 'A10', 'A9', 'A8'];
  const pin = (x, y, label, side) => `<g><rect x="${x}" y="${y}" width="8" height="13" rx="1" fill="url(#pin-${id})"/><circle cx="${x + 4}" cy="${y + 6.5}" r="1.7" fill="#141a1b"/><text x="${side === 'left' ? x + 14 : x - 5}" y="${y + 9}" text-anchor="${side === 'left' ? 'start' : 'end'}" class="pin-label">${label}</text></g>`;
  return `<svg class="board-svg" viewBox="0 0 280 410" role="img" aria-label="STM32F103C8T6 Blue Pill 开发板外观示意图">
    <defs>
      <linearGradient id="pcb-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17465a"/><stop offset=".48" stop-color="#10394c"/><stop offset="1" stop-color="#0b2c3e"/></linearGradient>
      <linearGradient id="pin-${id}" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#8f7040"/><stop offset=".45" stop-color="#d1b774"/><stop offset="1" stop-color="#6d522f"/></linearGradient>
      <linearGradient id="metal-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c5d0d0"/><stop offset=".45" stop-color="#78878b"/><stop offset="1" stop-color="#46555c"/></linearGradient>
      <filter id="shadow-${id}"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".4"/></filter>
    </defs>
    <style>.pin-label{fill:#648391;font:6px monospace}.silk{fill:#87a4ac;font:6px monospace}.chip-text{fill:#8a999c;font:7px monospace}.board-small{fill:#587c89;font:5px monospace;letter-spacing:.5px}</style>
    <g filter="url(#shadow-${id})">
      <rect x="55" y="19" width="170" height="372" rx="5" fill="#071a24"/>
      <rect x="57" y="17" width="166" height="370" rx="4" fill="url(#pcb-${id})" stroke="#2d5b68" stroke-width=".8"/>
      <path d="M66 27h35m78 0h35M65 376h38m76 0h35M65 50v300m150-300v300" stroke="#5b8c96" stroke-opacity=".16" fill="none"/>
      <path d="M80 45h120M80 365h120M90 115h100M90 270h100" stroke="#82a5a9" stroke-opacity=".13" stroke-width=".7" stroke-dasharray="2 2"/>
      <circle cx="69" cy="30" r="5" fill="#0a2430" stroke="#69909a" stroke-width=".8"/><circle cx="69" cy="30" r="2" fill="#08161d"/>
      <circle cx="211" cy="30" r="5" fill="#0a2430" stroke="#69909a" stroke-width=".8"/><circle cx="211" cy="30" r="2" fill="#08161d"/>
      <circle cx="69" cy="374" r="5" fill="#0a2430" stroke="#69909a" stroke-width=".8"/><circle cx="69" cy="374" r="2" fill="#08161d"/>
      <circle cx="211" cy="374" r="5" fill="#0a2430" stroke="#69909a" stroke-width=".8"/><circle cx="211" cy="374" r="2" fill="#08161d"/>
      ${pinsLeft.map((label, index) => pin(45, 54 + index * 19, label, 'left')).join('')}
      ${pinsRight.map((label, index) => pin(227, 54 + index * 19, label, 'right')).join('')}
      <g><rect x="111" y="1" width="58" height="34" rx="3" fill="url(#metal-${id})" stroke="#a0b0b2" stroke-width=".7"/><rect x="120" y="1" width="40" height="15" rx="2" fill="#222e33"/><rect x="125" y="1" width="30" height="7" fill="#0b1114"/><path d="M113 25h54" stroke="#dae1df" stroke-opacity=".5"/></g>
      <text x="140" y="46" text-anchor="middle" class="board-small">MICRO USB</text>
      <g><rect x="96" y="64" width="16" height="28" rx="1" fill="#152329" stroke="#47606a"/><rect x="168" y="64" width="16" height="28" rx="1" fill="#152329" stroke="#47606a"/><path d="M100 68h8m-8 5h8m-8 5h8m-8 5h8m64-15h8m-8 5h8m-8 5h8m-8 5h8" stroke="#a5a784" stroke-width="2"/></g>
      <g><rect x="126" y="64" width="28" height="18" rx="2" fill="#202d31" stroke="#617278"/><rect x="131" y="68" width="18" height="10" rx="1" fill="url(#metal-${id})"/><text x="140" y="89" text-anchor="middle" class="board-small">8 MHz</text></g>
      <g><circle cx="85" cy="105" r="6" fill="#202c2c" stroke="#8b8353"/><circle cx="85" cy="105" r="3.5" fill="#343a31"/><text x="85" y="119" text-anchor="middle" class="board-small">PWR</text><circle cx="195" cy="105" r="6" fill="#202c2c" stroke="#8b8353"/><circle cx="195" cy="105" r="3.5" fill="#343a31"/><text x="195" y="119" text-anchor="middle" class="board-small">PC13</text></g>
      <g>
        <path d="M108 141h-8m8 9h-8m8 9h-8m8 9h-8m8 9h-8m8 9h-8m8 9h-8m8 9h-8m80-63h8m-8 9h8m-8 9h8m-8 9h8m-8 9h8m-8 9h8m-8 9h8m-8 9h8M117 134v-8m9 8v-8m9 8v-8m9 8v-8m9 8v-8m9 8v-8m9 8v-8m-63 89v8m9-8v8m9-8v8m9-8v8m9-8v8m9-8v8m9-8v8" stroke="#9da9a6" stroke-width="2"/>
        <rect x="108" y="134" width="64" height="80" rx="2" fill="#151e22" stroke="#415159"/>
        <rect x="112" y="138" width="56" height="72" rx="1" fill="#1b2529" stroke="#252f33"/>
        <circle cx="119" cy="146" r="2.2" fill="#647479"/>
        <text x="140" y="158" text-anchor="middle" class="chip-text">STM32</text>
        <text x="140" y="169" text-anchor="middle" class="chip-text">F103C8T6</text>
        <text x="140" y="184" text-anchor="middle" class="board-small">ARM Cortex-M3</text>
        <text x="140" y="196" text-anchor="middle" class="board-small">LQFP48</text>
      </g>
      <path d="M92 131h8m80 0h8M92 220h16m64 0h16M98 230h84M98 240h84" stroke="#77a0a8" stroke-opacity=".25" stroke-width=".8"/>
      <g><rect x="89" y="253" width="30" height="18" rx="2" fill="#1c282d" stroke="#58686c"/><rect x="94" y="256" width="20" height="10" rx="2" fill="#89999b"/><text x="104" y="280" text-anchor="middle" class="board-small">RESET</text></g>
      <g><rect x="161" y="250" width="28" height="29" rx="1" fill="#172329" stroke="#53666c"/><path d="M165 254h20m-20 6h20m-20 6h20m-20 6h20" stroke="#94977a" stroke-width="2"/></g>
      <g><rect x="94" y="302" width="92" height="25" rx="2" fill="#102b38" stroke="#4e7580" stroke-dasharray="2 2"/><text x="140" y="313" text-anchor="middle" class="silk">STM32F103C8T6</text><text x="140" y="322" text-anchor="middle" class="board-small">BLUE PILL · F103 STUDIO</text></g>
      <g><rect x="119" y="345" width="42" height="31" rx="1" fill="#17252c" stroke="#58717a"/><path d="M126 345v31m9-31v31m9-31v31m9-31v31" stroke="#b3a574" stroke-width="3"/><text x="140" y="340" text-anchor="middle" class="board-small">SWD</text></g>
      <text x="76" y="351" class="board-small" transform="rotate(-90 76 351)">ARM 32-BIT MICROCONTROLLER</text>
      <text x="204" y="290" class="board-small" transform="rotate(90 204 290)">72 MHz · 64 KB FLASH</text>
    </g>
  </svg>`;
}

function renderBoards() {
  $$('[data-board]').forEach((element) => { element.innerHTML = boardMarkup(element.dataset.board); });
}

function navigate(view, updateHash = true) {
  if (!VIEW_NAMES.includes(view)) view = 'workspace';
  state.currentView = view;
  $$('.view').forEach((element) => element.classList.toggle('active', element.id === `view-${view}`));
  $$('[data-nav]').forEach((element) => {
    if (element.classList.contains('nav-item')) element.classList.toggle('active', element.dataset.nav === view);
  });
  const section = $(`#view-${view}`);
  $('#breadcrumbCurrent').textContent = section?.dataset.title || '工作台';
  if (updateHash) history.replaceState(null, '', view === 'workspace' ? '#workspace' : `#${view}`);
  $('#sidebar').classList.remove('open');
  $('#sidebarScrim').classList.remove('visible');
  if (view === 'history') loadHistory().catch((error) => toast('无法读取保存记录', error.message, 'error'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function fileTypeIcon(file) {
  if (file.kind === 'video') return `<span class="file-type-icon file-type-icon--video">${icon('video')}</span>`;
  const extension = extensionOf(file.name || file.path);
  return `<span class="file-type-icon ${extension === 'h' ? 'file-type-icon--h' : ''}">${extension.toUpperCase()}</span>`;
}

function renderQueue() {
  const entries = [...state.staged.values()];
  $('#queueEmpty').hidden = entries.length > 0;
  $('#queueList').innerHTML = entries.map((item) => {
    const exists = Boolean(savedFile(item.path));
    const meta = item.status === 'saving' ? '正在写入磁盘并计算摘要…'
      : item.status === 'saved' ? '已写入并校验'
        : `${formatBytes(item.size)} · ${exists ? '保存时将覆盖同名文件' : item.path}`;
    const statusIcon = item.status === 'saving' ? `<span class="queue-status saving" title="正在保存">${icon('refresh')}</span>`
      : item.status === 'error' ? `<span class="queue-status error" title="保存失败">${icon('alert')}</span>`
        : `<button class="icon-button" data-remove-staged="${escapeHtml(item.path)}" title="从待保存队列移除">${icon('x')}</button>`;
    return `<div class="queue-item ${item.status === 'error' ? 'has-error' : ''}">
      ${fileTypeIcon(item)}
      <div class="queue-item__main"><button class="queue-item__name" data-open-key="${escapeHtml(item.path)}" style="padding:0;background:none;border:0;text-align:left;cursor:pointer;width:100%"><span>${escapeHtml(item.name)}</span></button><span class="queue-item__meta">${escapeHtml(meta)}</span>${item.error ? `<span class="queue-item__error">${escapeHtml(item.error)}</span>` : ''}</div>
      <div class="queue-item__actions"><button class="icon-button" data-open-key="${escapeHtml(item.path)}" title="预览">${icon(item.kind === 'code' ? 'code' : 'eye')}</button>${statusIcon}</div>
    </div>`;
  }).join('');
  updateSaveState();
}

function uniqueItems(kind) {
  const map = new Map();
  state.files.filter((file) => file.kind === kind).forEach((file) => map.set(file.path, { ...file, source: 'saved' }));
  [...state.staged.values()].filter((file) => file.kind === kind).forEach((file) => map.set(file.path, { ...file, source: 'staged', saved: false }));
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

function renderRecent() {
  const files = [...state.files].sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt)).slice(0, 6);
  $('#recentEmpty').hidden = files.length > 0;
  $('.file-table').hidden = files.length === 0;
  $('#recentFileBody').innerHTML = files.map((file) => `<tr data-open-key="${escapeHtml(file.path)}">
    <td><div class="table-file">${fileTypeIcon(file)}<div><strong>${escapeHtml(file.name)}</strong><small>stm32/project/${escapeHtml(file.path)}</small></div></div></td>
    <td>${file.kind === 'code' ? (extensionOf(file.name) === 'h' ? 'C HEADER' : 'C SOURCE') : escapeHtml(extensionOf(file.name).toUpperCase())}</td>
    <td>${formatBytes(file.size)}</td><td>${formatDate(file.modifiedAt, true)}</td>
    <td><span class="saved-label">${icon('check-circle')}已落盘</span></td>
    <td><button class="icon-button row-action" data-download-key="${escapeHtml(file.path)}" title="下载项目文件">${icon('download')}</button></td>
  </tr>`).join('');
}

function renderFileTree() {
  const filter = $('#fileSearch').value.trim().toLowerCase();
  const savedCode = state.files.filter((file) => file.kind === 'code' && file.path.toLowerCase().includes(filter));
  const stagedCode = [...state.staged.values()].filter((file) => file.kind === 'code' && file.path.toLowerCase().includes(filter));
  $('#explorerEmpty').classList.toggle('visible', savedCode.length === 0 && stagedCode.length === 0);
  $('#explorerCount').textContent = `${state.files.filter((file) => file.kind === 'code').length} 个文件`;

  const groups = new Map();
  savedCode.forEach((file) => {
    const segments = file.path.split('/');
    const directory = segments.length > 2 ? segments.slice(1, -1).join('/') : '';
    if (!groups.has(directory)) groups.set(directory, []);
    groups.get(directory).push(file);
  });
  $('#fileTree').innerHTML = [...groups.entries()].map(([directory, files]) => `${directory ? `<div class="tree-directory">${icon('chevron')}<span>${escapeHtml(directory)}/</span></div>` : ''}${files.map((file) => `<button class="tree-file ${state.currentKey === file.path ? 'active' : ''}" data-open-key="${escapeHtml(file.path)}" title="${escapeHtml(file.path)}">${icon('file')}<span>${escapeHtml(file.name)}</span>${state.drafts.has(file.path) ? '<i title="有未保存修改"></i>' : ''}</button>`).join('')}`).join('');
  $('#explorerStaged').innerHTML = stagedCode.length ? `<div class="staged-heading"><span>待保存</span><span>${stagedCode.length}</span></div>${stagedCode.map((file) => `<button class="staged-file" data-open-key="${escapeHtml(file.path)}">${icon('file')}<span>${escapeHtml(file.name)}</span><i>${state.drafts.has(file.path) ? '已编辑' : '待写入'}</i></button>`).join('')}` : '';
}

function renderVideos() {
  const videos = uniqueItems('video');
  $('#videoLibraryEmpty').hidden = videos.length > 0;
  $('#videoLibraryCount').textContent = `${videos.length} 个参考视频`;
  $('#videoList').innerHTML = videos.map((video) => `<button class="video-item ${state.selectedVideoKey === video.path ? 'active' : ''}" data-video-key="${escapeHtml(video.path)}"><span class="video-thumbnail">${icon('play')}${video.source === 'staged' ? '<i></i>' : ''}</span><span class="video-item__text"><strong>${escapeHtml(video.name)}</strong><span>${formatBytes(video.size)} · ${escapeHtml(extensionOf(video.name).toUpperCase())}</span><small>${video.source === 'staged' ? '待保存 · 临时预览' : '已保存 · 项目文件'}</small></span></button>`).join('');
}

function renderCounts() {
  $('#navCodeCount').textContent = uniqueItems('code').length;
  $('#navVideoCount').textContent = uniqueItems('video').length;
  const total = state.files.reduce((sum, file) => sum + file.size, 0);
  $('#storageSummary').textContent = state.connected ? `${state.files.length} 个项目文件 · ${formatBytes(total)}` : '等待项目服务连接';
}

function renderAll() {
  renderQueue();
  renderRecent();
  renderFileTree();
  renderVideos();
  renderCounts();
  updateSaveState();
}

async function loadFiles(showSuccess = false) {
  const data = await request('/api/files');
  state.files = data.files;
  setConnected(true);
  renderAll();
  if (showSuccess) toast('项目目录已刷新', `后端返回 ${data.total} 个真实文件。`, 'info');
  return data.files;
}

async function loadHistory() {
  const data = await request('/api/history');
  const entries = data.history || [];
  $('#historyEmpty').hidden = entries.length > 0;
  $('.history-head').hidden = entries.length === 0;
  $('#historyList').innerHTML = entries.map((entry) => {
    const deleted = entry.action === 'deleted';
    const actionLabel = deleted ? '已从项目删除' : entry.action === 'updated' ? '已更新并校验' : '已创建并校验';
    return `<div class="history-item"><div class="history-file"><span class="history-action ${deleted ? 'deleted' : ''}">${icon(deleted ? 'trash' : 'check')}</span><div><strong>${escapeHtml(entry.path)}</strong><small>${actionLabel}</small></div></div><span>${formatBytes(entry.size)}</span><span class="history-hash" title="${escapeHtml(entry.sha256 || '')}">${escapeHtml(entry.sha256 || '—')}</span><span>${formatDate(entry.timestamp, true)}</span></div>`;
  }).join('');
}

function normalizeDroppedPath(path) {
  return String(path || '').replace(/^\/+/, '');
}

async function readEntry(entry) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [{ file, relativePath: normalizeDroppedPath(entry.fullPath || file.name) }];
  }
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const children = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map(readEntry));
  return nested.flat();
}

async function droppedEntries(dataTransfer) {
  const items = [...(dataTransfer.items || [])];
  if (items.length && items[0].webkitGetAsEntry) {
    const entries = items.map((item) => item.webkitGetAsEntry()).filter(Boolean);
    if (entries.length) {
      const nested = await Promise.all(entries.map(readEntry));
      return nested.flat();
    }
  }
  return [...(dataTransfer.files || [])].map((file) => ({ file, relativePath: file.name }));
}

function validateEntry(file, relativePath) {
  const cleanPath = normalizeDroppedPath(relativePath || file.name);
  const extension = extensionOf(file.name);
  const kind = CODE_EXTENSIONS.has(extension) ? 'code' : VIDEO_EXTENSIONS.has(extension) ? 'video' : null;
  if (!kind) return { error: `${file.name}：仅支持 .c、.h 和常见视频格式` };
  if (!cleanPath || cleanPath.length > 500 || cleanPath.includes('\\') || /[<>:"|?*\u0000-\u001f]/.test(cleanPath)) return { error: `${file.name}：路径包含非法字符` };
  const segments = cleanPath.split('/');
  if (segments.length > 11 || segments.some((part) => !part || part === '.' || part === '..' || part.startsWith('.') || /[. ]$/.test(part))) return { error: `${file.name}：目录结构不安全或层级过深` };
  if (file.size === 0) return { error: `${file.name}：空文件不会写入项目` };
  if (file.size > state.limits[kind]) return { error: `${file.name}：超过 ${formatBytes(state.limits[kind])} 限制` };
  return { kind, key: `${kind === 'code' ? 'code' : 'videos'}/${cleanPath}` };
}

async function stageEntries(entries) {
  const rejected = [];
  const addedKeys = [];
  let added = 0;
  let replaced = 0;
  for (const { file, relativePath } of entries.slice(0, 1000)) {
    const result = validateEntry(file, relativePath);
    if (result.error) { rejected.push(result.error); continue; }
    const previous = state.staged.get(result.key);
    if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
    if (previous) replaced += 1;
    const item = {
      file,
      path: result.key,
      name: file.name,
      kind: result.kind,
      size: file.size,
      modifiedAt: new Date(file.lastModified || Date.now()).toISOString(),
      status: 'pending',
      error: '',
      objectUrl: result.kind === 'video' ? URL.createObjectURL(file) : null,
    };
    state.staged.set(result.key, item);
    state.documents.delete(result.key);
    state.drafts.delete(result.key);
    addedKeys.push(result.key);
    added += 1;
  }
  if (entries.length > 1000) rejected.push('一次最多导入 1000 个文件，其余文件未加入队列');
  renderAll();
  if (state.currentKey && addedKeys.includes(state.currentKey)) await openCode(state.currentKey);
  if (state.selectedVideoKey && addedKeys.includes(state.selectedVideoKey)) selectVideo(state.selectedVideoKey);
  if (added) toast('已加入待保存队列', `${added} 个文件等待写入项目${replaced ? `，其中 ${replaced} 个替换了队列中的同名文件` : ''}。请记得点击“保存到项目”。`, 'info', 6500);
  if (rejected.length) toast('部分文件未导入', `${rejected.slice(0, 3).join('\n')}${rejected.length > 3 ? `\n另有 ${rejected.length - 3} 项` : ''}`, 'error', 9000);
}

function removeStaged(key) {
  const item = state.staged.get(key);
  if (!item || state.busy) return;
  if (item.objectUrl && state.selectedVideoKey !== key) URL.revokeObjectURL(item.objectUrl);
  state.staged.delete(key);
  state.documents.delete(key);
  state.drafts.delete(key);
  if (state.currentKey === key) closeEditor();
  if (state.selectedVideoKey === key) {
    $('#videoPlayer').pause();
    $('#videoPlayer').removeAttribute('src');
    $('#videoPlayer').load();
    state.selectedVideoKey = savedFile(key) ? key : null;
    if (state.selectedVideoKey) {
      selectVideo(key);
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    } else {
      $('#videoPlayerWrap').hidden = true;
      $('#videoPlayerEmpty').hidden = false;
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    }
  }
  renderAll();
}

function confirmDialog({ title, message, details = '', confirmText = '确认', danger = false }) {
  const modal = $('#confirmModal');
  $('#modalTitle').textContent = title;
  $('#modalMessage').textContent = message;
  $('#modalDetails').hidden = !details;
  $('#modalDetails').textContent = details;
  $('#modalConfirm').textContent = confirmText;
  $('#modalConfirm').className = `button ${danger ? 'button--light' : 'button--primary'}`;
  modal.returnValue = 'cancel';
  modal.showModal();
  return new Promise((resolve) => {
    modal.addEventListener('close', () => resolve(modal.returnValue === 'confirm'), { once: true });
  });
}

function decodeBrowserCode(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.includes(0)) throw new Error('检测到 UTF-16/NUL 字节，请先在 Keil 中转换为 UTF-8 或 GB18030。');
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text;
  let encoding;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    encoding = hasBom ? 'UTF-8 BOM' : 'UTF-8';
  } catch {
    try {
      text = new TextDecoder('gb18030').decode(bytes);
      encoding = 'GB18030';
    } catch {
      throw new Error('此浏览器无法解码中文源码；请先保存到项目，再由后端转换读取。');
    }
  }
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  return { content: text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), encoding, lineEnding: crlf >= lf && crlf > 0 ? 'CRLF' : 'LF' };
}

async function openCode(key) {
  const staged = state.staged.get(key);
  const saved = savedFile(key);
  if (!staged && !saved) { toast('文件不存在', '项目目录可能已发生变化，请刷新后重试。', 'error'); return; }
  navigate('files');
  state.currentKey = key;
  renderFileTree();
  if (!state.documents.has(key)) {
    $('#editorEmpty').hidden = false;
    $('#editorWorkspace').hidden = true;
    $('#editorEmpty h2').textContent = '正在读取源码…';
    $('#editorEmpty p').textContent = staged ? '正在读取待保存文件，此操作尚未写入磁盘。' : '正在从项目后端读取真实文件。';
    try {
      let documentData;
      if (staged) {
        const decoded = decodeBrowserCode(await staged.file.arrayBuffer());
        documentData = { ...decoded, source: 'staged', sha256: '', name: staged.name };
      } else {
        const data = await request(`/api/files/content?path=${encodeURIComponent(key)}`);
        documentData = { content: data.content, encoding: data.encoding, lineEnding: data.lineEnding,
          source: 'saved', sha256: data.sha256, name: saved.name };
      }
      state.documents.set(key, documentData);
    } catch (error) {
      if (state.currentKey === key) closeEditor();
      toast('无法打开源码', error.message, 'error');
      return;
    }
  }
  if (state.currentKey === key) showDocument(key);
}

function showDocument(key) {
  const documentData = state.documents.get(key);
  if (!documentData) return;
  $('#editorEmpty').hidden = true;
  $('#editorWorkspace').hidden = false;
  $('#editorTabName').textContent = baseName(key);
  $('#editorPath').textContent = documentData.source === 'saved' ? `stm32/project/${key}` : `待保存 / ${key}`;
  $('#editorEncoding').textContent = documentData.encoding;
  $('#editorLineEnding').textContent = documentData.lineEnding;
  $('#editorSourceState').textContent = documentData.source === 'saved' ? '项目文件' : '尚未落盘';
  $('#codeEditor').value = state.drafts.has(key) ? state.drafts.get(key) : documentData.content;
  updateEditorDetails();
  renderFileTree();
}

function updateEditorDetails() {
  const editor = $('#codeEditor');
  const key = state.currentKey;
  if (!key) return;
  const dirty = state.drafts.has(key);
  $('#editorDirtyDot').hidden = !dirty;
  const lines = editor.value.split('\n').length;
  $('#lineNumbers').textContent = Array.from({ length: lines }, (_, index) => index + 1).join('\n');
  $('#lineNumbers').scrollTop = editor.scrollTop;
  $('#editorCharCount').textContent = `${editor.value.length.toLocaleString('zh-CN')} 字符 · ${lines.toLocaleString('zh-CN')} 行`;
  const before = editor.value.slice(0, editor.selectionStart);
  const rows = before.split('\n');
  $('#cursorPosition').textContent = `Ln ${rows.length}, Col ${rows.at(-1).length + 1}`;
  $('#editorSourceState').textContent = dirty ? '有未保存修改' : state.staged.has(key) ? '尚未落盘' : '项目文件';
}

function onEditorInput() {
  const key = state.currentKey;
  const documentData = state.documents.get(key);
  if (!key || !documentData) return;
  const wasDirty = state.drafts.has(key);
  const value = $('#codeEditor').value;
  if (value === documentData.content) state.drafts.delete(key);
  else state.drafts.set(key, value);
  updateEditorDetails();
  updateSaveState();
  if (wasDirty !== state.drafts.has(key)) renderFileTree();
}

function closeEditor() {
  state.currentKey = null;
  $('#editorWorkspace').hidden = true;
  $('#editorEmpty').hidden = false;
  $('#editorEmpty h2').textContent = '选择一份源码开始查看';
  $('#editorEmpty p').textContent = '支持 .c / .h 文件，保存时保留原编码与 CRLF / LF。';
  renderFileTree();
}

function openKey(key) {
  const item = state.staged.get(key) || savedFile(key);
  if (!item) return;
  if (item.kind === 'code') openCode(key);
  else { navigate('videos'); selectVideo(key); }
}

function selectVideo(key) {
  const staged = state.staged.get(key);
  const saved = savedFile(key);
  const item = staged || saved;
  if (!item) return;
  const player = $('#videoPlayer');
  player.pause();
  state.selectedVideoKey = key;
  player.src = staged?.objectUrl || rawUrl(key);
  player.load();
  $('#videoPlayerEmpty').hidden = true;
  $('#videoPlayerWrap').hidden = false;
  $('#videoPlayerName').textContent = item.name;
  $('#videoPlayerPath').textContent = staged ? `待保存 / ${key} · 尚未写入项目` : `stm32/project/${key}`;
  const download = $('#downloadVideo');
  download.href = staged?.objectUrl || rawUrl(key, true);
  download.setAttribute('download', item.name);
  renderVideos();
}

function downloadKey(key) {
  const staged = state.staged.get(key);
  const saved = savedFile(key);
  if (!staged && !saved) return;
  const anchor = document.createElement('a');
  anchor.href = staged ? (staged.objectUrl || URL.createObjectURL(staged.file)) : rawUrl(key, true);
  anchor.download = baseName(key);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  if (staged && !staged.objectUrl) setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function saveTasksForAll() {
  const tasks = [...state.staged.keys()].map((key) => ({ key, staged: true }));
  for (const key of state.drafts.keys()) if (!state.staged.has(key)) tasks.push({ key, staged: false });
  return tasks;
}

async function runSaveTask(task, approvedOverwrites, progress) {
  const { key, staged } = task;
  const overwriteApproved = staged && approvedOverwrites.has(key);
  const item = staged ? state.staged.get(key) : null;
  const documentData = state.documents.get(key);
  const draft = state.drafts.get(key);
  if (item) { item.status = 'saving'; item.error = ''; renderQueue(); }
  try {
    let response;
    const hasTextChanges = typeof draft === 'string' && documentData;
    if (hasTextChanges) {
      const body = {
        content: draft,
        encoding: documentData.encoding,
        lineEnding: documentData.lineEnding,
        overwrite: staged ? overwriteApproved : false,
        expectedSha: staged ? '' : documentData.sha256,
      };
      response = await request(`/api/files/text?path=${encodeURIComponent(key)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else if (staged) {
      response = await request(`/api/files/content?path=${encodeURIComponent(key)}${overwriteApproved ? '&overwrite=1' : ''}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: item.file,
      });
    } else {
      return { key, ok: true, skipped: true };
    }

    if (documentData) {
      if (hasTextChanges) documentData.content = draft;
      documentData.source = 'saved';
      documentData.sha256 = response.file.sha256;
    }
    state.drafts.delete(key);
    if (staged) {
      item.status = 'saved';
      state.staged.delete(key);
      if (item.objectUrl && state.selectedVideoKey !== key) URL.revokeObjectURL(item.objectUrl);
    }
    progress.completed += 1;
    progress.element.style.width = `${(progress.completed / progress.total) * 100}%`;
    return { key, ok: true, file: response.file, objectUrl: item?.objectUrl || null };
  } catch (error) {
    if (item) { item.status = 'error'; item.error = error.message; }
    progress.completed += 1;
    progress.element.style.width = `${(progress.completed / progress.total) * 100}%`;
    return { key, ok: false, error };
  } finally {
    renderQueue();
  }
}

async function saveTasks(tasks) {
  if (state.busy) return;
  if (!state.connected) { toast('项目后端未连接', '文件没有被保存。请先恢复服务连接。', 'error'); return; }
  if (!tasks.length) { toast('没有待保存的更改', '选择文件或修改源码后，再点击“保存到项目”。', 'info'); return; }

  const overwritePaths = tasks.filter((task) => task.staged && savedFile(task.key)).map((task) => task.key);
  const approvedOverwrites = new Set();
  if (overwritePaths.length) {
    const approved = await confirmDialog({
      title: `覆盖 ${overwritePaths.length} 个项目文件？`,
      message: '以下路径已存在于真实项目目录。继续后，磁盘上的同名文件会被本次内容替换。',
      details: overwritePaths.join('\n'),
      confirmText: '确认覆盖并保存',
    });
    if (!approved) return;
    overwritePaths.forEach((key) => approvedOverwrites.add(key));
  }

  state.busy = true;
  updateSaveState();
  const progress = { completed: 0, total: tasks.length, element: $('#globalProgress') };
  progress.element.style.width = '2%';
  let cursor = 0;
  const results = [];
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      results.push(await runSaveTask(task, approvedOverwrites, progress));
    }
  }
  await Promise.all([worker(), worker()]);
  state.busy = false;

  try { await loadFiles(); }
  catch (error) { toast('文件已处理，但列表刷新失败', error.message, 'error'); }
  const successful = results.filter((result) => result.ok && !result.skipped);
  const failed = results.filter((result) => !result.ok);
  for (const result of successful) {
    if (state.selectedVideoKey === result.key) {
      selectVideo(result.key);
      if (result.objectUrl) URL.revokeObjectURL(result.objectUrl);
    }
  }
  if (state.currentKey && state.documents.has(state.currentKey)) showDocument(state.currentKey);
  if (state.currentView === 'history') await loadHistory().catch(() => {});
  updateSaveState();

  if (successful.length && !failed.length) {
    toast('已真正保存到项目', `${successful.length} 个文件已写入 stm32/project/，并完成 SHA-256 回读校验。`, 'success', 7000);
  } else if (successful.length && failed.length) {
    toast('部分文件保存成功', `${successful.length} 个已落盘，${failed.length} 个失败。失败项仍保留在待保存队列，请查看具体原因。`, 'error', 9000);
  } else if (failed.length) {
    const conflict = failed.find((result) => result.error.code === 'FILE_EXISTS');
    toast('保存未完成', conflict ? `${conflict.error.message} 请再次点击保存并确认覆盖。` : failed[0].error.message, 'error', 10000);
  }
}

async function clearQueue() {
  if (!state.staged.size || state.busy) return;
  const approved = await confirmDialog({
    title: '清空待保存队列？',
    message: `将移除 ${state.staged.size} 个尚未写入项目的文件。已经保存到项目的文件不受影响。`,
    confirmText: '清空待保存队列', danger: true,
  });
  if (!approved) return;
  for (const key of [...state.staged.keys()]) removeStaged(key);
}

async function connect() {
  try {
    const [health] = await Promise.all([
      request('/api/health'),
      loadFiles(),
    ]);
    state.health = health;
    state.limits = health.limits || DEFAULT_LIMITS;
    $('#gitBranch').textContent = health.git?.branch || '本地项目';
    $('#gitBranch').title = health.git?.commit ? `HEAD ${health.git.commit}` : '';
    setConnected(true);
    renderAll();
  } catch (error) {
    setConnected(false, error);
    renderCounts();
  }
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { navigate(nav.dataset.nav); return; }
    const importButton = event.target.closest('[data-action="import"]');
    if (importButton) { $('#fileInput').click(); return; }
    const download = event.target.closest('[data-download-key]');
    if (download) { event.stopPropagation(); downloadKey(download.dataset.downloadKey); return; }
    const remove = event.target.closest('[data-remove-staged]');
    if (remove) { removeStaged(remove.dataset.removeStaged); return; }
    const open = event.target.closest('[data-open-key]');
    if (open) { openKey(open.dataset.openKey); return; }
    const video = event.target.closest('[data-video-key]');
    if (video) { selectVideo(video.dataset.videoKey); }
  });

  $('#chooseFiles').addEventListener('click', (event) => { event.stopPropagation(); $('#fileInput').click(); });
  $('#chooseFolder').addEventListener('click', (event) => { event.stopPropagation(); $('#folderInput').click(); });
  $('#dropzone').addEventListener('click', (event) => { if (!event.target.closest('button')) $('#fileInput').click(); });
  $('#dropzone').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === $('#dropzone')) { event.preventDefault(); $('#fileInput').click(); }
  });
  $('#fileInput').addEventListener('change', async (event) => {
    await stageEntries([...event.target.files].map((file) => ({ file, relativePath: file.name })));
    event.target.value = '';
  });
  $('#folderInput').addEventListener('change', async (event) => {
    await stageEntries([...event.target.files].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
    event.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((type) => $('#dropzone').addEventListener(type, (event) => {
    event.preventDefault(); event.stopPropagation(); $('#dropzone').classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((type) => $('#dropzone').addEventListener(type, (event) => {
    event.preventDefault(); event.stopPropagation(); $('#dropzone').classList.remove('dragover');
  }));
  $('#dropzone').addEventListener('drop', async (event) => {
    try { await stageEntries(await droppedEntries(event.dataTransfer)); }
    catch (error) { toast('读取拖入内容失败', error.message, 'error'); }
  });

  $('#saveAllButton').addEventListener('click', () => saveTasks(saveTasksForAll()));
  $('#flowSaveButton').addEventListener('click', () => saveTasks(saveTasksForAll()));
  $('#saveCurrent').addEventListener('click', () => {
    if (!state.currentKey) return;
    const key = state.currentKey;
    if (state.staged.has(key)) saveTasks([{ key, staged: true }]);
    else if (state.drafts.has(key)) saveTasks([{ key, staged: false }]);
    else toast('当前文件没有修改', '磁盘中的内容已经与编辑器一致。', 'info');
  });
  $('#clearQueue').addEventListener('click', clearQueue);
  $('#fileSearch').addEventListener('input', renderFileTree);
  $('#codeEditor').addEventListener('input', onEditorInput);
  $('#codeEditor').addEventListener('scroll', () => { $('#lineNumbers').scrollTop = $('#codeEditor').scrollTop; });
  ['click', 'keyup', 'select'].forEach((type) => $('#codeEditor').addEventListener(type, updateEditorDetails));
  $('#codeEditor').addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const editor = event.currentTarget;
      editor.setRangeText('\t', editor.selectionStart, editor.selectionEnd, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  $('#closeEditor').addEventListener('click', closeEditor);
  $('#downloadCurrent').addEventListener('click', () => { if (state.currentKey) downloadKey(state.currentKey); });
  $('#refreshFiles').addEventListener('click', async () => {
    try {
      await loadFiles(true);
      if (state.currentKey && savedFile(state.currentKey) && !state.drafts.has(state.currentKey)) {
        state.documents.delete(state.currentKey);
        await openCode(state.currentKey);
      }
    } catch (error) { toast('刷新失败', error.message, 'error'); }
  });
  $('#refreshHistory').addEventListener('click', () => loadHistory().then(() => toast('保存记录已刷新', '', 'info')).catch((error) => toast('刷新失败', error.message, 'error')));
  $('#retryConnection').addEventListener('click', connect);
  $('#mobileMenu').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebarScrim').classList.add('visible'); });
  $('#sidebarScrim').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('visible'); });
  $('#videoPlayer').addEventListener('error', () => {
    if (state.selectedVideoKey) toast('浏览器无法播放此视频', '文件仍然可以保存和下载。请尝试 H.264/AAC 编码的 MP4，或使用本机播放器。', 'error', 8000);
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (event.shiftKey) saveTasks(saveTasksForAll());
      else $('#saveCurrent').click();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (pendingCount() || state.busy) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1), false));
}

renderBoards();
bindEvents();
navigate(VIEW_NAMES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'workspace', false);
renderAll();
connect();
