import { DurableObject } from 'cloudflare:workers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';
import fonteditor, {
  createFont,
  woff2,
  type FontEditor,
  type TTF
} from 'fonteditor-core';
import commonCharset from '../charsets/common-3500.txt';
import extendedCharset from '../charsets/extended-6500.txt';

export interface Env {
  ASSETS: Fetcher;
  FONTS?: R2Bucket;
  FONT_LIBRARY: DurableObjectNamespace;
}

type FontType = FontEditor.FontType;
type FontObject = Omit<TTF.TTFObject, 'glyf'> & {
  glyf: (TTF.Glyph & { instructions?: number[] })[];
} & Record<string, unknown>;
interface SourceRecord {
  sourceHash: string;
  sourceName: string;
  alias: string;
  sourceSize: number;
  sourceType: FontType;
  storedFilename: string;
  savedAt: number;
  lastUsedAt: number;
}
interface MatchRecord {
  subsetHash: string;
  sourceHash: string;
  outputName: string;
  outputBytes: number;
  savedAt: number;
  lastUsedAt: number;
}
interface Library {
  version: number;
  sources: SourceRecord[];
  subsetMatches: MatchRecord[];
}
type StorageMode = 'none' | 'r2';
interface RequestContext {
  env: Env;
  storage: DurableObjectStorage;
  sql: SqlStorage;
  storageMode: StorageMode;
}
interface FontPayload {
  filename: string;
  base64Data: string;
}
interface ReadOptions extends FontPayload {
  subsetCodePoints?: number[];
  keepHinting?: boolean;
  keepKerning?: boolean;
}
interface SubsetInput {
  subsetMode?: string;
  presetId?: string;
  subsetText?: string;
  charsetFileText?: string;
}
interface SubsetSource {
  mode: string;
  label: string;
  text: string;
}
interface ConvertOptions extends FontPayload {
  subsetSource: SubsetSource;
  outputType?: string;
  operationMode?: string;
  existingSubsetFilename?: string;
  existingSubsetData?: string;
  existingSubsetUrl?: string;
  keepHinting?: boolean;
  keepKerning?: boolean;
  optimize?: boolean;
}
interface OtfMetrics {
  readOptions?: { subset?: number[] };
  subsetMap?: Record<string, unknown>;
  hmtx?: { advanceWidth: number; leftSideBearing: number }[];
}
type JsonBody = Record<string, unknown>;

const MAX_FONT_BYTES = 16 * 1024 * 1024;
const MAX_BODY_BYTES = 24 * 1024 * 1024;
const MAX_SFNT_BYTES = 24 * 1024 * 1024;
const context = new AsyncLocalStorage<RequestContext>();
const supportedTypes = new Set<FontType>([
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'svg'
]);
const writableTypes = new Set<FontType>(['ttf', 'woff', 'woff2', 'eot', 'svg']);
const outputContentTypes = new Map<string, string>([
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
      text: commonCharset
    }
  ],
  [
    'extended-6500',
    {
      id: 'extended-6500',
      name: '扩展汉字集',
      description: '《通用规范汉字表》一级字表 + 二级字表，覆盖 6500 个汉字。',
      count: 6500,
      text: extendedCharset
    }
  ]
]);

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
function current(): RequestContext {
  const value = context.getStore();
  if (!value) throw new Error('Missing request context');
  return value;
}
function requirePersistentStorage(): void {
  if (current().storageMode === 'none') {
    throw new HttpError(400, '当前未启用字体库，请上传原始字体；启用 R2 后可保存和复用字体。');
  }
}
function fontBucket(): R2Bucket {
  const bucket = current().env.FONTS;
  if (!bucket) throw new HttpError(400, '当前未启用 R2 字体库。');
  return bucket;
}
function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}
function errorResponse(error: unknown): Response {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return json({ error: '请求 JSON 格式不正确。' }, 400);
  console.error(
    'Font request failed',
    error instanceof Error ? error.name : 'UnknownError'
  );
  return json(
    { error: '字体处理失败，请检查字体是否有效；复杂字体可能超出运行限制。' },
    500
  );
}
function secure(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set('Cache-Control', 'no-store');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('X-Frame-Options', 'DENY');
  secured.headers.set('Referrer-Policy', 'same-origin');
  secured.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );
  return secured;
}
function stringField(body: JsonBody, key: string, fallback = ''): string {
  const value = body[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string')
    throw new HttpError(400, `${key} 必须是字符串。`);
  return value;
}
function booleanField(body: JsonBody, key: string, fallback = false): boolean {
  const value = body[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean')
    throw new HttpError(400, `${key} 必须是布尔值。`);
  return value;
}
function hashField(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new HttpError(400, '字体指纹格式不正确。');
  return value.toLowerCase();
}
function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function boundedBody(
  message: Request | Response,
  limit: number
): Promise<Buffer> {
  if (Number(message.headers.get('Content-Length')) > limit) {
    await message.body?.cancel();
    throw new HttpError(
      413,
      '文件或请求体过大。单个字体最大 16 MB，请求体最大 24 MB。'
    );
  }
  const reader = message.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(
          413,
          '文件或请求体过大。单个字体最大 16 MB，请求体最大 24 MB。'
        );
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
async function readJson(request: Request): Promise<JsonBody> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  ) {
    throw new HttpError(415, '请使用 application/json 请求体。');
  }
  const body: unknown = JSON.parse(
    (await boundedBody(request, MAX_BODY_BYTES)).toString('utf8')
  );
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(400, '请求体必须是 JSON 对象。');
  return body as JsonBody;
}
function decodeFont(data: string): Buffer {
  if (!data) throw new HttpError(400, '字体文件内容为空。');
  if (data.length > Math.ceil(MAX_FONT_BYTES / 3) * 4)
    throw new HttpError(413, '字体文件最大 16 MB。');
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    throw new HttpError(400, '字体内容必须是有效 Base64。');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw new HttpError(400, '字体文件内容为空。');
  if (buffer.length > MAX_FONT_BYTES)
    throw new HttpError(413, '字体文件最大 16 MB。');
  return buffer;
}

function publicSourceRecord(
  record: SourceRecord
): Omit<SourceRecord, 'storedFilename'> {
  const { storedFilename: _storedFilename, ...source } = record;
  return source;
}
function normalizeSourceAlias(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
async function readFontLibrary(): Promise<Library> {
  if (current().storageMode === 'none') {
    return { version: 1, sources: [], subsetMatches: [] };
  }
  const sql = current().sql;
  return {
    version: 1,
    sources: [
      ...sql.exec<{ record: string }>(
        'SELECT record FROM sources ORDER BY last_used DESC'
      )
    ].map((row) => JSON.parse(row.record) as SourceRecord),
    subsetMatches: [
      ...sql.exec<{ record: string }>('SELECT record FROM matches')
    ].map((row) => JSON.parse(row.record) as MatchRecord)
  };
}
async function writeFontLibrary(library: Library): Promise<void> {
  requirePersistentStorage();
  const sql = current().sql;
  // Commit all index changes together, including removal of subset matches.
  current().storage.transactionSync(() => {
    const sources = new Set(library.sources.map((item) => item.sourceHash));
    const matches = new Set(
      library.subsetMatches.map((item) => item.subsetHash)
    );
    for (const row of sql.exec<{ hash: string }>('SELECT hash FROM sources')) {
      if (!sources.has(row.hash))
        sql.exec('DELETE FROM sources WHERE hash = ?', row.hash);
    }
    for (const row of sql.exec<{ hash: string }>('SELECT hash FROM matches')) {
      if (!matches.has(row.hash))
        sql.exec('DELETE FROM matches WHERE hash = ?', row.hash);
    }
    for (const source of library.sources)
      sql.exec(
        'INSERT INTO sources(hash, last_used, record) VALUES (?, ?, ?) ON CONFLICT(hash) DO UPDATE SET last_used=excluded.last_used, record=excluded.record',
        source.sourceHash,
        source.lastUsedAt,
        JSON.stringify(source)
      );
    for (const match of library.subsetMatches)
      sql.exec(
        'INSERT INTO matches(hash, record) VALUES (?, ?) ON CONFLICT(hash) DO UPDATE SET record=excluded.record',
        match.subsetHash,
        JSON.stringify(match)
      );
  });
}
async function saveSourceFontPayload(
  payload: FontPayload
): Promise<{ action: string; record: SourceRecord }> {
  requirePersistentStorage();
  const buffer = decodeFont(payload.base64Data);
  const sourceType = getFontType(payload.filename);
  const sourceHash = hashBuffer(buffer);
  const library = await readFontLibrary();
  const previous = library.sources.find(
    (item) => item.sourceHash === sourceHash
  );
  const now = Date.now();
  const record: SourceRecord = {
    sourceHash,
    sourceType,
    sourceName: path.basename(payload.filename),
    sourceSize: buffer.length,
    alias: previous?.alias || '',
    storedFilename: `${sourceHash}.${sourceType}`,
    savedAt: previous?.savedAt || now,
    lastUsedAt: now
  };
  await fontBucket().put(
    `source-fonts/${record.storedFilename}`,
    buffer,
    {
      httpMetadata: {
        contentType:
          outputContentTypes.get(sourceType) || 'application/octet-stream'
      }
    }
  );
  library.sources = [
    record,
    ...library.sources.filter((item) => item.sourceHash !== sourceHash)
  ];
  await writeFontLibrary(library);
  return { action: previous ? 'updated' : 'created', record };
}
async function getSourceFontPayload(
  sourceHash: string
): Promise<FontPayload & { record: SourceRecord }> {
  requirePersistentStorage();
  hashField(sourceHash);
  const library = await readFontLibrary();
  const record = library.sources.find((item) => item.sourceHash === sourceHash);
  if (!record) throw new HttpError(404, '未找到已保存的原始字体。');
  const object = await fontBucket().get(
    `source-fonts/${record.storedFilename}`
  );
  if (!object) throw new HttpError(404, '原始字体文件已不存在。');
  if (object.size > MAX_FONT_BYTES) {
    await object.body.cancel();
    throw new HttpError(413, '已保存字体超过 16 MB。');
  }
  const buffer = Buffer.from(await object.arrayBuffer());
  if (buffer.length > MAX_FONT_BYTES)
    throw new HttpError(413, '已保存字体超过 16 MB。');
  if (hashBuffer(buffer) !== record.sourceHash)
    throw new HttpError(502, '保存的字体内容与指纹不一致。');
  return {
    filename: record.sourceName,
    base64Data: buffer.toString('base64'),
    record
  };
}
async function touchSourceFont(sourceHash: string): Promise<SourceRecord> {
  const library = await readFontLibrary();
  const record = library.sources.find((item) => item.sourceHash === sourceHash);
  if (!record) throw new HttpError(404, '未找到已保存的原始字体。');
  record.lastUsedAt = Date.now();
  await writeFontLibrary(library);
  return record;
}
async function saveSubsetSourceMatch(
  input: Omit<MatchRecord, 'savedAt' | 'lastUsedAt'>
): Promise<{ action: string }> {
  const library = await readFontLibrary();
  const previous = library.subsetMatches.find(
    (item) => item.subsetHash === input.subsetHash
  );
  const now = Date.now();
  library.subsetMatches = [
    { ...input, savedAt: previous?.savedAt || now, lastUsedAt: now },
    ...library.subsetMatches.filter(
      (item) => item.subsetHash !== input.subsetHash
    )
  ];
  await writeFontLibrary(library);
  return { action: previous ? 'updated' : 'created' };
}
async function mutateSource(
  body: JsonBody,
  remove: boolean
): Promise<Response> {
  requirePersistentStorage();
  const sourceHash = hashField(stringField(body, 'sourceHash'));
  const library = await readFontLibrary();
  const record = library.sources.find((item) => item.sourceHash === sourceHash);
  if (!record) throw new HttpError(404, '未找到已保存的原始字体。');
  if (remove) {
    // Delete the object first. A failed object operation leaves the index available
    // for a safe retry instead of reporting success while data remains stored.
    await fontBucket().delete(`source-fonts/${record.storedFilename}`);
    library.sources = library.sources.filter(
      (item) => item.sourceHash !== sourceHash
    );
    library.subsetMatches = library.subsetMatches.filter(
      (item) => item.sourceHash !== sourceHash
    );
  } else record.alias = normalizeSourceAlias(stringField(body, 'alias'));
  await writeFontLibrary(library);
  return json({ source: publicSourceRecord(record) });
}

function validateRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, '网络字体地址格式不正确。');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  ) {
    throw new HttpError(
      400,
      '仅支持不含凭据的公开 HTTP/HTTPS 字体地址和标准端口。'
    );
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const parts = hostname.split('.').map(Number);
  const ipv4 = parts.length === 4 && parts.every(Number.isFinite);
  const privateV4 =
    ipv4 &&
    (parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] >= 224 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127));
  if (
    privateV4 ||
    hostname.includes(':') ||
    !hostname.includes('.') ||
    /\.(localhost|local|internal|test|invalid)$/.test(hostname)
  ) {
    throw new HttpError(400, '网络字体地址必须是公开互联网地址。');
  }
  return url;
}
async function fetchRemoteFontAsPayload(value: string): Promise<FontPayload> {
  let url = validateRemoteUrl(value);
  const signal = AbortSignal.timeout(20000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': 'font-convert-compress' }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('Location');
        if (!location || redirects === 3)
          throw new HttpError(400, '网络字体重定向次数过多或缺少地址。');
        url = validateRemoteUrl(new URL(location, url).href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(
          502,
          `网络字体下载失败（HTTP ${response.status}）。`
        );
      }
      const buffer = await boundedBody(response, MAX_FONT_BYTES);
      if (!buffer.length) throw new HttpError(400, '网络字体文件为空。');
      let filename = path.basename(url.pathname);
      try {
        filename = decodeURIComponent(filename);
      } catch {
        /* Keep the URL name if malformed. */
      }
      getFontType(filename);
      return { filename, base64Data: buffer.toString('base64') };
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, '网络字体下载失败或超时。');
  }
  throw new HttpError(502, '网络字体下载失败。');
}

function resolveStorage(request: Request, env: Env): StorageMode {
  const requested = request.headers.get('X-Font-Storage-Mode') || '';
  if (!['', 'none', 'local', 'r2'].includes(requested)) {
    throw new HttpError(400, '字体存储模式不正确，请选择临时处理或 R2。');
  }
  if (requested === 'none') return 'none';
  if (requested === 'r2' && !env.FONTS) {
    throw new HttpError(400, '当前未启用 R2，请选择临时处理。');
  }
  // Retain the legacy "local" alias for the available Cloudflare storage mode.
  return env.FONTS ? 'r2' : 'none';
}

function publicRuntimeConfig(env: Env) {
  return {
    ok: true,
    runtime: 'cloudflare-workers',
    defaultStorage: env.FONTS ? 'r2' : 'none',
    r2Storage: { available: Boolean(env.FONTS) },
    maxFontBytes: MAX_FONT_BYTES,
    maxRequestBytes: MAX_BODY_BYTES,
    supportedTypes: [...supportedTypes],
    writableTypes: [...writableTypes]
  };
}
async function fontPayload(body: JsonBody): Promise<FontPayload> {
  const sourceHash = stringField(body, 'sourceFontHash');
  if (sourceHash) return getSourceFontPayload(hashField(sourceHash));
  const url = stringField(body, 'url');
  if (url) return fetchRemoteFontAsPayload(url);
  return {
    filename: stringField(body, 'filename'),
    base64Data: stringField(body, 'data')
  };
}
async function handlePreview(body: JsonBody): Promise<Response> {
  const payload = await fontPayload(body);
  const { type, sourceBuffer, font, fontObject } = await createFontFromPayload({
    ...payload,
    keepHinting: true,
    keepKerning: true
  });
  const codePoints = extractCmapCodePoints(fontObject);
  const features = inspectFontFeatures(fontObject);
  let previewFont: { type: FontType; base64Data: string } | undefined;
  if (booleanField(body, 'includePreviewFont', false)) {
    // SVG and EOT remain valid input/export formats, but modern browsers cannot
    // load them as web fonts. Produce a separate read-only rendering asset; keep
    // the original bytes and fingerprint intact for subsequent conversions.
    if (type === 'svg' || type === 'eot') {
      const output = font.write({
        type: 'woff',
        hinting: true,
        kerning: true,
        deflate: (bytes) => Array.from(deflateSync(Buffer.from(bytes)))
      });
      const bytes = Buffer.isBuffer(output)
        ? output
        : typeof output === 'string'
          ? Buffer.from(output)
          : Buffer.from(new Uint8Array(output));
      previewFont = { type: 'woff', base64Data: bytes.toString('base64') };
    } else {
      previewFont = { type, base64Data: payload.base64Data };
    }
  }
  return json({
    filename: payload.filename,
    type,
    bytes: sourceBuffer.length,
    sourceHash: hashBuffer(sourceBuffer),
    ...features,
    count: codePoints.length,
    codePoints,
    characters: codePointsToText(codePoints),
    ...(previewFont ? { previewFont } : {}),
    base64Data: booleanField(body, 'includeData', true)
      ? payload.base64Data
      : ''
  });
}
async function handleConvert(body: JsonBody): Promise<Response> {
  const operationMode = stringField(body, 'operationMode', 'fresh');
  if (!['fresh', 'incremental'].includes(operationMode))
    throw new HttpError(400, '处理模式不正确。');
  const sourceHashValue = stringField(body, 'sourceFontHash');
  const sourceFontHash = sourceHashValue ? hashField(sourceHashValue) : '';
  const payload = sourceFontHash
    ? await getSourceFontPayload(hashField(sourceFontHash))
    : {
        filename: stringField(body, 'filename'),
        base64Data: stringField(body, 'data')
      };
  const subsetSource = await resolveSubsetSource({
    subsetMode: stringField(body, 'subsetMode'),
    presetId: stringField(body, 'presetId'),
    subsetText: stringField(body, 'subsetText'),
    charsetFileText: stringField(body, 'charsetFileText')
  });
  const result = await convertFont({
    ...payload,
    subsetSource,
    outputType: stringField(body, 'outputType', 'ttf'),
    operationMode,
    existingSubsetFilename: stringField(body, 'existingSubsetFilename'),
    existingSubsetData: stringField(body, 'existingSubsetData'),
    existingSubsetUrl: stringField(body, 'existingSubsetUrl'),
    keepHinting: booleanField(body, 'keepHinting'),
    keepKerning: booleanField(body, 'keepKerning'),
    optimize: booleanField(body, 'optimize', true)
  });
  // Conversion without an R2 binding returns the font without creating
  // unusable library records.
  const saved = current().storageMode === 'none'
    ? null
    : sourceFontHash
      ? { action: 'reused', record: await touchSourceFont(sourceFontHash) }
      : await saveSourceFontPayload(payload);
  const match = saved ? await saveSubsetSourceMatch({
    subsetHash: result.outputHash,
    sourceHash: saved.record.sourceHash,
    outputName: result.outputName,
    outputBytes: result.outputBytes
  }) : null;
  const headers = new Headers({
    'Content-Type':
      outputContentTypes.get(result.outputType) || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${result.outputName}"`,
    'Content-Length': String(result.buffer.length),
    'X-Source-Hash': result.sourceHash,
    'X-Output-Hash': result.outputHash,
    'X-Server-Source-Saved': String(Boolean(saved && saved.action !== 'reused')),
    'X-Server-Source-Action': saved?.action || 'skipped',
    'X-Server-Match-Saved': String(match?.action === 'created'),
    'X-Server-Match-Action': match?.action || 'skipped',
    'X-Subset-Source-Mode': result.subsetSourceMode,
    'X-Subset-Source-Label': encodeURIComponent(result.subsetSourceLabel),
    'X-Removed-Kerning-Tables': result.removedKerningTables.join(','),
    'X-Source-Hinting-Tables': result.sourceFeatures.hintingTables.join(','),
    'X-Source-Kerning-Tables': result.sourceFeatures.kerningTables.join(',')
  });
  const metrics = {
    'Source-Bytes': result.sourceBytes,
    'Output-Bytes': result.outputBytes,
    'Output-Type': result.outputType,
    'Subset-Count': result.subsetCount,
    'New-Subset-Count': result.newSubsetCount,
    'Existing-Subset-Count': result.existingSubsetCount,
    'Operation-Mode': result.operationMode,
    'Keep-Hinting': result.keepHinting,
    'Keep-Kerning': result.keepKerning,
    'Source-Has-Hinting': result.sourceFeatures.hasHintingData,
    'Source-Has-Kerning': result.sourceFeatures.hasKerningData,
    'Output-Has-Hinting': result.outputFeatures.hasHintingData,
    'Output-Has-Kerning': result.outputFeatures.hasKerningData,
    'Subset-Glyph-Hinting-Stripped': result.subsetGlyphHintingStripped,
    'Source-Glyph-Count': result.sourceFeatures.glyphCount
  };
  for (const [name, value] of Object.entries(metrics))
    headers.set('X-' + name, String(value));
  return new Response(new Uint8Array(result.buffer), { headers });
}
const routes = new Map<string, 'GET' | 'POST'>([
  ['/api/health', 'GET'],
  ['/api/charsets', 'GET'],
  ['/api/source-fonts', 'GET'],
  ['/api/convert', 'POST'],
  ['/api/source-fonts/delete', 'POST'],
  ['/api/source-fonts/alias', 'POST'],
  ['/api/source-match', 'POST'],
  ['/api/font-fingerprint', 'POST'],
  ['/api/font-preview', 'POST']
]);
async function handleApi(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/source-fonts')
    return json({
      sources: (await readFontLibrary()).sources.map(publicSourceRecord)
    });
  const body = await readJson(request);
  if (pathname === '/api/convert') return handleConvert(body);
  if (pathname === '/api/font-preview') return handlePreview(body);
  if (pathname === '/api/source-fonts/delete') return mutateSource(body, true);
  if (pathname === '/api/source-fonts/alias') return mutateSource(body, false);
  if (pathname === '/api/font-fingerprint') {
    const payload = await fetchRemoteFontAsPayload(stringField(body, 'url'));
    const buffer = decodeFont(payload.base64Data);
    return json({
      filename: payload.filename,
      bytes: buffer.length,
      hash: hashBuffer(buffer)
    });
  }
  const subsetHash = hashField(stringField(body, 'subsetHash'));
  const library = await readFontLibrary();
  const match = library.subsetMatches.find(
    (item) => item.subsetHash === subsetHash
  );
  const source =
    match &&
    library.sources.find((item) => item.sourceHash === match.sourceHash);
  if (!match || !source) return json({ match: null, source: null });
  match.lastUsedAt = source.lastUsedAt = Date.now();
  await writeFontLibrary(library);
  return json({ match, source: publicSourceRecord(source) });
}

export class FontLibrary extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS sources (hash TEXT PRIMARY KEY, last_used INTEGER NOT NULL, record TEXT NOT NULL)'
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS matches (hash TEXT PRIMARY KEY, record TEXT NOT NULL)'
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (this.pending >= 4)
      return json({ error: '字体处理队列已满，请稍后重试。' }, 429);
    this.pending++;
    // Async R2 operations yield. Explicitly serialize the complete
    // read/modify/write workflow so two uploads never overwrite each other's index.
    const job = this.tail.then(async () => {
      try {
        const mode = resolveStorage(request, this.env);
        return await context.run(
          {
            env: this.env,
            storage: this.ctx.storage,
            sql: this.ctx.storage.sql,
            storageMode: mode
          },
          () => handleApi(request)
        );
      } catch (error) {
        return errorResponse(error);
      } finally {
        this.pending--;
      }
    });
    this.tail = job.catch(() => undefined);
    return job;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      const method = routes.get(pathname);
      if (!method) return secure(json({ error: '接口不存在。' }, 404));
      if (request.method !== method) {
        const response = json({ error: '请求方法不受支持。' }, 405);
        response.headers.set('Allow', method);
        return secure(response);
      }
      const origin = request.headers.get('Origin');
      if (origin && origin !== new URL(request.url).origin)
        throw new HttpError(403, '不允许跨站调用字体接口。');
      if (pathname === '/api/health')
        return secure(json(publicRuntimeConfig(env)));
      if (pathname === '/api/charsets')
        return secure(json({ presets: listCharsetPresets() }));
      if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES)
        throw new HttpError(413, '请求体最大 24 MB。');
      // Keep existing persistent library names stable when R2 is enabled later.
      // Temporary processing is isolated and never populates the saved index.
      const mode = resolveStorage(request, env);
      return secure(
        await env.FONT_LIBRARY.get(env.FONT_LIBRARY.idFromName(mode)).fetch(
          request
        )
      );
    } catch (error) {
      return secure(errorResponse(error));
    }
  }
} satisfies ExportedHandler<Env>;

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return new Uint8Array(buffer).buffer;
}

function sanitizeBaseName(filename: string): string {
  const raw = path.basename(filename, path.extname(filename));
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'converted-font';
}

function getFontType(filename: string): FontType {
  const extension = path.extname(filename).slice(1).toLowerCase() as FontType;
  if (!supportedTypes.has(extension)) {
    throw new HttpError(400, '仅支持 ttf、otf、woff、woff2、eot、svg 格式。');
  }

  return extension;
}

function getOutputType(value: string): FontType {
  const outputType =
    typeof value === 'string' && value.trim()
      ? (value.trim().toLowerCase() as FontType)
      : 'ttf';

  if (!writableTypes.has(outputType)) {
    throw new HttpError(
      400,
      '输出格式仅支持 ttf、woff、woff2、eot、svg；当前库暂不支持导出 otf。'
    );
  }

  return outputType;
}

function getSubsetCodePoints(subsetText: string): number[] {
  if (typeof subsetText !== 'string' || !subsetText.trim()) {
    return [];
  }

  const codePoints = new Set<number>();

  for (const char of subsetText.normalize('NFC')) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint < 32 || codePoint === 127) {
      continue;
    }
    codePoints.add(codePoint);
  }

  return Array.from(codePoints);
}

function mergeCodePoints(...groups: number[][]): number[] {
  const merged = new Set<number>();

  for (const group of groups) {
    for (const codePoint of group || []) {
      if (Number.isInteger(codePoint) && codePoint >= 32 && codePoint !== 127) {
        merged.add(codePoint);
      }
    }
  }

  return Array.from(merged).sort((left, right) => left - right);
}

function extractCmapCodePoints(fontObject: FontObject): number[] {
  // SVG fonts do not get a cmap from fonteditor-core. Glyph unicode values also
  // describe the actual retained subset when a reader keeps an original cmap.
  return [...new Set(fontObject.glyf.flatMap((glyph) => glyph.unicode || []))]
    .filter(
      (codePoint) =>
        Number.isInteger(codePoint) && codePoint >= 32 && codePoint !== 127
    )
    .sort((left, right) => left - right);
}

function codePointsToText(codePoints: number[]): string {
  return codePoints
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join('');
}

function stripSubsetGlyphHinting(fontObject: FontObject): number {
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

function stripKerningTables(fontObject: FontObject): string[] {
  const removedTables = [];

  for (const tableName of ['GPOS', 'kern', 'kerx']) {
    if (Object.prototype.hasOwnProperty.call(fontObject || {}, tableName)) {
      delete fontObject[tableName];
      removedTables.push(tableName);
    }
  }

  return removedTables;
}

function subsetIncludesEmptyAdvanceGlyph(
  fontObject: FontObject,
  subsetCodePoints: number[]
): boolean {
  if (!Array.isArray(fontObject?.glyf) || !subsetCodePoints?.length) {
    return false;
  }

  return subsetCodePoints.some((codePoint) => {
    const glyph = fontObject.glyf.find((item) =>
      item.unicode?.includes(codePoint)
    );

    return (
      glyph &&
      (!Array.isArray(glyph.contours) || glyph.contours.length === 0) &&
      Number.isFinite(glyph.advanceWidth) &&
      glyph.advanceWidth > 0
    );
  });
}

function getOtfMetricIndexes(rawFont: OtfMetrics): number[] {
  if (rawFont?.readOptions?.subset?.length) {
    return Object.keys(rawFont.subsetMap || { 0: true })
      .map((key) => Number(key))
      .filter((index) => Number.isInteger(index) && rawFont.hmtx?.[index])
      .sort((left, right) => left - right);
  }

  return Array.isArray(rawFont?.hmtx)
    ? rawFont.hmtx.map((_, index) => index)
    : [];
}

function repairOtfGlyphMetrics(
  fontObject: FontObject,
  sourceBuffer: Buffer,
  subsetCodePoints?: number[]
): void {
  if (!Array.isArray(fontObject?.glyf) || !Buffer.isBuffer(sourceBuffer)) {
    return;
  }

  try {
    const reader = new fonteditor.OTFReader({
      subset: subsetCodePoints?.length ? subsetCodePoints : []
    });
    // The public read() drops CFF metric indexes; the existing metric repair uses
    // the reader's raw table method, whose visibility is narrower in its typings.
    const rawFont = (
      reader as unknown as { readBuffer(input: ArrayBuffer): OtfMetrics }
    ).readBuffer(bufferToArrayBuffer(sourceBuffer));
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

function listCharsetPresets() {
  return [...charsetPresets.values()].map(
    ({ text, ...preset }) => ({
      ...preset,
      characters: codePointsToText(getSubsetCodePoints(text))
    })
  );
}
async function loadCharsetPreset(id?: string) {
  const preset = charsetPresets.get(id || '');
  if (!preset) throw new HttpError(400, '未找到对应的系统预设字符集。');
  return preset;
}
let woff2ReadyPromise: Promise<unknown> | undefined;
function ensureWoff2Ready(): Promise<unknown> {
  if (!woff2ReadyPromise) {
    woff2ReadyPromise = Promise.resolve()
      .then(() => woff2.init())
      .catch((error) => {
        woff2ReadyPromise = undefined;
        throw error;
      });
  }
  return woff2ReadyPromise;
}
async function resolveSubsetSource({
  subsetMode,
  presetId,
  subsetText = '',
  charsetFileText = ''
}: SubsetInput): Promise<SubsetSource> {
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
    if (
      typeof charsetFileText !== 'string' ||
      !getSubsetCodePoints(charsetFileText).length
    ) {
      throw new HttpError(400, '上传的字符集文件没有可用字符，请重新选择。');
    }

    return {
      mode: 'file',
      label: '上传字符集文件',
      text: charsetFileText
    };
  }

  if (normalizedMode === 'manual') {
    if (
      typeof subsetText !== 'string' ||
      !getSubsetCodePoints(subsetText).length
    ) {
      throw new HttpError(400, '手动输入字符为空，请填写需要保留的字符。');
    }
    return {
      mode: 'manual',
      label: '手动输入字符',
      text: typeof subsetText === 'string' ? subsetText : ''
    };
  }

  throw new HttpError(400, '不支持的字符集来源。');
}

function inspectFontFeatures(fontObject: FontObject) {
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

async function createFontFromPayload({
  filename,
  base64Data,
  subsetCodePoints,
  keepHinting = false,
  keepKerning = false
}: ReadOptions) {
  const type = getFontType(filename);
  const sourceBuffer = decodeFont(base64Data);

  if (!sourceBuffer.length) {
    throw new HttpError(400, '文件内容为空，请重新选择字体文件。');
  }

  if (type === 'woff2') {
    await ensureWoff2Ready();
  }

  if (
    (type === 'woff' || type === 'woff2') &&
    sourceBuffer.length >= 20 &&
    sourceBuffer.readUInt32BE(16) > MAX_SFNT_BYTES
  ) {
    throw new HttpError(413, '字体解压后超过 24 MB。');
  }
  const source =
    type === 'svg'
      ? sourceBuffer.toString('utf8')
      : bufferToArrayBuffer(sourceBuffer);
  let font: FontEditor.Font;
  try {
    font = createFont(source, {
      type,
      subset: subsetCodePoints?.length ? subsetCodePoints : undefined,
      hinting: keepHinting,
      kerning: keepKerning,
      compound2simple: true,
      inflate: (bytes) =>
        Array.from(
          inflateSync(Buffer.from(bytes), { maxOutputLength: MAX_SFNT_BYTES })
        )
    });
  } catch {
    throw new HttpError(422, '字体文件无效、已损坏或包含不支持的字体表。');
  }
  const fontObject = font.get() as FontObject;
  // The SVG reader ignores its subset option. Apply it explicitly while keeping
  // glyph zero (.notdef), and build the cmap used by preview/empty-glyph checks.
  if (type === 'svg') {
    if (subsetCodePoints?.length) {
      const wanted = new Set(subsetCodePoints);
      fontObject.glyf = fontObject.glyf.filter(
        (glyph, index) =>
          index === 0 || glyph.unicode?.some((code) => wanted.has(code))
      );
      for (const glyph of fontObject.glyf) {
        if (glyph.unicode)
          glyph.unicode = glyph.unicode.filter((code) => wanted.has(code));
      }
    }
    fontObject.cmap = {};
    fontObject.glyf.forEach((glyph, index) => {
      for (const code of glyph.unicode || []) fontObject.cmap[code] = index;
    });
  }
  const subsetGlyphHintingStripped =
    keepHinting && subsetCodePoints?.length
      ? stripSubsetGlyphHinting(fontObject)
      : 0;

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
}: ConvertOptions) {
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
      throw new HttpError(400, '增量更新模式缺少当前子集字体文件。');
    }

    const existingSubset = await createFontFromPayload({
      filename: existingSubsetPayload.filename,
      base64Data: existingSubsetPayload.base64Data,
      keepHinting: true,
      keepKerning: true
    });
    const existingCodePoints = extractCmapCodePoints(existingSubset.fontObject);

    if (!existingCodePoints.length) {
      throw new HttpError(
        400,
        '当前子集字体里没有可识别字符，无法进行增量更新。'
      );
    }

    existingSubsetCount = existingCodePoints.length;
    finalSubsetCodePoints = mergeCodePoints(
      existingCodePoints,
      requestedCodePoints
    );
  }

  const { sourceBuffer, font, fontObject, subsetGlyphHintingStripped } =
    await createFontFromPayload({
      filename,
      base64Data,
      subsetCodePoints: finalSubsetCodePoints,
      keepHinting,
      keepKerning
    });
  const sourceFeatures = inspectFontFeatures(fontObject);
  const removedKerningTables = !keepKerning
    ? stripKerningTables(fontObject)
    : [];
  const outputFeatures = inspectFontFeatures(fontObject);

  const shouldOptimize =
    optimize &&
    !subsetIncludesEmptyAdvanceGlyph(fontObject, finalSubsetCodePoints);

  if (shouldOptimize) {
    font.optimize();
  }

  if (normalizedOutputType === 'woff2') {
    await ensureWoff2Ready();
  }

  const output = font.write({
    type: normalizedOutputType,
    hinting: keepHinting,
    kerning: keepKerning,
    deflate: (bytes) => Array.from(deflateSync(Buffer.from(bytes)))
  });
  const outputBuffer = Buffer.isBuffer(output)
    ? output
    : typeof output === 'string'
      ? Buffer.from(output)
      : Buffer.from(new Uint8Array(output));

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
