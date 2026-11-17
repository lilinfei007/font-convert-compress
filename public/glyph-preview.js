function uniqueCharacters(values) {
  const characters = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    for (const character of value) characters.add(character);
  }
  return [...characters];
}

// Work with Unicode characters rather than UTF-16 units, so supplementary
// characters remain one glyph. The input parser owns NFC normalization.
export function computeCoverage({ existing = [], requested = [], available = [], incremental = false, full = false } = {}) {
  const source = uniqueCharacters(available);
  const old = incremental ? uniqueCharacters(existing) : [];
  const input = full ? (incremental ? [] : source) : uniqueCharacters(requested);
  const sourceSet = new Set(source);
  const oldSet = new Set(old);
  return {
    requested: input,
    existing: old,
    added: input.filter(character => !oldSet.has(character) && sourceSet.has(character)),
    repeated: input.filter(character => oldSet.has(character)),
    missing: input.filter(character => !sourceSet.has(character)),
    lost: old.filter(character => !sourceSet.has(character)),
    output: uniqueCharacters([...old, ...input]).filter(character => sourceSet.has(character))
  };
}

let fontSequence = 0;
const browserFontTypes = new Set(['ttf', 'otf', 'woff', 'woff2']);

// A face is only published after the browser has decoded it. Pending loads are
// invalidated on replacement, so an old request cannot restore a stale font.
export function createFontLoader({ FontFace: FontFaceClass = globalThis.FontFace, fontSet = globalThis.document?.fonts } = {}) {
  const entries = new Map();

  function clear(kind) {
    const entry = entries.get(kind);
    if (entry?.face && fontSet) fontSet.delete(entry.face);
    entries.delete(kind);
  }

  return {
    async load(kind, payload) {
      clear(kind);
      const entry = { family: '', status: 'loading', error: '', face: null };
      entries.set(kind, entry);
      try {
        if (!FontFaceClass || !fontSet) throw new Error('浏览器不支持字体预览，请使用较新的浏览器。');
        const asset = payload?.previewFont || payload;
        if (!browserFontTypes.has(String(asset?.type || '').toLowerCase())) {
          throw new Error('没有收到可供浏览器显示的字体，请重试预览。');
        }
        if (typeof asset?.base64Data !== 'string' || !asset.base64Data) {
          throw new Error('预览字体数据为空，请重新加载字体。');
        }
        const decoded = globalThis.atob(asset.base64Data);
        const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
        const family = `GlyphPreview-${++fontSequence}`;
        const face = new FontFaceClass(family, bytes.buffer);
        entry.face = face;
        await face.load();
        if (entries.get(kind) !== entry) return null;
        if (face.status !== 'loaded') throw new Error('浏览器未能加载字体字形。');
        fontSet.add(face);
        entry.family = family;
        entry.status = 'loaded';
        return { family, status: 'loaded' };
      } catch (error) {
        if (entries.get(kind) !== entry) return null;
        if (entry.face && fontSet) fontSet.delete(entry.face);
        entry.face = null;
        entry.status = 'error';
        entry.error = `字形预览加载失败：${error instanceof Error ? error.message : '请重新加载字体。'}`;
        throw new Error(entry.error);
      }
    },
    get(kind) {
      const entry = entries.get(kind);
      return entry
        ? { family: entry.family, status: entry.status, error: entry.error }
        : { family: '', status: 'idle', error: '' };
    },
    clear,
    clearAll() {
      for (const kind of entries.keys()) clear(kind);
    }
  };
}
