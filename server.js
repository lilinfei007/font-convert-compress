import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFont, woff2 } from 'fonteditor-core';

const HOST = '127.0.0.1';
const runtimePort =
  typeof process !== 'undefined' && process?.env?.PORT ? Number(process.env.PORT) : 3000;
const PORT = Number.isFinite(runtimePort) && runtimePort > 0 ? runtimePort : 3000;
const MAX_BODY_SIZE = 60 * 1024 * 1024;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const CHARSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'charsets');

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

const supportedTypes = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot', 'svg']);
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
let woff2ReadyPromise;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
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

async function fetchRemoteFontAsPayload(urlString) {
  if (!isHttpUrl(urlString)) {
    throw new Error('网络字体地址只支持 http 或 https。');
  }

  const response = await fetch(urlString, {
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`网络字体下载失败：${response.status} ${response.statusText}`);
  }

  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_SIZE) {
    throw new Error('网络字体文件过大，请控制在 60MB 以内。');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

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

  return {
    type,
    sourceBuffer,
    font,
    fontObject: font.get()
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

async function convertFontToTtf({
  filename,
  base64Data,
  subsetSource,
  operationMode = 'fresh',
  existingSubsetFilename = '',
  existingSubsetData = '',
  existingSubsetUrl = '',
  keepHinting = false,
  keepKerning = false,
  optimize = true
}) {
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

  const { sourceBuffer, font, fontObject } = await createFontFromPayload({
    filename,
    base64Data,
    subsetCodePoints: finalSubsetCodePoints,
    keepHinting,
    keepKerning
  });
  const sourceFeatures = inspectFontFeatures(fontObject);

  if (optimize) {
    font.optimize();
  }

  const outputBuffer = Buffer.from(
    font.write({
      type: 'ttf',
      hinting: keepHinting,
      kerning: keepKerning
    })
  );

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
    outputName: `${baseName}${suffix}.ttf`,
    sourceBytes: sourceBuffer.length,
    outputBytes: outputBuffer.length,
    subsetCount: finalSubsetCodePoints.length,
    newSubsetCount: requestedCodePoints.length,
    existingSubsetCount,
    subsetSourceLabel: subsetSource?.label || '完整字体',
    subsetSourceMode: subsetSource?.mode || 'full',
    operationMode,
    keepHinting,
    keepKerning,
    sourceFeatures
  };
}

async function handleConvert(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const {
      filename,
      data,
      operationMode = 'fresh',
      existingSubsetFilename = '',
      existingSubsetData = '',
      existingSubsetUrl = '',
      subsetMode,
      presetId,
      subsetText = '',
      charsetFileText = '',
      keepHinting = false,
      keepKerning = false,
      optimize = true
    } = JSON.parse(rawBody);

    if (typeof filename !== 'string' || typeof data !== 'string') {
      sendJson(response, 400, { error: '请求体缺少 filename 或 data 字段。' });
      return;
    }

    const subsetSource = await resolveSubsetSource({
      subsetMode,
      presetId,
      subsetText: typeof subsetText === 'string' ? subsetText : '',
      charsetFileText: typeof charsetFileText === 'string' ? charsetFileText : ''
    });

    const result = await convertFontToTtf({
      filename,
      base64Data: data,
      subsetSource,
      operationMode: operationMode === 'incremental' ? 'incremental' : 'fresh',
      existingSubsetFilename:
        typeof existingSubsetFilename === 'string' ? existingSubsetFilename : '',
      existingSubsetData: typeof existingSubsetData === 'string' ? existingSubsetData : '',
      existingSubsetUrl: typeof existingSubsetUrl === 'string' ? existingSubsetUrl : '',
      keepHinting: Boolean(keepHinting),
      keepKerning: Boolean(keepKerning),
      optimize: optimize !== false
    });

    response.writeHead(200, {
      'Content-Type': 'font/ttf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.outputName)}"`,
      'Content-Length': result.buffer.length,
      'X-Source-Bytes': String(result.sourceBytes),
      'X-Output-Bytes': String(result.outputBytes),
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
      'X-Source-Glyph-Count': String(result.sourceFeatures.glyphCount),
      'X-Source-Hinting-Tables': result.sourceFeatures.hintingTables.join(','),
      'X-Source-Kerning-Tables': result.sourceFeatures.kerningTables.join(',')
    });
    response.end(result.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : '字体转换失败。';
    const statusCode = /缺少|为空|支持|过大|格式/.test(message) ? 400 : 500;
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
      supportedTypes: Array.from(supportedTypes)
    });
    return;
  }

  if (method === 'GET' && requestUrl.pathname === '/api/charsets') {
    sendJson(response, 200, {
      presets: listCharsetPresets()
    });
    return;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/convert') {
    await handleConvert(request, response);
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
