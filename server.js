import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
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
const MAX_CDN_RESPONSE_SIZE = 1024 * 1024;
const CDN_RESPONSE_TTL_MS = 10 * 60 * 1000;
const MAX_STORED_CDN_RESPONSES = 20;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const CHARSET_DIR = path.join(APP_DIR, 'charsets');
const DATA_DIR = resolveDataDir();
const SOURCE_FONT_DIR = path.join(DATA_DIR, 'source-fonts');
const SOURCE_META_DIR = path.join(DATA_DIR, 'source-metadata');
const SUBSET_MATCH_DIR = path.join(DATA_DIR, 'subset-matches');
const FONT_LIBRARY_FILE = path.join(DATA_DIR, 'font-library.json');
const REPOSITORY_LIBRARY_FILE = 'font-library.json';
const repositoryStorageContext = new AsyncLocalStorage();
const cdnUploadResponses = new Map();

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
const REPOSITORY_STORAGE_CONFIG = createRepositoryStorageConfig();
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

function resolveDataDir() {
  const configured = getEnvString('FONT_DATA_DIR');
  return configured ? path.resolve(APP_DIR, configured) : path.join(APP_DIR, 'data');
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
    formFilenameField: getEnvString('CDN_UPLOAD_FORM_FILENAME_FIELD'),
    responseUrlPath: getEnvString('CDN_RESPONSE_URL_PATH')
  };
}

function normalizeCdnExtraHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const blockedHeaders = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, headerValue]) => {
        const normalizedKey = String(key || '').trim();
        return (
          normalizedKey &&
          /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(normalizedKey) &&
          !blockedHeaders.has(normalizedKey.toLowerCase()) &&
          headerValue !== undefined &&
          headerValue !== null &&
          !/[\r\n]/.test(String(headerValue))
        );
      })
      .map(([key, headerValue]) => [String(key).trim(), String(headerValue)])
  );
}

function normalizeClientCdnUploadConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return CDN_UPLOAD_CONFIG;
  }

  const uploadUrlTemplate =
    typeof value.uploadUrlTemplate === 'string' ? value.uploadUrlTemplate.trim() : '';
  if (!uploadUrlTemplate) {
    throw new Error('页面 CDN 配置缺少上传地址模板。');
  }
  if (!/^https?:\/\//i.test(uploadUrlTemplate)) {
    throw new Error('CDN 上传地址模板必须以 http:// 或 https:// 开头。');
  }

  const method = typeof value.method === 'string' ? value.method.toUpperCase() : 'PUT';
  const bodyMode = typeof value.bodyMode === 'string' ? value.bodyMode.toLowerCase() : 'raw';
  const authHeader = typeof value.authHeader === 'string' ? value.authHeader.trim() : '';
  const authToken = typeof value.authToken === 'string' ? value.authToken : '';
  const blockedAuthHeaders = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);
  if (authHeader && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(authHeader)) {
    throw new Error('CDN 鉴权请求头名称不合法。');
  }
  if (blockedAuthHeaders.has(authHeader.toLowerCase())) {
    throw new Error('CDN 鉴权请求头不能使用 Host、Content-Length 等连接控制字段。');
  }
  if (/[\r\n]/.test(authToken)) {
    throw new Error('CDN 鉴权内容不能包含换行。');
  }

  const timeoutMs = Number(value.timeoutMs);
  return {
    available: true,
    uploadUrlTemplate,
    publicUrlTemplate:
      typeof value.publicUrlTemplate === 'string' ? value.publicUrlTemplate.trim() : '',
    label:
      typeof value.label === 'string' && value.label.trim() ? value.label.trim() : 'CDN',
    method: ['PUT', 'POST'].includes(method) ? method : 'PUT',
    authHeader,
    authToken,
    extraHeaders: normalizeCdnExtraHeaders(value.extraHeaders),
    autoUploadDefault: false,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 120000 ? timeoutMs : 20000,
    bodyMode: ['raw', 'json', 'text', 'form'].includes(bodyMode) ? bodyMode : 'raw',
    bodyTemplate: typeof value.bodyTemplate === 'string' ? value.bodyTemplate : '',
    bodyTemplateFile: '',
    filenameTemplate:
      typeof value.filenameTemplate === 'string' && value.filenameTemplate.trim()
        ? value.filenameTemplate.trim()
        : '{{filename}}',
    formFileField:
      typeof value.formFileField === 'string' && value.formFileField.trim()
        ? value.formFileField.trim()
        : 'file',
    formFilenameField:
      typeof value.formFilenameField === 'string' ? value.formFilenameField.trim() : '',
    responseUrlPath:
      typeof value.responseUrlPath === 'string' ? value.responseUrlPath.trim() : ''
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

function decodeRepositoryHeader(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

function parseRepositoryUrl(value) {
  const normalized = value.trim().replace(/^git@(github\.com|gitee\.com):/i, 'https://$1/');
  let url;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error('仓库地址格式不正确，请填写 GitHub 或 Gitee 仓库地址。');
  }

  const hostname = url.hostname.toLowerCase();
  const provider = hostname === 'github.com' ? 'github' : hostname === 'gitee.com' ? 'gitee' : '';
  if (!provider) {
    throw new Error('当前仅支持 github.com 和 gitee.com 仓库。');
  }

  const parts = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('仓库地址需要包含仓库所有者和仓库名。');
  }

  return {
    provider,
    owner: parts[0],
    repository: parts[1]
  };
}

function normalizeRepositoryDirectory(value) {
  const normalized = String(value || 'font-data')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
  return normalized || 'font-data';
}

function createRepositoryStorageConfig() {
  const repositoryUrl = getEnvString('FONT_REPOSITORY_URL');
  const token = getEnvString('FONT_REPOSITORY_TOKEN');
  if (!repositoryUrl) {
    return null;
  }
  if (!token) {
    console.warn('Ignoring FONT_REPOSITORY_URL because FONT_REPOSITORY_TOKEN is empty.');
    return null;
  }

  try {
    return {
      ...parseRepositoryUrl(repositoryUrl),
      repositoryUrl,
      token,
      branch: getEnvString('FONT_REPOSITORY_BRANCH'),
      directory: normalizeRepositoryDirectory(getEnvString('FONT_REPOSITORY_PATH', 'font-data'))
    };
  } catch (error) {
    console.warn('Ignoring invalid FONT_REPOSITORY_URL:', error instanceof Error ? error.message : error);
    return null;
  }
}

function getRequestRepositoryConfig(request) {
  const storageMode = decodeRepositoryHeader(request.headers['x-font-storage-mode']).toLowerCase();
  if (storageMode === 'local') {
    return null;
  }

  if (REPOSITORY_STORAGE_CONFIG) {
    return REPOSITORY_STORAGE_CONFIG;
  }
  if (storageMode === 'remote') {
    throw new Error('服务端未配置远程字体仓库环境变量。');
  }
  return null;
}

function getRepositoryConfig() {
  return repositoryStorageContext.getStore() || null;
}

function encodeRepositoryPath(filePath) {
  return filePath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function getRepositoryStoragePath(relativePath, config = getRepositoryConfig()) {
  return `${config.directory}/${String(relativePath).replace(/^\/+/, '')}`;
}

function createRepositoryApiUrl(config, relativePath, includeRef = true) {
  const encodedPath = encodeRepositoryPath(getRepositoryStoragePath(relativePath, config));
  const baseUrl =
    config.provider === 'github'
      ? `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/contents/${encodedPath}`
      : `https://gitee.com/api/v5/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/contents/${encodedPath}`;
  const url = new URL(baseUrl);

  if (includeRef && config.branch) {
    url.searchParams.set('ref', config.branch);
  }
  if (config.provider === 'gitee') {
    url.searchParams.set('access_token', config.token);
  }

  return url;
}

function createRepositoryInfoUrl(config) {
  const baseUrl =
    config.provider === 'github'
      ? `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`
      : `https://gitee.com/api/v5/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`;
  const url = new URL(baseUrl);
  if (config.provider === 'gitee') {
    url.searchParams.set('access_token', config.token);
  }
  return url;
}

function requestRepositoryApi(config, url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      'User-Agent': 'font-converter/1.0',
      Accept: 'application/json',
      ...headers
    };
    if (config.provider === 'github') {
      requestHeaders.Authorization = `Bearer ${config.token}`;
      requestHeaders['X-GitHub-Api-Version'] = '2022-11-28';
    }
    if (body) {
      requestHeaders['Content-Type'] = 'application/json; charset=utf-8';
      requestHeaders['Content-Length'] = String(body.length);
    }

    const remoteRequest = httpsRequest(
      url,
      { method, timeout: 30000, headers: requestHeaders },
      (remoteResponse) => {
        const chunks = [];
        let totalSize = 0;
        const responseLimit = Math.ceil((MAX_BODY_SIZE * 4) / 3) + 2 * 1024 * 1024;

        remoteResponse.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > responseLimit) {
            remoteRequest.destroy(new Error('仓库返回的文件过大，请控制在 60MB 以内。'));
            return;
          }
          chunks.push(chunk);
        });
        remoteResponse.on('end', () => {
          resolve({
            statusCode: remoteResponse.statusCode || 0,
            statusMessage: remoteResponse.statusMessage || '',
            headers: remoteResponse.headers,
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );

    remoteRequest.on('timeout', () => remoteRequest.destroy(new Error('连接字体仓库超时。')));
    remoteRequest.on('error', reject);
    remoteRequest.end(body || undefined);
  });
}

function parseRepositoryApiPayload(result) {
  if (!result.buffer.length) {
    return {};
  }

  try {
    return JSON.parse(result.buffer.toString('utf8'));
  } catch {
    throw new Error(`字体仓库返回了无法解析的数据（HTTP ${result.statusCode}）。`);
  }
}

function getRepositoryApiError(result, fallback) {
  let detail = '';
  try {
    const payload = JSON.parse(result.buffer.toString('utf8'));
    detail = payload?.message || payload?.error || '';
  } catch {
    detail = '';
  }

  if (result.statusCode === 401 || result.statusCode === 403) {
    return new Error('仓库鉴权失败，请检查 Token 权限。');
  }
  if (result.statusCode === 404) {
    return new Error('仓库或分支不存在，或者 Token 无权访问。');
  }
  return new Error(`${fallback}（HTTP ${result.statusCode}${detail ? `：${detail}` : ''}）。`);
}

async function verifyRepositoryAccess() {
  const config = getRepositoryConfig();
  const repositoryResult = await requestRepositoryApi(config, createRepositoryInfoUrl(config));
  if (repositoryResult.statusCode < 200 || repositoryResult.statusCode >= 300) {
    throw getRepositoryApiError(repositoryResult, '字体仓库连接失败');
  }

  if (!config.branch) {
    return;
  }

  const branchUrl = createRepositoryInfoUrl(config);
  branchUrl.pathname += `/branches/${encodeURIComponent(config.branch)}`;
  const branchResult = await requestRepositoryApi(config, branchUrl);
  if (branchResult.statusCode < 200 || branchResult.statusCode >= 300) {
    if (branchResult.statusCode === 404) {
      throw new Error(`仓库中不存在分支 ${config.branch}。`);
    }
    throw getRepositoryApiError(branchResult, '仓库分支读取失败');
  }
}

async function readRepositoryFile(relativePath, { missingAllowed = false } = {}) {
  const config = getRepositoryConfig();
  const url = createRepositoryApiUrl(config, relativePath);
  const result = await requestRepositoryApi(config, url);

  if (result.statusCode === 404 && missingAllowed) {
    return null;
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw getRepositoryApiError(result, '字体仓库文件读取失败');
  }

  const payload = parseRepositoryApiPayload(result);
  let buffer = null;
  if (typeof payload.content === 'string' && payload.content) {
    buffer = Buffer.from(payload.content.replace(/\s/g, ''), 'base64');
  } else if (config.provider === 'github') {
    const rawResult = await requestRepositoryApi(config, url, {
      headers: { Accept: 'application/vnd.github.raw' }
    });
    if (rawResult.statusCode < 200 || rawResult.statusCode >= 300) {
      throw getRepositoryApiError(rawResult, '字体仓库文件下载失败');
    }
    buffer = rawResult.buffer;
  }

  if (!buffer) {
    throw new Error('字体仓库没有返回文件内容。');
  }

  return { buffer, sha: typeof payload.sha === 'string' ? payload.sha : '' };
}

async function writeRepositoryFile(relativePath, buffer, message) {
  const config = getRepositoryConfig();
  const existing = await readRepositoryFile(relativePath, { missingAllowed: true });
  const url = createRepositoryApiUrl(config, relativePath, false);
  const payload = {
    message,
    content: buffer.toString('base64')
  };
  if (existing?.sha) payload.sha = existing.sha;
  if (config.branch) payload.branch = config.branch;
  if (config.provider === 'gitee') payload.access_token = config.token;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const method = config.provider === 'gitee' && !existing ? 'POST' : 'PUT';
  const result = await requestRepositoryApi(config, url, { method, body });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw getRepositoryApiError(result, '字体仓库文件写入失败');
  }
}

async function deleteRepositoryFile(relativePath, message) {
  const config = getRepositoryConfig();
  const existing = await readRepositoryFile(relativePath, { missingAllowed: true });
  if (!existing) return;

  const url = createRepositoryApiUrl(config, relativePath, false);
  const payload = { message, sha: existing.sha };
  if (config.branch) payload.branch = config.branch;
  if (config.provider === 'gitee') payload.access_token = config.token;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const result = await requestRepositoryApi(config, url, { method: 'DELETE', body });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw getRepositoryApiError(result, '字体仓库文件删除失败');
  }
}

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function sanitizeBaseName(filename) {
  const raw = path.basename(filename, path.extname(filename));
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'converted-font';
}

function sanitizeRecoveredSourceName(name, sourceHash, sourceType) {
  const fallbackName = `${sourceHash}.${sourceType}`;
  if (typeof name !== 'string' || !name.trim()) {
    return fallbackName;
  }

  const basename = path.basename(name.trim());
  const cleaned = basename.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').trim();

  if (!cleaned) {
    return fallbackName;
  }

  const expectedExtension = `.${sourceType.toLowerCase()}`;
  return cleaned.toLowerCase().endsWith(expectedExtension) ? cleaned : `${cleaned}${expectedExtension}`;
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

function normalizeFontLibrary(library) {
  return {
    ...createEmptyFontLibrary(),
    ...(library && typeof library === 'object' ? library : {}),
    sources: Array.isArray(library?.sources) ? library.sources : [],
    subsetMatches: Array.isArray(library?.subsetMatches) ? library.subsetMatches : []
  };
}

function publicSourceRecord(record) {
  return {
    sourceHash: record.sourceHash,
    sourceName: record.sourceName,
    alias: record.alias || '',
    sourceSize: record.sourceSize,
    sourceType: record.sourceType,
    savedAt: record.savedAt,
    lastUsedAt: record.lastUsedAt || record.savedAt
  };
}

function normalizeSourceAlias(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function ensureFontLibraryStorage() {
  await fs.mkdir(SOURCE_FONT_DIR, { recursive: true });
  await fs.mkdir(SOURCE_META_DIR, { recursive: true });
  await fs.mkdir(SUBSET_MATCH_DIR, { recursive: true });
}

function isMissingFileError(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function getSourceMetadataPath(sourceHash) {
  return path.join(SOURCE_META_DIR, `${sourceHash}.json`);
}

function getSubsetMatchMetadataPath(subsetHash) {
  return path.join(SUBSET_MATCH_DIR, `${subsetHash}.json`);
}

async function readJsonFile(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    console.warn(`Failed to read ${label}:`, error);
    return null;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeTimestamp(value, fallback = 0) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeSourceRecord(record, fallback = {}) {
  const sourceHash = typeof record?.sourceHash === 'string' && record.sourceHash.trim()
    ? record.sourceHash.trim().toLowerCase()
    : typeof fallback.sourceHash === 'string'
      ? fallback.sourceHash
      : '';
  const sourceType =
    typeof record?.sourceType === 'string' && supportedTypes.has(record.sourceType.toLowerCase())
      ? record.sourceType.toLowerCase()
      : typeof fallback.sourceType === 'string'
        ? fallback.sourceType
        : '';

  if (!sourceHash || !sourceType) {
    return null;
  }

  const storedFilename =
    typeof record?.storedFilename === 'string' && record.storedFilename.trim()
      ? record.storedFilename.trim()
      : typeof fallback.storedFilename === 'string'
        ? fallback.storedFilename
        : `${sourceHash}.${sourceType}`;
  const sourceSize = Number.isFinite(Number(record?.sourceSize))
    ? Number(record.sourceSize)
    : Number.isFinite(Number(fallback.sourceSize))
      ? Number(fallback.sourceSize)
      : 0;
  const savedAt = normalizeTimestamp(record?.savedAt, normalizeTimestamp(fallback.savedAt));
  const lastUsedAt = normalizeTimestamp(record?.lastUsedAt, savedAt || normalizeTimestamp(fallback.lastUsedAt));

  return {
    sourceHash,
    sourceName: sanitizeRecoveredSourceName(
      record?.sourceName || fallback.sourceName || '',
      sourceHash,
      sourceType
    ),
    alias: normalizeSourceAlias(record?.alias ?? fallback.alias ?? ''),
    sourceSize,
    sourceType,
    storedFilename,
    savedAt,
    lastUsedAt
  };
}

function normalizeSubsetMatchRecord(record) {
  const subsetHash =
    typeof record?.subsetHash === 'string' && record.subsetHash.trim()
      ? record.subsetHash.trim().toLowerCase()
      : '';
  const sourceHash =
    typeof record?.sourceHash === 'string' && record.sourceHash.trim()
      ? record.sourceHash.trim().toLowerCase()
      : '';

  if (!subsetHash || !sourceHash) {
    return null;
  }

  const savedAt = normalizeTimestamp(record?.savedAt);

  return {
    subsetHash,
    sourceHash,
    outputName: typeof record?.outputName === 'string' ? record.outputName : '',
    outputBytes: Number.isFinite(Number(record?.outputBytes)) ? Number(record.outputBytes) : 0,
    savedAt,
    lastUsedAt: normalizeTimestamp(record?.lastUsedAt, savedAt)
  };
}

function sameSourceRecord(left, right) {
  return (
    left?.sourceHash === right?.sourceHash &&
    left?.sourceName === right?.sourceName &&
    (left?.alias || '') === (right?.alias || '') &&
    Number(left?.sourceSize || 0) === Number(right?.sourceSize || 0) &&
    left?.sourceType === right?.sourceType &&
    left?.storedFilename === right?.storedFilename &&
    Number(left?.savedAt || 0) === Number(right?.savedAt || 0) &&
    Number(left?.lastUsedAt || 0) === Number(right?.lastUsedAt || 0)
  );
}

function sameSubsetMatchRecord(left, right) {
  return (
    left?.subsetHash === right?.subsetHash &&
    left?.sourceHash === right?.sourceHash &&
    left?.outputName === right?.outputName &&
    Number(left?.outputBytes || 0) === Number(right?.outputBytes || 0) &&
    Number(left?.savedAt || 0) === Number(right?.savedAt || 0) &&
    Number(left?.lastUsedAt || 0) === Number(right?.lastUsedAt || 0)
  );
}

function parseStoredSourceHash(storedFilename) {
  const candidate = path.basename(storedFilename, path.extname(storedFilename)).toLowerCase();
  return /^[a-f0-9]{64}$/.test(candidate) ? candidate : '';
}

function pickFontDisplayName(fontObject) {
  const names = fontObject?.name || {};

  for (const value of [
    names.fullName,
    names.fontFamily,
    names.preferredFamily,
    names.postScriptName
  ]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

async function inspectStoredSourceName(filePath, sourceType, sourceHash, cachedBuffer = null) {
  try {
    const sourceBuffer = cachedBuffer || (await fs.readFile(filePath));
    if (!sourceBuffer.length) {
      return '';
    }

    if (sourceType === 'woff2') {
      await ensureWoff2Ready();
    }

    const source = sourceType === 'svg' ? sourceBuffer.toString('utf8') : sourceBuffer;
    const font = createFont(source, {
      type: sourceType,
      compound2simple: false
    });
    const fontName = pickFontDisplayName(font.get());
    return sanitizeRecoveredSourceName(fontName, sourceHash, sourceType);
  } catch (error) {
    console.warn(`Failed to inspect stored source font ${path.basename(filePath)}:`, error);
    return '';
  }
}

function sortSourceRecords(records) {
  return [...records].sort((left, right) => {
    const timeDelta = Number(right.savedAt || 0) - Number(left.savedAt || 0);
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return String(left.sourceName || '').localeCompare(String(right.sourceName || ''), 'zh-Hans-CN');
  });
}

function sortSubsetMatchRecords(records) {
  return [...records].sort((left, right) => {
    const lastUsedDelta = Number(right.lastUsedAt || 0) - Number(left.lastUsedAt || 0);
    if (lastUsedDelta !== 0) {
      return lastUsedDelta;
    }

    return String(left.outputName || '').localeCompare(String(right.outputName || ''), 'zh-Hans-CN');
  });
}

async function persistSourceMetadataRecords(records) {
  for (const record of records) {
    await writeJsonFile(getSourceMetadataPath(record.sourceHash), record);
  }
}

async function persistSubsetMatchMetadataRecords(records) {
  for (const record of records) {
    await writeJsonFile(getSubsetMatchMetadataPath(record.subsetHash), record);
  }
}

async function syncSourceRecords(existingRecords) {
  const normalizedExisting = Array.isArray(existingRecords)
    ? existingRecords
        .map((record) => normalizeSourceRecord(record))
        .filter(Boolean)
    : [];
  const existingByHash = new Map(normalizedExisting.map((record) => [record.sourceHash, record]));
  const entries = await fs.readdir(SOURCE_FONT_DIR, { withFileTypes: true });
  const records = [];
  const seenHashes = new Set();
  let changed = false;

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const sourceType = path.extname(entry.name).slice(1).toLowerCase();
    if (!supportedTypes.has(sourceType)) {
      continue;
    }

    const filePath = path.join(SOURCE_FONT_DIR, entry.name);
    const stat = await fs.stat(filePath);
    let sourceHash = parseStoredSourceHash(entry.name);
    let sourceBuffer = null;

    if (!sourceHash) {
      sourceBuffer = await fs.readFile(filePath);
      sourceHash = hashBuffer(sourceBuffer);
    }

    if (seenHashes.has(sourceHash)) {
      changed = true;
      continue;
    }

    const existingRecord = existingByHash.get(sourceHash) || null;
    const metadataRecord = normalizeSourceRecord(
      await readJsonFile(getSourceMetadataPath(sourceHash), `source metadata ${sourceHash}`)
    );
    let sourceName =
      sanitizeRecoveredSourceName(
        existingRecord?.sourceName || metadataRecord?.sourceName || '',
        sourceHash,
        sourceType
      ) || '';

    if (!sourceName || sourceName === `${sourceHash}.${sourceType}`) {
      const inspectedName = await inspectStoredSourceName(filePath, sourceType, sourceHash, sourceBuffer);
      if (inspectedName) {
        sourceName = inspectedName;
      }
    }

    const record = normalizeSourceRecord(
      {
        sourceHash,
        sourceName,
        alias: existingRecord?.alias || metadataRecord?.alias || '',
        sourceSize: stat.size,
        sourceType,
        storedFilename: entry.name,
        savedAt: existingRecord?.savedAt || metadataRecord?.savedAt || stat.birthtimeMs || stat.mtimeMs,
        lastUsedAt:
          existingRecord?.lastUsedAt || metadataRecord?.lastUsedAt || existingRecord?.savedAt || stat.mtimeMs
      },
      {
        sourceHash,
        sourceType,
        storedFilename: entry.name
      }
    );

    if (!record) {
      continue;
    }

    if (!sameSourceRecord(existingRecord, record) || !sameSourceRecord(metadataRecord, record)) {
      changed = true;
    }

    records.push(record);
    seenHashes.add(sourceHash);
  }

  if (normalizedExisting.some((record) => !seenHashes.has(record.sourceHash))) {
    changed = true;
  }

  const sortedRecords = sortSourceRecords(records);
  return { records: sortedRecords, changed };
}

function preferSubsetMatchRecord(currentRecord, nextRecord) {
  if (!currentRecord) {
    return nextRecord;
  }

  const currentScore = Number(currentRecord.lastUsedAt || currentRecord.savedAt || 0);
  const nextScore = Number(nextRecord.lastUsedAt || nextRecord.savedAt || 0);

  return nextScore >= currentScore ? nextRecord : currentRecord;
}

async function syncSubsetMatchRecords(existingRecords, validSourceHashes) {
  const recordMap = new Map();
  const normalizedExisting = Array.isArray(existingRecords)
    ? existingRecords
        .map((record) => normalizeSubsetMatchRecord(record))
        .filter(Boolean)
    : [];
  let changed = false;

  for (const record of normalizedExisting) {
    recordMap.set(record.subsetHash, record);
  }

  const entries = await fs.readdir(SUBSET_MATCH_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }

    const storedRecord = normalizeSubsetMatchRecord(
      await readJsonFile(path.join(SUBSET_MATCH_DIR, entry.name), `subset match metadata ${entry.name}`)
    );

    if (!storedRecord) {
      continue;
    }

    const currentRecord = recordMap.get(storedRecord.subsetHash) || null;
    const preferredRecord = preferSubsetMatchRecord(currentRecord, storedRecord);
    recordMap.set(storedRecord.subsetHash, preferredRecord);

    if (!sameSubsetMatchRecord(currentRecord, preferredRecord)) {
      changed = true;
    }
  }

  const validRecords = [];
  for (const record of recordMap.values()) {
    if (!validSourceHashes.has(record.sourceHash)) {
      changed = true;
      continue;
    }

    validRecords.push(record);
  }

  const sortedRecords = sortSubsetMatchRecords(validRecords);
  return { records: sortedRecords, changed };
}

async function syncFontLibraryWithStorage(library) {
  const normalizedLibrary = normalizeFontLibrary(library);
  const sourceResult = await syncSourceRecords(normalizedLibrary.sources);
  const validSourceHashes = new Set(sourceResult.records.map((record) => record.sourceHash));
  const subsetResult = await syncSubsetMatchRecords(normalizedLibrary.subsetMatches, validSourceHashes);

  const syncedLibrary = {
    ...createEmptyFontLibrary(),
    ...normalizedLibrary,
    sources: sourceResult.records,
    subsetMatches: subsetResult.records
  };

  return {
    library: syncedLibrary,
    changed:
      sourceResult.changed ||
      subsetResult.changed ||
      syncedLibrary.sources.length !== normalizedLibrary.sources.length ||
      syncedLibrary.subsetMatches.length !== normalizedLibrary.subsetMatches.length
  };
}

async function readFontLibrary() {
  if (getRepositoryConfig()) {
    const stored = await readRepositoryFile(REPOSITORY_LIBRARY_FILE, { missingAllowed: true });
    if (!stored) {
      await verifyRepositoryAccess();
      return createEmptyFontLibrary();
    }

    try {
      return normalizeFontLibrary(JSON.parse(stored.buffer.toString('utf8')));
    } catch {
      throw new Error('仓库中的 font-library.json 无法解析。');
    }
  }

  await ensureFontLibraryStorage();

  try {
    const raw = await fs.readFile(FONT_LIBRARY_FILE, 'utf8');
    const { library, changed } = await syncFontLibraryWithStorage(JSON.parse(raw));

    if (changed) {
      await writeFontLibrary(library);
    }

    return library;
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      if (error instanceof SyntaxError) {
        console.warn('Failed to parse font-library.json, rebuilding from stored font data:', error);
      }

      const { library, changed } = await syncFontLibraryWithStorage(createEmptyFontLibrary());

      if (changed || !isMissingFileError(error)) {
        await writeFontLibrary(library);
      }

      return library;
    }

    throw error;
  }
}

async function writeFontLibrary(library) {
  if (getRepositoryConfig()) {
    const normalizedLibrary = normalizeFontLibrary(library);
    await writeRepositoryFile(
      REPOSITORY_LIBRARY_FILE,
      Buffer.from(`${JSON.stringify(normalizedLibrary, null, 2)}\n`, 'utf8'),
      'Update font library index'
    );
    return;
  }

  await ensureFontLibraryStorage();
  const normalizedLibrary = normalizeFontLibrary(library);
  await writeJsonFile(FONT_LIBRARY_FILE, normalizedLibrary);
  await persistSourceMetadataRecords(normalizedLibrary.sources);
  await persistSubsetMatchMetadataRecords(normalizedLibrary.subsetMatches);
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

  if (getRepositoryConfig()) {
    await writeRepositoryFile(
      `source-fonts/${storedFilename}`,
      buffer,
      `Save source font ${sanitizeRecoveredSourceName(filename, sourceHash, sourceType)}`
    );
  } else {
    await fs.writeFile(path.join(SOURCE_FONT_DIR, storedFilename), buffer);
  }

  const record = {
    sourceHash,
    sourceName: filename,
    alias: existingRecord?.alias || '',
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

  const buffer = getRepositoryConfig()
    ? (await readRepositoryFile(`source-fonts/${record.storedFilename}`)).buffer
    : await fs.readFile(getStoredSourcePath(record));
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
  const removedMatches = library.subsetMatches.filter((item) => item.sourceHash === sourceHash);
  library.subsetMatches = library.subsetMatches.filter((item) => item.sourceHash !== sourceHash);
  await writeFontLibrary(library);
  if (getRepositoryConfig()) {
    await deleteRepositoryFile(
      `source-fonts/${record.storedFilename}`,
      `Delete source font ${record.sourceName}`
    );
    return record;
  }

  await fs.rm(getStoredSourcePath(record), { force: true });
  await fs.rm(getSourceMetadataPath(sourceHash), { force: true });

  for (const match of removedMatches) {
    await fs.rm(getSubsetMatchMetadataPath(match.subsetHash), { force: true });
  }

  return record;
}

async function setSourceFontAlias(sourceHash, alias) {
  const library = await readFontLibrary();
  const record = library.sources.find((item) => item.sourceHash === sourceHash);

  if (!record) {
    throw new Error('未找到要设置别名的原始字体。');
  }

  record.alias = normalizeSourceAlias(alias);
  await writeFontLibrary(library);
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
    repositoryStorage: {
      available: Boolean(REPOSITORY_STORAGE_CONFIG),
      provider: REPOSITORY_STORAGE_CONFIG?.provider || '',
      repositoryUrl: REPOSITORY_STORAGE_CONFIG?.repositoryUrl || '',
      branch: REPOSITORY_STORAGE_CONFIG?.branch || '',
      path: REPOSITORY_STORAGE_CONFIG?.directory || 'font-data',
      displayName: REPOSITORY_STORAGE_CONFIG
        ? `${REPOSITORY_STORAGE_CONFIG.owner}/${REPOSITORY_STORAGE_CONFIG.repository}`
        : ''
    },
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

function buildCdnTemplateValues(result, uploadContext = {}, cdnConfig = CDN_UPLOAD_CONFIG) {
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

  const renderedTemplateFilename = renderValueTemplate(cdnConfig.filenameTemplate, baseValues);
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

function readCdnStructuredTemplate(templateValues, label, cdnConfig = CDN_UPLOAD_CONFIG) {
  const templateText = readOptionalTemplateText({
    inlineValue: cdnConfig.bodyTemplate,
    filePath: cdnConfig.bodyTemplateFile,
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

function buildCdnRequestPayload(result, templateValues, cdnConfig = CDN_UPLOAD_CONFIG) {
  if (cdnConfig.bodyMode === 'raw') {
    return {
      body: result.buffer,
      contentType: outputContentTypes.get(result.outputType) || 'application/octet-stream'
    };
  }

  if (cdnConfig.bodyMode === 'form') {
    const structuredFields =
      readCdnStructuredTemplate(templateValues, 'CDN 上传表单字段模板', cdnConfig) || {};
    const fieldEntries = Object.entries(structuredFields).filter(
      ([fieldName, fieldValue]) =>
        fieldName &&
        fieldValue !== undefined &&
        fieldValue !== null &&
        fieldName !== (cdnConfig.formFileField || 'file') &&
        fieldName !== cdnConfig.formFilenameField
    );
    const parts = [
      {
        name: cdnConfig.formFileField || 'file',
        filename: templateValues.cdnBasename || result.outputName,
        contentType: outputContentTypes.get(result.outputType) || 'application/octet-stream',
        value: result.buffer
      }
    ];

    if (cdnConfig.formFilenameField) {
      parts.push({
        name: cdnConfig.formFilenameField,
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
    inlineValue: cdnConfig.bodyTemplate,
    filePath: cdnConfig.bodyTemplateFile,
    label: 'CDN upload body template'
  }).trim();

  if (!templateText) {
    throw new Error('CDN 上传已启用自定义请求体，但没有提供模板。');
  }

  if (cdnConfig.bodyMode === 'text') {
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
        let storedSize = 0;
        let totalSize = 0;

        remoteResponse.on('data', (chunk) => {
          totalSize += chunk.length;
          if (storedSize >= MAX_CDN_RESPONSE_SIZE) {
            return;
          }

          const remaining = MAX_CDN_RESPONSE_SIZE - storedSize;
          const storedChunk = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
          chunks.push(storedChunk);
          storedSize += storedChunk.length;
        });

        remoteResponse.on('end', () => {
          const cdnResponse = {
            statusCode,
            statusMessage: remoteResponse.statusMessage || '',
            headers: remoteResponse.headers,
            body: Buffer.concat(chunks),
            truncated: totalSize > storedSize,
            totalSize
          };

          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(`CDN 上传失败（HTTP ${statusCode}）。`);
            error.cdnResponse = cdnResponse;
            reject(error);
            return;
          }

          resolve(cdnResponse);
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

function normalizeCdnResponseHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : String(value ?? '')
    ])
  );
}

function cleanupCdnUploadResponses(now = Date.now()) {
  for (const [responseId, entry] of cdnUploadResponses) {
    if (now - entry.savedAt > CDN_RESPONSE_TTL_MS) {
      cdnUploadResponses.delete(responseId);
    }
  }

  while (cdnUploadResponses.size >= MAX_STORED_CDN_RESPONSES) {
    const oldestKey = cdnUploadResponses.keys().next().value;
    if (!oldestKey) break;
    cdnUploadResponses.delete(oldestKey);
  }
}

function storeCdnUploadResponse(cdnResponse) {
  if (!cdnResponse || !Buffer.isBuffer(cdnResponse.body)) {
    return '';
  }

  cleanupCdnUploadResponses();
  const responseId = randomUUID();
  cdnUploadResponses.set(responseId, {
    savedAt: Date.now(),
    payload: {
      statusCode: cdnResponse.statusCode,
      statusMessage: cdnResponse.statusMessage,
      headers: normalizeCdnResponseHeaders(cdnResponse.headers),
      bodyBase64: cdnResponse.body.toString('base64'),
      truncated: Boolean(cdnResponse.truncated),
      totalSize: Number(cdnResponse.totalSize || cdnResponse.body.length)
    }
  });
  return responseId;
}

function getNestedResponseValue(payload, valuePath) {
  if (!valuePath) {
    return undefined;
  }

  return valuePath.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return current[key];
  }, payload);
}

function extractCdnResponseUrl(cdnResponse, responseUrlPath) {
  if (!responseUrlPath || !cdnResponse?.body?.length) {
    return '';
  }

  try {
    const payload = JSON.parse(cdnResponse.body.toString('utf8'));
    const value = getNestedResponseValue(payload, responseUrlPath);
    return typeof value === 'string' && isHttpUrl(value.trim()) ? value.trim() : '';
  } catch {
    return '';
  }
}

async function uploadResultToCdn(result, uploadContext = {}, cdnConfig = CDN_UPLOAD_CONFIG) {
  const runtime = {
    requested: true,
    available: cdnConfig.available,
    succeeded: false,
    publicUrl: '',
    message: '',
    filenameMode: 'template',
    responseId: ''
  };

  if (!cdnConfig.available) {
    runtime.message = '服务端未配置 CDN 自动上传。';
    return runtime;
  }

  const uploadValues = buildCdnTemplateValues(result, uploadContext, cdnConfig);
  runtime.filenameMode = uploadValues.cdnFilenameMode;
  const uploadUrl = resolveCdnTemplate(cdnConfig.uploadUrlTemplate, uploadValues);
  const configuredPublicUrl = cdnConfig.publicUrlTemplate
    ? resolveCdnTemplate(cdnConfig.publicUrlTemplate, uploadValues)
    : uploadValues.cdnFilenameMode === 'existing'
      ? buildPublicUrlFromExistingUrl(uploadContext.existingSubsetUrl || '', uploadValues.cdnFilename)
      : '';
  const requestPayload = buildCdnRequestPayload(result, {
    ...uploadValues,
    publicUrl: configuredPublicUrl
  }, cdnConfig);
  const headers = {
    'Content-Type': requestPayload.contentType,
    'Content-Length': String(requestPayload.body.length),
    'User-Agent': 'font-converter/1.0',
    ...cdnConfig.extraHeaders
  };

  if (cdnConfig.authHeader && cdnConfig.authToken) {
    headers[cdnConfig.authHeader] = cdnConfig.authToken;
  }

  try {
    const cdnResponse = await uploadBufferToUrl(uploadUrl, {
      method: cdnConfig.method,
      headers,
      body: requestPayload.body,
      timeoutMs: cdnConfig.timeoutMs
    });

    runtime.succeeded = true;
    runtime.responseId = storeCdnUploadResponse(cdnResponse);
    runtime.publicUrl =
      extractCdnResponseUrl(cdnResponse, cdnConfig.responseUrlPath) || configuredPublicUrl;
    const publicUrl = runtime.publicUrl;
    runtime.message =
      uploadValues.cdnFilenameMode === 'existing'
        ? publicUrl
          ? `已上传到 ${cdnConfig.label}，并沿用原文件名覆盖原地址。`
          : `已上传到 ${cdnConfig.label}，并沿用原文件名。`
        : publicUrl
          ? `已上传到 ${cdnConfig.label}，可通过公开地址访问。`
          : `已上传到 ${cdnConfig.label}。`;
    return runtime;
  } catch (error) {
    console.warn('CDN upload failed:', error);
    runtime.responseId = storeCdnUploadResponse(error?.cdnResponse);
    runtime.message =
      error instanceof Error && /HTTP \d+/.test(error.message)
        ? error.message
        : `${cdnConfig.label} 上传失败，请检查配置或网络连接。`;
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
      cdnConfig = null,
      optimize = true
    } = JSON.parse(rawBody);

    const activeCdnConfig = normalizeClientCdnUploadConfig(cdnConfig);

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
          }, activeCdnConfig)
        : {
            requested: false,
            available: activeCdnConfig.available,
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
      'X-Cdn-Upload-Label': encodeURIComponent(activeCdnConfig.label),
      'X-Cdn-Upload-Url': encodeURIComponent(cdnUpload.publicUrl),
      'X-Cdn-Upload-Message': encodeURIComponent(cdnUpload.message),
      'X-Cdn-Upload-Filename-Mode': cdnUpload.filenameMode,
      'X-Cdn-Upload-Response-Id': cdnUpload.responseId || ''
    });
    response.end(result.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : '字体转换失败。';
    const statusCode = /缺少|为空|支持|过大|格式|输出|未找到|配置|模板|请求头|地址/.test(message)
      ? 400
      : 500;
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

function handleCdnUploadResponse(requestUrl, response) {
  cleanupCdnUploadResponses();
  const responseId = requestUrl.searchParams.get('id') || '';
  const entry = cdnUploadResponses.get(responseId);

  if (!entry) {
    sendJson(response, 404, { error: 'CDN 原始响应不存在或已过期。' });
    return;
  }

  cdnUploadResponses.delete(responseId);
  sendJson(response, 200, entry.payload);
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

async function handleSourceFontAlias(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const { sourceHash = '', alias = '' } = JSON.parse(rawBody);

    if (typeof sourceHash !== 'string' || !sourceHash.trim()) {
      sendJson(response, 400, { error: '请求体缺少 sourceHash 字段。' });
      return;
    }
    if (typeof alias !== 'string') {
      sendJson(response, 400, { error: '字体别名必须是字符串。' });
      return;
    }

    const record = await setSourceFontAlias(sourceHash.trim(), alias);
    sendJson(response, 200, { source: publicSourceRecord(record) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '字体别名保存失败。';
    const statusCode = /缺少|未找到|必须/.test(message) ? 400 : 500;
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
  let repositoryConfig;
  try {
    repositoryConfig = getRequestRepositoryConfig(request);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : '字体仓库配置无效。'
    });
    return;
  }

  await repositoryStorageContext.run(repositoryConfig, async () => {
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

    if (method === 'GET' && requestUrl.pathname === '/api/cdn-upload-response') {
      handleCdnUploadResponse(requestUrl, response);
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

    if (method === 'POST' && requestUrl.pathname === '/api/source-fonts/alias') {
      await handleSourceFontAlias(request, response);
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
});

server.listen(PORT, HOST, () => {
  console.log(`Font converter is running at http://${HOST}:${PORT}`);
});

export { HOST, PORT, server };
