import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

test('font workflow: conversion, preview, incremental update and source reuse', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'font-workflow-test-'));
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, PORT: String(port), FONT_DATA_DIR: temp,
      FONT_REPOSITORY_URL: '', FONT_REPOSITORY_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let errors = '';
  child.stderr.on('data', chunk => errors += chunk);
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('running at')) resolve(); });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${errors}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const post = (url, body) => fetch(base + url, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await ready;
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.ok, true);
    assert.equal(Object.keys(health).some(key => /cdn/i.test(key)), false);
    const source = (await readFile(new URL('./fixtures/sample.svg', import.meta.url))).toString('base64');
    const input = { filename: 'sample.svg', data: source, subsetMode: 'manual', subsetText: 'ABBA', operationMode: 'fresh' };
    let subset, sourceHash, outputHash;
    for (const outputType of ['ttf', 'woff', 'woff2', 'eot', 'svg']) {
      const response = await post('/api/convert', { ...input, outputType });
      assert.equal(response.status, 200, `${outputType}: ${response.status}`);
      assert.equal(response.headers.get('X-Subset-Count'), '2');
      assert.equal([...response.headers.keys()].some(key => /cdn/i.test(key)), false);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length > 0);
      if (outputType === 'ttf') {
        subset = bytes.toString('base64');
        sourceHash = response.headers.get('X-Source-Hash');
        outputHash = response.headers.get('X-Output-Hash');
      }
    }
    const match = await (await post('/api/source-match', { subsetHash: outputHash })).json();
    assert.equal(match.source.sourceHash, sourceHash);
    const originalPreview = await (await post('/api/font-preview', { filename: 'sample.ttf', data: subset })).json();
    const expectedCharacters = new Set([...originalPreview.characters, 'B', 'C']);
    const updated = await post('/api/convert', { sourceFontHash: sourceHash, outputType: 'woff2',
      operationMode: 'incremental', existingSubsetFilename: 'sample.ttf', existingSubsetData: subset,
      subsetMode: 'manual', subsetText: 'BC' });
    assert.equal(updated.status, 200);
    assert.equal(Number(updated.headers.get('X-Subset-Count')), expectedCharacters.size);
    assert.equal(Number(updated.headers.get('X-Existing-Subset-Count')), originalPreview.count);
    const preview = await post('/api/font-preview', { filename: 'result.woff2', data: Buffer.from(await updated.arrayBuffer()).toString('base64') });
    assert.equal(preview.status, 200);
    const previewData = await preview.json();
    assert.deepEqual(new Set(previewData.characters), expectedCharacters);
    const full = await post('/api/convert', { sourceFontHash: sourceHash, outputType: 'ttf', subsetMode: 'full' });
    assert.equal(full.status, 200);
    await full.arrayBuffer();
    const invalid = await post('/api/convert', { filename: 'bad.ttf', data: 'bm90IGEgZm9udA==', outputType: 'ttf' });
    assert.ok(invalid.status >= 400);
    const empty = await post('/api/convert', { ...input, subsetText: '', outputType: 'ttf' });
    assert.equal(empty.status, 400);
    const library = await (await fetch(base + '/api/source-fonts')).json();
    assert.ok(JSON.stringify(library).includes(sourceHash));
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    await rm(temp, { recursive: true, force: true });
  }
});
