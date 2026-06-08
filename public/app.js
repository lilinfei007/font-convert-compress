const fileInput = document.querySelector('#fontFile');
const fileName = document.querySelector('#fileName');
const convertButton = document.querySelector('#convertButton');
const status = document.querySelector('#status');
const dropzone = document.querySelector('#dropzone');
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
const subsetModeInputs = Array.from(document.querySelectorAll('input[name="subsetMode"]'));
const operationModeInputs = Array.from(document.querySelectorAll('input[name="operationMode"]'));

let selectedFile = null;
let charsetPresets = [];
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

function updateStatus(message, tone = 'default') {
  status.textContent = message;
  status.className = 'status';

  if (tone !== 'default') {
    status.classList.add(`is-${tone}`);
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

function getSelectedSubsetMode() {
  return subsetModeInputs.find((input) => input.checked)?.value || 'full';
}

function getSelectedOperationMode() {
  return operationModeInputs.find((input) => input.checked)?.value || 'fresh';
}

function getSelectedPreset() {
  return charsetPresets.find((preset) => preset.id === presetSelect.value) || null;
}

function getExistingSubsetUrlValue() {
  return existingSubsetUrl.value.trim();
}

function setSelectedFile(file) {
  selectedFile = file || null;
  fileName.textContent = selectedFile ? `${selectedFile.name} (${formatBytes(selectedFile.size)})` : '还没有选择文件';
  convertButton.disabled = !selectedFile;

  if (selectedFile) {
    updateStatus('原始字体已就绪，选择处理模式和字符来源后即可开始。');
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
  convertButton.textContent =
    getSelectedOperationMode() === 'incremental' ? '增量更新并下载 TTF' : '转换并下载 TTF';
}

function updateExistingSubsetMeta() {
  const remoteUrl = getExistingSubsetUrlValue();

  if (remoteUrl) {
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

async function loadCharsetPresets() {
  try {
    const response = await fetch('/api/charsets');
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
  } catch (error) {
    presetSelect.innerHTML = '';
    presetDescription.textContent = error instanceof Error ? error.message : '系统预设加载失败。';
  }
}

async function getSubsetPayload() {
  const subsetMode = getSelectedSubsetMode();

  if (subsetMode === 'full') {
    return {
      subsetMode,
      uniqueCount: 0,
      label: '完整字体'
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
      label: preset.name
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
      label: '手动输入字符'
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
    label: `字符集文件：${file.name}`
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
  if (!selectedFile) {
    updateStatus('请先选择原始全量字体。', 'error');
    return;
  }

  convertButton.disabled = true;

  try {
    const operationMode = getSelectedOperationMode();
    const subsetPayload = await getSubsetPayload();
    const existingSubsetPayload =
      operationMode === 'incremental' ? await getExistingSubsetPayload() : null;

    const jobLabel =
      operationMode === 'incremental'
        ? `正在基于当前子集字体增量更新，并合并 ${subsetPayload.label}，请稍候...`
        : subsetPayload.subsetMode === 'full'
          ? '正在转换完整字体，请稍候...'
          : `正在使用 ${subsetPayload.label} 压缩并转换字体，请稍候...`;
    updateStatus(jobLabel, 'busy');

    const data = await readFileAsBase64(selectedFile);
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: selectedFile.name,
        data,
        operationMode,
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
    const sourceBytes = Number(response.headers.get('X-Source-Bytes') || selectedFile.size);
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
    const fallbackName = `${selectedFile.name.replace(/\.[^.]+$/, '') || 'converted-font'}.ttf`;
    const outputName = decodeURIComponent(
      contentDisposition.match(/filename="(.+?)"/)?.[1] || fallbackName
    );

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = outputName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

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
    }
    if (keepKerning.checked && !sourceHasKerning) {
      notes.push('源字体不含 kerning 数据，勾选无影响');
    }

    updateStatus(
      `转换完成：${formatSizeDelta(sourceBytes, outputBytes)}。${notes.length ? ` ${notes.join('；')}。` : ''}`,
      'success'
    );
  } catch (error) {
    updateStatus(error instanceof Error ? error.message : '转换失败，请稍后重试。', 'error');
  } finally {
    convertButton.disabled = !selectedFile;
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

presetSelect.addEventListener('change', () => {
  updatePresetDescription();
  updateSubsetSummary();
});

subsetText.addEventListener('input', () => {
  updateSubsetSummary();
});

charsetFile.addEventListener('change', async () => {
  const file = charsetFile.files?.[0];

  if (!file) {
    charsetFileState = {
      name: '',
      size: 0,
      lastModified: 0,
      text: '',
      count: 0
    };
    charsetFileMeta.textContent = '还没有选择字符集文件。';
    updateSubsetSummary();
    return;
  }

  try {
    await cacheCharsetFile(file);
    updateSubsetSummary();
  } catch (error) {
    charsetFileMeta.textContent = error instanceof Error ? error.message : '字符集文件读取失败。';
    updateStatus(charsetFileMeta.textContent, 'error');
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
    updateSubsetSummary();
    return;
  }

  try {
    await cacheExistingSubsetFile(file);
    updateSubsetSummary();
  } catch (error) {
    existingSubsetMeta.textContent = error instanceof Error ? error.message : '当前子集字体读取失败。';
    updateStatus(existingSubsetMeta.textContent, 'error');
  }
});

existingSubsetUrl.addEventListener('input', () => {
  updateExistingSubsetMeta();
  updateSubsetSummary();
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

syncUI();
updateExistingSubsetMeta();
void loadCharsetPresets();
