import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFont, woff2 } from 'fonteditor-core';

const require = createRequire(import.meta.url);
const OTFReader = require('./node_modules/fonteditor-core/lib/ttf/otfreader.js').default;
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

loadLocalEnvFiles(APP_DIR);

const HOST = '127.0.0.1';
const runtimePort =
  typeof process !== 'undefined' && process?.env?.PORT ? Number(process.env.PORT) : 3000;
const PORT = Number.isFinite(runtimePort) && runtimePort > 0 ? runtimePort : 3000;
const MAX_BODY_SIZE = 60 * 1024 * 1024;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const CHARSET_DIR = path.join(APP_DIR, 'charsets');
const DATA_DIR = path.join(APP_DIR, 'data');
const SOURCE_FONT_DIR = path.join(DATA_DIR, 'source-fonts');
const FONT_LIBRARY_FILE = path.join(DATA_DIR, 'font-library.json');

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.eot', 'application/vnd.ms-fontobject']
]);

const supportedTypes = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot', 'svg']);
const writableTypes = new Set(['ttf', 'woff', 'woff2', 'eot', 'svg']);
const outputContentTypes = new Map([
  ['ttf', 'font/ttf'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['eot', 'application/vnd.ms-fontobject'],
  ['svg', 'image/svg+xml; charset=utf-8']
]);
const charsetPresets = new Map([
  [
    'common-3500',
    {
      id: 'common-3500',
      name: '常用汉字集',
      description: '《通用规范汉字表》一级字表，覆盖 3500 个常用汉字。',
      count: 3500,
      filename: 'common-3500.txt'
    }
  ],
  [
    'extended-6500',
    {
      id: 'extended-6500',
      name: '扩展汉字集',
      description: '《通用规范汉字表》一级字表 + 二级字表，覆盖 6500 个汉字。',
      count: 6500,
      filename: 'extended-6500.txt'
    }
  ]
]);
const CDN_UPLOAD_CONFIG = createCdnUploadConfig();
let woff2ReadyPromise;

function loadLocalEnvFiles(rootDir) {
  for (const filename of ['.env.local', '.env']) {
    const filePath = path.join(rootDir, filename);
    if (!existsSync(filePath)) {
      continue;
    }

    const rawText = readFileSync(filePath, 'utf8');
    for (const line of rawText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value.replace(/\\n/g, '\n');
    }
  }
}

function getEnvString(name, fallback = '') {
  const value = process.env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getEnvBoolean(name, fallback = false) {
  const value = getEnvString(name).toLowerCase();
  if (!value) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  return fallback;
}

function getEnvNumber(name, fallback) {
  const value = Number(getEnvString(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getEnvJsonObject(name) {
  const raw = getEnvString(name);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object');
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => key && value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    );
  } catch (error) {
    console.warn(`Ignoring invalid ${name}:`, error);
    return {};
  }
}

function resolveOptionalConfigPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return '';
  }

  const candidate = path.isAbsolute(filePath) ? filePath : path.join(APP_DIR, filePath.trim());
  const resolved = path.normalize(candidate);
  return resolved.startsWith(APP_DIR) ? resolved : '';
}

function readOptionalTemplateText({ inlineValue = '', filePath = '', label = 'template' }) {
  if (inlineValue) {
    return inlineValue;
  }

  const resolvedPath = resolveOptionalConfigPath(filePath);
  if (!resolvedPath) {
    return '';
  }

  try {
    return readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    console.warn(`Failed to read ${label} file:`, error);
    return '';
  }
}

function createCdnUploadConfig() {
  const uploadUrlTemplate = getEnvString('CDN_UPLOAD_URL_TEMPLATE');
  const publicUrlTemplate = getEnvString('CDN_PUBLIC_URL_TEMPLATE');
  const label = getEnvString('CDN_UPLOAD_LABEL', 'CDN');
  const method = getEnvString('CDN_UPLOAD_METHOD', 'PUT').toUpperCase();
  const authHeader = getEnvString('CDN_AUTH_HEADER');
  const authToken = process.env?.CDN_AUTH_TOKEN || '';
  const bodyMode = getEnvString('CDN_UPLOAD_BODY_MODE', 'raw').toLowerCase();

  return {
    available: Boolean(uploadUrlTemplate),
    uploadUrlTemplate,
    publicUrlTemplate,
    label,
    method: ['PUT', 'POST'].includes(method) ? method : 'PUT',
    authHeader,
    authToken,
    extraHeaders: getEnvJsonObject('CDN_UPLOAD_HEADERS_JSON'),
    autoUploadDefault: getEnvBoolean('CDN_AUTO_UPLOAD_DEFAULT', false),
    timeoutMs: getEnvNumber('CDN_UPLOAD_TIMEOUT_MS', 20000),
    bodyMode: ['raw', 'json', 'text', 'form'].includes(bodyMode) ? bodyMode : 'raw',
    bodyTemplate: getEnvString('CDN_UPLOAD_BODY_TEMPLATE'),
    bodyTemplateFile: getEnvString('CDN_UPLOAD_BODY_TEMPLATE_FILE'),
    filenameTemplate: getEnvString('CDN_UPLOAD_FILENAME_TEMPLATE', '{{filename}}'),
    formFileField: getEnvString('CDN_UPLOAD_FORM_FILE_FIELD', 'file'),
    formFilenameField: getEnvString('CDN_UPLOAD_FORM_FILENAME_FIELD')
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function sanitizeBaseName(filename) {
  const raw = path.basename(filename, path.extname(filename));
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'converted-font';
}

function getFontType(filename) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (!supportedTypes.has(extension)) {
    throw new Error('仅支持 ttf、otf、woff、woff2、eot、svg 格式。');
  }

  return extension;
}

function getOutputType(value) {
  const outputType = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'ttf';

  if (!writableTypes.has(outputType)) {
    throw new Error('输出格式仅支持 ttf、woff、woff2、eot、svg；当前库暂不支持导出 otf。');
  }

  return outputType;
}

function getSubsetCodePoints(subsetText) {
  if (typeof subsetText !== 'string' || !subsetText.trim()) {
    return [];
  }

  const codePoints = new Set();

  for (const char of subsetText.normalize('NFC')) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint < 32 || codePoint === 127) {
      continue;
    }
    codePoints.add(codePoint);
  }

  return Array.from(codePoints);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mergeCodePoints(...groups) {
  const merged = new Set();

  for (const group of groups) {
    for (const codePoint of group || []) {
      if (Number.isInteger(codePoint) && codePoint >= 32 && codePoint !== 127) {
        merged.add(codePoint);
      }
    }
  }

  return Array.from(merged).sort((left, right) => left - right);
}

function extractCmapCodePoints(fontObject) {
  const cmap = fontObject?.cmap || {};
  return Object.keys(cmap)
    .map((key) => Number(key))
    .filter((codePoint) => Number.isInteger(codePoint) && codePoint >= 32 && codePoint !== 127)
    .sort((left, right) => left - right);
}

function codePointsToText(codePoints) {
  return codePoints.map((codePoint) => String.fromCodePoint(codePoint)).join('');
}

function stripSubsetGlyphHinting(fontObject) {
  if (!Array.isArray(fontObject?.glyf)) {
    return 0;
  }

  let strippedCount = 0;

  for (const glyph of fontObject.glyf) {
    if (Array.isArray(glyph?.instructions) && glyph.instructions.length > 0) {
      delete glyph.instructions;
      strippedCount += 1;
    }
  }

  return strippedCount;
}

function stripKerningTables(fontObject) {
  const removedTables = [];

  for (const tableName of ['GPOS', 'kern', 'kerx']) {
    if (Object.prototype.hasOwnProperty.call(fontObject || {}, tableName)) {
      delete fontObject[tableName];
      removedTables.push(tableName);
    }
  }

  return removedTables;
}

function subsetIncludesEmptyAdvanceGlyph(fontObject, subsetCodePoints) {
  if (!Array.isArray(fontObject?.glyf) || !subsetCodePoints?.length) {
    return false;
  }

  const cmap = fontObject.cmap || {};

  return subsetCodePoints.some((codePoint) => {
    const glyphIndex = cmap[codePoint];
    const glyph = fontObject.glyf[glyphIndex];

    return (
      glyph &&
      (!Array.isArray(glyph.contours) || glyph.contours.length === 0) &&
      Number.isFinite(glyph.advanceWidth) &&
      glyph.advanceWidth > 0
    );
  });
}

function getOtfMetricIndexes(rawFont) {
  if (rawFont?.readOptions?.subset?.length) {
    return Object.keys(rawFont.subsetMap || { 0: true })
      .map((key) => Number(key))
      .filter((index) => Number.isInteger(index) && rawFont.hmtx?.[index])
      .sort((left, right) => left - right);
  }

  return Array.isArray(rawFont?.hmtx) ? rawFont.hmtx.map((_, index) => index) : [];
}

function repairOtfGlyphMetrics(fontObject, sourceBuffer, subsetCodePoints) {
  if (!Array.isArray(fontObject?.glyf) || !Buffer.isBuffer(sourceBuffer)) {
    return;
  }

  try {
    const rawFont = new OTFReader({
      subset: subsetCodePoints?.length ? subsetCodePoints : []
    }).readBuffer(bufferToArrayBuffer(sourceBuffer));
    const metricIndexes = getOtfMetricIndexes(rawFont);
    const limit = Math.min(fontObject.glyf.length, metricIndexes.length);

    for (let index = 0; index < limit; index += 1) {
      const glyph = fontObject.glyf[index];
      const metric = rawFont.hmtx?.[metricIndexes[index]];

      if (!glyph || !metric) {
        continue;
      }

      if (Number.isFinite(metric.advanceWidth)) {
        glyph.advanceWidth = metric.advanceWidth;
      }

      if (Number.isFinite(metric.leftSideBearing)) {
        glyph.leftSideBearing = metric.leftSideBearing;
      }
    }
  } catch (error) {
    console.warn('Failed to repair OTF glyph metrics:', error);
  }
}

function createEmptyFontLibrary() {
  return {
    version: 1,
    sources: [],
    subsetMatches: []
  };
}

function publicSourceRecord(record) {
  return {
    sourceHash: record.sourceHash,
    sourceName: record.sourceName,
    sourceSize: record.sourceSize,
    sourceType: record.sourceType,
    savedAt: record.savedAt,
    lastUsedAt: record.lastUsedAt || record.savedAt
  };
}

async function ensureFontLibraryStorage() {
  await fs.mkdir(SOURCE_FONT_DIR, { recursive: true });
}

async function readFontLibrary() {
  await ensureFontLibraryStorage();

  try {
    const raw = await fs.readFile(FONT_LIBRARY_FILE, 'utf8');
    const library = JSON.parse(raw);

    return {
      ...createEmptyFontLibrary(),
      ...library,
      sources: Array.isArray(library.sources) ? library.sources : [],
      subsetMatches: Array.isArray(library.subsetMatches) ? library.subsetMatches : []
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createEmptyFontLibrary();
    }

    throw error;
  }
}

async function writeFontLibrary(library) {
  await ensureFontLibraryStorage();
  await fs.writeFile(FONT_LIBRARY_FILE, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
}

function getStoredSourcePath(record) {
  return path.join(SOURCE_FONT_DIR, record.storedFilename);
}

async function saveSourceFontBuffer(filename, buffer) {
  const sourceType = getFontType(filename);
  const sourceHash = hashBuffer(buffer);
  const now = Date.now();
  const storedFilename = `${sourceHash}.${sourceType}`;
  const library = await readFontLibrary();
  const existingRecord = library.sources.find((record) => record.sourceHash === sourceHash);

  await fs.writeFile(path.join(SOURCE_FONT_DIR, storedFilename), buffer);

  const record = {
    sourceHash,
    sourceName: filename,
    sourceSize: buffer.length,
    sourceType,
    storedFilename,
    savedAt: existingRecord?.savedAt || now,
    lastUsedAt: now
  };

  library.sources = [
    record,
    ...library.sources.filter((item) => item.sourceHash !== sourceHash)
  ];
  await writeFontLibrary(library);

  return {
    action: existingRecord ? 'updated' : 'created',
    record
  };
}

async function saveSourceFontPayload({ filename, base64Data }) {
  const buffer = Buffer.from(base64Data, 'base64');

  if (!buffer.length) {
    throw new Error('原始字体文件为空，无法保存。');
  }

  return saveSourceFontBuffer(filename, buffer);
}

async function getSourceFontRecord(sourceHash) {
  const library = await readFontLibrary();
  return library.sources.find((record) => record.sourceHash === sourceHash) || null;
}

async function getSourceFontPayload(sourceHash) {
  const record = await getSourceFontRecord(sourceHash);

  if (!record) {
    throw new Error('未找到已保存的原始字体。');
  }

  const buffer = await fs.readFile(getStoredSourcePath(record));
  return {
    record,
    filename: record.sourceName,
    base64Data: buffer.toString('base64')
  };
}

async function touchSourceFont(sourceHash) {
  const library = await readFontLibrary();
  const record = library.sources.find((item) => item.sourceHash === sourceHash);

  if (!record) {
    return null;
  }

  record.lastUsedAt = Date.now();
  await writeFontLibrary(library);
  return record;
}

async function deleteSourceFont(sourceHash) {
  const library = await readFontLibrary();
  const record = library.sources.find((item) => item.sourceHash === sourceHash);

  if (!record) {
    throw new Error('未找到要移除的原始字体。');
  }

  library.sources = library.sources.filter((item) => item.sourceHash !== sourceHash);
  library.subsetMatches = library.subsetMatches.filter((item) => item.sourceHash !== sourceHash);
  await writeFontLibrary(library);
  await fs.rm(getStoredSourcePath(record), { force: true });

  return record;
}

async function saveSubsetSourceMatch({ subsetHash, sourceHash, outputName, outputBytes }) {
  if (!subsetHash || !sourceHash) {
    return null;
  }

  const library = await readFontLibrary();
  const now = Date.now();
  const existingRecord = library.subsetMatches.find((record) => record.subsetHash === subsetHash);
  const record = {
    subsetHash,
    sourceHash,
    outputName,
    outputBytes,
    savedAt: existingRecord?.savedAt || now,
    lastUsedAt: now
  };

  library.subsetMatches = [
    record,
    ...library.subsetMatches.filter((item) => item.subsetHash !== subsetHash)
  ];
  await writeFontLibrary(library);

  return {
    action: existingRecord ? 'updated' : 'created',
    record
  };
}

async function getSubsetSourceMatch(subsetHash) {
  const library = await readFontLibrary();
  const match = library.subsetMatches.find((record) => record.subsetHash === subsetHash);

  if (!match) {
    return null;
  }

  const source = library.sources.find((record) => record.sourceHash === match.sourceHash);

  if (!source) {
    return null;
  }

  match.lastUsedAt = Date.now();
  source.lastUsedAt = Date.now();
  await writeFontLibrary(library);

  return {
    match,
    source
  };
}

function listCharsetPresets() {
  return Array.from(charsetPresets.values()).map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    count: preset.count
  }));
}

async function loadCharsetPreset(presetId) {
  const preset = charsetPresets.get(presetId);

  if (!preset) {
    throw new Error('未找到对应的系统预设字符集。');
  }

  const presetPath = path.join(CHARSET_DIR, preset.filename);
  const content = await fs.readFile(presetPath, 'utf8');

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    count: preset.count,
    text: content
  };
}

async function resolveSubsetSource({ subsetMode, presetId, subsetText, charsetFileText }) {
  const normalizedMode =
    typeof subsetMode === 'string' && subsetMode
      ? subsetMode
      : presetId
        ? 'preset'
        : typeof charsetFileText === 'string' && charsetFileText.trim()
          ? 'file'
          : typeof subsetText === 'string' && subsetText.trim()
            ? 'manual'
            : 'full';

  if (normalizedMode === 'full') {
    return {
      mode: 'full',
      label: '完整字体',
      text: ''
    };
  }

  if (normalizedMode === 'preset') {
    const preset = await loadCharsetPreset(presetId);
    return {
      mode: 'preset',
      label: `${preset.name}（${preset.count} 字）`,
      text: preset.text
    };
  }

  if (normalizedMode === 'file') {
    if (typeof charsetFileText !== 'string' || !charsetFileText.trim()) {
      throw new Error('上传的字符集文件为空，请重新选择。');
    }

    return {
      mode: 'file',
      label: '上传字符集文件',
      text: charsetFileText
    };
  }

  if (normalizedMode === 'manual') {
    return {
      mode: 'manual',
      label: '手动输入字符',
      text: typeof subsetText === 'string' ? subsetText : ''
    };
  }

  throw new Error('不支持的字符集来源。');
}

function inspectFontFeatures(fontObject) {
  const hintingTables = ['fpgm', 'cvt', 'prep', 'gasp'].filter((key) =>
    Object.prototype.hasOwnProperty.call(fontObject, key)
  );
  const kerningTables = ['kern', 'GPOS'].filter((key) =>
    Object.prototype.hasOwnProperty.call(fontObject, key)
  );

  return {
    hintingTables,
    kerningTables,
    hasHintingData: hintingTables.length > 0,
    hasKerningData: kerningTables.length > 0,
    glyphCount: Array.isArray(fontObject.glyf) ? fontObject.glyf.length : 0
  };
}

function getStaticFilePath(requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return resolvedPath;
}

async function ensureWoff2Ready() {
  if (!woff2ReadyPromise) {
    woff2ReadyPromise = woff2.init();
  }

  return woff2ReadyPromise;
}

function fetchRemoteBuffer(urlString, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!isHttpUrl(urlString)) {
      reject(new Error('网络字体地址只支持 http 或 https。'));
      return;
    }

    const url = new URL(urlString);
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        timeout: 20000,
        headers: {
          'User-Agent': 'font-converter/1.0'
        }
      },
      (remoteResponse) => {
        const statusCode = remoteResponse.statusCode || 0;
        const isRedirect = [301, 302, 303, 307, 308].includes(statusCode);

        if (isRedirect && remoteResponse.headers.location) {
          remoteResponse.resume();

          if (redirectCount >= 3) {
            reject(new Error('网络字体重定向次数过多。'));
            return;
          }

          const nextUrl = new URL(remoteResponse.headers.location, url).toString();
          fetchRemoteBuffer(nextUrl, redirectCount + 1).then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          remoteResponse.resume();
          reject(new Error(`网络字体下载失败：${statusCode} ${remoteResponse.statusMessage || ''}`.trim()));
          return;
        }

        const declaredLength = Number(remoteResponse.headers['content-length'] || 0);
        if (declaredLength > MAX_BODY_SIZE) {
          remoteResponse.resume();
          reject(new Error('网络字体文件过大，请控制在 60MB 以内。'));
          return;
        }

        const chunks = [];
        let totalSize = 0;

        remoteResponse.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > MAX_BODY_SIZE) {
            request.destroy(new Error('网络字体文件过大，请控制在 60MB 以内。'));
            return;
          }

          chunks.push(chunk);
        });

        remoteResponse.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('网络字体下载超时，请稍后重试。'));
    });
    request.on('error', reject);
    request.end();
  });
}

function getPublicRuntimeConfig() {
  return {
    cdnUpload: {
      available: CDN_UPLOAD_CONFIG.available,
      autoUploadDefault: CDN_UPLOAD_CONFIG.available && CDN_UPLOAD_CONFIG.autoUploadDefault,
      label: CDN_UPLOAD_CONFIG.label
    }
  };
}

function formatCompactDate(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function resolveCdnTemplate(template, values) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : encodeURIComponent(String(value));
  });
}

function deriveCdnFilenameFromExistingUrl(urlString, outputType) {
  if (!isHttpUrl(urlString)) {
    return '';
  }

  try {
    const url = new URL(urlString);
    const pathname = decodeURIComponent(url.pathname || '').replace(/\\/g, '/').trim();

    if (!pathname || pathname === '/' || pathname.endsWith('/')) {
      return '';
    }

    const currentExt = path.posix.extname(pathname);

    if (currentExt.toLowerCase() === `.${outputType}`) {
      return pathname;
    }

    if (currentExt) {
      return `${pathname.slice(0, -currentExt.length)}.${outputType}`;
    }

    return `${pathname}.${outputType}`;
  } catch {
    return '';
  }
}

function buildPublicUrlFromExistingUrl(urlString, filename) {
  if (!isHttpUrl(urlString) || !filename) {
    return '';
  }

  try {
    const url = new URL(urlString);
    url.pathname = filename
      .split('/')
      .map((segment, index) => (index === 0 && segment === '' ? '' : encodeURIComponent(segment)))
      .join('/');
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function renderValueTemplate(template, values) {
  if (typeof template !== 'string') {
    return template;
  }

  const exactTokenMatch = template.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
  if (exactTokenMatch) {
    return values[exactTokenMatch[1]] ?? '';
  }

  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function renderJsonTemplateValue(value, templateValues) {
  if (Array.isArray(value)) {
    return value.map((item) => renderJsonTemplateValue(item, templateValues));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, renderJsonTemplateValue(nestedValue, templateValues)])
    );
  }

  if (typeof value === 'string') {
    return renderValueTemplate(value, templateValues);
  }

  return value;
}

function buildCdnTemplateValues(result, uploadContext = {}) {
  const dateCompact = formatCompactDate();
  const uuid = randomUUID().replace(/-/g, '');
  const baseValues = {
    filename: result.outputName,
    basename: path.basename(result.outputName, path.extname(result.outputName)),
    ext: result.outputType,
    hash: result.outputHash,
    sourceHash: result.sourceHash,
    size: result.outputBytes,
    sourceBytes: result.sourceBytes,
    subsetCount: result.subsetCount,
    newSubsetCount: result.newSubsetCount,
    existingSubsetCount: result.existingSubsetCount,
    operationMode: result.operationMode,
    contentType: outputContentTypes.get(result.outputType) || 'application/octet-stream',
    publicUrl: '',
    fileBase64: result.buffer.toString('base64'),
    dateCompact,
    uuid
  };

  const renderedTemplateFilename = renderValueTemplate(CDN_UPLOAD_CONFIG.filenameTemplate, baseValues);
  const templateCdnFilename = String(renderedTemplateFilename || result.outputName)
    .trim()
    .replace(/\\/g, '/');
  const existingCdnFilename =
    result.operationMode === 'incremental'
      ? deriveCdnFilenameFromExistingUrl(uploadContext.existingSubsetUrl || '', result.outputType)
      : '';
  const requestedFilenameMode = uploadContext.cdnFilenameMode === 'existing' ? 'existing' : 'template';
  const cdnFilenameMode =
    requestedFilenameMode === 'existing' && existingCdnFilename ? 'existing' : 'template';
  const cdnFilename = cdnFilenameMode === 'existing' ? existingCdnFilename : templateCdnFilename;
  const cdnBasename = path.posix.basename(cdnFilename);
  const rawCdnDirname = path.posix.dirname(cdnFilename);

  return {
    ...baseValues,
    cdnFilenameMode,
    templateCdnFilename,
    existingCdnFilename,
    cdnFilename,
    cdnBasename,
    cdnDirname: rawCdnDirname === '.' ? '' : rawCdnDirname
  };
}

function readCdnStructuredTemplate(templateValues, label) {
  const templateText = readOptionalTemplateText({
    inlineValue: CDN_UPLOAD_CONFIG.bodyTemplate,
    filePath: CDN_UPLOAD_CONFIG.bodyTemplateFile,
    label
  }).trim();

  if (!templateText) {
    return null;
  }

  try {
    const parsed = JSON.parse(templateText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('模板必须是 JSON 对象。');
    }

    return renderJsonTemplateValue(parsed, templateValues);
  } catch (error) {
    throw new Error(
      `${label} 解析失败：${error instanceof Error ? error.message : 'JSON 无法解析。'}`
    );
  }
}

function serializeMultipartFormData(parts) {
  const boundary = `----font-converter-${randomUUID().replace(/-/g, '')}`;
  const chunks = [];

  for (const part of parts) {
    const safeName = String(part.name || '')
      .replace(/\r?\n/g, ' ')
      .replace(/"/g, '\\"');
    const headers = [`Content-Disposition: form-data; name="${safeName}"`];

    if (part.filename) {
      const safeFilename = String(part.filename)
        .replace(/\r?\n/g, ' ')
        .replace(/"/g, '\\"');
      headers[0] += `; filename="${safeFilename}"`;
    }

    if (part.contentType) {
      headers.push(`Content-Type: ${part.contentType}`);
    }

    chunks.push(Buffer.from(`--${boundary}\r\n${headers.join('\r\n')}\r\n\r\n`, 'utf8'));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value ?? ''), 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function buildCdnRequestPayload(result, templateValues) {
  if (CDN_UPLOAD_CONFIG.bodyMode === 'raw') {
    return {
      body: result.buffer,
      contentType: outputContentTypes.get(result.outputType) || 'application/octet-stream'
    };
  }

  if (CDN_UPLOAD_CONFIG.bodyMode === 'form') {
    const structuredFields =
      readCdnStructuredTemplate(templateValues, 'CDN 上传表单字段模板') || {};
    const fieldEntries = Object.entries(structuredFields).filter(
      ([fieldName, fieldValue]) =>
        fieldName &&
        fieldValue !== undefined &&
        fieldValue !== null &&
        fieldName !== (CDN_UPLOAD_CONFIG.formFileField || 'file') &&
        fieldName !== CDN_UPLOAD_CONFIG.formFilenameField
    );
    const parts = [
      {
        name: CDN_UPLOAD_CONFIG.formFileField || 'file',
        filename: templateValues.cdnBasename || result.outputName,
        contentType: outputContentTypes.get(result.outputType) || 'application/octet-stream',
        value: result.buffer
      }
    ];

    if (CDN_UPLOAD_CONFIG.formFilenameField) {
      parts.push({
        name: CDN_UPLOAD_CONFIG.formFilenameField,
        value: templateValues.cdnFilename
      });
    }

    for (const [fieldName, fieldValue] of fieldEntries) {
      const value =
        typeof fieldValue === 'string'
          ? fieldValue
          : typeof fieldValue === 'number' || typeof fieldValue === 'boolean'
            ? String(fieldValue)
            : JSON.stringify(fieldValue);

      parts.push({
        name: fieldName,
        value
      });
    }

    return serializeMultipartFormData(parts);
  }

  const templateText = readOptionalTemplateText({
    inlineValue: CDN_UPLOAD_CONFIG.bodyTemplate,
    filePath: CDN_UPLOAD_CONFIG.bodyTemplateFile,
    label: 'CDN upload body template'
  }).trim();

  if (!templateText) {
    throw new Error('CDN 上传已启用自定义请求体，但没有提供模板。');
  }

  if (CDN_UPLOAD_CONFIG.bodyMode === 'text') {
    return {
      body: Buffer.from(String(renderValueTemplate(templateText, templateValues)), 'utf8'),
      contentType: 'text/plain; charset=utf-8'
    };
  }

  try {
    const parsed = JSON.parse(templateText);
    const rendered = renderJsonTemplateValue(parsed, templateValues);
    return {
      body: Buffer.from(JSON.stringify(rendered), 'utf8'),
      contentType: 'application/json; charset=utf-8'
    };
  } catch (error) {
    throw new Error(
      `CDN 上传请求体模板解析失败：${error instanceof Error ? error.message : 'JSON 无法解析。'}`
    );
  }
}

function uploadBufferToUrl(urlString, { method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    if (!isHttpUrl(urlString)) {
      reject(new Error('CDN 上传地址只支持 http 或 https。'));
      return;
    }

    const url = new URL(urlString);
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method,
        timeout: timeoutMs,
        headers
      },
      (remoteResponse) => {
        const statusCode = remoteResponse.statusCode || 0;
        const chunks = [];

        remoteResponse.on('data', (chunk) => {
          chunks.push(chunk);
        });

        remoteResponse.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`CDN 上传失败（HTTP ${statusCode}）。`));
            return;
          }

          resolve({
            statusCode,
            headers: remoteResponse.headers,
            body: ''
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('CDN 上传超时。'));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function uploadResultToCdn(result, uploadContext = {}) {
  const runtime = {
    requested: true,
    available: CDN_UPLOAD_CONFIG.available,
    succeeded: false,
    publicUrl: '',
    message: '',
    filenameMode: 'template'
  };

  if (!CDN_UPLOAD_CONFIG.available) {
    runtime.message = '服务端未配置 CDN 自动上传。';
    return runtime;
  }

  const uploadValues = buildCdnTemplateValues(result, uploadContext);
  runtime.filenameMode = uploadValues.cdnFilenameMode;
  const uploadUrl = resolveCdnTemplate(CDN_UPLOAD_CONFIG.uploadUrlTemplate, uploadValues);
  const publicUrl = CDN_UPLOAD_CONFIG.publicUrlTemplate
    ? resolveCdnTemplate(CDN_UPLOAD_CONFIG.publicUrlTemplate, uploadValues)
    : uploadValues.cdnFilenameMode === 'existing'
      ? buildPublicUrlFromExistingUrl(uploadContext.existingSubsetUrl || '', uploadValues.cdnFilename)
      : '';
  const requestPayload = buildCdnRequestPayload(result, {
    ...uploadValues,
    publicUrl
  });
  const headers = {
    'Content-Type': requestPayload.contentType,
    'Content-Length': String(requestPayload.body.length),
    'User-Agent': 'font-converter/1.0',
    ...CDN_UPLOAD_CONFIG.extraHeaders
  };

  if (CDN_UPLOAD_CONFIG.authHeader && CDN_UPLOAD_CONFIG.authToken) {
    headers[CDN_UPLOAD_CONFIG.authHeader] = CDN_UPLOAD_CONFIG.authToken;
  }

  try {
    await uploadBufferToUrl(uploadUrl, {
      method: CDN_UPLOAD_CONFIG.method,
      headers,
      body: requestPayload.body,
      timeoutMs: CDN_UPLOAD_CONFIG.timeoutMs
    });

    runtime.succeeded = true;
    runtime.publicUrl = publicUrl;
    runtime.message =
      uploadValues.cdnFilenameMode === 'existing'
        ? publicUrl
          ? `已上传到 ${CDN_UPLOAD_CONFIG.label}，并沿用原文件名覆盖原地址。`
          : `已上传到 ${CDN_UPLOAD_CONFIG.label}，并沿用原文件名。`
        : publicUrl
          ? `已上传到 ${CDN_UPLOAD_CONFIG.label}，可通过公开地址访问。`
          : `已上传到 ${CDN_UPLOAD_CONFIG.label}。`;
    return runtime;
  } catch (error) {
    console.warn('CDN upload failed:', error);
    runtime.message =
      error instanceof Error && /HTTP \d+/.test(error.message)
        ? error.message
        : `${CDN_UPLOAD_CONFIG.label} 上传失败，请检查服务端配置或网络连接。`;
    return runtime;
  }
}

async function fetchRemoteFontAsPayload(urlString) {
  if (!isHttpUrl(urlString)) {
    throw new Error('网络字体地址只支持 http 或 https。');
  }

  const buffer = await fetchRemoteBuffer(urlString);

  if (!buffer.length) {
    throw new Error('网络字体文件为空，请检查链接。');
  }

  if (buffer.length > MAX_BODY_SIZE) {
    throw new Error('网络字体文件过大，请控制在 60MB 以内。');
  }

  const url = new URL(urlString);
  const filename = path.basename(url.pathname) || 'remote-subset.ttf';

  return {
    filename,
    base64Data: buffer.toString('base64')
  };
}

async function createFontFromPayload({
  filename,
  base64Data,
  subsetCodePoints,
  keepHinting = false,
  keepKerning = false
}) {
  const type = getFontType(filename);
  const sourceBuffer = Buffer.from(base64Data, 'base64');

  if (!sourceBuffer.length) {
    throw new Error('文件内容为空，请重新选择字体文件。');
  }

  if (type === 'woff2') {
    await ensureWoff2Ready();
  }

  const source = type === 'svg' ? sourceBuffer.toString('utf8') : sourceBuffer;
  const font = createFont(source, {
    type,
    subset: subsetCodePoints?.length ? subsetCodePoints : undefined,
    hinting: keepHinting,
    kerning: keepKerning,
    compound2simple: true
  });
  const fontObject = font.get();
  const subsetGlyphHintingStripped =
    keepHinting && subsetCodePoints?.length ? stripSubsetGlyphHinting(fontObject) : 0;

  if (type === 'otf') {
    repairOtfGlyphMetrics(fontObject, sourceBuffer, subsetCodePoints);
  }

  return {
    type,
    sourceBuffer,
    font,
    fontObject,
    subsetGlyphHintingStripped
  };
}

async function readRequestBody(request) {
  const chunks = [];
  let totalSize = 0;

  for await (const chunk of request) {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_SIZE) {
      throw new Error('上传文件过大，请控制在 60MB 以内。');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function convertFont({
  filename,
  base64Data,
  subsetSource,
  outputType = 'ttf',
  operationMode = 'fresh',
  existingSubsetFilename = '',
  existingSubsetData = '',
  existingSubsetUrl = '',
  keepHinting = false,
  keepKerning = false,
  optimize = true
}) {
  const normalizedOutputType = getOutputType(outputType);
  const requestedCodePoints = getSubsetCodePoints(subsetSource?.text || '');
  let existingSubsetCount = 0;
  let finalSubsetCodePoints = requestedCodePoints;

  if (operationMode === 'incremental') {
    const existingSubsetPayload =
      typeof existingSubsetUrl === 'string' && existingSubsetUrl.trim()
        ? await fetchRemoteFontAsPayload(existingSubsetUrl.trim())
        : {
            filename: existingSubsetFilename,
            base64Data: existingSubsetData
          };

    if (
      typeof existingSubsetPayload.filename !== 'string' ||
      typeof existingSubsetPayload.base64Data !== 'string'
    ) {
      throw new Error('增量更新模式缺少当前子集字体文件。');
    }

    const existingSubset = await createFontFromPayload({
      filename: existingSubsetPayload.filename,
      base64Data: existingSubsetPayload.base64Data,
      keepHinting: true,
      keepKerning: true
    });
    const existingCodePoints = extractCmapCodePoints(existingSubset.fontObject);

    if (!existingCodePoints.length) {
      throw new Error('当前子集字体里没有可识别字符，无法进行增量更新。');
    }

    existingSubsetCount = existingCodePoints.length;
    finalSubsetCodePoints = mergeCodePoints(existingCodePoints, requestedCodePoints);
  }

  const { sourceBuffer, font, fontObject, subsetGlyphHintingStripped } = await createFontFromPayload({
    filename,
    base64Data,
    subsetCodePoints: finalSubsetCodePoints,
    keepHinting,
    keepKerning
  });
  const sourceFeatures = inspectFontFeatures(fontObject);
  const removedKerningTables = !keepKerning ? stripKerningTables(fontObject) : [];
  const outputFeatures = inspectFontFeatures(fontObject);

  const shouldOptimize =
    optimize && !subsetIncludesEmptyAdvanceGlyph(fontObject, finalSubsetCodePoints);

  if (shouldOptimize) {
    font.optimize();
  }

  if (normalizedOutputType === 'woff2') {
    await ensureWoff2Ready();
  }

  const output = font.write({
    type: normalizedOutputType,
    hinting: keepHinting,
    kerning: keepKerning
  });
  const outputBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output);

  const baseName = sanitizeBaseName(filename);
  const suffix =
    operationMode === 'incremental'
      ? '-subset-update'
      : finalSubsetCodePoints.length
        ? '-subset'
        : optimize || !keepHinting || !keepKerning
          ? '-slim'
          : '';

  return {
    buffer: outputBuffer,
    outputName: `${baseName}${suffix}.${normalizedOutputType}`,
    outputType: normalizedOutputType,
    sourceHash: hashBuffer(sourceBuffer),
    outputHash: hashBuffer(outputBuffer),
    sourceBytes: sourceBuffer.length,
    outputBytes: outputBuffer.length,
    subsetGlyphHintingStripped,
    removedKerningTables,
    subsetCount: finalSubsetCodePoints.length,
    newSubsetCount: requestedCodePoints.length,
    existingSubsetCount,
    subsetSourceLabel: subsetSource?.label || '完整字体',
    subsetSourceMode: subsetSource?.mode || 'full',
    operationMode,
    keepHinting,
    keepKerning,
    sourceFeatures,
    outputFeatures
  };
}

async function handleConvert(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const {
      filename = '',
      data = '',
      sourceFontHash = '',
      operationMode = 'fresh',
      existingSubsetFilename = '',
      existingSubsetData = '',
      existingSubsetUrl = '',
      outputType = 'ttf',
      subsetMode,
      presetId,
      subsetText = '',
      charsetFileText = '',
      keepHinting = false,
      keepKerning = false,
      uploadToCdn = false,
      cdnFilenameMode = 'template',
      optimize = true
    } = JSON.parse(rawBody);

    let sourcePayload;
    let sourceRecordState = null;

    if (typeof sourceFontHash === 'string' && sourceFontHash.trim()) {
      const savedPayload = await getSourceFontPayload(sourceFontHash.trim());
      sourcePayload = {
        filename: savedPayload.filename,
        base64Data: savedPayload.base64Data
      };
      const reusedRecord = await touchSourceFont(savedPayload.record.sourceHash);
      sourceRecordState = reusedRecord
        ? {
            action: 'reused',
            record: reusedRecord
          }
        : null;
    } else if (typeof filename === 'string' && typeof data === 'string' && filename && data) {
      sourcePayload = {
        filename,
        base64Data: data
      };
    } else {
      sendJson(response, 400, { error: '请求体缺少原始字体文件或 sourceFontHash。' });
      return;
    }

    const subsetSource = await resolveSubsetSource({
      subsetMode,
      presetId,
      subsetText: typeof subsetText === 'string' ? subsetText : '',
      charsetFileText: typeof charsetFileText === 'string' ? charsetFileText : ''
    });

    const result = await convertFont({
      filename: sourcePayload.filename,
      base64Data: sourcePayload.base64Data,
      subsetSource,
      outputType,
      operationMode: operationMode === 'incremental' ? 'incremental' : 'fresh',
      existingSubsetFilename:
        typeof existingSubsetFilename === 'string' ? existingSubsetFilename : '',
      existingSubsetData: typeof existingSubsetData === 'string' ? existingSubsetData : '',
      existingSubsetUrl: typeof existingSubsetUrl === 'string' ? existingSubsetUrl : '',
      keepHinting: Boolean(keepHinting),
      keepKerning: Boolean(keepKerning),
      optimize: optimize !== false
    });
    sourceRecordState =
      sourceRecordState ||
      (await saveSourceFontPayload({
        filename: sourcePayload.filename,
        base64Data: sourcePayload.base64Data
      }));
    const subsetMatchState = await saveSubsetSourceMatch({
      subsetHash: result.outputHash,
      sourceHash: sourceRecordState.record.sourceHash,
      outputName: result.outputName,
      outputBytes: result.outputBytes
    });
    const cdnUpload =
      uploadToCdn === true || uploadToCdn === 'true'
        ? await uploadResultToCdn(result, {
            existingSubsetUrl: typeof existingSubsetUrl === 'string' ? existingSubsetUrl : '',
            cdnFilenameMode: typeof cdnFilenameMode === 'string' ? cdnFilenameMode : 'template'
          })
        : {
            requested: false,
            available: CDN_UPLOAD_CONFIG.available,
            succeeded: false,
            publicUrl: '',
            message: '',
            filenameMode: 'template'
          };

    response.writeHead(200, {
      'Content-Type': outputContentTypes.get(result.outputType) || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.outputName)}"`,
      'Content-Length': result.buffer.length,
      'X-Source-Bytes': String(result.sourceBytes),
      'X-Output-Bytes': String(result.outputBytes),
      'X-Output-Type': result.outputType,
      'X-Source-Hash': sourceRecordState.record.sourceHash,
      'X-Output-Hash': result.outputHash,
      'X-Server-Source-Saved': String(
        sourceRecordState.action === 'created' || sourceRecordState.action === 'updated'
      ),
      'X-Server-Source-Action': sourceRecordState.action,
      'X-Server-Match-Saved': String(subsetMatchState?.action === 'created'),
      'X-Server-Match-Action': subsetMatchState?.action || 'updated',
      'X-Subset-Count': String(result.subsetCount),
      'X-New-Subset-Count': String(result.newSubsetCount),
      'X-Existing-Subset-Count': String(result.existingSubsetCount),
      'X-Operation-Mode': result.operationMode,
      'X-Subset-Source-Mode': result.subsetSourceMode,
      'X-Subset-Source-Label': encodeURIComponent(result.subsetSourceLabel),
      'X-Keep-Hinting': String(result.keepHinting),
      'X-Keep-Kerning': String(result.keepKerning),
      'X-Source-Has-Hinting': String(result.sourceFeatures.hasHintingData),
      'X-Source-Has-Kerning': String(result.sourceFeatures.hasKerningData),
      'X-Output-Has-Hinting': String(result.outputFeatures.hasHintingData),
      'X-Output-Has-Kerning': String(result.outputFeatures.hasKerningData),
      'X-Removed-Kerning-Tables': result.removedKerningTables.join(','),
      'X-Subset-Glyph-Hinting-Stripped': String(result.subsetGlyphHintingStripped || 0),
      'X-Source-Glyph-Count': String(result.sourceFeatures.glyphCount),
      'X-Source-Hinting-Tables': result.sourceFeatures.hintingTables.join(','),
      'X-Source-Kerning-Tables': result.sourceFeatures.kerningTables.join(','),
      'X-Cdn-Upload-Available': String(cdnUpload.available),
      'X-Cdn-Upload-Requested': String(cdnUpload.requested),
      'X-Cdn-Upload-Succeeded': String(cdnUpload.succeeded),
      'X-Cdn-Upload-Label': encodeURIComponent(CDN_UPLOAD_CONFIG.label),
      'X-Cdn-Upload-Url': encodeURIComponent(cdnUpload.publicUrl),
      'X-Cdn-Upload-Message': encodeURIComponent(cdnUpload.message),
      'X-Cdn-Upload-Filename-Mode': cdnUpload.filenameMode
    });
    response.end(result.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : '字体转换失败。';
    const statusCode = /缺少|为空|支持|过大|格式|输出|未找到/.test(message) ? 400 : 500;
    sendJson(response, statusCode, { error: message });
  }
}

async function handleFontFingerprint(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const { url = '' } = JSON.parse(rawBody);

    if (typeof url !== 'string' || !url.trim()) {
      sendJson(response, 400, { error: '请求体缺少 url 字段。' });
      return;
    }

    const remotePayload = await fetchRemoteFontAsPayload(url.trim());
    const buffer = Buffer.from(remotePayload.base64Data, 'base64');

    sendJson(response, 200, {
      filename: remotePayload.filename,
      bytes: buffer.length,
      hash: hashBuffer(buffer)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '字体指纹计算失败。';
    const statusCode = /缺少|为空|支持|过大|地址|下载失败/.test(message) ? 400 : 500;
    sendJson(response, statusCode, { error: message });
  }
}

async function handleFontPreview(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const { filename = '', data = '', url = '', sourceFontHash = '', includeData = true } = JSON.parse(rawBody);
    const fontPayload =
      typeof sourceFontHash === 'string' && sourceFontHash.trim()
        ? await getSourceFontPayload(sourceFontHash.trim())
        : typeof url === 'string' && url.trim()
        ? await fetchRemoteFontAsPayload(url.trim())
        : {
            filename,
            base64Data: data
          };

    if (typeof fontPayload.filename !== 'string' || typeof fontPayload.base64Data !== 'string') {
      sendJson(response, 400, { error: '请求体缺少字体文件或字体 URL。' });
      return;
    }

    const { type, sourceBuffer, fontObject } = await createFontFromPayload({
      filename: fontPayload.filename,
      base64Data: fontPayload.base64Data,
      keepHinting: true,
      keepKerning: true
    });
    const codePoints = extractCmapCodePoints(fontObject);
    const sourceFeatures = inspectFontFeatures(fontObject);

    sendJson(response, 200, {
      filename: fontPayload.filename,
      type,
      bytes: sourceBuffer.length,
      sourceHash: hashBuffer(sourceBuffer),
      glyphCount: sourceFeatures.glyphCount,
      count: codePoints.length,
      codePoints,
      characters: codePointsToText(codePoints),
      hasHintingData: sourceFeatures.hasHintingData,
      hasKerningData: sourceFeatures.hasKerningData,
      hintingTables: sourceFeatures.hintingTables,
      kerningTables: sourceFeatures.kerningTables,
      base64Data: includeData === false ? '' : fontPayload.base64Data
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '字体预览解析失败。';
    const statusCode = /缺少|为空|支持|过大|地址|下载失败|格式/.test(message) ? 400 : 500;
    sendJson(response, statusCode, { error: message });
  }
}

async function handleListSourceFonts(response) {
  try {
    const library = await readFontLibrary();
    sendJson(response, 200, {
      sources: library.sources.map(publicSourceRecord)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '原始字体列表读取失败。';
    sendJson(response, 500, { error: message });
  }
}

async function handleDeleteSourceFont(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const { sourceHash = '' } = JSON.parse(rawBody);

    if (typeof sourceHash !== 'string' || !sourceHash.trim()) {
      sendJson(response, 400, { error: '请求体缺少 sourceHash 字段。' });
      return;
    }

    const record = await deleteSourceFont(sourceHash.trim());
    sendJson(response, 200, {
      source: publicSourceRecord(record)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '原始字体移除失败。';
    const statusCode = /缺少|未找到/.test(message) ? 400 : 500;
    sendJson(response, statusCode, { error: message });
  }
}

async function handleSourceMatch(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const { subsetHash = '' } = JSON.parse(rawBody);

    if (typeof subsetHash !== 'string' || !subsetHash.trim()) {
      sendJson(response, 400, { error: '请求体缺少 subsetHash 字段。' });
      return;
    }

    const result = await getSubsetSourceMatch(subsetHash.trim());

    sendJson(response, 200, {
      match: result
        ? {
            subsetHash: result.match.subsetHash,
            outputName: result.match.outputName,
            outputBytes: result.match.outputBytes,
            savedAt: result.match.savedAt,
            lastUsedAt: result.match.lastUsedAt
          }
        : null,
      source: result ? publicSourceRecord(result.source) : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '原始字体匹配失败。';
    const statusCode = /缺少|未找到/.test(message) ? 400 : 500;
    sendJson(response, statusCode, { error: message });
  }
}

async function handleStatic(requestPath, response) {
  const filePath = getStaticFilePath(requestPath);

  if (!filePath) {
    sendJson(response, 403, { error: '非法路径。' });
    return;
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      'Content-Type': mimeTypes.get(extension) || 'application/octet-stream'
    });
    response.end(fileBuffer);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      sendJson(response, 404, { error: '页面不存在。' });
      return;
    }

    sendJson(response, 500, { error: '静态文件读取失败。' });
  }
}

const server = createServer(async (request, response) => {
  const method = request.method || 'GET';
  const requestUrl = new URL(request.url || '/', `http://${HOST}:${PORT}`);

  if (method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      supportedTypes: Array.from(supportedTypes),
      writableTypes: Array.from(writableTypes),
      ...getPublicRuntimeConfig()
    });
    return;
  }

  if (method === 'GET' && requestUrl.pathname === '/api/charsets') {
    sendJson(response, 200, {
      presets: listCharsetPresets()
    });
    return;
  }

  if (method === 'GET' && requestUrl.pathname === '/api/source-fonts') {
    await handleListSourceFonts(response);
    return;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/convert') {
    await handleConvert(request, response);
    return;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/source-fonts/delete') {
    await handleDeleteSourceFont(request, response);
    return;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/source-match') {
    await handleSourceMatch(request, response);
    return;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/font-fingerprint') {
    await handleFontFingerprint(request, response);
    return;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/font-preview') {
    await handleFontPreview(request, response);
    return;
  }

  if (method === 'GET') {
    await handleStatic(requestUrl.pathname, response);
    return;
  }

  sendJson(response, 405, { error: '请求方法不受支持。' });
});

server.listen(PORT, HOST, () => {
  console.log(`Font converter is running at http://${HOST}:${PORT}`);
});

export { HOST, PORT, server };
