import { createWorkflow } from './workflow.js';
import { computeCoverage, createFontLoader } from './glyph-preview.js';

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
const resultFootnote = document.querySelector('#resultFootnote');
const subsetModeInputs = Array.from(document.querySelectorAll('input[name="subsetMode"]'));
const operationModeInputs = Array.from(document.querySelectorAll('input[name="operationMode"]'));

const OUTPUT_FORMAT_LABELS = {
  ttf: 'TTF',
  woff: 'WOFF',
  woff2: 'WOFF2',
  eot: 'EOT',
  svg: 'SVG'
};
const PREVIEW_BATCH_SIZE = 200;
const fontLoader = createFontLoader();
let sourceInspectionController;
let subsetPreviewController;
let subsetInspectionState = { status: 'idle', payload: null, error: '' };
let livePreviewTimer;
let composingCharacters = false;
let statusOverride = null;
let maxFontBytes = 16 * 1024 * 1024;

let selectedFile = null;
let sourceSelectionRevision = 0;
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
let storageState = {
  loaded: false,
  r2Available: false,
  error: ''
};
let sourceInspectionState = {
  key: '',
  status: 'idle',
  sourceLabel: '',
  payload: null,
  error: ''
};
const previewStates = {
  live: {
    items: [], parsedCount: 0, displayCount: 0, renderedCount: 0,
    filename: '', context: '', family: '', missingItems: [], copyText: '', copyCount: 0, copyResetTimer: 0
  },
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

const workflow = createWorkflow({
  getState: () => ({
    sourceReady: hasSourceFontForCurrentOperation() && sourceInspectionState.status === 'ready' &&
      (getSelectedOperationMode() !== 'incremental' || subsetInspectionState.status === 'ready'),
    sourceMessage: getSelectedOperationMode() === 'incremental' && subsetInspectionState.status !== 'ready'
      ? subsetInspectionState.error || '先加载已有的小字体文件。' : sourceInspectionState.status === 'error' ? sourceInspectionState.error :
      sourceInspectionState.status === 'loading' ? '正在解析字体，请稍候…' : '选择一份原始字体后继续。',
    charactersReady: getSubsetModeValidationState().ready,
    charactersMessage: getSubsetModeValidationState().message,
    sourceName: selectedFile?.name || getSourceDisplayName(selectedLibrarySource || matchedSourceState || {}, '尚未选择'),
    mode: getSelectedOperationMode() === 'incremental' ? '更新小字体' : '制作小字体',
    incremental: getSelectedOperationMode() === 'incremental',
    characters: subsetSummary.textContent,
    format: getSelectedOutputLabel(),
    ready: getPreflightState().blockingItems.length === 0,
    formatBytes
  }),
  onNavigate: (step) => {
    if (step !== 2) statusOverride = null;
    refreshWorkspaceStatus();
    scheduleLivePreview();
  }
});

function updateStatus(message, tone = 'default') {
  statusOverride = { message, tone };
  paintStatus(message, tone);
}

function paintStatus(message, tone = 'default') {
  status.textContent = message;
  status.className = `status is-${tone}`;
  document.querySelector('#statusBanner').dataset.tone = tone;
  document.querySelector('#statusBanner').className = `status-banner is-${tone}`;
  document.querySelector('#statusTitle').textContent = {
    busy: '正在处理', error: '需要处理', warning: '请检查字符', success: '已完成', ready: '已就绪'
  }[tone] || '下一步';
}

function refreshWorkspaceStatus() {
  if (statusOverride && (['error', 'success', 'busy'].includes(statusOverride.tone) || workflow.current === 2)) {
    paintStatus(statusOverride.message, statusOverride.tone);
    return;
  }
  const incremental = getSelectedOperationMode() === 'incremental';
  if (incremental && subsetInspectionState.status === 'error') {
    paintStatus(subsetInspectionState.error, 'error');
  } else if (sourceInspectionState.status === 'error') {
    paintStatus(sourceInspectionState.error, 'error');
  } else if (sourceInspectionState.status === 'loading' || (incremental && subsetInspectionState.status === 'loading')) {
    paintStatus('正在读取字体和加载真实字形，请稍候…', 'busy');
  } else if (incremental && subsetInspectionState.status !== 'ready') {
    paintStatus('先选择已有的小字体文件，查看它已包含的字符。');
  } else if (sourceInspectionState.status !== 'ready') {
    paintStatus(incremental ? '旧字体已读取。请补充对应的完整字体，用它提取新增字形。' : '选择一份完整字体，开始制作小字体。');
  } else if (fontLoader.get('source').status === 'error' || (incremental && fontLoader.get('subset').status === 'error')) {
    paintStatus('字符已解析，但浏览器未能加载字形。请点击“重试字形预览”；导出仍可使用。', 'warning');
  } else {
    const coverage = getCharacterCoverage();
    if (coverage.lost.length) {
      paintStatus(`当前完整字体缺少 ${coverage.lost.length} 个旧字符；继续生成将无法保留这些字符，请核对完整字体。`, 'warning');
    } else if (coverage.missing.length) {
      paintStatus(`有 ${coverage.missing.length} 个输入字符在完整字体中不存在，输出不会包含它们。请检查标记为“缺失”的字符。`, 'warning');
    } else if (workflow.current === 0) {
      paintStatus('字体已就绪，可以开始编辑字符。', 'ready');
    } else if (!getSubsetModeValidationState().ready) {
      paintStatus(getSubsetModeValidationState().message);
    } else {
      paintStatus(`预计输出 ${coverage.output.length} 个字符。确认字形和输出格式后，点击生成。`, 'ready');
    }
  }
}

function apiFetch(resource, options = {}) {
  const headers = new Headers(options.headers || {});

  if (storageState.loaded) {
    headers.set('X-Font-Storage-Mode', getActiveStorageMode());
  }

  return window.fetch(resource, { ...options, headers });
}

function getActiveStorageMode() {
  return storageState.r2Available ? 'r2' : 'none';
}

function hasPersistentStorage() {
  return getActiveStorageMode() !== 'none';
}

function getDefaultSourceMatchMessage() {
  return hasPersistentStorage()
    ? '选择当前子集字体后，会自动匹配曾用于生成它的原始全量字体。'
    : '当前仅转换、不保存匹配记录。增量更新时，请同时提供当前子集和原始全量字体。';
}

function applyRuntimeConfig(payload) {
  if (Number.isSafeInteger(payload?.maxFontBytes) && payload.maxFontBytes > 0) {
    maxFontBytes = payload.maxFontBytes;
    document.querySelector('#dropzoneHint').textContent =
      `TTF / OTF / WOFF / WOFF2 / EOT / SVG · 最大 ${formatBytes(maxFontBytes)}`;
  }
  storageState = {
    loaded: true,
    r2Available: Boolean(payload?.r2Storage?.available),
    error: ''
  };
  sourceMatchMeta.textContent = getDefaultSourceMatchMessage();
  updateSourceFontMeta();
  updateConvertButtonState();
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
    storageState = {
      loaded: true,
      r2Available: false,
      error: '存储配置读取失败，本次按仅转换模式处理，不保存原始字体和匹配记录。刷新页面可重试。'
    };
    sourceMatchMeta.textContent = getDefaultSourceMatchMessage();
    updateSourceFontMeta();
    updateConvertButtonState();
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
  if (!value.trim()) return [];
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

function getSelectedPreset() {
  return charsetPresets.find((preset) => preset.id === presetSelect.value) || null;
}

function getExistingSubsetUrlValue() {
  return existingSubsetUrl.value.trim();
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
  return Boolean(selectedFile || (hasPersistentStorage() && selectedLibrarySource?.sourceHash));
}

function hasSourceFontForCurrentOperation() {
  if (getSelectedOperationMode() !== 'incremental') {
    return hasExplicitSourceSelection();
  }

  return Boolean(hasExplicitSourceSelection() || (hasPersistentStorage() && matchedSourceState?.sourceHash));
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
      message: getSelectedOperationMode() === 'incremental'
        ? '本次不新增字符，按当前子集已有字符重新生成。'
        : '本次会保留完整字体，不做字符切割。'
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
      key: `manual:${sourceSelectionRevision}:${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`,
      sourceLabel: selectedFile.name,
      kind: 'file',
      file: selectedFile
    };
  }

  if (hasPersistentStorage() && selectedLibrarySource?.sourceHash) {
    return {
      key: `library:${selectedLibrarySource.sourceHash}`,
      sourceLabel: getSourceDisplayName(selectedLibrarySource, '已保存原始字体'),
      kind: 'saved',
      sourceFontHash: selectedLibrarySource.sourceHash
    };
  }

  if (hasPersistentStorage() && getSelectedOperationMode() === 'incremental' && matchedSourceState?.sourceHash) {
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
  sourceInspectionController?.abort();
  setPreviewMessage('live', '选择完整字体后，可预览字形。');
  fontLoader.clear('source');
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

    if (sourceInspectionState.status === 'loading' || sourceInspectionState.status === 'error') {
      return null;
    }
  }

  const requestId = sourceInspectionRequestId + 1;
  sourceInspectionRequestId = requestId;
  sourceInspectionController?.abort();
  const controller = new AbortController();
  sourceInspectionController = controller;
  setPreviewMessage('live', '正在加载这份完整字体的字形…');
  fontLoader.clear('source');
  sourceInspectionState = {
    key: target.key,
    status: 'loading',
    sourceLabel: target.sourceLabel,
    payload: null,
    error: ''
  };
  applySourceStatePresentation('manual', '读取中', '正在解析字符并加载真实字形。');
  updateConvertButtonState();

  try {
    const requestPayload =
      target.kind === 'file'
        ? {
            filename: target.file.name,
            data: await readFileAsBase64(target.file),
            includeData: false,
            includePreviewFont: true
          }
        : {
            sourceFontHash: target.sourceFontHash,
            includeData: false,
            includePreviewFont: true
          };

    const response = await apiFetch('/api/font-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '原始字体特性读取失败。');
    }

    const payload = await response.json();

    if (requestId !== sourceInspectionRequestId) {
      return null;
    }

    try { await fontLoader.load('source', payload); } catch { /* Parsing still allows export; show preview error separately. */ }
    if (requestId !== sourceInspectionRequestId) return null;
    sourceInspectionState = {
      key: target.key,
      status: 'ready',
      sourceLabel: target.sourceLabel,
      payload,
      error: ''
    };
    applySourceStatePresentation('manual', '解析完成', `已识别 ${payload.count} 个字符，可开始编辑。`);
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
    applySourceStatePresentation('manual', '读取失败', sourceInspectionState.error);
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
  } else if (hasPersistentStorage() && operationMode === 'incremental' && getExistingSubsetMatchTarget()) {
    items.push({
      tone: 'blocking',
      message: '正在等待原始全量字体自动匹配；如果长时间没有结果，再手动上传。'
    });
  } else {
    items.push({
      tone: 'blocking',
      message:
        !hasPersistentStorage()
          ? '请上传原始全量字体；当前仅转换模式不会保存或自动匹配原始字体。'
          : operationMode === 'incremental'
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

  if (hasResolvedSource && sourceInspectionState.status !== 'ready') {
    items.push({ tone: 'blocking', message: sourceInspectionState.status === 'error'
      ? sourceInspectionState.error : '正在解析原始字体，请稍候。' });
  }
  if (operationMode === 'incremental' && hasExistingSubsetSource() && subsetInspectionState.status !== 'ready') {
    items.push({ tone: 'blocking', message: subsetInspectionState.status === 'error'
      ? subsetInspectionState.error : '正在读取旧字体，请等待解析完成。' });
  }
  if (sourceInspectionState.status === 'ready' && (operationMode !== 'incremental' || subsetInspectionState.status === 'ready')) {
    const coverage = getCharacterCoverage();
    if (subsetState.ready && !coverage.output.length) {
      items.push({ tone: 'blocking', message: '所选字符在完整字体中均不存在，请更换字符或完整字体。' });
    }
    if (coverage.lost.length) items.push({ tone: 'warning', message: `有 ${coverage.lost.length} 个旧字符在完整字体中缺失，生成后将无法保留。请核对原始字体。` });
    if (coverage.missing.length) items.push({ tone: 'warning', message: `${coverage.missing.length} 个输入字符缺失，不会写入输出字体。` });
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
        : `检查通过，可以生成 ${outputLabel} 字体。`;

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
    buttonTitle: blockingItems.length ? firstBlockingMessage : `生成 ${outputLabel} 字体`
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
  convertButton.disabled = workflow.busy || preflightState.blockingItems.length > 0;
  convertButton.title = preflightState.buttonTitle;
  renderPreflightState(preflightState);
  workflow.render();
  refreshWorkspaceStatus();
  scheduleLivePreview();
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
    const canAutoMatch = getSelectedOperationMode() === 'incremental' && hasPersistentStorage();
    message =
      canAutoMatch
        ? '等待自动匹配，或手动选择原始全量字体'
        : '还没有选择文件';

    applySourceStatePresentation(
      canAutoMatch ? 'pending-match' : 'empty',
      canAutoMatch ? '等待匹配' : '待选择',
      canAutoMatch
        ? '提供当前子集字体后，系统会优先自动匹配原始字体。'
        : '请上传原始全量字体，上传后会自动检查字体。'
    );
  }

  fileName.textContent = message;
  if (sourceInspectionState.status === 'ready') {
    applySourceStatePresentation('manual', '解析完成', `已识别 ${sourceInspectionState.payload.count} 个字符。`);
  } else if (sourceInspectionState.status === 'loading') {
    applySourceStatePresentation('manual', '读取中', '正在解析字符并加载字形。');
  }
  updateWorkflowCopy();
  void inspectSourceFontForPreflight();
}

function updateWorkflowCopy() {
  const incremental = getSelectedOperationMode() === 'incremental';
  const resolved = hasSourceFontForCurrentOperation();
  panel.classList.toggle('is-incremental-mode', incremental);
  sourceSetupCard.classList.toggle('is-ready', resolved && sourceInspectionState.status === 'ready');
  operationTitle.textContent = incremental ? '更新已有的小字体' : '从完整字体制作小字体';
  operationLead.textContent = incremental
    ? '先加载正在使用的小字体，再补充完整字体。旧字符会保留，本次只需输入新增内容。'
    : '选择一份完整字体，挑出需要的字符，生成更小的字体文件。';
  sourceSectionTitle.textContent = incremental ? '补充对应的完整字体' : '选择完整字体';
  sourceSectionLead.textContent = incremental
    ? '小字体已删去其他字形，新增字符需要从当时使用的完整字体提取。'
    : '上传需要压缩的字体，下一步输入要保留的字符。';
  if (incremental && matchedSourceState?.sourceHash && !hasExplicitSourceSelection()) {
    sourceSectionLead.textContent = '已从字体库匹配到完整字体，也可以手动替换。';
  }
  sourceLibraryTitle.textContent = '已保存的完整字体';
  dropzoneTitle.textContent = resolved ? '拖入或点击更换完整字体' : '拖入完整字体，或点击选择';
  dropzoneHint.textContent = 'TTF / OTF / WOFF / WOFF2 / EOT / SVG · 最大 ' + formatBytes(maxFontBytes);
  sourceSectionEyebrow.textContent = '';
  optionsEyebrow.textContent = '';
  optionsLead.textContent = incremental
    ? '已有字符会一起展示。输入新文案后，可查看新增、已存在和缺失的字形。'
    : '输入项目文案，下面立即显示完整字体中的真实字形。重复字符会自动合并。';
  subsetFootnote.textContent = '默认移除字号微调和字距数据以减小体积；按需保留。源字体没有的数据无法补回。';
  document.querySelector('.library-disclosure').classList.toggle('is-hidden', storageState.loaded && !hasPersistentStorage());
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
  sourceFontSelect.disabled = !sourceLibraryRecords.length;
  useSavedSourceButton.disabled = !hasSelection;
  resetSourceButton.disabled = !hasExplicitSelection;
  deleteSavedSourceButton.disabled = !hasSelection;
  sourceFontAlias.disabled = !hasSelection;
  saveSourceAliasButton.disabled = !hasSelection;
  sourceFontAlias.value = aliasRecord?.alias || '';
  sourceLibraryMeta.textContent = storageState.error || (!hasPersistentStorage()
    ? '当前仅转换、不保存字体，字体库和自动匹配暂不可用。刷新页面后需重新上传原始字体；以后启用 R2 即可使用保存功能。'
    : operationMode === 'incremental'
      ? sourceLibraryRecords.length
        ? `Cloudflare 字体库已保存 ${sourceLibraryRecords.length} 个原始字体。自动匹配不合适时，可以直接从这里手动指定来源。`
        : '当前还没有已保存的原始字体可供手动指定；完成一次转换后，原始字体会自动出现在这里。'
      : sourceLibraryRecords.length
        ? `Cloudflare 字体库已保存 ${sourceLibraryRecords.length} 个原始字体，可直接复用作为新的压缩来源。`
        : '完成一次转换后，原始字体会自动保存到 Cloudflare 字体库，后续可直接从这里选择。');
  updateWorkflowCopy();
}

async function loadSourceLibrary() {
  if (!hasPersistentStorage()) {
    sourceLibraryRecords = [];
    renderSourceLibrary();
    return true;
  }

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

  if (!hasPersistentStorage()) {
    clearMatchedSource();
    updateStatus('已重置原始字体，请重新上传。当前仅转换模式需要手动提供原始全量字体。');
    return;
  }

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
  sourceSelectionRevision += 1;
  selectedFile = file || null;
  if (selectedFile) {
    selectedLibrarySource = null;
    sourceFontSelect.value = '';
    renderSourceLibrary();
  }
  updateSourceFontMeta();
  updateConvertButtonState();

  if (selectedFile) {
    statusOverride = null;
    refreshWorkspaceStatus();
    if (getSelectedOperationMode() === 'incremental') {
      sourceMatchMeta.textContent = `将使用手动上传的原始字体：${selectedFile.name}。`;
    }
  } else if (getSelectedOperationMode() === 'incremental') {
    updateStatus(hasPersistentStorage()
      ? '请选择当前子集字体，系统会尝试自动匹配原始全量字体。'
      : '增量更新需要当前子集字体和原始全量字体，请手动上传原始全量字体。');
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
  convertButton.textContent = `生成 ${outputLabel} 字体`;
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
  const validation = getSubsetModeValidationState();
  subsetSummary.textContent = validation.message;
  scheduleLivePreview();
}

function getRequestedCharacters() {
  switch (getSelectedSubsetMode()) {
    case 'manual': return getSubsetCharacters(subsetText.value);
    case 'preset': return Array.from(getSelectedPreset()?.characters || '');
    case 'file': return charsetFileLoadState === 'ready' ? getSubsetCharacters(charsetFileState.text) : [];
    default: return [];
  }
}

function getCharacterCoverage() {
  return computeCoverage({
    existing: getPreviewCharactersFromPayload(subsetInspectionState.payload),
    requested: getRequestedCharacters(),
    available: getPreviewCharactersFromPayload(sourceInspectionState.payload),
    incremental: getSelectedOperationMode() === 'incremental',
    full: getSelectedSubsetMode() === 'full'
  });
}

function scheduleLivePreview() {
  window.clearTimeout(livePreviewTimer);
  if (!composingCharacters) livePreviewTimer = window.setTimeout(renderLivePreview, 150);
}

function renderLivePreview() {
  const coverage = getCharacterCoverage();
  const incremental = getSelectedOperationMode() === 'incremental';
  const font = fontLoader.get('source');
  const elements = getPreviewElements('live');
  const state = previewStates.live;
  const retryNeeded = font.status === 'error' || sourceInspectionState.status === 'error' ||
    (incremental && (fontLoader.get('subset').status === 'error' || subsetInspectionState.status === 'error'));
  document.querySelector('#previewRetry').classList.toggle('is-hidden', !retryNeeded);
  const summary = document.querySelector('#characterCoverage');
  if (sourceInspectionState.status !== 'ready') {
    summary.textContent = '载入完整字体后，可检查字符是否存在并预览字形。';
    setPreviewMessage('live', sourceInspectionState.status === 'loading' ? '正在加载真实字形…' : '请先选择完整字体。');
    return;
  }
  summary.textContent = incremental
    ? '旧字符 ' + coverage.existing.length + ' · 可新增 ' + coverage.added.length + ' · 已存在 ' + coverage.repeated.length + ' · 输入缺失 ' + coverage.missing.length + ' · 预计输出 ' + coverage.output.length
    : '选中 ' + coverage.requested.length + ' · 可保留 ' + coverage.output.length + ' · 缺失 ' + coverage.missing.length;
  summary.dataset.tone = coverage.missing.length || coverage.lost.length ? 'warning' : 'ready';
  if (coverage.lost.length) summary.textContent += '。注意：完整字体还缺少 ' + coverage.lost.length + ' 个旧字符。';
  if (font.status !== 'loaded') {
    setPreviewMessage('live', font.error || '正在加载真实字形…');
    return;
  }
  const old = new Set(coverage.existing);
  const missing = new Set(coverage.missing);
  state.items = coverage.requested.map(character => ({
    ...buildPreviewItem(character, missing.has(character)),
    classification: missing.has(character) ? 'missing' : old.has(character) ? 'existing' : 'added',
    label: missing.has(character) ? '缺失' : old.has(character) ? '已存在' : incremental ? '新增' : '保留'
  }));
  state.family = font.family;
  state.parsedCount = coverage.requested.length - coverage.missing.length;
  state.displayCount = state.items.length;
  state.renderedCount = 0;
  state.missingItems = state.items.filter(item => item.missing);
  state.copyText = coverage.requested.filter(character => !missing.has(character)).join('');
  state.copyCount = state.parsedCount;
  resetPreviewCopyButton('live');
  elements.copy.textContent = '复制可用字符';
  elements.panel.classList.remove('is-hidden');
  elements.text.replaceChildren();
  if (state.items.length) appendPreviewCharacters('live');
  else {
    elements.meta.textContent = incremental && getSelectedSubsetMode() === 'full'
      ? '本次不新增字符，将按旧字符集重新生成。' : '输入字符后，在这里查看真实字形。';
    updatePreviewActionButtons('live');
  }
  // The old grid continues to use the old font's actual glyphs, even if the
  // selected full font lacks them. Mark the potential loss explicitly.
  const lost = new Set(coverage.lost);
  const oldState = previewStates.subset;
  const changed = oldState.items.some(item => Boolean(item.lost) !== lost.has(item.character));
  if (changed) {
    oldState.items.forEach(item => {
      item.lost = lost.has(item.character);
      item.classification = item.lost ? 'lost' : '';
      item.label = item.lost ? '原字体缺失' : '';
    });
    oldState.renderedCount = 0;
    subsetPreviewText.replaceChildren();
    appendPreviewCharacters('subset');
  }
}

async function readFileAsBase64(file) {
  if (file.size > maxFontBytes) {
    throw new Error(`字体文件最大 ${formatBytes(maxFontBytes)}，请先选择较小的字体。`);
  }
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
  if (charsetFile.files?.[0] !== file) return;
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
  if (existingSubsetFile.files?.[0] !== file) return;

  existingSubsetState = {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    base64
  };
  updateExistingSubsetMeta();
}

function getPreviewElements(kind) {
  if (kind === 'live') return {
    panel: document.querySelector('#livePreviewPanel'), meta: document.querySelector('#livePreviewMeta'),
    text: document.querySelector('#livePreviewText'), more: document.querySelector('#livePreviewMore'),
    copy: document.querySelector('#livePreviewCopy')
  };
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



function updatePreviewMeta(kind) {
  const elements = getPreviewElements(kind);
  const state = previewStates[kind];
  if (kind === 'live') {
    elements.meta.textContent = `共 ${state.displayCount} 个不同字符，已显示 ${state.renderedCount} 个。${state.missingItems.length ? '缺失字符用系统字形提示。' : ''}`;
    return;
  }
  const missingText =
    state.missingItems.length > 0
      ? ` 缺失 ${state.missingItems.length} 个字符：${state.missingItems.slice(0, 12).map((item) => item.character).join(' ')}${state.missingItems.length > 12 ? '…' : ''}。`
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
    `${state.filename} 包含 ${state.parsedCount} 个字符，已显示 ${state.renderedCount} 个。`;
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
    token.className = `preview-token${item.missing ? ' is-missing' : ''}${item.classification ? ` is-${item.classification}` : ''}`;
    token.title = `${item.title}${item.label ? `（${item.label}）` : item.missing ? '（字体中缺失）' : ''}`;

    const glyph = document.createElement('span');
    glyph.className = 'preview-token-char';
    glyph.textContent = item.displayCharacter;

    if (item.usePreviewFont && state.family && !item.missing) {
      glyph.style.fontFamily = `"${state.family}", "Segoe UI Symbol", sans-serif`;
    }

    const code = document.createElement('span');
    code.className = 'preview-token-code';
    code.textContent = item.infoLabel;

    token.append(glyph, code);
    if (item.label) {
      const label = document.createElement('span');
      label.className = 'preview-token-label';
      label.textContent = item.label;
      token.append(label);
    }
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
  if (kind !== 'live') fontLoader.clear(kind);
}

function clearSubsetPreview() {
  subsetPreviewController?.abort();
  subsetInspectionState = { status: 'idle', payload: null, error: '' };
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
  const family = fontLoader.get(kind).family;
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
  subsetPreviewController?.abort();
  const controller = new AbortController();
  subsetPreviewController = controller;
  subsetInspectionState = { status: 'loading', payload: null, error: '' };
  setSubsetPreviewMessage('正在读取当前子集字体字符...');
  updateConvertButtonState();

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

    if (requestId !== subsetPreviewRequestId) return null;
    requestPayload.includePreviewFont = true;
    const response = await apiFetch('/api/font-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '当前子集字体预览解析失败。');
    }

    const payload = await response.json();

    if (requestId !== subsetPreviewRequestId) {
      return null;
    }

    let previewError = '';
    try { await fontLoader.load('subset', payload); } catch (error) { previewError = error.message; }
    if (requestId !== subsetPreviewRequestId) return null;
    subsetInspectionState = { status: 'ready', payload, error: '' };
    subsetPreviewTargetKey = target.key;
    if (previewError) setSubsetPreviewMessage(previewError);
    else renderSubsetPreview(payload, target.key);
    updateConvertButtonState();
    return payload;
  } catch (error) {
    if (requestId === subsetPreviewRequestId) {
      const message = error instanceof Error ? error.message : '当前子集字体预览解析失败。';
      subsetInspectionState = { status: 'error', payload: null, error: message };
      setSubsetPreviewMessage(message);
      updateConvertButtonState();
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

  clearSubsetPreview();
  subsetInspectionState = { status: 'loading', payload: null, error: '' };
  setSubsetPreviewMessage('准备读取当前子集字体字符...');
  updateConvertButtonState();
  subsetPreviewTimer = window.setTimeout(() => {
    void inspectExistingSubsetForPreview();
  }, 200);
}

function clearMatchedSource(message = getDefaultSourceMatchMessage()) {
  window.clearTimeout(sourceMatchTimer);
  matchedSourceState = null;
  sourceMatchRequestId += 1;
  sourceMatchMeta.textContent = message;
  updateSourceFontMeta();
  updateConvertButtonState();
  updateSubsetSummary();
}

function applyMatchedSource(record, matchKey) {
  if (getSelectedOperationMode() !== 'incremental' || getExistingSubsetMatchTarget()?.key !== matchKey) return;
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

  if (!hasPersistentStorage()) {
    clearMatchedSource();
    return null;
  }

  const target = getExistingSubsetMatchTarget();
  if (!target) {
    clearMatchedSource();
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
    const fingerprint = subsetPreviewTargetKey === target.key && subsetInspectionState.payload?.sourceHash
      ? { hash: subsetInspectionState.payload.sourceHash }
      : target.type === 'url'
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

  if (!hasPersistentStorage()) {
    clearMatchedSource();
    return;
  }

  const remoteUrl = getExistingSubsetUrlValue();
  if (remoteUrl && !isValidRemoteFontUrl(remoteUrl)) {
    clearMatchedSource('当前子集字体 URL 还不完整，填成 http:// 或 https:// 后再自动匹配原始字体。');
    return;
  }

  const target = getExistingSubsetMatchTarget();
  if (!target) {
    clearMatchedSource();
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

  if (!hasPersistentStorage()) {
    throw new Error('当前仅转换模式需要手动上传原始全量字体。');
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
  let count;

  try {
    const data = await readFileAsBase64(blob);
    const response = await apiFetch('/api/font-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: outputName,
        data,
        includeData: false,
        includePreviewFont: true
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '压缩完成字体预览解析失败。');
    }

    const payload = await response.json();
    count = payload.count;
    await fontLoader.load('output', payload);
    renderOutputPreview(payload, previewCharacters);
    return { count, loaded: true };
  } catch (error) {
    setOutputPreviewMessage(error instanceof Error ? error.message : '压缩完成字体预览解析失败。');
    return { count, loaded: false };
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
  // Use the same inspected bytes even if a remote file changes before export.
  if (subsetInspectionState.status === 'ready' && subsetInspectionState.payload?.base64Data) {
    return { filename: subsetInspectionState.payload.filename, data: subsetInspectionState.payload.base64Data, url: '' };
  }
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
  if (workflow.busy || getPreflightState().blockingItems.length) return;
  const operationMode = getSelectedOperationMode();
  if (operationMode === 'fresh' && !hasSourceFontForCurrentOperation()) {
    updateStatus('请先上传原始全量字体，或从已保存原始字体中选择一个。', 'error');
    return;
  }

  if (operationMode === 'incremental' && !hasExistingSubsetSource()) {
    updateStatus('增量更新模式下，请先填写当前子集字体 URL，或上传本地子集字体。', 'error');
    return;
  }

  workflow.start();
  convertButton.disabled = true;
  clearOutputPreview();

  try {
    const outputType = getSelectedOutputFormat();
    const outputLabel = OUTPUT_FORMAT_LABELS[outputType] || outputType.toUpperCase();
    const subsetPayload = await getSubsetPayload();
    const existingSubsetPayload =
      operationMode === 'incremental' ? await getExistingSubsetPayload() : null;
    const sourcePayload = await getSourceFontPayload(operationMode);
    const jobLabel =
      operationMode === 'incremental'
        ? `正在基于当前子集字体增量更新为 ${outputLabel}，并合并 ${subsetPayload.label}，请稍候...`
        : subsetPayload.subsetMode === 'full'
          ? `正在转换完整字体为 ${outputLabel}，请稍候...`
          : `正在使用 ${subsetPayload.label} 压缩并转换为 ${outputLabel}，请稍候...`;
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
        keepKerning: keepKerning.checked
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
    const responseOutputType = response.headers.get('X-Output-Type') || outputType;
    const serverSourceSaved = response.headers.get('X-Server-Source-Saved') === 'true';
    const serverSourceAction = response.headers.get('X-Server-Source-Action') || (serverSourceSaved ? 'created' : 'skipped');
    const serverMatchSaved = response.headers.get('X-Server-Match-Saved') === 'true';
    const serverMatchAction = response.headers.get('X-Server-Match-Action') || (serverMatchSaved ? 'created' : 'skipped');
    const fallbackName = `${sourcePayload.filename.replace(/\.[^.]+$/, '') || 'converted-font'}.${responseOutputType}`;
    const outputName = decodeURIComponent(
      contentDisposition.match(/filename="(.+?)"/)?.[1] || fallbackName
    );
    if (serverSourceAction === 'created' || serverSourceAction === 'updated') {
      await loadSourceLibrary();
    }

    const sourcePersisted = ['created', 'updated', 'reused'].includes(serverSourceAction);
    const matchPersisted = ['created', 'updated', 'reused'].includes(serverMatchAction);
    resultFootnote.textContent = sourcePersisted
      ? matchPersisted
        ? '原始字体和匹配记录已保存，可在字体库中继续复用。'
        : '原始字体已保存到字体库；本次未保存自动匹配记录。'
      : '本次仅转换，原始字体和匹配记录未保存。请下载结果；后续增量更新需再次提供原始全量字体。';
    const coverage = getCharacterCoverage();
    const outputPreviewCharacters = [...new Set([...coverage.existing, ...coverage.requested])];
    const renderedOutputPreview = await previewOutputFont(blob, outputName, outputPreviewCharacters);
    workflow.setResult({ blob, outputName, sourceBytes, outputBytes, subsetCount: renderedOutputPreview.count });

    const actualCount = renderedOutputPreview.count;
    const details = [formatSizeDelta(sourceBytes, outputBytes)];
    if (Number.isInteger(actualCount)) details.push('实际输出 ' + actualCount + ' 个字符');
    if (operationMode === 'incremental') details.push('可新增 ' + coverage.added.length + ' 个字符');
    if (coverage.missing.length || coverage.lost.length) details.push('缺失字符未写入，请检查结果网格');
    if (!renderedOutputPreview.loaded) details.push('预览暂时失败，文件已生成，可下载');
    updateStatus(details.join('。') + '。', coverage.missing.length || coverage.lost.length || !renderedOutputPreview.loaded ? 'warning' : 'success');

  } catch (error) {
    updateStatus(error instanceof Error ? error.message : '转换失败，请稍后重试。', 'error');
  } finally {
    workflow.finish();
    updateConvertButtonState();
  }
}

function syncUI() {
  updateOperationPanels();
  updateSourcePanels();
  updateSubsetSummary();
}

fileInput.addEventListener('change', () => {
  setSelectedFile(fileInput.files?.[0] || null);
});

// Clear completed/failed action messages as soon as the user edits the job.
['input', 'change'].forEach(eventName => document.querySelector('#workflowFields').addEventListener(eventName, () => {
  statusOverride = null;
}, true));
subsetText.addEventListener('compositionstart', () => {
  composingCharacters = true;
  window.clearTimeout(livePreviewTimer);
});
subsetText.addEventListener('compositionend', () => {
  composingCharacters = false;
  updateSubsetSummary();
  updateConvertButtonState();
});
document.querySelector('#livePreviewMore').addEventListener('click', () => appendPreviewCharacters('live'));
document.querySelector('#livePreviewCopy').addEventListener('click', () => void copyPreviewCharacters('live'));
document.querySelector('#previewRetry').addEventListener('click', async () => {
  statusOverride = null;
  const retry = document.querySelector('#previewRetry');
  retry.disabled = true;
  await Promise.all([
    inspectSourceFontForPreflight(true),
    getSelectedOperationMode() === 'incremental' ? inspectExistingSubsetForPreview() : Promise.resolve()
  ]);
  retry.disabled = false;
  updateConvertButtonState();
});
document.querySelector('#statusBanner').append(document.querySelector('#previewRetry'));
window.addEventListener('beforeunload', () => fontLoader.clearAll());

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
  updateConvertButtonState();
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
    }
    if (matchedSourceState?.sourceHash === sourceHash) clearMatchedSource('已移除自动匹配的完整字体，请重新选择来源。');
    updateSourceFontMeta();
    updateConvertButtonState();

    renderSourceLibrary();
    updateStatus(`已从 Cloudflare 字体库移除：${getSourceDisplayName(record)}。`);
  } catch (error) {
    updateStatus(error instanceof Error ? error.message : '原始字体移除失败。', 'error');
  }
});

subsetPreviewMore.addEventListener('click', () => {
  appendPreviewCharacters('subset');
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
    if (charsetFile.files?.[0] !== file) return;
    charsetFileLoadState = 'ready';
    updateSubsetSummary();
    updateConvertButtonState();
  } catch (error) {
    if (charsetFile.files?.[0] !== file) return;
    charsetFileLoadState = 'error';
    charsetFileLoadError = error instanceof Error ? error.message : '字符集文件读取失败。';
    charsetFileMeta.textContent = charsetFileLoadError;
    updateStatus(charsetFileMeta.textContent, 'error');
    updateConvertButtonState();
  }
});

existingSubsetFile.addEventListener('change', () => {
  const file = existingSubsetFile.files?.[0];
  clearSubsetPreview();
  clearMatchedSource();
  existingSubsetState = { name: '', size: 0, lastModified: 0, base64: '' };

  if (!file) {
    existingSubsetState = {
      name: '',
      size: 0,
      lastModified: 0,
      base64: ''
    };
    updateExistingSubsetMeta();
    clearMatchedSource();
    scheduleSubsetPreview();
    updateSubsetSummary();
    updateConvertButtonState();
    return;
  }

  existingSubsetMeta.textContent = `正在读取 ${file.name}…`;
  if (selectedFile || selectedLibrarySource) {
    const sourceName = selectedFile?.name || getSourceDisplayName(selectedLibrarySource);
    sourceMatchMeta.textContent = `将使用完整字体：${sourceName}。`;
  } else scheduleOriginalSourceMatch();
  scheduleSubsetPreview();
  updateSubsetSummary();
  updateConvertButtonState();
});

existingSubsetUrl.addEventListener('input', () => {
  clearSubsetPreview();
  clearMatchedSource();
  updateExistingSubsetMeta();
  if (selectedFile || selectedLibrarySource) {
    const sourceName = selectedFile?.name || getSourceDisplayName(selectedLibrarySource);
    sourceMatchMeta.textContent = `将使用${selectedFile ? '手动上传' : '已保存'}的原始字体：${sourceName}。`;
  } else {
    scheduleOriginalSourceMatch();
  }
  scheduleSubsetPreview();
  updateSubsetSummary();
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
  if (workflow.busy) return;
  const file = event.dataTransfer?.files?.[0] || null;

  if (!file) {
    return;
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
});

async function initializeApp() {
  syncUI();
  updateExistingSubsetMeta();
  await loadRuntimeConfig();
  await Promise.all([loadSourceLibrary(), loadCharsetPresets()]);
}

void initializeApp();
