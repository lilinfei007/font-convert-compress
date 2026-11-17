import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { unstable_dev } from 'wrangler';

// Retired bindings may remain on an existing deployment. They must be ignored;
// the deliberately invalid URL also prevents a regression from contacting a repository.
const legacyRepositoryVars = {
  FONT_REPOSITORY_URL: 'invalid-legacy-repository-url',
  FONT_REPOSITORY_TOKEN: 'test-only-unused-token',
  FONT_REPOSITORY_BRANCH: 'unused-branch',
  FONT_REPOSITORY_PATH: 'unused-path'
};

test(
  'Cloudflare runtime: assets, conversion, R2 persistence, concurrency and validation',
  { timeout: 120000 },
  async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'font-cloudflare-test-'));
    let worker;
    let base;
    const start = async (vars) => {
      worker = await unstable_dev('dist/index.js', {
        config: 'wrangler.jsonc',
        port: 0,
        local: true,
        persist: true,
        persistTo: temp,
        logLevel: 'error',
        r2: [{ binding: 'FONTS', bucket_name: 'test-fonts' }],
        vars,
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          watch: false
        }
      });
      base = 'http://' + worker.address + ':' + worker.port;
    };
    const post = (url, body, headers = {}) =>
      fetch(base + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
      });
    try {
      await start();
      const page = await fetch(base + '/');
      assert.equal(page.status, 200);
      const pageText = await page.text();
      assert.match(pageText, /<title>字集 · 字体处理工作台<\/title>/);
      assert.doesNotMatch(pageText, /repositoryStoragePanel|connectRepositoryButton/);
      assert.match(
        page.headers.get('Content-Security-Policy'),
        /script-src 'self'/
      );
      for (const asset of ['/app.js', '/workflow.js', '/theme-refresh.css']) {
        const response = await fetch(base + asset);
        assert.equal(response.status, 200, asset);
        await response.arrayBuffer();
      }
      assert.equal((await fetch(base + '/missing-page')).status, 404);
      assert.equal((await fetch(base + '/api/missing')).status, 404);
      assert.equal((await post('/api/health', {})).status, 405);
      const presets = await (await fetch(base + '/api/charsets')).json();
      assert.deepEqual(
        presets.presets.map((item) => item.count),
        [3500, 6500]
      );
      const health = await (await fetch(base + '/api/health')).json();
      assert.equal(health.ok, true);
      assert.equal(health.runtime, 'cloudflare-workers');
      assert.equal(health.defaultStorage, 'r2');
      assert.equal(health.r2Storage.available, true);
      assert.equal(Object.hasOwn(health, 'repositoryStorage'), false);
      assert.equal(health.maxFontBytes, 16 * 1024 * 1024);
      assert.equal(
        Object.keys(health).some((key) => /cdn/i.test(key)),
        false
      );
      const source = (
        await readFile(new URL('./fixtures/sample.svg', import.meta.url))
      ).toString('base64');
      const input = {
        filename: 'sample.svg',
        data: source,
        subsetMode: 'manual',
        subsetText: 'ABBA',
        operationMode: 'fresh'
      };
      let subset, sourceHash, outputHash;
      for (const outputType of ['ttf', 'woff', 'woff2', 'eot', 'svg']) {
        const response = await post('/api/convert', { ...input, outputType });
        assert.equal(response.status, 200, `${outputType}: ${response.status}`);
        assert.equal(response.headers.get('X-Subset-Count'), '2');
        assert.equal(
          [...response.headers.keys()].some((key) => /cdn/i.test(key)),
          false
        );
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.ok(bytes.length > 0);
        const decoded = await post('/api/font-preview', {
          filename: 'roundtrip.' + outputType,
          data: bytes.toString('base64'),
          includeData: false
        });
        assert.equal(
          decoded.status,
          200,
          'preview ' + outputType + ': ' + (await decoded.clone().text())
        );
        const details = await decoded.json();
        assert.deepEqual(
          new Set(details.characters),
          new Set('AB'),
          outputType + ': ' + JSON.stringify(details)
        );
        assert.equal(details.base64Data, '');
        if (outputType === 'ttf') {
          subset = bytes.toString('base64');
          sourceHash = response.headers.get('X-Source-Hash');
          outputHash = response.headers.get('X-Output-Hash');
        }
      }
      const match = await (
        await post('/api/source-match', { subsetHash: outputHash })
      ).json();
      assert.equal(match.source.sourceHash, sourceHash);
      const originalPreview = await (
        await post('/api/font-preview', {
          filename: 'sample.ttf',
          data: subset
        })
      ).json();
      const expectedCharacters = new Set([
        ...originalPreview.characters,
        'B',
        'C'
      ]);
      const updated = await post('/api/convert', {
        sourceFontHash: sourceHash,
        outputType: 'woff2',
        operationMode: 'incremental',
        existingSubsetFilename: 'sample.ttf',
        existingSubsetData: subset,
        subsetMode: 'manual',
        subsetText: 'BC'
      });
      assert.equal(updated.status, 200);
      assert.equal(
        Number(updated.headers.get('X-Subset-Count')),
        expectedCharacters.size
      );
      assert.equal(
        Number(updated.headers.get('X-Existing-Subset-Count')),
        originalPreview.count
      );
      const preview = await post('/api/font-preview', {
        filename: 'result.woff2',
        data: Buffer.from(await updated.arrayBuffer()).toString('base64')
      });
      assert.equal(preview.status, 200);
      const previewData = await preview.json();
      assert.deepEqual(new Set(previewData.characters), expectedCharacters);
      const full = await post('/api/convert', {
        sourceFontHash: sourceHash,
        outputType: 'ttf',
        subsetMode: 'full'
      });
      assert.equal(full.status, 200);
      await full.arrayBuffer();
      const invalid = await post('/api/convert', {
        filename: 'bad.ttf',
        data: 'bm90IGEgZm9udA==',
        outputType: 'ttf'
      });
      assert.ok(invalid.status >= 400);
      const empty = await post('/api/convert', {
        ...input,
        subsetText: '',
        outputType: 'ttf'
      });
      assert.equal(empty.status, 400);
      const library = await (await fetch(base + '/api/source-fonts')).json();
      assert.ok(JSON.stringify(library).includes(sourceHash));

      // Explicit temporary mode must bypass persistence even when R2 is bound.
      const temporaryData = Buffer.from(
        Buffer.from(source, 'base64')
          .toString()
          .replace(/Workflow/g, 'Temporary')
      ).toString('base64');
      const temporary = await post(
        '/api/convert',
        { ...input, data: temporaryData, outputType: 'woff2' },
        { 'X-Font-Storage-Mode': 'none' }
      );
      assert.equal(temporary.status, 200);
      assert.equal(temporary.headers.get('X-Server-Source-Saved'), 'false');
      assert.equal(temporary.headers.get('X-Server-Source-Action'), 'skipped');
      const temporaryHash = temporary.headers.get('X-Source-Hash');
      const temporaryOutputHash = temporary.headers.get('X-Output-Hash');
      await temporary.arrayBuffer();
      const persistentLibrary = await (
        await fetch(base + '/api/source-fonts')
      ).json();
      assert.equal(
        persistentLibrary.sources.some(
          (record) => record.sourceHash === temporaryHash
        ),
        false
      );
      const temporaryMatch = await (
        await post('/api/source-match', { subsetHash: temporaryOutputHash })
      ).json();
      assert.equal(temporaryMatch.match, null);
      assert.equal(temporaryMatch.source, null);

      const alias = await post('/api/source-fonts/alias', {
        sourceHash,
        alias: '  测试字体  '
      });
      assert.equal(alias.status, 200);
      assert.equal((await alias.json()).source.alias, '测试字体');
      // Recreate the runtime to prove the library is not held in isolate memory.
      await worker.stop();
      worker = undefined;
      await start(legacyRepositoryVars);
      const restoredHealth = await (await fetch(base + '/api/health')).json();
      assert.equal(restoredHealth.defaultStorage, 'r2');
      assert.equal(Object.hasOwn(restoredHealth, 'repositoryStorage'), false);
      const restored = await (await fetch(base + '/api/source-fonts')).json();
      assert.equal(
        restored.sources.find((item) => item.sourceHash === sourceHash).alias,
        '测试字体'
      );
      const reused = await post('/api/convert', {
        sourceFontHash: sourceHash,
        outputType: 'woff2',
        subsetMode: 'manual',
        subsetText: 'A'
      });
      assert.equal(reused.status, 200);
      await reused.arrayBuffer();
      const rematched = await (
        await post('/api/source-match', { subsetHash: outputHash })
      ).json();
      assert.equal(rematched.source.sourceHash, sourceHash);
      const fileSubset = await post('/api/convert', {
        sourceFontHash: sourceHash,
        outputType: 'ttf',
        subsetMode: 'file',
        charsetFileText: 'ABC'
      });
      assert.equal(fileSubset.status, 200);
      assert.equal(fileSubset.headers.get('X-Subset-Count'), '3');
      await fileSubset.arrayBuffer();
      const unknownPreset = await post('/api/convert', {
        ...input,
        subsetMode: 'preset',
        presetId: 'unknown',
        outputType: 'ttf'
      });
      assert.equal(unknownPreset.status, 400);
      // Distinct concurrent writes must all survive the read/modify/write index flow.
      const svg = Buffer.from(source, 'base64').toString();
      const concurrent = await Promise.all(
        [0, 1, 2].map(async (index) => {
          const data = Buffer.from(
            svg.replace(/Workflow/g, 'Parallel' + index)
          ).toString('base64');
          const response = await post('/api/convert', {
            ...input,
            data,
            filename: 'parallel' + index + '.svg',
            outputType: 'ttf'
          });
          assert.equal(response.status, 200);
          await response.arrayBuffer();
          return response.headers.get('X-Source-Hash');
        })
      );
      const afterConcurrent = await (
        await fetch(base + '/api/source-fonts')
      ).json();
      for (const hash of concurrent)
        assert.ok(
          afterConcurrent.sources.some((item) => item.sourceHash === hash)
        );
      const remove = await post('/api/source-fonts/delete', { sourceHash });
      assert.equal(remove.status, 200);
      assert.equal(
        (
          await (
            await post('/api/source-match', { subsetHash: outputHash })
          ).json()
        ).source,
        null
      );
      assert.equal(
        (await post('/api/font-preview', { sourceFontHash: sourceHash }))
          .status,
        404
      );
      assert.equal(
        (await post('/api/source-fonts/delete', { sourceHash })).status,
        404
      );
      assert.equal(
        (
          await post('/api/source-fonts/alias', {
            sourceHash: '../bad',
            alias: 'bad'
          })
        ).status,
        400
      );
      assert.equal(
        (await post('/api/convert', { ...input, data: '%%%%' })).status,
        400
      );
      assert.equal(
        (await post('/api/convert', { ...input, keepHinting: 'false' })).status,
        400
      );
      assert.equal(
        (
          await post('/api/convert', {
            ...input,
            data: Buffer.alloc(16 * 1024 * 1024 + 1).toString('base64')
          })
        ).status,
        413
      );
      assert.equal(
        (
          await post('/api/convert', input, {
            Origin: 'https://another-origin.example'
          })
        ).status,
        403
      );
      assert.equal(
        (await post('/api/convert', input, { 'X-Font-Storage-Mode': 'remote' }))
          .status,
        400
      );
      const malformed = await fetch(base + '/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      });
      assert.equal(malformed.status, 400);
      assert.equal((await post('/api/convert', null)).status, 400);
      assert.equal(
        (await fetch(base + '/api/convert', { method: 'POST', body: '{}' }))
          .status,
        415
      );
      for (const url of [
        'http://127.0.0.1/font.ttf',
        'http://169.254.169.254/font.ttf',
        'http://[::1]/font.ttf',
        'ftp://example.com/font.ttf',
        'https://user:secret@example.com/font.ttf'
      ]) {
        assert.equal(
          (await post('/api/font-fingerprint', { url })).status,
          400,
          url
        );
      }
      const healthResponse = await fetch(base + '/api/health');
      assert.equal(healthResponse.headers.get('Cache-Control'), 'no-store');
      assert.equal(
        healthResponse.headers.get('Access-Control-Allow-Origin'),
        null
      );
    } finally {
      await worker?.stop();
      const target = path.resolve(temp);
      assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
      assert.ok(path.basename(target).startsWith('font-cloudflare-test-'));
      await rm(target, { recursive: true, force: true });
    }
  }
);

test(
  'Cloudflare without R2: temporary conversion, previews and manual incremental update',
  { timeout: 120000 },
  async () => {
    let worker;
    try {
      worker = await unstable_dev('dist/index.js', {
        config: 'wrangler.jsonc',
        port: 0,
        local: true,
        persist: false,
        logLevel: 'error',
        vars: legacyRepositoryVars,
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          watch: false
        }
      });
      const base = 'http://' + worker.address + ':' + worker.port;
      const post = (url, body, headers = {}) =>
        fetch(base + url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body)
        });
      const health = await (await fetch(base + '/api/health')).json();
      assert.equal(health.ok, true);
      assert.equal(health.defaultStorage, 'none');
      assert.equal(health.r2Storage.available, false);
      assert.equal(Object.hasOwn(health, 'repositoryStorage'), false);
      const source = await readFile(
        new URL('./fixtures/sample.svg', import.meta.url)
      );
      const sourceHash = createHash('sha256').update(source).digest('hex');
      const input = {
        filename: 'sample.svg',
        data: source.toString('base64'),
        operationMode: 'fresh',
        subsetMode: 'manual',
        subsetText: 'AB'
      };
      let subset;
      let outputHash;
      for (const outputType of ['ttf', 'woff', 'woff2', 'eot', 'svg']) {
        const response = await post('/api/convert', { ...input, outputType });
        assert.equal(
          response.status,
          200,
          `${outputType}: ${await response.clone().text()}`
        );
        assert.equal(response.headers.get('X-Source-Hash'), sourceHash);
        assert.equal(response.headers.get('X-Server-Source-Saved'), 'false');
        assert.equal(response.headers.get('X-Server-Source-Action'), 'skipped');
        assert.equal(response.headers.get('X-Server-Match-Saved'), 'false');
        assert.equal(response.headers.get('X-Server-Match-Action'), 'skipped');
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(
          response.headers.get('X-Output-Hash'),
          createHash('sha256').update(bytes).digest('hex')
        );
        const decoded = await post('/api/font-preview', {
          filename: 'roundtrip.' + outputType,
          data: bytes.toString('base64'),
          includeData: false
        });
        assert.equal(decoded.status, 200);
        const preview = await decoded.json();
        assert.deepEqual(new Set(preview.characters), new Set('AB'));
        assert.equal(preview.base64Data, '');
        if (outputType === 'ttf') {
          subset = bytes.toString('base64');
          outputHash = response.headers.get('X-Output-Hash');
        }
      }
      const library = await (await fetch(base + '/api/source-fonts')).json();
      assert.deepEqual(library.sources, []);
      const matched = await (
        await post('/api/source-match', { subsetHash: outputHash })
      ).json();
      assert.equal(matched.match, null);
      assert.equal(matched.source, null);
      const incremental = await post('/api/convert', {
        ...input,
        operationMode: 'incremental',
        existingSubsetFilename: 'existing.ttf',
        existingSubsetData: subset,
        subsetText: 'C',
        outputType: 'woff2'
      });
      assert.equal(incremental.status, 200);
      assert.equal(incremental.headers.get('X-Existing-Subset-Count'), '2');
      assert.equal(incremental.headers.get('X-Subset-Count'), '3');
      assert.equal(incremental.headers.get('X-Server-Source-Saved'), 'false');
      const updatedPreview = await post('/api/font-preview', {
        filename: 'incremental.woff2',
        data: Buffer.from(await incremental.arrayBuffer()).toString('base64'),
        includeData: false
      });
      assert.equal(updatedPreview.status, 200);
      assert.deepEqual(
        new Set((await updatedPreview.json()).characters),
        new Set('ABC')
      );
      for (const mode of ['none', 'local']) {
        const response = await post(
          '/api/convert',
          { ...input, outputType: 'ttf' },
          {
            'X-Font-Storage-Mode': mode
          }
        );
        assert.equal(response.status, 200, mode);
        assert.equal(response.headers.get('X-Server-Source-Saved'), 'false');
        await response.arrayBuffer();
      }
      const unavailableR2 = await post('/api/convert', input, {
        'X-Font-Storage-Mode': 'r2'
      });
      assert.equal(unavailableR2.status, 400);
      assert.match((await unavailableR2.json()).error, /R2|字体库|存储/);
      const retiredStorageMode = await post('/api/convert', input, {
        'X-Font-Storage-Mode': 'remote'
      });
      assert.equal(retiredStorageMode.status, 400);
      assert.match((await retiredStorageMode.json()).error, /存储模式/);
      const reuse = await post('/api/convert', {
        sourceFontHash: sourceHash,
        outputType: 'ttf'
      });
      assert.equal(reuse.status, 400);
      assert.match((await reuse.json()).error, /上传|字体库|存储/);
      assert.deepEqual(
        (await (await fetch(base + '/api/source-fonts')).json()).sources,
        []
      );
    } finally {
      await worker?.stop();
    }
  }
);
