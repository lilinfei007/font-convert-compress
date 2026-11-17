import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCoverage, createFontLoader } from '../public/glyph-preview.js';

test('incremental coverage separates additions, duplicates, missing input and unavailable old characters', () => {
  assert.deepEqual(computeCoverage({ existing: [...'AB'], requested: [...'BBCD'], available: [...'ABC'], incremental: true }), {
    requested: [...'BCD'], existing: [...'AB'], added: ['C'], repeated: ['B'], missing: ['D'], lost: [], output: [...'ABC']
  });
  const changedSource = computeCoverage({ existing: [...'AB𠮷'], requested: [...'B𠮷C𠮷'], available: [...'AC𠮷'], incremental: true });
  assert.deepEqual(changedSource.added, ['C']);
  assert.deepEqual(changedSource.repeated, ['B', '𠮷']);
  assert.deepEqual(changedSource.missing, ['B']);
  assert.deepEqual(changedSource.lost, ['B']);
  assert.deepEqual(changedSource.output, ['A', '𠮷', 'C']);
});

test('full mode distinguishes converting the source from regenerating only the old subset', () => {
  assert.deepEqual(computeCoverage({ existing: ['A'], requested: ['D'], available: [' ', 'A', 'B'], full: true }).output, [' ', 'A', 'B']);
  const keepOld = computeCoverage({ existing: ['A'], requested: ['D'], available: [' ', 'A', 'B'], incremental: true, full: true });
  assert.deepEqual(keepOld.output, ['A']);
  assert.deepEqual(keepOld.requested, []);
  assert.deepEqual(keepOld.added, []);
  assert.deepEqual(computeCoverage({ requested: ['D'], available: ['A'] }).output, []);
});

function fontEnvironment() {
  const pending = [];
  class TestFontFace {
    constructor(family, buffer) {
      this.family = family;
      this.buffer = buffer;
      this.status = 'unloaded';
    }
    load() {
      this.status = 'loading';
      return new Promise((resolve, reject) => pending.push({
        face: this,
        resolve: () => { this.status = 'loaded'; resolve(this); },
        reject
      }));
    }
  }
  const fontSet = new Set();
  return { pending, fontSet, loader: createFontLoader({ FontFace: TestFontFace, fontSet }) };
}
const font = { type: 'woff', base64Data: Buffer.from([1, 2, 3]).toString('base64') };

test('font loader waits for decoding, rejects stale loads, and removes replaced or cleared faces', async () => {
  const { loader, pending, fontSet } = fontEnvironment();
  const stale = loader.load('source', font);
  const current = loader.load('source', { type: 'svg', previewFont: font });
  assert.equal(loader.get('source').status, 'loading');
  assert.equal(fontSet.size, 0);
  pending[0].resolve();
  assert.equal(await stale, null);
  assert.equal(fontSet.size, 0);
  pending[1].resolve();
  const result = await current;
  assert.equal(result.status, 'loaded');
  assert.equal(loader.get('source').family, result.family);
  assert.equal(fontSet.size, 1);
  assert.deepEqual([...new Uint8Array(pending[1].face.buffer)], [1, 2, 3]);
  const next = loader.load('source', font);
  assert.equal(fontSet.size, 0);
  loader.clearAll();
  pending[2].resolve();
  assert.equal(await next, null);
  assert.equal(fontSet.size, 0);
  assert.equal(loader.get('source').status, 'idle');
});

test('font loader reports browser failure rather than publishing a fallback font', async () => {
  const { loader, pending, fontSet } = fontEnvironment();
  const load = loader.load('source', font);
  pending[0].reject(new Error('invalid font'));
  await assert.rejects(load, /字形预览加载失败：invalid font/);
  assert.equal(loader.get('source').status, 'error');
  assert.equal(fontSet.size, 0);
  await assert.rejects(loader.load('subset', { type: 'svg', base64Data: font.base64Data }), /没有收到可供浏览器显示的字体/);
  assert.equal(fontSet.size, 0);
});
