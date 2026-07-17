const fileInput = document.querySelector('#fontFile');
const fileName = document.querySelector('#fileName');
const panel = document.querySelector('.panel');
const sourceSetupCard = document.querySelector('#sourceSetupCard');
const metaSourceCard = document.querySelector('.meta-source-card');
const operationTitle = document.querySelector('#operationTitle');
const operationLead = document.querySelector('#operationLead');
const sourceSectionEyebrow = document.querySelector('#sourceSectionEyebrow');
const sourceSectionTitle = document.querySelector('#sourceSectionTitle');
const sourceSectionLead = document.querySelector('#sourceSectionLead');
const sourceLibraryTitle = document.querySelector('#sourceLibraryTitle');
const dropzoneTitle = document.querySelector('#dropzoneTitle');
const dropzoneHint = document.querySelector('#dropzoneHint');
const optionsEyebrow = document.querySelector('#optionsEyebrow');
const optionsLead = document.querySelector('#optionsLead');
const subsetFootnote = document.querySelector('#subsetFootnote');
const preflightPanel = document.querySelector('#preflightPanel');
const preflightBadge = document.querySelector('#preflightBadge');
const preflightSummary = document.querySelector('#preflightSummary');
const preflightChecklist = document.querySelector('#preflightChecklist');
const preflightFeatureNotes = document.querySelector('#preflightFeatureNotes');
const sourceStateBadge = document.querySelector('#sourceStateBadge');
const sourceStateHint = document.querySelector('#sourceStateHint');
const sourceFontSelect = document.querySelector('#sourceFontSelect');
const useSavedSourceButton = document.querySelector('#useSavedSourceButton');
const resetSourceButton = document.querySelector('#resetSourceButton');
const deleteSavedSourceButton = document.querySelector('#deleteSavedSourceButton');
const sourceFontAlias = document.querySelector('#sourceFontAlias');
const saveSourceAliasButton = document.querySelector('#saveSourceAliasButton');
const sourceLibraryMeta = document.querySelector('#sourceLibraryMeta');
const repositoryStoragePanel = document.querySelector('#repositoryStoragePanel');
const repositoryStorageSummary = document.querySelector('#repositoryStorageSummary');
const connectRepositoryButton = document.querySelector('#connectRepositoryButton');
const useLocalStorageButton = document.querySelector('#useLocalStorageButton');
const repositoryStorageMeta = document.querySelector('#repositoryStorageMeta');
const convertButton = document.querySelector('#convertButton');
const status = document.querySelector('#status');
const dropzone = document.querySelector('#dropzone');
const outputFormat = document.querySelector('#outputFormat');
const subsetText = document.querySelector('#subsetText');
const subsetSummary = document.querySelector('#subsetSummary');
const keepHinting = document.querySelector('#keepHinting');
const keepKerning = document.querySelector('#keepKerning');
const presetPanel = document.querySelector('#presetPanel');
const manualPanel = document.querySelector('#manualPanel');
const filePanel = document.querySelector('#filePanel');
const existingSubsetPanel = document.querySelector('#existingSubsetPanel');
const presetSelect = document.querySelector('#presetSelect');
const presetDescription = document.querySelector('#presetDescription');
const charsetFile = document.querySelector('#charsetFile');
const charsetFileMeta = document.querySelector('#charsetFileMeta');
const existingSubsetUrl = document.querySelector('#existingSubsetUrl');
const existingSubsetFile = document.querySelector('#existingSubsetFile');
const existingSubsetMeta = document.querySelector('#existingSubsetMeta');
const sourceMatchMeta = document.querySelector('#sourceMatchMeta');
const subsetPreviewPanel = document.querySelector('#subsetPreviewPanel');
const subsetPreviewMeta = document.querySelector('#subsetPreviewMeta');
const subsetPreviewText = document.querySelector('#subsetPreviewText');
const subsetPreviewMore = document.querySelector('#subsetPreviewMore');
const subsetPreviewCopy = document.querySelector('#subsetPreviewCopy');
const outputPreviewPanel = document.querySelector('#outputPreviewPanel');
const outputPreviewMeta = document.querySelector('#outputPreviewMeta');
const outputPreviewText = document.querySelector('#outputPreviewText');
const outputPreviewMore = document.querySelector('#outputPreviewMore');
const outputPreviewCopy = document.querySelector('#outputPreviewCopy');
const uploadToCdn = document.querySelector('#uploadToCdn');
const cdnUploadCard = document.querySelector('#cdnUploadCard');
const cdnUploadHelp = document.querySelector('#cdnUploadHelp');
const cdnUploadResult = document.querySelector('#cdnUploadResult');
const cdnFilenameModePanel = document.querySelector('#cdnFilenameModePanel');
const cdnFilenameModeLead = document.querySelector('#cdnFilenameModeLead');
const cdnConfigPanel = document.querySelector('#cdnConfigPanel');
const cdnConfigSummary = document.querySelector('#cdnConfigSummary');
const cdnConfigLabel = document.querySelector('#cdnConfigLabel');
const cdnConfigUploadUrl = document.querySelector('#cdnConfigUploadUrl');
const cdnConfigFilename = document.querySelector('#cdnConfigFilename');
const applyCdnConfigButton = document.querySelector('#applyCdnConfigButton');
const useServerCdnConfigButton = document.querySelector('#useServerCdnConfigButton');
const cdnConfigMeta = document.querySelector('#cdnConfigMeta');
const subsetModeInputs = Array.from(document.querySelectorAll('input[name="subsetMode"]'));
const operationModeInputs = Array.from(document.querySelectorAll('input[name="operationMode"]'));
const cdnFilenameModeInputs = Array.from(document.querySelectorAll('input[name="cdnFilenameMode"]'));

const OUTPUT_FORMAT_LABELS = {
  ttf: 'TTF',
  woff: 'WOFF',
  woff2: 'WOFF2',
  eot: 'EOT',
  svg: 'SVG'
};
const FONT_MIME_TYPES = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  eot: 'application/vnd.ms-fontobject',
  svg: 'image/svg+xml'
};
const FONT_FORMAT_HINTS = {
  ttf: 'truetype',
  otf: 'opentype',
  woff: 'woff',
  woff2: 'woff2',
  eot: 'embedded-opentype',
  svg: 'svg'
};
const PREVIEW_BATCH_SIZE = 600;
const REPOSITORY_STORAGE_SESSION_KEY = 'font-converter-repository-storage';
const CDN_CONFIG_SESSION_KEY = 'font-converter-cdn-config';

let selectedFile = null;
let charsetPresets = [];
let charsetFileLoadState = 'idle';
let charsetFileLoadError = '';
let charsetFileState = {
  name: '',
  size: 0,
  lastModified: 0,
  text: '',
  count: 0
};
let existingSubsetState = {
  name: '',
  size: 0,
  lastModified: 0,
  base64: ''
};
let sourceLibraryRecords = [];
let selectedLibrarySource = null;
let matchedSourceState = null;
let sourceMatchRequestId = 0;
let sourceMatchTimer = 0;
let sourceInspectionRequestId = 0;
let subsetPreviewRequestId = 0;
let subsetPreviewTimer = 0;
let subsetPreviewTargetKey = '';
let subsetPreviewStyle = null;
let outputPreviewStyle = null;
let runtimeConfigState = {
  cdnUploadAvailable: false,
  cdnUploadDefault: false,
  cdnUploadLabel: 'CDN'
};
let serverCdnRuntimeState = {
  available: false,
  autoUploadDefault: false,
  label: 'CDN'
};
let pageCdnConfigState = {
  enabled: false,
  config: null
};
let repositoryStorageState = {
  enabled: true,
  available: false,
  path: 'font-data',
  displayName: ''
};
let sourceInspectionState = {
  key: '',
  status: 'idle',
  sourceLabel: '',
  payload: null,
  error: ''
};
const previewStates = {
  subset: {
    items: [],
    parsedCount: 0,
    displayCount: 0,
    renderedCount: 0,
    filename: '',
    context: '当前子集',
    family: '',
    prefersRequestedOrder: false,
    missingItems: [],
    copyText: '',
    copyCount: 0,
    copyResetTimer: 0
  },
  output: {
    items: [],
    parsedCount: 0,
    displayCount: 0,
    renderedCount: 0,
    filename: '',
    context: '压缩完成后',
    family: '',
    prefersRequestedOrder: false,
    missingItems: [],
    copyText: '',
    copyCount: 0,
    copyResetTimer: 0
  }
};

function updateStatus(message, tone = 'default') {
  status.textContent = message;
  status.className = 'status';

  if (tone !== 'default') {
    status.classList.add(`is-${tone}`);
  }
}

function apiFetch(resource, options = {}) {
  const headers = new Headers(options.headers || {});

  if (repositoryStorageState.available) {
    headers.set('X-Font-Storage-Mode', repositoryStorageState.enabled ? 'remote' : 'local');
  }

  return window.fetch(resource, { ...options, headers });
}

function persistRepositoryStorageState() {
  sessionStorage.setItem(
    REPOSITORY_STORAGE_SESSION_KEY,
    JSON.stringify({ enabled: repositoryStorageState.enabled })
  );
}

function restoreRepositoryStorageState() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(REPOSITORY_STORAGE_SESSION_KEY) || 'null');
    repositoryStorageState.enabled = stored?.enabled !== false;
    persistRepositoryStorageState();
  } catch {
    sessionStorage.removeItem(REPOSITORY_STORAGE_SESSION_KEY);
  }
}

function renderRepositoryStorageState() {
  connectRepositoryButton.disabled = !repositoryStorageState.available || repositoryStorageState.enabled;
  useLocalStorageButton.disabled = !repositoryStorageState.available || !repositoryStorageState.enabled;

  if (!repositoryStorageState.available) {
    repositoryStorageSummary.textContent = '服务端未配置远程仓库';
    repositoryStorageMeta.textContent =
      '请在服务端环境变量中配置 FONT_REPOSITORY_URL、FONT_REPOSITORY_TOKEN、FONT_REPOSITORY_BRANCH 和 FONT_REPOSITORY_PATH。';
    return;
  }

  if (repositoryStorageState.enabled) {
    repositoryStorageSummary.textContent = `正在使用 ${repositoryStorageState.displayName}`;
    repositoryStorageMeta.textContent = `字体操作将使用服务端配置的 ${repositoryStorageState.displayName} 仓库，数据目录为 ${repositoryStorageState.path}/；Token 不会发送到浏览器。`;
    return;
  }

  repositoryStorageSummary.textContent = `当前使用本地存储（远程：${repositoryStorageState.displayName}）`;
  repositoryStorageMeta.textContent = '远程仓库配置仍保留在服务端；点击“使用远程仓库”即可切回。';
}

function clearCdnUploadResult() {
  cdnUploadResult.replaceChildren();
  cdnUploadResult.className = 'delivery-result is-hidden';
}

function decodeBase64Text(value) {
  if (!value) {
    return '';
  }

  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function formatCdnRawResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (payload.error) {
    return payload.error;
  }

  const statusLine = `HTTP ${payload.statusCode || 0}${payload.statusMessage ? ` ${payload.statusMessage}` : ''}`;
  const headerLines = Object.entries(payload.headers || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${value}`);
  const contentType = String(payload.headers?.['content-type'] || '').toLowerCase();
  const isTextResponse =
    !contentType ||
    contentType.startsWith('text/') ||
    /json|xml|javascript|x-www-form-urlencoded/.test(contentType);
  let body = '';

  if (payload.bodyBase64) {
    body = isTextResponse
      ? decodeBase64Text(payload.bodyBase64)
      : `[二进制响应，以下为 Base64]\n${payload.bodyBase64}`;
  }

  const sections = [statusLine];
  if (headerLines.length) sections.push(headerLines.join('\n'));
  if (body) sections.push(body);
  if (payload.truncated) {
    sections.push(`[响应共 ${payload.totalSize || 0} 字节，页面仅保留前 1MB]`);
  }
  return sections.join('\n\n');
}

async function loadCdnRawResponse(responseId) {
  if (!responseId) {
    return null;
  }

  try {
    const response = await apiFetch(`/api/cdn-upload-response?id=${encodeURIComponent(responseId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: payload.error || 'CDN 原始响应读取失败。' };
    }
    return payload;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'CDN 原始响应读取失败。' };
  }
}

function setCdnUploadResult({ tone = 'default', message, url = '', rawResponse = null }) {
  cdnUploadResult.replaceChildren();

  const text = document.createElement('span');
  text.textContent = message;
  cdnUploadResult.append(text);

  if (url) {
    cdnUploadResult.append(document.createTextNode(' '));
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = '打开链接';
    cdnUploadResult.append(link);
  }

  if (rawResponse) {
    const details = document.createElement('details');
    details.className = 'cdn-raw-response';
    const summary = document.createElement('summary');
    summary.textContent = rawResponse.statusCode
      ? `CDN 原始响应（HTTP ${rawResponse.statusCode}）`
      : 'CDN 原始响应';
    const pre = document.createElement('pre');
    pre.textContent = formatCdnRawResponse(rawResponse);
    details.append(summary, pre);
    cdnUploadResult.append(details);
  }

  cdnUploadResult.className = `delivery-result is-${tone}`;
}

function updateCdnUploadCardState() {
  const available = !uploadToCdn.disabled;
  cdnUploadCard.classList.toggle('is-disabled', !available);
  cdnUploadCard.classList.toggle('is-ready', available);
  cdnUploadCard.classList.toggle('is-checked', available && uploadToCdn.checked);
}

function updateCdnFilenameModePanel() {
  const visible =
    runtimeConfigState.cdnUploadAvailable &&
    !uploadToCdn.disabled &&
    uploadToCdn.checked &&
    getSelectedOperationMode() === 'incremental' &&
    Boolean(getExistingSubsetUrlValue());

  cdnFilenameModePanel.classList.toggle('is-hidden', !visible);

  if (!visible) {
    return;
  }

  const urlInfo = getExistingSubsetUrlFileInfo();
  const currentName = urlInfo?.basename || '当前 URL 文件';
  const resolvedName = urlInfo?.resolvedBasename || '';

  cdnFilenameModeLead.textContent =
    resolvedName && resolvedName !== currentName
      ? `当前 URL 指向 ${currentName}。如果继续沿用原文件名，本次会保留原路径并自动改成 ${resolvedName}。`
      : '当前子集字体来自网络地址。你可以直接覆盖这份 CDN 文件，或生成一个新的随机地址。';
}

function createDefaultPageCdnConfig() {
  return {
    label: 'qll-times CDN',
    uploadUrlTemplate: 'https://bt.qll-times.com/api/upload/file',
    publicUrlTemplate: '',
    method: 'POST',
    filenameTemplate: '/temp/{{dateCompact}}/{{uuid}}.{{ext}}',
    authHeader: '',
    authToken: '',
    bodyMode: 'form',
    timeoutMs: 20000,
    formFileField: 'file',
    formFilenameField: 'filename',
    extraHeaders: {},
    bodyTemplate: '',
    responseUrlPath: 'data.url'
  };
}

function populateCdnConfigForm(config = createDefaultPageCdnConfig()) {
  cdnConfigLabel.value = config.label || 'qll-times CDN';
  cdnConfigUploadUrl.value = config.uploadUrlTemplate || 'https://bt.qll-times.com/api/upload/file';
  cdnConfigFilename.value = config.filenameTemplate || '/temp/{{dateCompact}}/{{uuid}}.{{ext}}';
}

function readCdnConfigForm() {
  const uploadUrlTemplate = cdnConfigUploadUrl.value.trim();

  if (!/^https?:\/\//i.test(uploadUrlTemplate)) {
    throw new Error('上传接口必须以 http:// 或 https:// 开头。');
  }

  return {
    ...createDefaultPageCdnConfig(),
    label: cdnConfigLabel.value.trim() || 'qll-times CDN',
    uploadUrlTemplate,
    filenameTemplate:
      cdnConfigFilename.value.trim() || '/temp/{{dateCompact}}/{{uuid}}.{{ext}}'
  };
}

function persistPageCdnConfig() {
  if (!pageCdnConfigState.enabled || !pageCdnConfigState.config) {
    sessionStorage.removeItem(CDN_CONFIG_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(CDN_CONFIG_SESSION_KEY, JSON.stringify(pageCdnConfigState.config));
}

function restorePageCdnConfig() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(CDN_CONFIG_SESSION_KEY) || 'null');
    if (!stored?.uploadUrlTemplate) {
      populateCdnConfigForm();
      return;
    }
    const migratedConfig = {
      ...createDefaultPageCdnConfig(),
      label: stored.label || 'qll-times CDN',
      uploadUrlTemplate: stored.uploadUrlTemplate,
      filenameTemplate: stored.filenameTemplate || '/temp/{{dateCompact}}/{{uuid}}.{{ext}}'
    };
    pageCdnConfigState = { enabled: true, config: migratedConfig };
    persistPageCdnConfig();
    populateCdnConfigForm(migratedConfig);
  } catch {
    sessionStorage.removeItem(CDN_CONFIG_SESSION_KEY);
    populateCdnConfigForm();
  }
}

function syncEffectiveCdnRuntime({ resetChecked = false } = {}) {
  const pageConfig = pageCdnConfigState.enabled ? pageCdnConfigState.config : null;
  const effective = pageConfig
    ? { available: true, autoUploadDefault: false, label: pageConfig.label || 'CDN' }
    : serverCdnRuntimeState;
  const wasChecked = uploadToCdn.checked;

  runtimeConfigState = {
    cdnUploadAvailable: Boolean(effective.available),
    cdnUploadDefault: Boolean(effective.available && effective.autoUploadDefault),
    cdnUploadLabel: effective.label || 'CDN'
  };
  uploadToCdn.disabled = !runtimeConfigState.cdnUploadAvailable;
  uploadToCdn.checked = runtimeConfigState.cdnUploadAvailable &&
    (resetChecked ? runtimeConfigState.cdnUploadDefault : wasChecked);

  if (pageConfig) {
    cdnConfigSummary.textContent = `正在使用页面配置：${runtimeConfigState.cdnUploadLabel}`;
    cdnConfigMeta.textContent = '页面配置已启用并覆盖服务端 .env；Token 和自定义请求头只保存在当前标签页。';
    cdnUploadHelp.textContent = `已启用页面配置 ${runtimeConfigState.cdnUploadLabel}，勾选后由本地 Node 服务执行上传。`;
  } else {
    cdnConfigSummary.textContent = runtimeConfigState.cdnUploadAvailable
      ? `使用服务端默认：${runtimeConfigState.cdnUploadLabel}`
      : '服务端默认配置未启用';
    cdnConfigMeta.textContent = '页面配置会覆盖 .env 中的 CDN 设置；敏感内容只保存在当前浏览器标签页。';
    cdnUploadHelp.textContent = runtimeConfigState.cdnUploadAvailable
      ? `服务端已配置 ${runtimeConfigState.cdnUploadLabel}。勾选后会在转换完成后由服务端代为上传。`
      : '服务端和页面均未配置 CDN 上传，当前只会直接下载结果文件。';
  }

  useServerCdnConfigButton.disabled = !pageCdnConfigState.enabled;
  updateCdnUploadCardState();
  updateCdnFilenameModePanel();
}

function applyRuntimeConfig(payload) {
  const cdnConfig =
    payload?.cdnUpload && typeof payload.cdnUpload === 'object' ? payload.cdnUpload : {};
  const repositoryConfig =
    payload?.repositoryStorage && typeof payload.repositoryStorage === 'object'
      ? payload.repositoryStorage
      : {};

  serverCdnRuntimeState = {
    available: Boolean(cdnConfig.available),
    autoUploadDefault: Boolean(cdnConfig.available && cdnConfig.autoUploadDefault),
    label: typeof cdnConfig.label === 'string' && cdnConfig.label.trim() ? cdnConfig.label.trim() : 'CDN'
  };
  repositoryStorageState = {
    ...repositoryStorageState,
    available: Boolean(repositoryConfig.available),
    enabled: Boolean(repositoryConfig.available && repositoryStorageState.enabled),
    path: typeof repositoryConfig.path === 'string' && repositoryConfig.path ? repositoryConfig.path : 'font-data',
    displayName:
      typeof repositoryConfig.displayName === 'string' && repositoryConfig.displayName
        ? repositoryConfig.displayName
        : '远程字体仓库'
  };
  renderRepositoryStorageState();
  syncEffectiveCdnRuntime({ resetChecked: true });
}

async function loadRuntimeConfig() {
  try {
    const response = await apiFetch('/api/health');
    if (!response.ok) {
      throw new Error('运行时配置读取失败。');
    }

    const payload = await response.json();
    applyRuntimeConfig(payload);
  } catch (error) {
    serverCdnRuntimeState = { available: false, autoUploadDefault: false, label: 'CDN' };
    repositoryStorageState = { ...repositoryStorageState, available: false, enabled: false };
    renderRepositoryStorageState();
    syncEffectiveCdnRuntime({ resetChecked: true });
    if (!pageCdnConfigState.enabled) {
      cdnUploadHelp.textContent =
        error instanceof Error ? `${error.message} 当前只会直接下载结果文件。` : '当前只会直接下载结果文件。';
    }
  }
}

function formatBytes(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function getSubsetCharacters(value) {
  const uniqueCodePoints = new Set();
  const characters = [];

  for (const char of value.normalize('NFC')) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint < 32 || codePoint === 127 || uniqueCodePoints.has(codePoint)) {
      continue;
    }

    uniqueCodePoints.add(codePoint);
    characters.push(char);
  }

  return characters;
}

function formatSizeDelta(sourceBytes, outputBytes) {
  if (!sourceBytes || sourceBytes <= 0) {
    return `输出 ${formatBytes(outputBytes)}`;
  }

  const ratio = (outputBytes - sourceBytes) / sourceBytes;
  const percent = Math.round(Math.abs(ratio) * 100);

  if (outputBytes < sourceBytes) {
    return `${formatBytes(sourceBytes)} -> ${formatBytes(outputBytes)}，缩小 ${percent}%`;
  }

  if (outputBytes > sourceBytes) {
    return `${formatBytes(sourceBytes)} -> ${formatBytes(outputBytes)}，增大 ${percent}%`;
  }

  return `${formatBytes(sourceBytes)} -> ${formatBytes(outputBytes)}，大小不变`;
}

function getSourceDisplayName(record, fallback = '原始字体') {
  return record?.alias?.trim() || record?.sourceName?.trim() || fallback;
}

function formatCodePoint(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(codePoint > 0xffff ? 6 : 4, '0')}`;
}

function getPreviewCharacterMeta(character) {
  const codePoint = character.codePointAt(0);

  if (!Number.isInteger(codePoint)) {
    return null;
  }

  if (codePoint === 32) {
    return {
      character,
      codePoint,
      displayCharacter: '␠',
      infoLabel: `空格 · ${formatCodePoint(codePoint)}`,
      title: `空格 ${formatCodePoint(codePoint)}`,
      usePreviewFont: false
    };
  }

  if (codePoint === 0x3000) {
    return {
      character,
      codePoint,
      displayCharacter: '□',
      infoLabel: `全角空格 · ${formatCodePoint(codePoint)}`,
      title: `全角空格 ${formatCodePoint(codePoint)}`,
      usePreviewFont: false
    };
  }

  return {
    character,
    codePoint,
    displayCharacter: character,
    infoLabel: formatCodePoint(codePoint),
    title: `${character} ${formatCodePoint(codePoint)}`,
    usePreviewFont: true
  };
}

function buildPreviewItem(character, missing = false) {
  const meta = getPreviewCharacterMeta(character);

  if (!meta) {
    return null;
  }

  return {
    ...meta,
    missing
  };
}

function getPreviewCharactersFromPayload(payload) {
  if (Array.isArray(payload?.codePoints) && payload.codePoints.length) {
    return payload.codePoints
      .filter((codePoint) => Number.isInteger(codePoint))
      .map((codePoint) => String.fromCodePoint(codePoint));
  }

  return Array.from(typeof payload?.characters === 'string' ? payload.characters : '');
}

async function getSha256Hex(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getSelectedSubsetMode() {
  return subsetModeInputs.find((input) => input.checked)?.value || 'full';
}

function getSelectedOperationMode() {
  return operationModeInputs.find((input) => input.checked)?.value || 'fresh';
}

function getSelectedOutputFormat() {
  const value = outputFormat.value || 'ttf';
  return Object.prototype.hasOwnProperty.call(OUTPUT_FORMAT_LABELS, value) ? value : 'ttf';
}

function getSelectedOutputLabel() {
  return OUTPUT_FORMAT_LABELS[getSelectedOutputFormat()] || 'TTF';
}

function getSelectedCdnFilenameMode() {
  return cdnFilenameModeInputs.find((input) => input.checked)?.value || 'existing';
}

function getSelectedPreset() {
  return charsetPresets.find((preset) => preset.id === presetSelect.value) || null;
}

function getExistingSubsetUrlValue() {
  return existingSubsetUrl.value.trim();
}

function getExistingSubsetUrlFileInfo() {
  const remoteUrl = getExistingSubsetUrlValue();

  if (!remoteUrl) {
    return null;
  }

  try {
    const url = new URL(remoteUrl);
    const pathname = decodeURIComponent(url.pathname || '').replace(/\\/g, '/');

    if (!pathname || pathname === '/' || pathname.endsWith('/')) {
      return null;
    }

    const normalizedOutputExt = getSelectedOutputFormat().toLowerCase();
    const currentExt = pathname.match(/\.([^.\/]+)$/)?.[1]?.toLowerCase() || '';
    const resolvedPath =
      currentExt && currentExt !== normalizedOutputExt
        ? pathname.replace(/\.[^.\/]+$/, `.${normalizedOutputExt}`)
        : currentExt
          ? pathname
          : `${pathname}.${normalizedOutputExt}`;

    return {
      pathname,
      basename: pathname.split('/').pop() || '',
      resolvedPath,
      resolvedBasename: resolvedPath.split('/').pop() || ''
    };
  } catch {
    return null;
  }
}

function getExistingSubsetMatchTarget() {
  const remoteUrl = getExistingSubsetUrlValue();

  if (remoteUrl) {
    if (!isValidRemoteFontUrl(remoteUrl)) {
      return null;
    }

    return {
      type: 'url',
      key: `url:${remoteUrl}`,
      url: remoteUrl
    };
  }

  const file = existingSubsetFile.files?.[0];

  if (!file) {
    return null;
  }

  return {
    type: 'file',
    key: `file:${file.name}:${file.size}:${file.lastModified}`,
    file
  };
}

function hasExistingSubsetSource() {
  return Boolean(getExistingSubsetUrlValue() || existingSubsetFile.files?.length);
}

function hasExplicitSourceSelection() {
  return Boolean(selectedFile || selectedLibrarySource?.sourceHash);
}

function hasSourceFontForCurrentOperation() {
  if (getSelectedOperationMode() !== 'incremental') {
    return hasExplicitSourceSelection();
  }

  return Boolean(hasExplicitSourceSelection() || matchedSourceState?.sourceHash);
}

function isMatchingCachedFileState(fileState, file) {
  return Boolean(
    file &&
      fileState.name === file.name &&
      fileState.size === file.size &&
      fileState.lastModified === file.lastModified
  );
}

function isValidRemoteFontUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getSubsetModeValidationState() {
  const subsetMode = getSelectedSubsetMode();

  if (subsetMode === 'full') {
    return {
      ready: true,
      message: '本次会保留完整字体，不做字符切割。'
    };
  }

  if (subsetMode === 'preset') {
    const preset = getSelectedPreset();
    return preset
      ? {
          ready: true,
          message: `系统预设已就绪：${preset.name}，共 ${preset.count} 个汉字。`
        }
      : {
          ready: false,
          message: '系统预设还没加载完成，请稍后再试。'
        };
  }

  if (subsetMode === 'manual') {
    const characters = getSubsetCharacters(subsetText.value);
    return characters.length
      ? {
          ready: true,
          message: `手动字符已准备好，识别到 ${characters.length} 个唯一字符。`
        }
      : {
          ready: false,
          message: '请先输入这次要保留的字符。'
        };
  }

  const file = charsetFile.files?.[0];

  if (!file) {
    return {
      ready: false,
      message: '请先上传字符集文件。'
    };
  }

  if (charsetFileLoadState === 'loading' || !isMatchingCachedFileState(charsetFileState, file)) {
    return {
      ready: false,
      message: `正在读取字符集文件 ${file.name}，请稍候。`
    };
  }

  if (charsetFileLoadState === 'error') {
    return {
      ready: false,
      message: charsetFileLoadError || '字符集文件读取失败，请重新选择。'
    };
  }

  if (!charsetFileState.count) {
    return {
      ready: false,
      message: `字符集文件 ${file.name} 里没有识别到可用字符。`
    };
  }

  return {
    ready: true,
    message: `字符集文件已就绪：${file.name}，共 ${charsetFileState.count} 个唯一字符。`
  };
}

function getCurrentSourceInspectionTarget() {
  if (selectedFile) {
    return {
      key: `manual:${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`,
      sourceLabel: selectedFile.name,
      kind: 'file',
      file: selectedFile
    };
  }

  if (selectedLibrarySource?.sourceHash) {
    return {
      key: `library:${selectedLibrarySource.sourceHash}`,
      sourceLabel: getSourceDisplayName(selectedLibrarySource, '已保存原始字体'),
      kind: 'saved',
      sourceFontHash: selectedLibrarySource.sourceHash
    };
  }

  if (getSelectedOperationMode() === 'incremental' && matchedSourceState?.sourceHash) {
    return {
      key: `matched:${matchedSourceState.sourceHash}`,
      sourceLabel: getSourceDisplayName(matchedSourceState, '自动匹配原始字体'),
      kind: 'saved',
      sourceFontHash: matchedSourceState.sourceHash
    };
  }

  return null;
}

function resetSourceInspectionState() {
  sourceInspectionState = {
    key: '',
    status: 'idle',
    sourceLabel: '',
    payload: null,
    error: ''
  };
}

async function inspectSourceFontForPreflight(force = false) {
  const target = getCurrentSourceInspectionTarget();

  if (!target) {
    if (sourceInspectionState.key || sourceInspectionState.status !== 'idle') {
      sourceInspectionRequestId += 1;
      resetSourceInspectionState();
      updateConvertButtonState();
    }
    return null;
  }

  if (!force && sourceInspectionState.key === target.key) {
    if (sourceInspectionState.status === 'ready') {
      return sourceInspectionState.payload;
    }

    if (sourceInspectionState.status === 'loading') {
      return null;
    }
  }

  const requestId = sourceInspectionRequestId + 1;
  sourceInspectionRequestId = requestId;
  sourceInspectionState = {
    key: target.key,
    status: 'loading',
    sourceLabel: target.sourceLabel,
    payload: null,
    error: ''
  };
  updateConvertButtonState();

  try {
    const requestPayload =
      target.kind === 'file'
        ? {
            filename: target.file.name,
            data: await readFileAsBase64(target.file),
            includeData: false
          }
        : {
            sourceFontHash: target.sourceFontHash,
            includeData: false
          };

    const response = await apiFetch('/api/font-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '原始字体特性读取失败。');
    }

    const payload = await response.json();

    if (requestId !== sourceInspectionRequestId) {
      return null;
    }

    sourceInspectionState = {
      key: target.key,
      status: 'ready',
      sourceLabel: target.sourceLabel,
      payload,
      error: ''
    };
    updateConvertButtonState();
    return payload;
  } catch (error) {
    if (requestId !== sourceInspectionRequestId) {
      return null;
    }

    sourceInspectionState = {
      key: target.key,
      status: 'error',
      sourceLabel: target.sourceLabel,
      payload: null,
      error: error instanceof Error ? error.message : '原始字体特性读取失败。'
    };
    updateConvertButtonState();
    return null;
  }
}

function formatFeatureTables(tables, fallback = '无') {
  return Array.isArray(tables) && tables.length ? tables.join(' / ') : fallback;
}

function renderPreflightCollection(container, items, itemClassName, tagName = 'li') {
  container.replaceChildren();

  for (const item of items) {
    const element = document.createElement(tagName);
    element.className = `${itemClassName} is-${item.tone}`;
    element.textContent = item.message;
    container.append(element);
  }
}

function getPreflightState() {
  const operationMode = getSelectedOperationMode();
  const outputLabel = getSelectedOutputLabel();
  const items = [];
  const featureItems = [];
  const remoteUrl = getExistingSubsetUrlValue();
  const existingSubsetLocalFile = existingSubsetFile.files?.[0] || null;
  const subsetState = getSubsetModeValidationState();
  const hasResolvedSource = hasSourceFontForCurrentOperation();

  if (selectedFile) {
    items.push({
      tone: 'ready',
      message: `原始全量字体已选中：${selectedFile.name}。`
    });
  } else if (selectedLibrarySource?.sourceHash) {
    items.push({
      tone: 'ready',
      message: `原始全量字体将复用已保存项：${getSourceDisplayName(selectedLibrarySource)}。`
    });
  } else if (operationMode === 'incremental' && matchedSourceState?.sourceHash) {
    items.push({
      tone: 'ready',
      message: `原始全量字体已自动匹配：${getSourceDisplayName(matchedSourceState)}。`
    });
  } else if (operationMode === 'incremental' && getExistingSubsetMatchTarget()) {
    items.push({
      tone: 'blocking',
      message: '正在等待原始全量字体自动匹配；如果长时间没有结果，再手动上传。'
    });
  } else {
    items.push({
      tone: 'blocking',
      message:
        operationMode === 'incremental'
          ? '请先提供当前子集字体，让系统自动匹配原始全量字体。'
          : '请先上传原始全量字体，或从已保存列表里选择一份。'
    });
  }

  if (operationMode === 'incremental') {
    if (!remoteUrl && !existingSubsetLocalFile) {
      items.push({
        tone: 'blocking',
        message: '请先填写当前子集字体 URL，或上传本地子集字体。'
      });
    } else if (remoteUrl && !isValidRemoteFontUrl(remoteUrl)) {
      items.push({
        tone: 'blocking',
        message: '当前子集字体 URL 需要是 http:// 或 https:// 地址。'
      });
    } else if (remoteUrl) {
      items.push({
        tone: 'ready',
        message: '当前子集字体将优先使用网络 URL。'
      });
    } else if (existingSubsetLocalFile) {
      items.push({
        tone: 'ready',
        message: `当前子集字体已选中本地文件：${existingSubsetLocalFile.name}。`
      });
    }
  }

  items.push({
    tone: subsetState.ready ? 'ready' : 'blocking',
    message: subsetState.message
  });

  if (operationMode === 'incremental' && remoteUrl && existingSubsetLocalFile) {
    featureItems.push({
      tone: 'warning',
      message: `你已经填写了当前子集字体 URL，本地文件 ${existingSubsetLocalFile.name} 这次会被忽略。`
    });
  }

  if (sourceInspectionState.status === 'loading' && hasResolvedSource) {
    featureItems.push({
      tone: 'info',
      message: `正在读取原始字体 ${sourceInspectionState.sourceLabel} 的 hinting / kerning 特性...`
    });
  } else if (sourceInspectionState.status === 'error' && hasResolvedSource) {
    featureItems.push({
      tone: 'warning',
      message: `原始字体特性读取失败：${sourceInspectionState.error}`
    });
  } else if (sourceInspectionState.status === 'ready' && sourceInspectionState.payload) {
    const payload = sourceInspectionState.payload;
    featureItems.push({
      tone: 'info',
      message:
        `已读取原始字体 ${sourceInspectionState.sourceLabel}：${payload.glyphCount || 0} 个字形，` +
        `hinting 表 ${formatFeatureTables(payload.hintingTables)}，` +
        `kerning 表 ${formatFeatureTables(payload.kerningTables)}。`
    });

    if (keepHinting.checked) {
      featureItems.push(
        payload.hasHintingData
          ? {
              tone: 'ready',
              message: `当前会尽量保留 hinting，源字体里可用表为 ${formatFeatureTables(payload.hintingTables)}。`
            }
          : {
              tone: 'warning',
              message: '当前勾选了“保留 hinting”，但这份源字体本身不含 hinting 数据。'
            }
      );
    } else if (payload.hasHintingData) {
      featureItems.push({
        tone: 'info',
        message: '当前不会保留 hinting 数据，输出体积通常会更小。'
      });
    }

    if (keepKerning.checked) {
      featureItems.push(
        payload.hasKerningData
          ? {
              tone: 'ready',
              message: `当前会尽量保留 kerning，源字体里可用表为 ${formatFeatureTables(payload.kerningTables)}。`
            }
          : {
              tone: 'warning',
              message: '当前勾选了“保留 kerning”，但这份源字体本身不含 kerning 数据。'
            }
      );
    } else if (payload.hasKerningData) {
      featureItems.push({
        tone: 'info',
        message: '当前不会保留 kerning，输出体积通常会更小。'
      });
    }
  }

  const blockingItems = items.filter((item) => item.tone === 'blocking');
  const warningItems = [...items, ...featureItems].filter((item) => item.tone === 'warning');
  const firstBlockingMessage = blockingItems[0]?.message || '';
  const summary = blockingItems.length
    ? blockingItems.length === 1
      ? `还差 1 项必需步骤：${firstBlockingMessage}`
      : `还差 ${blockingItems.length} 项必需步骤，补齐后才会解锁转换按钮。`
    : sourceInspectionState.status === 'loading'
      ? '主要步骤已经齐了，正在补充读取原始字体特性。'
      : warningItems.length
        ? '已经可以开始转换了，但下面还有几条提醒，建议先看一眼。'
        : `主要步骤已经齐了，可以开始转换并下载 ${outputLabel}。`;

  return {
    items,
    featureItems,
    blockingItems,
    badgeText: blockingItems.length
      ? `待补齐 ${blockingItems.length} 项`
      : sourceInspectionState.status === 'loading'
        ? '检查中'
        : warningItems.length
          ? '有提醒'
          : '可开始',
    badgeTone: blockingItems.length ? 'pending' : warningItems.length ? 'warning' : 'ready',
    summary,
    buttonTitle: blockingItems.length ? firstBlockingMessage : `开始转换并下载 ${outputLabel}`
  };
}

function renderPreflightState(preflightState) {
  preflightPanel.dataset.tone = preflightState.badgeTone;
  preflightBadge.textContent = preflightState.badgeText;
  preflightBadge.className = 'preflight-badge';

  if (preflightState.badgeTone !== 'pending') {
    preflightBadge.classList.add(`is-${preflightState.badgeTone}`);
  }

  preflightSummary.textContent = preflightState.summary;
  renderPreflightCollection(preflightChecklist, preflightState.items, 'preflight-check', 'li');
  renderPreflightCollection(preflightFeatureNotes, preflightState.featureItems, 'preflight-feature-note', 'div');
  preflightFeatureNotes.classList.toggle('is-hidden', !preflightState.featureItems.length);
}

function updateConvertButtonState() {
  const preflightState = getPreflightState();
  convertButton.disabled = preflightState.blockingItems.length > 0;
  convertButton.title = preflightState.buttonTitle;
  renderPreflightState(preflightState);
}

function applySourceStatePresentation(state, badge, hint) {
  metaSourceCard.dataset.sourceState = state;
  sourceSetupCard.dataset.sourceState = state;
  sourceStateBadge.textContent = badge;
  sourceStateHint.textContent = hint;
}

function updateSourceFontMeta() {
  let message = '';

  if (selectedFile) {
    message = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
    applySourceStatePresentation('manual', '已上传', '当前会使用你刚上传的原始全量字体。');
  } else if (selectedLibrarySource) {
    message = `已保存：${getSourceDisplayName(selectedLibrarySource)} (${formatBytes(selectedLibrarySource.sourceSize)})`;
    applySourceStatePresentation('library', '已选保存项', '当前会使用服务端已保存的原始字体。');
  } else if (getSelectedOperationMode() === 'incremental' && matchedSourceState?.sourceName) {
    message = `自动匹配：${getSourceDisplayName(matchedSourceState)} (${formatBytes(matchedSourceState.sourceSize)})`;
    applySourceStatePresentation('matched', '自动匹配成功', '系统已根据当前子集字体自动匹配到这份原始全量字体。');
  } else {
    message =
      getSelectedOperationMode() === 'incremental'
        ? '等待自动匹配，或手动选择原始全量字体'
        : '还没有选择文件';

    applySourceStatePresentation(
      getSelectedOperationMode() === 'incremental' ? 'pending-match' : 'empty',
      getSelectedOperationMode() === 'incremental' ? '等待匹配' : '待选择',
      getSelectedOperationMode() === 'incremental'
        ? '提供当前子集字体后，系统会优先自动匹配原始字体。'
        : '上传后这里会显示当前生效的原始字体来源。'
    );
  }

  fileName.textContent = message;
  updateWorkflowCopy();
  void inspectSourceFontForPreflight();
}

function updateWorkflowCopy() {
  const operationMode = getSelectedOperationMode();
  const hasManualSource = hasExplicitSourceSelection();
  const hasMatchedSource = operationMode === 'incremental' && Boolean(matchedSourceState?.sourceHash);
  const hasResolvedSource = hasSourceFontForCurrentOperation();

  panel.classList.toggle('is-incremental-mode', operationMode === 'incremental');
  sourceSetupCard.classList.toggle('is-ready', hasResolvedSource);

  if (operationMode === 'incremental') {
    operationTitle.textContent = '先提供当前子集字体，再决定是否补充原始字体';
    operationLead.textContent =
      '增量更新会先读取你现有的子集字体，自动找回对应的原始全量字体；只有匹配不到时，才需要手动补充原始字体。';
    sourceSectionEyebrow.textContent = 'Step 2';
    sourceSectionTitle.textContent = '确认原始全量字体';
    sourceLibraryTitle.textContent = '已保存原始字体（手动指定）';
    optionsEyebrow.textContent = 'Step 3';
    optionsLead.textContent =
      '选好当前子集字体和原始来源后，再决定这次要新增哪些字符。默认还会去掉 hinting 和 kerning，进一步减小文件。';
    subsetFootnote.textContent =
      '提醒：很多 OTF 本身并不包含可保留的 hinting 或 kerning 表，这种情况下勾选它们不会改变体积。增量更新时先提供当前子集字体来源（网络地址或本地文件），系统会自动匹配原始全量字体；匹配不到时再在这里手动上传或从保存列表里指定。';

    if (hasManualSource) {
      sourceSectionLead.textContent =
        '你已经手动指定了原始全量字体，系统会优先使用这份来源。需要的话，可以在这里继续替换。';
      dropzoneTitle.textContent = '如需更换原始全量字体，可重新拖入或点击选择';
      dropzoneHint.textContent = '也可以直接从下方服务端已保存的原始字体里切换来源。';
      return;
    }

    if (hasMatchedSource) {
      sourceSectionLead.textContent =
        '系统已根据当前子集字体自动匹配到原始全量字体；如果想覆盖这个结果，再在这里手动指定。';
      dropzoneTitle.textContent = '如需覆盖自动匹配，可拖入别的原始全量字体';
      dropzoneHint.textContent = '或者从下方已保存原始字体里手动指定一份新的来源。';
      return;
    }

    sourceSectionLead.textContent =
      '系统会先尝试自动匹配原始全量字体。只有匹配不到时，才需要在这里手动上传或从保存列表里选择。';
    dropzoneTitle.textContent = '自动匹配失败时，再上传原始全量字体';
    dropzoneHint.textContent = '你可以先完成上一步提供当前子集字体，系统会优先自动查找对应来源。';
    return;
  }

  operationTitle.textContent = '先选择原始全量字体，再决定如何裁剪';
  operationLead.textContent =
    '第一次压缩时，流程最简单：上传完整字体，选择保留字符，再直接转换下载。';
  sourceSectionEyebrow.textContent = 'Step 1';
  sourceSectionTitle.textContent = '选择原始全量字体';
  sourceSectionLead.textContent =
    '上传一份完整字体，或直接复用服务端已保存的原始字体，作为这次压缩的来源。';
  sourceLibraryTitle.textContent = '已保存原始字体';
  dropzoneTitle.textContent = hasManualSource
    ? '拖入新的原始全量字体，或点击这里替换当前选择'
    : '拖入原始全量字体，或点击这里选择';
  dropzoneHint.textContent = '原始字体支持：TTF / OTF / WOFF / WOFF2 / EOT / SVG';
  optionsEyebrow.textContent = 'Step 2';
  optionsLead.textContent =
    '只保留你真正会用到的字符，是缩小输出字体体积最有效的方法。默认还会去掉 hinting 和 kerning，进一步减小文件。';
  subsetFootnote.textContent =
    '提醒：很多 OTF 本身并不包含可保留的 hinting 或 kerning 表，这种情况下勾选它们不会改变体积。';
}

function renderSourceLibrary() {
  sourceFontSelect.replaceChildren();
  const operationMode = getSelectedOperationMode();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent =
    operationMode === 'incremental'
      ? sourceLibraryRecords.length
        ? '需要时可手动指定已保存原始字体'
        : '暂无可手动指定的已保存原始字体'
      : sourceLibraryRecords.length
        ? '选择已保存原始字体'
        : '暂无已保存原始字体';
  sourceFontSelect.append(placeholder);

  const sortedRecords = [...sourceLibraryRecords].sort((left, right) => {
    return Number(right.savedAt || 0) - Number(left.savedAt || 0);
  });

  for (const record of sortedRecords) {
    const option = document.createElement('option');
    option.value = record.sourceHash;
    const displayName = getSourceDisplayName(record);
    const originalName = record.alias ? ` · ${record.sourceName}` : '';
    option.textContent = `${displayName}${originalName} (${formatBytes(record.sourceSize || 0)})`;
    sourceFontSelect.append(option);
  }

  if (selectedLibrarySource?.sourceHash) {
    sourceFontSelect.value = selectedLibrarySource.sourceHash;
  }

  const hasSelection = Boolean(sourceFontSelect.value);
  const aliasRecord = sourceLibraryRecords.find((item) => item.sourceHash === sourceFontSelect.value) || null;
  const hasExplicitSelection = hasExplicitSourceSelection();
  useSavedSourceButton.disabled = !hasSelection;
  resetSourceButton.disabled = !hasExplicitSelection;
  deleteSavedSourceButton.disabled = !hasSelection;
  sourceFontAlias.disabled = !hasSelection;
  saveSourceAliasButton.disabled = !hasSelection;
  sourceFontAlias.value = aliasRecord?.alias || '';
  sourceLibraryMeta.textContent =
    operationMode === 'incremental'
      ? sourceLibraryRecords.length
        ? `${repositoryStorageState.enabled ? '仓库' : '服务端'}已保存 ${sourceLibraryRecords.length} 个原始字体。自动匹配不合适时，可以直接从这里手动指定来源。`
        : '当前还没有已保存的原始字体可供手动指定；完成一次转换后，原始字体会自动出现在这里。'
      : sourceLibraryRecords.length
        ? `${repositoryStorageState.enabled ? '仓库' : '服务端'}已保存 ${sourceLibraryRecords.length} 个原始字体，可直接复用作为新的压缩来源。`
        : repositoryStorageState.enabled
          ? '完成一次转换后，原始字体会自动保存到当前仓库，后续可直接从这里选择。'
          : '完成一次转换后，原始字体会自动保存在服务端数据目录，后续可直接从这里选择。';
  updateWorkflowCopy();
}

async function loadSourceLibrary() {
  try {
    const response = await apiFetch('/api/source-fonts');

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '原始字体列表读取失败。');
    }

    const payload = await response.json();
    sourceLibraryRecords = Array.isArray(payload.sources) ? payload.sources : [];
    renderSourceLibrary();
    return true;
  } catch (error) {
    sourceLibraryRecords = [];
    renderSourceLibrary();
    sourceLibraryMeta.textContent = error instanceof Error ? error.message : '原始字体列表读取失败。';
    return false;
  }
}

function selectSavedSource(record) {
  selectedLibrarySource = record || null;

  if (selectedLibrarySource) {
    selectedFile = null;
    fileInput.value = '';
    updateStatus(`已选择保存的原始字体：${getSourceDisplayName(selectedLibrarySource)}。`);
    if (getSelectedOperationMode() === 'incremental') {
      sourceMatchMeta.textContent = `将使用已保存的原始字体：${getSourceDisplayName(selectedLibrarySource)}。`;
    }
  }

  updateSourceFontMeta();
  updateConvertButtonState();
  renderSourceLibrary();
}

function resetOriginalSourceSelection() {
  if (!hasExplicitSourceSelection()) {
    return;
  }

  selectedFile = null;
  selectedLibrarySource = null;
  fileInput.value = '';
  sourceFontSelect.value = '';

  renderSourceLibrary();
  updateSourceFontMeta();
  updateConvertButtonState();

  if (getSelectedOperationMode() !== 'incremental') {
    updateStatus('已重置原始字体，请重新上传，或从已保存原始字体中选择一个。');
    return;
  }

  if (matchedSourceState?.sourceHash) {
    updateStatus('已重置手动选择的原始字体，当前回退为自动匹配结果。');
    return;
  }

  if (getExistingSubsetMatchTarget()) {
    updateStatus('已重置原始字体，系统将重新尝试自动匹配。');
    scheduleOriginalSourceMatch();
    return;
  }

  clearMatchedSource();
  updateStatus('已重置原始字体，请重新上传、选择已保存字体，或先提供当前子集字体。');
}

function setSelectedFile(file) {
  selectedFile = file || null;
  if (selectedFile) {
    selectedLibrarySource = null;
    sourceFontSelect.value = '';
    renderSourceLibrary();
  }
  updateSourceFontMeta();
  updateConvertButtonState();

  if (selectedFile) {
    updateStatus('原始字体已就绪，选择处理模式和字符来源后即可开始。');
    if (getSelectedOperationMode() === 'incremental') {
      sourceMatchMeta.textContent = `将使用手动上传的原始字体：${selectedFile.name}。`;
    }
  } else if (getSelectedOperationMode() === 'incremental') {
    updateStatus('请选择当前子集字体，系统会尝试自动匹配原始全量字体。');
    if (getExistingSubsetMatchTarget()) {
      scheduleOriginalSourceMatch();
    }
  } else {
    updateStatus('请选择一个字体文件开始。');
  }
}

function updatePresetDescription() {
  const preset = getSelectedPreset();
  presetDescription.textContent = preset
    ? `${preset.description} 当前预设共 ${preset.count} 个汉字。`
    : '当前没有可用的系统预设。';
}

function updateConvertButtonLabel() {
  const outputLabel = getSelectedOutputLabel();
  convertButton.textContent =
    getSelectedOperationMode() === 'incremental'
      ? `增量更新并下载 ${outputLabel}`
      : `转换并下载 ${outputLabel}`;
}

function updateExistingSubsetMeta() {
  const remoteUrl = getExistingSubsetUrlValue();

  if (remoteUrl) {
    if (!isValidRemoteFontUrl(remoteUrl)) {
      existingSubsetMeta.textContent = '当前子集字体 URL 还不完整，请填写 http:// 或 https:// 地址。';
      return;
    }

    existingSubsetMeta.textContent = `将优先使用网络子集字体：${remoteUrl}`;
    return;
  }

  if (existingSubsetState.name) {
    existingSubsetMeta.textContent = `已载入当前子集字体 ${existingSubsetState.name}（${formatBytes(existingSubsetState.size)}）。`;
    return;
  }

  existingSubsetMeta.textContent = '还没有选择当前子集字体。';
}

function updateSourcePanels() {
  const subsetMode = getSelectedSubsetMode();
  presetPanel.classList.toggle('is-hidden', subsetMode !== 'preset');
  manualPanel.classList.toggle('is-hidden', subsetMode !== 'manual');
  filePanel.classList.toggle('is-hidden', subsetMode !== 'file');
}

function updateOperationPanels() {
  const operationMode = getSelectedOperationMode();
  existingSubsetPanel.classList.toggle('is-hidden', operationMode !== 'incremental');
  updateConvertButtonLabel();
  updateSourceFontMeta();
  updateConvertButtonState();
  updateCdnFilenameModePanel();

  const target = getExistingSubsetMatchTarget();
  if (operationMode !== 'incremental') {
    clearSubsetPreview();
    return;
  }

  if (target && subsetPreviewTargetKey !== target.key) {
    scheduleSubsetPreview();
  }

  if (
    operationMode === 'incremental' &&
    target &&
    !selectedFile &&
    !selectedLibrarySource &&
    matchedSourceState?.matchKey !== target.key
  ) {
    scheduleOriginalSourceMatch();
  }
}

function updateSubsetSummary() {
  const subsetMode = getSelectedSubsetMode();
  const operationMode = getSelectedOperationMode();
  const remoteUrl = getExistingSubsetUrlValue();
  const incrementalPrefix =
    operationMode === 'incremental'
      ? remoteUrl
        ? '当前将以网络子集字体为基础，'
        : existingSubsetFile.files?.length
          ? '当前将以已压缩子集字体为基础，'
          : '当前选择的是增量更新模式，但还没有提供当前子集字体；'
      : '';

  if (subsetMode === 'full') {
    subsetSummary.textContent =
      operationMode === 'incremental'
        ? `${incrementalPrefix}不新增字符，只按当前子集字体已有字符重新生成。`
        : '当前保留完整字体，不做字符切割。';
    return;
  }

  if (subsetMode === 'preset') {
    const preset = getSelectedPreset();
    subsetSummary.textContent = preset
      ? `${incrementalPrefix}使用系统预设“${preset.name}”，预计新增/保留 ${preset.count} 个汉字。`
      : '系统预设尚未加载完成。';
    return;
  }

  if (subsetMode === 'manual') {
    const characters = getSubsetCharacters(subsetText.value);

    if (!characters.length) {
      subsetSummary.textContent =
        operationMode === 'incremental'
          ? `${incrementalPrefix}还没有填写要新增或保留的字符。`
          : '当前选择手动输入，但还没有填写要保留的字符。';
      return;
    }

    const preview = characters.slice(0, 24).join('');
    const ellipsis = characters.length > 24 ? '…' : '';
    subsetSummary.textContent =
      operationMode === 'incremental'
        ? `${incrementalPrefix}按手动输入处理，包含 ${characters.length} 个唯一字符。预览：${preview}${ellipsis}`
        : `当前将按手动输入处理，包含 ${characters.length} 个唯一字符。预览：${preview}${ellipsis}`;
    return;
  }

  if (!charsetFile.files?.length) {
    subsetSummary.textContent =
      operationMode === 'incremental'
        ? `${incrementalPrefix}还没有上传字符集文件。`
        : '当前选择字符集文件模式，但还没有上传字符集文件。';
    return;
  }

  if (!charsetFileState.count) {
    subsetSummary.textContent = `${incrementalPrefix}已选择文件 ${charsetFile.files[0].name}，正在等待可用字符或文件内容为空。`;
    return;
  }

  subsetSummary.textContent =
    operationMode === 'incremental'
      ? `${incrementalPrefix}按字符集文件 ${charsetFileState.name} 处理，识别到 ${charsetFileState.count} 个唯一字符。`
      : `当前将按字符集文件 ${charsetFileState.name} 处理，识别到 ${charsetFileState.count} 个唯一字符。`;
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64Payload = result.split(',')[1];

      if (!base64Payload) {
        reject(new Error('文件读取失败，请重试。'));
        return;
      }

      resolve(base64Payload);
    };

    reader.onerror = () => reject(new Error('文件读取失败，请重试。'));
    reader.readAsDataURL(file);
  });
}

async function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };

    reader.onerror = () => reject(new Error('字符集文件读取失败，请重试。'));
    reader.readAsText(file, 'utf-8');
  });
}

async function cacheCharsetFile(file) {
  const text = await readTextFile(file);
  const count = getSubsetCharacters(text).length;

  charsetFileState = {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    text,
    count
  };

  charsetFileMeta.textContent = count
    ? `已载入 ${file.name}，识别到 ${count} 个唯一字符。`
    : `已载入 ${file.name}，但没有识别到可用字符。`;
}

async function cacheExistingSubsetFile(file) {
  const base64 = await readFileAsBase64(file);

  existingSubsetState = {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    base64
  };
  updateExistingSubsetMeta();
}

function getPreviewElements(kind) {
  return kind === 'output'
    ? {
        panel: outputPreviewPanel,
        meta: outputPreviewMeta,
        text: outputPreviewText,
        more: outputPreviewMore,
        copy: outputPreviewCopy
      }
    : {
        panel: subsetPreviewPanel,
        meta: subsetPreviewMeta,
        text: subsetPreviewText,
        more: subsetPreviewMore,
        copy: subsetPreviewCopy
      };
}

function getPreviewCopyLabel(kind, copiedCount = 0) {
  if (copiedCount > 0) {
    return `已复制 ${copiedCount} 个字符`;
  }

  return '复制已识别字符';
}

function resetPreviewCopyButton(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  if (state.copyResetTimer) {
    window.clearTimeout(state.copyResetTimer);
    state.copyResetTimer = 0;
  }

  elements.copy.textContent = getPreviewCopyLabel(kind);
}

function updatePreviewActionButtons(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  elements.more.classList.toggle('is-hidden', !state.items.length || state.renderedCount >= state.items.length);
  elements.copy.classList.toggle('is-hidden', !state.copyText);
}

function getPreviewStyleElement(kind) {
  if (kind === 'output') {
    if (!outputPreviewStyle) {
      outputPreviewStyle = document.createElement('style');
      outputPreviewStyle.id = 'outputPreviewFontStyle';
      document.head.append(outputPreviewStyle);
    }

    return outputPreviewStyle;
  }

  if (!subsetPreviewStyle) {
    subsetPreviewStyle = document.createElement('style');
    subsetPreviewStyle.id = 'subsetPreviewFontStyle';
    document.head.append(subsetPreviewStyle);
  }

  return subsetPreviewStyle;
}

function updatePreviewMeta(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];
  const missingText =
    state.missingItems.length > 0
      ? ` 未识别：${state.missingItems.map((item) => item.title).join('、')}。`
      : '';

  if (!state.parsedCount && !state.displayCount) {
    elements.meta.textContent = `${state.filename || '字体'} 没有解析到可预览字符。`;
    return;
  }

  if (state.prefersRequestedOrder) {
    elements.meta.textContent =
      `${state.filename} ${state.context}识别到 ${state.parsedCount} 个可预览字符，` +
      `按当前输入顺序显示 ${state.displayCount} 个目标字符，已显示 ${state.renderedCount} 个。` +
      missingText;
    return;
  }

  elements.meta.textContent =
    `${state.filename} ${state.context}包含 ${state.parsedCount} 个可预览字符，已显示 ${state.renderedCount} 个。` +
    ' 预览按字符集展开，不按原句顺序。';
}

function appendPreviewCharacters(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  if (!state.items.length) {
    elements.text.textContent = '未识别到字符';
    updatePreviewActionButtons(kind);
    updatePreviewMeta(kind);
    return;
  }

  const nextCount = Math.min(state.renderedCount + PREVIEW_BATCH_SIZE, state.items.length);
  const chunk = state.items.slice(state.renderedCount, nextCount);
  const fragment = document.createDocumentFragment();

  for (const item of chunk) {
    const token = document.createElement('span');
    token.className = `preview-token${item.missing ? ' is-missing' : ''}`;
    token.title = item.missing ? `${item.title}（输出字体里未识别到）` : item.title;

    const glyph = document.createElement('span');
    glyph.className = 'preview-token-char';
    glyph.textContent = item.displayCharacter;

    if (item.usePreviewFont && state.family) {
      glyph.style.fontFamily = `"${state.family}", "Segoe UI Symbol", sans-serif`;
    }

    const code = document.createElement('span');
    code.className = 'preview-token-code';
    code.textContent = item.infoLabel;

    token.append(glyph, code);
    fragment.append(token);
  }

  elements.text.append(fragment);
  state.renderedCount = nextCount;
  updatePreviewActionButtons(kind);
  updatePreviewMeta(kind);
}

function clearPreview(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  state.items = [];
  state.parsedCount = 0;
  state.displayCount = 0;
  state.renderedCount = 0;
  state.filename = '';
  state.family = '';
  state.prefersRequestedOrder = false;
  state.missingItems = [];
  state.copyText = '';
  state.copyCount = 0;
  elements.panel.classList.add('is-hidden');
  elements.meta.textContent = '';
  elements.text.replaceChildren();
  resetPreviewCopyButton(kind);
  updatePreviewActionButtons(kind);

  const styleElement = kind === 'output' ? outputPreviewStyle : subsetPreviewStyle;
  if (styleElement) {
    styleElement.textContent = '';
  }
}

function clearSubsetPreview() {
  window.clearTimeout(subsetPreviewTimer);
  subsetPreviewRequestId += 1;
  subsetPreviewTargetKey = '';
  clearPreview('subset');
}

function clearOutputPreview() {
  clearPreview('output');
}

function setPreviewMessage(kind, message) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  elements.panel.classList.remove('is-hidden');
  elements.meta.textContent = message;
  elements.text.replaceChildren();
  state.items = [];
  state.parsedCount = 0;
  state.displayCount = 0;
  state.renderedCount = 0;
  state.family = '';
  state.prefersRequestedOrder = false;
  state.missingItems = [];
  state.copyText = '';
  state.copyCount = 0;
  resetPreviewCopyButton(kind);
  updatePreviewActionButtons(kind);
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('浏览器当前不支持自动复制。');
  }
}

async function copyPreviewCharacters(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  if (!state.copyText) {
    return;
  }

  try {
    await writeTextToClipboard(state.copyText);
    resetPreviewCopyButton(kind);
    elements.copy.textContent = getPreviewCopyLabel(kind, state.copyCount);
    state.copyResetTimer = window.setTimeout(() => {
      resetPreviewCopyButton(kind);
    }, 1800);
  } catch (error) {
    updateStatus(error instanceof Error ? error.message : '复制失败，请稍后重试。', 'error');
  }
}

function setSubsetPreviewMessage(message) {
  setPreviewMessage('subset', message);
}

function setOutputPreviewMessage(message) {
  setPreviewMessage('output', message);
}

function renderFontPreview(kind, payload, targetKey, context, options = {}) {
  const type = typeof payload.type === 'string' ? payload.type.toLowerCase() : 'ttf';
  const mimeType = FONT_MIME_TYPES[type] || 'font/ttf';
  const formatHint = FONT_FORMAT_HINTS[type] || 'truetype';
  const family = `${kind === 'output' ? 'OutputPreviewFont' : 'SubsetPreviewFont'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parsedCharacterList = getPreviewCharactersFromPayload(payload);
  const parsedCodePointSet = new Set(
    parsedCharacterList
      .map((character) => character.codePointAt(0))
      .filter((codePoint) => Number.isInteger(codePoint))
  );
  const preferredCharacters = Array.isArray(options.preferredCharacters)
    ? options.preferredCharacters.filter((character) => typeof character === 'string' && character)
    : [];
  const preferredItems = preferredCharacters
    .map((character) => buildPreviewItem(character, !parsedCodePointSet.has(character.codePointAt(0))))
    .filter(Boolean);
  const parsedItems = parsedCharacterList.map((character) => buildPreviewItem(character)).filter(Boolean);
  const items = preferredItems.length ? preferredItems : parsedItems;
  const recognizedCharacters = preferredItems.length
    ? preferredCharacters.filter((character) => parsedCodePointSet.has(character.codePointAt(0)))
    : parsedCharacterList;
  const filename =
    typeof payload.filename === 'string' && payload.filename
      ? payload.filename
      : kind === 'output'
        ? '压缩完成字体'
        : '当前子集字体';
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];

  getPreviewStyleElement(kind).textContent = `
@font-face {
  font-family: "${family}";
  src: url("data:${mimeType};base64,${payload.base64Data || ''}") format("${formatHint}");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}`;

  state.items = items;
  state.parsedCount = Number(payload.count || parsedItems.length || 0);
  state.displayCount = items.length;
  state.renderedCount = 0;
  state.filename = filename;
  state.context = context;
  state.family = family;
  state.prefersRequestedOrder = preferredItems.length > 0;
  state.missingItems = preferredItems.filter((item) => item.missing);
  state.copyText = recognizedCharacters.join('');
  state.copyCount = recognizedCharacters.length;
  resetPreviewCopyButton(kind);

  if (kind === 'subset') {
    subsetPreviewTargetKey = targetKey;
  }

  elements.panel.classList.remove('is-hidden');
  elements.text.replaceChildren();
  appendPreviewCharacters(kind);
}

function renderSubsetPreview(payload, targetKey) {
  renderFontPreview('subset', payload, targetKey, '当前');
}

function renderOutputPreview(payload, previewCharacters = []) {
  renderFontPreview('output', payload, '', '压缩完成后', {
    preferredCharacters: previewCharacters
  });
}

async function inspectExistingSubsetForPreview() {
  if (getSelectedOperationMode() !== 'incremental') {
    clearSubsetPreview();
    return null;
  }

  const target = getExistingSubsetMatchTarget();
  if (!target) {
    clearSubsetPreview();
    return null;
  }

  const requestId = subsetPreviewRequestId + 1;
  subsetPreviewRequestId = requestId;
  setSubsetPreviewMessage('正在读取当前子集字体字符...');

  try {
    let requestPayload;

    if (target.type === 'url') {
      requestPayload = { url: target.url };
    } else {
      const file = target.file;
      const cacheMiss =
        existingSubsetState.name !== file.name ||
        existingSubsetState.size !== file.size ||
        existingSubsetState.lastModified !== file.lastModified;

      if (cacheMiss) {
        await cacheExistingSubsetFile(file);
      }

      requestPayload = {
        filename: file.name,
        data: existingSubsetState.base64
      };
    }

    const response = await apiFetch('/api/font-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '当前子集字体预览解析失败。');
    }

    const payload = await response.json();

    if (requestId !== subsetPreviewRequestId) {
      return null;
    }

    renderSubsetPreview(payload, target.key);
    return payload;
  } catch (error) {
    if (requestId === subsetPreviewRequestId) {
      setSubsetPreviewMessage(error instanceof Error ? error.message : '当前子集字体预览解析失败。');
    }

    return null;
  }
}

function scheduleSubsetPreview() {
  window.clearTimeout(subsetPreviewTimer);

  const target = getExistingSubsetMatchTarget();
  if (getSelectedOperationMode() !== 'incremental' || !target) {
    clearSubsetPreview();
    return;
  }

  if (subsetPreviewTargetKey === target.key && subsetPreviewText.textContent) {
    return;
  }

  subsetPreviewRequestId += 1;
  setSubsetPreviewMessage('准备读取当前子集字体字符...');
  subsetPreviewTimer = window.setTimeout(() => {
    void inspectExistingSubsetForPreview();
  }, 450);
}

function clearMatchedSource(message = '选择当前子集字体后，会自动匹配曾用于生成它的原始全量字体。') {
  matchedSourceState = null;
  sourceMatchRequestId += 1;
  sourceMatchMeta.textContent = message;
  updateSourceFontMeta();
  updateConvertButtonState();
  updateSubsetSummary();
}

function applyMatchedSource(record, matchKey) {
  matchedSourceState = {
    matchKey,
    sourceHash: record.sourceHash || '',
    sourceName: record.sourceName || '原始字体',
    alias: record.alias || '',
    sourceSize: Number(record.sourceSize || 0),
    sourceType: record.sourceType || '',
    savedAt: Number(record.savedAt || 0)
  };

  sourceMatchMeta.textContent = `已自动匹配原始字体：${getSourceDisplayName(matchedSourceState)}（${formatBytes(
    matchedSourceState.sourceSize
  )}）。`;
  updateSourceFontMeta();
  updateConvertButtonState();
  updateSubsetSummary();
}

async function getRemoteSubsetFingerprint(url) {
  const response = await apiFetch('/api/font-fingerprint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '网络子集字体指纹计算失败。');
  }

  const payload = await response.json();
  if (typeof payload.hash !== 'string' || !payload.hash) {
    throw new Error('网络子集字体指纹计算失败。');
  }

  return payload;
}

async function getServerSourceMatch(subsetHash) {
  const response = await apiFetch('/api/source-match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subsetHash })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '原始字体匹配失败。');
  }

  return response.json();
}

async function matchOriginalSourceForExistingSubset() {
  if (getSelectedOperationMode() !== 'incremental') {
    return null;
  }

  const target = getExistingSubsetMatchTarget();
  if (!target) {
    clearMatchedSource('选择当前子集字体后，会自动匹配曾用于生成它的原始全量字体。');
    return null;
  }

  if (matchedSourceState?.matchKey === target.key && matchedSourceState.sourceHash) {
    return matchedSourceState;
  }

  const requestId = sourceMatchRequestId + 1;
  sourceMatchRequestId = requestId;
  matchedSourceState = null;
  sourceMatchMeta.textContent =
    target.type === 'url'
      ? '正在匹配网络子集字体的原始全量字体...'
      : '正在匹配本地子集字体的原始全量字体...';
  updateSourceFontMeta();
  updateConvertButtonState();

  try {
    const fingerprint =
      target.type === 'url'
        ? await getRemoteSubsetFingerprint(target.url)
        : {
            filename: target.file.name,
            bytes: target.file.size,
            hash: await getSha256Hex(target.file)
          };

    if (requestId !== sourceMatchRequestId) {
      return null;
    }

    const payload = await getServerSourceMatch(fingerprint.hash);

    if (requestId !== sourceMatchRequestId) {
      return null;
    }

    if (!payload.source?.sourceHash) {
      sourceMatchMeta.textContent = '服务端没有找到这个子集字体对应的原始全量字体，请在上方手动上传。';
      updateSourceFontMeta();
      updateConvertButtonState();
      return null;
    }

    applyMatchedSource(payload.source, target.key);
    return matchedSourceState;
  } catch (error) {
    if (requestId === sourceMatchRequestId) {
      sourceMatchMeta.textContent =
        error instanceof Error ? error.message : '自动匹配失败，请手动上传原始全量字体。';
      updateSourceFontMeta();
      updateConvertButtonState();
    }

    return null;
  }
}

function scheduleOriginalSourceMatch() {
  window.clearTimeout(sourceMatchTimer);
  sourceMatchRequestId += 1;
  matchedSourceState = null;
  updateSourceFontMeta();
  updateConvertButtonState();

  const remoteUrl = getExistingSubsetUrlValue();
  if (remoteUrl && !isValidRemoteFontUrl(remoteUrl)) {
    clearMatchedSource('当前子集字体 URL 还不完整，填成 http:// 或 https:// 后再自动匹配原始字体。');
    return;
  }

  const target = getExistingSubsetMatchTarget();
  if (!target) {
    clearMatchedSource('选择当前子集字体后，会自动匹配曾用于生成它的原始全量字体。');
    return;
  }

  sourceMatchMeta.textContent = '准备自动匹配原始全量字体...';
  updateSubsetSummary();
  sourceMatchTimer = window.setTimeout(() => {
    void matchOriginalSourceForExistingSubset();
  }, 450);
}

async function getSourceFontPayload(operationMode) {
  if (selectedFile) {
    const [data, hash] = await Promise.all([
      readFileAsBase64(selectedFile),
      getSha256Hex(selectedFile).catch(() => '')
    ]);

    return {
      filename: selectedFile.name,
      data,
      size: selectedFile.size,
      lastModified: selectedFile.lastModified,
      hash,
      source: 'manual'
    };
  }

  if (selectedLibrarySource?.sourceHash) {
    return {
      filename: selectedLibrarySource.sourceName,
      sourceFontHash: selectedLibrarySource.sourceHash,
      size: selectedLibrarySource.sourceSize,
      lastModified: 0,
      hash: selectedLibrarySource.sourceHash,
      source: 'library'
    };
  }

  if (operationMode === 'incremental') {
    const match = matchedSourceState?.sourceHash ? matchedSourceState : await matchOriginalSourceForExistingSubset();

    if (match?.sourceHash) {
      return {
        filename: match.sourceName,
        sourceFontHash: match.sourceHash,
        size: match.sourceSize,
        lastModified: 0,
        hash: match.sourceHash,
        source: 'matched'
      };
    }

    throw new Error('没有自动匹配到原始全量字体，请在上方上传原始全量字体后再增量更新。');
  }

  throw new Error('请先选择原始全量字体。');
}

async function previewOutputFont(blob, outputName, previewCharacters = []) {
  setOutputPreviewMessage('正在生成压缩完成字体预览...');

  try {
    const data = await readFileAsBase64(blob);
    const response = await apiFetch('/api/font-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: outputName,
        data
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '压缩完成字体预览解析失败。');
    }

    const payload = await response.json();
    renderOutputPreview(payload, previewCharacters);
    return true;
  } catch (error) {
    setOutputPreviewMessage(error instanceof Error ? error.message : '压缩完成字体预览解析失败。');
    return false;
  }
}

async function loadCharsetPresets() {
  try {
    const response = await apiFetch('/api/charsets');
    if (!response.ok) {
      throw new Error('系统预设加载失败。');
    }

    const payload = await response.json();
    charsetPresets = Array.isArray(payload.presets) ? payload.presets : [];
    presetSelect.innerHTML = charsetPresets
      .map(
        (preset) =>
          `<option value="${preset.id}">${preset.name} (${preset.count} 字)</option>`
      )
      .join('');

    updatePresetDescription();
    updateSubsetSummary();
    updateConvertButtonState();
  } catch (error) {
    presetSelect.innerHTML = '';
    presetDescription.textContent = error instanceof Error ? error.message : '系统预设加载失败。';
    updateConvertButtonState();
  }
}

async function getSubsetPayload() {
  const subsetMode = getSelectedSubsetMode();

  if (subsetMode === 'full') {
    return {
      subsetMode,
      uniqueCount: 0,
      label: '完整字体',
      previewCharacters: []
    };
  }

  if (subsetMode === 'preset') {
    const preset = getSelectedPreset();
    if (!preset) {
      throw new Error('系统预设还没准备好，请稍后重试。');
    }

    return {
      subsetMode,
      presetId: preset.id,
      uniqueCount: preset.count,
      label: preset.name,
      previewCharacters: []
    };
  }

  if (subsetMode === 'manual') {
    const characters = getSubsetCharacters(subsetText.value);
    if (!characters.length) {
      throw new Error('请先输入要保留的字符。');
    }

    return {
      subsetMode,
      subsetText: subsetText.value,
      uniqueCount: characters.length,
      label: '手动输入字符',
      previewCharacters: characters
    };
  }

  const file = charsetFile.files?.[0];
  if (!file) {
    throw new Error('请先上传字符集文件。');
  }

  const cacheMiss =
    charsetFileState.name !== file.name ||
    charsetFileState.size !== file.size ||
    charsetFileState.lastModified !== file.lastModified;

  if (cacheMiss) {
    await cacheCharsetFile(file);
  }

  if (!charsetFileState.count) {
    throw new Error('上传的字符集文件里没有可用字符，请检查文件内容。');
  }

  return {
    subsetMode,
    charsetFileText: charsetFileState.text,
    uniqueCount: charsetFileState.count,
    label: `字符集文件：${file.name}`,
    previewCharacters: getSubsetCharacters(charsetFileState.text)
  };
}

async function getExistingSubsetPayload() {
  const remoteUrl = getExistingSubsetUrlValue();

  if (remoteUrl) {
    return {
      filename: '',
      data: '',
      url: remoteUrl
    };
  }

  const file = existingSubsetFile.files?.[0];
  if (!file) {
    throw new Error('增量更新模式下，请先填写当前子集字体 URL，或上传本地子集字体。');
  }

  const cacheMiss =
    existingSubsetState.name !== file.name ||
    existingSubsetState.size !== file.size ||
    existingSubsetState.lastModified !== file.lastModified;

  if (cacheMiss) {
    await cacheExistingSubsetFile(file);
  }

  return {
    filename: file.name,
    data: existingSubsetState.base64,
    url: ''
  };
}

async function convertSelectedFile() {
  const operationMode = getSelectedOperationMode();
  const shouldUploadToCdn = !uploadToCdn.disabled && uploadToCdn.checked;
  const shouldReuseOriginalCdnFilename =
    shouldUploadToCdn &&
    operationMode === 'incremental' &&
    Boolean(getExistingSubsetUrlValue()) &&
    getSelectedCdnFilenameMode() === 'existing';

  if (operationMode === 'fresh' && !hasSourceFontForCurrentOperation()) {
    updateStatus('请先上传原始全量字体，或从已保存原始字体中选择一个。', 'error');
    return;
  }

  if (operationMode === 'incremental' && !hasExistingSubsetSource()) {
    updateStatus('增量更新模式下，请先填写当前子集字体 URL，或上传本地子集字体。', 'error');
    return;
  }

  convertButton.disabled = true;
  clearOutputPreview();
  clearCdnUploadResult();

  try {
    const outputType = getSelectedOutputFormat();
    const outputLabel = OUTPUT_FORMAT_LABELS[outputType] || outputType.toUpperCase();
    const subsetPayload = await getSubsetPayload();
    const existingSubsetPayload =
      operationMode === 'incremental' ? await getExistingSubsetPayload() : null;
    const sourcePayload = await getSourceFontPayload(operationMode);
    const cdnUploadLead = shouldUploadToCdn
      ? shouldReuseOriginalCdnFilename
        ? `，并准备覆盖 ${runtimeConfigState.cdnUploadLabel} 原文件`
        : `，并准备上传到 ${runtimeConfigState.cdnUploadLabel}`
      : '';

    const jobLabel =
      operationMode === 'incremental'
        ? `正在基于当前子集字体增量更新为 ${outputLabel}${cdnUploadLead}，并合并 ${subsetPayload.label}，请稍候...`
        : subsetPayload.subsetMode === 'full'
          ? `正在转换完整字体为 ${outputLabel}${cdnUploadLead}，请稍候...`
          : `正在使用 ${subsetPayload.label} 压缩并转换为 ${outputLabel}${cdnUploadLead}，请稍候...`;
    updateStatus(jobLabel, 'busy');

    const response = await apiFetch('/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: sourcePayload.filename,
        data: sourcePayload.data,
        sourceFontHash: sourcePayload.sourceFontHash,
        operationMode,
        outputType,
        existingSubsetFilename: existingSubsetPayload?.filename,
        existingSubsetData: existingSubsetPayload?.data,
        existingSubsetUrl: existingSubsetPayload?.url,
        subsetMode: subsetPayload.subsetMode,
        presetId: subsetPayload.presetId,
        subsetText: subsetPayload.subsetText,
        charsetFileText: subsetPayload.charsetFileText,
        keepHinting: keepHinting.checked,
        keepKerning: keepKerning.checked,
        uploadToCdn: shouldUploadToCdn,
        cdnConfig:
          shouldUploadToCdn && pageCdnConfigState.enabled ? pageCdnConfigState.config : null,
        cdnFilenameMode:
          shouldUploadToCdn && operationMode === 'incremental' && existingSubsetPayload?.url
            ? getSelectedCdnFilenameMode()
            : 'template'
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '转换失败，请检查文件格式。');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const sourceBytes = Number(response.headers.get('X-Source-Bytes') || sourcePayload.size || 0);
    const outputBytes = Number(response.headers.get('X-Output-Bytes') || blob.size);
    const subsetCount = Number(response.headers.get('X-Subset-Count') || subsetPayload.uniqueCount);
    const newSubsetCount = Number(response.headers.get('X-New-Subset-Count') || subsetPayload.uniqueCount);
    const existingSubsetCount = Number(response.headers.get('X-Existing-Subset-Count') || 0);
    const operationModeHeader = response.headers.get('X-Operation-Mode') || operationMode;
    const subsetSourceMode = response.headers.get('X-Subset-Source-Mode') || subsetPayload.subsetMode;
    const subsetSourceLabel = decodeURIComponent(
      response.headers.get('X-Subset-Source-Label') || subsetPayload.label
    );
    const sourceHasHinting = response.headers.get('X-Source-Has-Hinting') === 'true';
    const sourceHasKerning = response.headers.get('X-Source-Has-Kerning') === 'true';
    const outputHasKerning = response.headers.get('X-Output-Has-Kerning') === 'true';
    const removedKerningTables = (response.headers.get('X-Removed-Kerning-Tables') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const subsetGlyphHintingStripped = Number(response.headers.get('X-Subset-Glyph-Hinting-Stripped') || 0);
    const responseOutputType = response.headers.get('X-Output-Type') || outputType;
    const serverSourceSaved = response.headers.get('X-Server-Source-Saved') === 'true';
    const serverSourceAction = response.headers.get('X-Server-Source-Action') || (serverSourceSaved ? 'created' : 'reused');
    const serverMatchSaved = response.headers.get('X-Server-Match-Saved') === 'true';
    const serverMatchAction = response.headers.get('X-Server-Match-Action') || (serverMatchSaved ? 'created' : 'updated');
    const cdnUploadRequested = response.headers.get('X-Cdn-Upload-Requested') === 'true';
    const cdnUploadSucceeded = response.headers.get('X-Cdn-Upload-Succeeded') === 'true';
    const cdnUploadLabel = decodeURIComponent(
      response.headers.get('X-Cdn-Upload-Label') || runtimeConfigState.cdnUploadLabel || 'CDN'
    );
    const cdnUploadUrl = decodeURIComponent(response.headers.get('X-Cdn-Upload-Url') || '');
    const cdnUploadMessage = decodeURIComponent(response.headers.get('X-Cdn-Upload-Message') || '');
    const cdnUploadFilenameMode = response.headers.get('X-Cdn-Upload-Filename-Mode') || '';
    const cdnUploadResponseId = response.headers.get('X-Cdn-Upload-Response-Id') || '';
    const cdnRawResponse = await loadCdnRawResponse(cdnUploadResponseId);
    const fallbackName = `${sourcePayload.filename.replace(/\.[^.]+$/, '') || 'converted-font'}.${responseOutputType}`;
    const outputName = decodeURIComponent(
      contentDisposition.match(/filename="(.+?)"/)?.[1] || fallbackName
    );
    if (serverSourceAction === 'created' || serverSourceAction === 'updated') {
      await loadSourceLibrary();
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = outputName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    const outputPreviewCharacters =
      operationMode === 'incremental' || subsetPayload.subsetMode === 'full'
        ? []
        : Array.isArray(subsetPayload.previewCharacters)
          ? subsetPayload.previewCharacters
          : [];
    const renderedOutputPreview = await previewOutputFont(blob, outputName, outputPreviewCharacters);

    const notes = [];
    if (operationModeHeader === 'incremental') {
      notes.push(`已合并当前子集的 ${existingSubsetCount} 个字符`);
      if (subsetSourceMode === 'full') {
        notes.push(`本次未新增字符，重新生成后共 ${subsetCount} 个唯一字符`);
      } else {
        notes.push(`本次新增来源 ${subsetSourceLabel}，识别到 ${newSubsetCount} 个字符`);
        notes.push(`合并后共 ${subsetCount} 个唯一字符`);
      }
    } else if (subsetSourceMode === 'full') {
      notes.push('本次未做字符切割');
    } else {
      notes.push(`使用 ${subsetSourceLabel}，保留 ${subsetCount} 个唯一字符`);
    }
    if (keepHinting.checked && !sourceHasHinting) {
      notes.push('源字体不含 hinting 数据，勾选无影响');
    } else if (keepHinting.checked && subsetGlyphHintingStripped > 0) {
      notes.push(`为避免子集字形异常，已移除 ${subsetGlyphHintingStripped} 个字形的局部 hinting 指令`);
    }
    if (keepKerning.checked && !sourceHasKerning) {
      notes.push('源字体不含 kerning 数据，勾选无影响');
    } else if (!keepKerning.checked && removedKerningTables.length > 0 && !outputHasKerning) {
      notes.push('已按当前设置移除 kerning 表，避免 hinting 连带保留字距信息');
    }
    if (serverMatchAction === 'created') {
      notes.push('服务端已建立当前输出与原始字体的自动匹配');
    }
    if (serverSourceAction === 'created') {
      notes.push('原始字体已保存到服务端列表');
    } else if (serverSourceAction === 'updated') {
      notes.push('检测到同源字体，已刷新服务端原始字体记录');
    }
    if (cdnUploadRequested && cdnUploadSucceeded) {
      notes.push(`已自动上传到 ${cdnUploadLabel}`);
      if (cdnUploadFilenameMode === 'existing') {
        notes.push('沿用了当前 URL 文件名');
      } else if (cdnUploadFilenameMode === 'template' && operationModeHeader === 'incremental' && existingSubsetPayload?.url) {
        notes.push('生成了新的 CDN 文件名');
      }
      setCdnUploadResult({
        tone: 'success',
        message: cdnUploadMessage || `已同步到 ${cdnUploadLabel}。`,
        url: cdnUploadUrl,
        rawResponse: cdnRawResponse
      });
    } else if (cdnUploadRequested) {
      notes.push(`${cdnUploadLabel} 上传未完成`);
      setCdnUploadResult({
        tone: 'error',
        message: cdnUploadMessage || `${cdnUploadLabel} 上传失败，请检查服务端配置。`,
        rawResponse: cdnRawResponse
      });
    }
    if (renderedOutputPreview) {
      notes.push('已生成压缩完成字体预览');
    }

    const finalTone = cdnUploadRequested && !cdnUploadSucceeded ? 'error' : 'success';
    const finalPrefix =
      cdnUploadRequested && !cdnUploadSucceeded ? '转换完成，但 CDN 上传失败：' : '转换完成：';
    updateStatus(
      `${finalPrefix}${formatSizeDelta(sourceBytes, outputBytes)}。${notes.length ? ` ${notes.join('；')}。` : ''}`,
      finalTone
    );
  } catch (error) {
    updateStatus(error instanceof Error ? error.message : '转换失败，请稍后重试。', 'error');
  } finally {
    updateConvertButtonState();
  }
}

function syncUI() {
  updateOperationPanels();
  updateSourcePanels();
  updateSubsetSummary();
  updateCdnFilenameModePanel();
}

fileInput.addEventListener('change', () => {
  setSelectedFile(fileInput.files?.[0] || null);
});

subsetModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    syncUI();
  });
});

operationModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    syncUI();
  });
});

outputFormat.addEventListener('change', () => {
  updateConvertButtonLabel();
  updateCdnFilenameModePanel();
});

uploadToCdn.addEventListener('change', () => {
  updateCdnUploadCardState();
  updateCdnFilenameModePanel();
});

applyCdnConfigButton.addEventListener('click', () => {
  try {
    const config = readCdnConfigForm();
    pageCdnConfigState = { enabled: true, config };
    persistPageCdnConfig();
    syncEffectiveCdnRuntime();
    uploadToCdn.checked = true;
    updateCdnUploadCardState();
    updateCdnFilenameModePanel();
    cdnConfigMeta.textContent = `页面配置已生效：转换完成后可上传到 ${config.label}。敏感内容只保存在当前标签页。`;
    updateStatus(`已应用 CDN 页面配置：${config.label}。`);
  } catch (error) {
    cdnConfigPanel.open = true;
    cdnConfigMeta.textContent = error instanceof Error ? error.message : 'CDN 页面配置无效。';
    updateStatus(cdnConfigMeta.textContent, 'error');
  }
});

useServerCdnConfigButton.addEventListener('click', () => {
  pageCdnConfigState = { enabled: false, config: null };
  persistPageCdnConfig();
  populateCdnConfigForm();
  syncEffectiveCdnRuntime({ resetChecked: true });
  updateStatus(
    serverCdnRuntimeState.available
      ? `已恢复服务端 CDN 默认配置：${serverCdnRuntimeState.label}。`
      : '已清除页面 CDN 配置；服务端默认配置未启用。'
  );
});

sourceFontSelect.addEventListener('change', () => {
  const hasSelection = Boolean(sourceFontSelect.value);
  const record = sourceLibraryRecords.find((item) => item.sourceHash === sourceFontSelect.value) || null;
  useSavedSourceButton.disabled = !hasSelection;
  deleteSavedSourceButton.disabled = !hasSelection;
  sourceFontAlias.disabled = !hasSelection;
  saveSourceAliasButton.disabled = !hasSelection;
  sourceFontAlias.value = record?.alias || '';
});

saveSourceAliasButton.addEventListener('click', async () => {
  const sourceHash = sourceFontSelect.value;
  const record = sourceLibraryRecords.find((item) => item.sourceHash === sourceHash) || null;
  if (!record) {
    updateStatus('请选择要设置别名的字体。', 'error');
    return;
  }

  try {
    saveSourceAliasButton.disabled = true;
    const response = await apiFetch('/api/source-fonts/alias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceHash, alias: sourceFontAlias.value })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || '字体别名保存失败。');
    }

    const updatedRecord = payload.source || { ...record, alias: sourceFontAlias.value.trim() };
    sourceLibraryRecords = sourceLibraryRecords.map((item) =>
      item.sourceHash === sourceHash ? updatedRecord : item
    );
    if (selectedLibrarySource?.sourceHash === sourceHash) {
      selectedLibrarySource = updatedRecord;
      updateSourceFontMeta();
    }
    if (matchedSourceState?.sourceHash === sourceHash) {
      matchedSourceState = { ...matchedSourceState, alias: updatedRecord.alias || '' };
      sourceMatchMeta.textContent = `已自动匹配原始字体：${getSourceDisplayName(matchedSourceState)}（${formatBytes(
        matchedSourceState.sourceSize
      )}）。`;
      updateSourceFontMeta();
    }
    renderSourceLibrary();
    updateStatus(
      updatedRecord.alias
        ? `已保存字体别名：${updatedRecord.alias}。`
        : `已清除字体 ${updatedRecord.sourceName} 的别名。`
    );
  } catch (error) {
    saveSourceAliasButton.disabled = false;
    updateStatus(error instanceof Error ? error.message : '字体别名保存失败。', 'error');
  }
});

useSavedSourceButton.addEventListener('click', () => {
  const record = sourceLibraryRecords.find((item) => item.sourceHash === sourceFontSelect.value) || null;

  if (!record) {
    updateStatus('请选择一个已保存原始字体。', 'error');
    return;
  }

  selectSavedSource(record);
});

sourceFontAlias.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !saveSourceAliasButton.disabled) {
    event.preventDefault();
    saveSourceAliasButton.click();
  }
});

resetSourceButton.addEventListener('click', () => {
  resetOriginalSourceSelection();
});

deleteSavedSourceButton.addEventListener('click', async () => {
  const sourceHash = sourceFontSelect.value;
  const record = sourceLibraryRecords.find((item) => item.sourceHash === sourceHash) || null;

  if (!record) {
    updateStatus('请选择要移除的原始字体。', 'error');
    return;
  }

  try {
    const response = await apiFetch('/api/source-fonts/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sourceHash })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '原始字体移除失败。');
    }

    sourceLibraryRecords = sourceLibraryRecords.filter((item) => item.sourceHash !== sourceHash);

    if (selectedLibrarySource?.sourceHash === sourceHash) {
      selectedLibrarySource = null;
      updateSourceFontMeta();
      updateConvertButtonState();
    }

    renderSourceLibrary();
    updateStatus(
      repositoryStorageState.enabled
        ? `已从字体仓库删除：${getSourceDisplayName(record)}。`
        : `已从本地列表移除：${getSourceDisplayName(record)}。`
    );
  } catch (error) {
    updateStatus(error instanceof Error ? error.message : '原始字体移除失败。', 'error');
  }
});

subsetPreviewMore.addEventListener('click', () => {
  appendPreviewCharacters('subset');
});

connectRepositoryButton.addEventListener('click', async () => {
  if (!repositoryStorageState.available) {
    repositoryStorageMeta.textContent = '服务端尚未配置远程字体仓库环境变量。';
    repositoryStoragePanel.open = true;
    return;
  }

  repositoryStorageState.enabled = true;
  persistRepositoryStorageState();
  renderRepositoryStorageState();
  connectRepositoryButton.disabled = true;
  repositoryStorageMeta.textContent = '正在读取服务端远程字体仓库...';
  const succeeded = await loadSourceLibrary();

  if (succeeded) {
    selectedLibrarySource = null;
    matchedSourceState = null;
    renderSourceLibrary();
    renderRepositoryStorageState();
    updateStatus(`已切换到远程字体仓库：${repositoryStorageState.displayName}。`);
  } else {
    repositoryStorageMeta.textContent = sourceLibraryMeta.textContent;
    repositoryStoragePanel.open = true;
    connectRepositoryButton.disabled = false;
  }
});

useLocalStorageButton.addEventListener('click', async () => {
  repositoryStorageState.enabled = false;
  selectedLibrarySource = null;
  matchedSourceState = null;
  persistRepositoryStorageState();
  renderRepositoryStorageState();
  await loadSourceLibrary();
  updateSourceFontMeta();
  updateConvertButtonState();
  updateStatus('已切换为本地字体存储，远程仓库环境变量配置仍保留在服务端。');
});

subsetPreviewCopy.addEventListener('click', () => {
  void copyPreviewCharacters('subset');
});

outputPreviewMore.addEventListener('click', () => {
  appendPreviewCharacters('output');
});

outputPreviewCopy.addEventListener('click', () => {
  void copyPreviewCharacters('output');
});

presetSelect.addEventListener('change', () => {
  updatePresetDescription();
  updateSubsetSummary();
  updateConvertButtonState();
});

subsetText.addEventListener('input', () => {
  updateSubsetSummary();
  updateConvertButtonState();
});

charsetFile.addEventListener('change', async () => {
  const file = charsetFile.files?.[0];

  if (!file) {
    charsetFileLoadState = 'idle';
    charsetFileLoadError = '';
    charsetFileState = {
      name: '',
      size: 0,
      lastModified: 0,
      text: '',
      count: 0
    };
    charsetFileMeta.textContent = '还没有选择字符集文件。';
    updateSubsetSummary();
    updateConvertButtonState();
    return;
  }

  try {
    charsetFileLoadState = 'loading';
    charsetFileLoadError = '';
    charsetFileMeta.textContent = `正在读取 ${file.name}...`;
    updateConvertButtonState();
    await cacheCharsetFile(file);
    charsetFileLoadState = 'ready';
    updateSubsetSummary();
    updateConvertButtonState();
  } catch (error) {
    charsetFileLoadState = 'error';
    charsetFileLoadError = error instanceof Error ? error.message : '字符集文件读取失败。';
    charsetFileMeta.textContent = charsetFileLoadError;
    updateStatus(charsetFileMeta.textContent, 'error');
    updateConvertButtonState();
  }
});

existingSubsetFile.addEventListener('change', async () => {
  const file = existingSubsetFile.files?.[0];

  if (!file) {
    existingSubsetState = {
      name: '',
      size: 0,
      lastModified: 0,
      base64: ''
    };
    updateExistingSubsetMeta();
    clearMatchedSource();
    clearSubsetPreview();
    updateSubsetSummary();
    updateCdnFilenameModePanel();
    updateConvertButtonState();
    return;
  }

  try {
    await cacheExistingSubsetFile(file);
    if (selectedFile || selectedLibrarySource) {
      const sourceName = selectedFile?.name || getSourceDisplayName(selectedLibrarySource);
      sourceMatchMeta.textContent = `将使用${selectedFile ? '手动上传' : '已保存'}的原始字体：${sourceName}。`;
    } else {
      scheduleOriginalSourceMatch();
    }
    scheduleSubsetPreview();
    updateSubsetSummary();
    updateCdnFilenameModePanel();
    updateConvertButtonState();
  } catch (error) {
    existingSubsetMeta.textContent = error instanceof Error ? error.message : '当前子集字体读取失败。';
    updateStatus(existingSubsetMeta.textContent, 'error');
    clearMatchedSource('当前子集字体读取失败，请重新选择。');
    clearSubsetPreview();
    updateCdnFilenameModePanel();
    updateConvertButtonState();
  }
});

existingSubsetUrl.addEventListener('input', () => {
  updateExistingSubsetMeta();
  if (selectedFile || selectedLibrarySource) {
    const sourceName = selectedFile?.name || getSourceDisplayName(selectedLibrarySource);
    sourceMatchMeta.textContent = `将使用${selectedFile ? '手动上传' : '已保存'}的原始字体：${sourceName}。`;
  } else {
    scheduleOriginalSourceMatch();
  }
  scheduleSubsetPreview();
  updateSubsetSummary();
  updateCdnFilenameModePanel();
  updateConvertButtonState();
});

[keepHinting, keepKerning].forEach((input) => {
  input.addEventListener('change', () => {
    updateConvertButtonState();
  });
});

convertButton.addEventListener('click', () => {
  void convertSelectedFile();
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-active');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-active');
  });
});

dropzone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0] || null;

  if (!file) {
    return;
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  setSelectedFile(file);
});

async function initializeApp() {
  syncUI();
  updateExistingSubsetMeta();
  updateCdnUploadCardState();
  restoreRepositoryStorageState();
  renderRepositoryStorageState();
  restorePageCdnConfig();
  syncEffectiveCdnRuntime();
  await loadRuntimeConfig();
  await Promise.all([loadSourceLibrary(), loadCharsetPresets()]);
}

void initializeApp();
