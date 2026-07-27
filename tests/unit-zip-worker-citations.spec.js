/**
 * Independent Node test for classic zip-worker citation-library support.
 * Loads workers/zip-worker.js via the `vm` module after stubbing the Worker
 * globals (`self`, `importScripts`, `postMessage`, `onmessage`), then drives
 * it against the real JSZip library (already a project dependency).
 *
 * Asserts the four contracts spelled out by the parent task:
 *   1. build: when payload includes referencesJson / referencesBib, both
 *      files are written into the .mentor archive (alongside content.md,
 *      annotations.json, media/*) and the archive round-trips intact.
 *   2. load: when both files exist, they are returned as referencesJson /
 *      referencesBib (BibTeX as a string, JSON parsed object).
 *   3. Backward compatibility: old .mentor archives that omit the optional
 *      files must still load with referencesJson=null and referencesBib='',
 *      and without disturbing mdText / annotations / mediaFiles.
 *   4. Safety: existing safety constraints (media path validation, MAX_*,
 *      transfer list) are preserved.
 *
 * Run: `node tests/unit-zip-worker-citations.spec.js`
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const WORKER_SRC = fs.readFileSync(
  path.join(ROOT, 'workers', 'zip-worker.js'),
  'utf8'
);

/**
 * Spin up the classic worker source inside a fresh `vm` context. Stubs the
 * browser-Worker globals so `importScripts('./jszip.min.js')` resolves to the
 * same JSZip we `require` above, and `self.postMessage` enqueues messages for
 * the test instead of leaving the realm.
 *
 * Returns { dispatch, messages, sentTransfers, raw } where:
 *   - dispatch(payload)  — simulates the main thread posting a message.
 *   - messages           — array of { id, ok, result|error } the worker emitted.
 *   - sentTransfers      — array of ArrayBuffers the worker tried to transfer.
 *   - raw                — the underlying self/onmessage handles (for inspection).
 */
function bootWorker() {
  const messages = [];
  const sentTransfers = [];

  const fakeSelf = {
    postMessage(msg, transfer) {
      messages.push(msg);
      if (Array.isArray(transfer)) sentTransfers.push(transfer);
    },
    onmessage: null,
  };

  const sandbox = {
    self: fakeSelf,
    importScripts: (url) => {
      // The worker asks for './jszip.min.js'. In Node we already loaded JSZip
      // via require(), so just inject the constructor into the sandbox.
      sandbox.JSZip = JSZip;
    },
    console,
  };
  vm.createContext(sandbox);

  // First postMessage in the source is the 'init' ready ping — drop it so
  // tests only see application-level responses.
  vm.runInContext(WORKER_SRC, sandbox, { filename: 'zip-worker.js' });

  fakeSelf.onmessage = vm.runInContext(
    'self.onmessage',
    sandbox,
    { filename: 'zip-worker.js#onmessage-handle' }
  );

  return {
    dispatch(payload) {
      // Mimic Worker message shape: { data: payload }
      const evt = { data: payload };
      return Promise.resolve(fakeSelf.onmessage(evt));
    },
    messages,
    sentTransfers,
  };
}

/** Pull the next response matching `id` out of the worker's message log. */
function awaitResponse(worker, id, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      const found = worker.messages.find((m) => m && m.id === id);
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('worker response timeout for id=' + id));
      }
      setTimeout(poll, 5);
    })();
  });
}

/** Convenience wrapper: dispatch a command and wait for the matching reply. */
async function call(worker, payload) {
  const reply = awaitResponse(worker, payload.id);
  await worker.dispatch(payload);
  return reply;
}

const tests = [];
const ok = (name) => tests.push({ name, ok: true });
const bad = (name, err) => {
  tests.push({ name, ok: false, err: String((err && err.message) || err) });
  console.error('FAIL', name, err && err.stack ? err.stack : err);
};

async function run() {
  /* -------------------------------------------------------------- *
   * 1. build emits references.json + references.bib when provided   *
   * -------------------------------------------------------------- */
  try {
    const worker = bootWorker();
    const refsJson = { entries: [{ id: 'smith2020', type: 'article-journal' }] };
    const refsBib = '@article{smith2020,\n  title={A sample paper},\n  year={2020}\n}\n';

    const reply = await call(worker, {
      id: 'build-refs',
      cmd: 'build',
      mdText: '# Hello',
      sidecar: { annotations: [] },
      referencesJson: refsJson,
      referencesBib: refsBib,
      mediaFiles: [
        { path: 'media/a.png', bytes: new Uint8Array([1, 2, 3, 4]) },
      ],
    });

    assert.strictEqual(reply.ok, true, 'build should succeed');
    assert.ok(reply.result && reply.result.bytes, 'build should return bytes');
    assert.ok(reply.result.size > 0, 'build should report positive size');

    // Re-open the archive with the public JSZip to verify the new files made it.
    const outZip = await JSZip.loadAsync(reply.result.bytes);
    assert.ok(outZip.file('content.md'), 'content.md missing');
    assert.ok(outZip.file('annotations.json'), 'annotations.json missing');
    assert.ok(
      outZip.file('references.json'),
      'references.json missing from archive'
    );
    assert.ok(
      outZip.file('references.bib'),
      'references.bib missing from archive'
    );
    assert.ok(outZip.file('media/a.png'), 'media/a.png missing');

    const refsJsonText = await outZip.file('references.json').async('string');
    assert.deepStrictEqual(
      JSON.parse(refsJsonText),
      refsJson,
      'references.json content should round-trip'
    );
    const refsBibText = await outZip.file('references.bib').async('string');
    assert.strictEqual(refsBibText, refsBib, 'references.bib content should round-trip');

    ok('build-writes-references-json-and-bib');
  } catch (e) {
    bad('build-writes-references-json-and-bib', e);
  }

  /* -------------------------------------------------------------- *
   * 2. load returns referencesJson / referencesBib when present    *
   * -------------------------------------------------------------- */
  try {
    const worker = bootWorker();

    // Pre-bake an archive the *old* way: hand-assembled to be sure the
    // optional files are present but the worker still has to discover them.
    const zip = new JSZip();
    zip.file('content.md', '# X');
    zip.file('annotations.json', JSON.stringify({ annotations: [] }));
    zip.file('references.json', JSON.stringify({ entries: [{ id: 'x' }] }));
    zip.file('references.bib', '@misc{x,\n  note={hi}\n}\n');
    zip.file('media/img.png', new Uint8Array([9, 9, 9]));
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const reply = await call(worker, {
      id: 'load-refs',
      cmd: 'load',
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ),
    });

    assert.strictEqual(reply.ok, true, 'load should succeed');
    assert.strictEqual(reply.result.mdText, '# X');
    // Note: deepEqual (not deepStrictEqual) — the worker source is loaded in
    // a separate vm realm whose Object prototype is not === to ours, so
    // strict prototype-identity comparisons fail across the boundary.
    assert.deepEqual(reply.result.annotations, { annotations: [] });
    assert.deepEqual(
      reply.result.referencesJson,
      { entries: [{ id: 'x' }] },
      'referencesJson should be the parsed object'
    );
    assert.strictEqual(
      reply.result.referencesBib,
      '@misc{x,\n  note={hi}\n}\n',
      'referencesBib should be the raw string'
    );
    assert.ok(reply.result.mediaFiles && reply.result.mediaFiles['media/img.png']);

    ok('load-returns-references-json-and-bib');
  } catch (e) {
    bad('load-returns-references-json-and-bib', e);
  }

  /* -------------------------------------------------------------- *
   * 3. Backward compatibility: old archive without optional files   *
   * -------------------------------------------------------------- */
  try {
    const worker = bootWorker();

    const zip = new JSZip();
    zip.file('content.md', '# legacy');
    zip.file('annotations.json', JSON.stringify({ annotations: [] }));
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const reply = await call(worker, {
      id: 'load-legacy',
      cmd: 'load',
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ),
    });

    assert.strictEqual(reply.ok, true, 'legacy load should succeed');
    assert.strictEqual(reply.result.mdText, '# legacy');
    assert.deepEqual(reply.result.annotations, { annotations: [] });
    assert.strictEqual(
      reply.result.referencesJson,
      null,
      'referencesJson should be null when file is absent'
    );
    assert.strictEqual(
      reply.result.referencesBib,
      '',
      "referencesBib should be '' when file is absent"
    );
    assert.deepEqual(reply.result.mediaFiles, {});

    ok('load-legacy-no-references');
  } catch (e) {
    bad('load-legacy-no-references', e);
  }

  /* -------------------------------------------------------------- *
   * 4. build without optional fields still produces a valid archive *
   * -------------------------------------------------------------- */
  try {
    const worker = bootWorker();
    const reply = await call(worker, {
      id: 'build-bare',
      cmd: 'build',
      mdText: '# bare',
      sidecar: { annotations: [] },
      // no referencesJson, no referencesBib, no mediaFiles
    });

    assert.strictEqual(reply.ok, true);
    const outZip = await JSZip.loadAsync(reply.result.bytes);
    assert.ok(outZip.file('content.md'));
    assert.ok(outZip.file('annotations.json'));
    assert.strictEqual(
      outZip.file('references.json'),
      null,
      'references.json should be absent when not provided'
    );
    assert.strictEqual(
      outZip.file('references.bib'),
      null,
      'references.bib should be absent when not provided'
    );

    ok('build-bare-omits-references');
  } catch (e) {
    bad('build-bare-omits-references', e);
  }

  /* -------------------------------------------------------------- *
   * 5. load: malformed references.json must not crash the worker    *
   * -------------------------------------------------------------- */
  try {
    const worker = bootWorker();
    const zip = new JSZip();
    zip.file('content.md', '# broken');
    zip.file('annotations.json', JSON.stringify({ annotations: [] }));
    zip.file('references.json', '{not json'); // malformed
    zip.file('references.bib', '@misc{ok}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const reply = await call(worker, {
      id: 'load-broken-refs',
      cmd: 'load',
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ),
    });

    assert.strictEqual(reply.ok, true, 'worker should not crash on bad JSON');
    assert.strictEqual(reply.result.referencesJson, null);
    assert.strictEqual(reply.result.referencesBib, '@misc{ok}');
    assert.strictEqual(reply.result.mdText, '# broken');

    ok('load-malformed-references-json');
  } catch (e) {
    bad('load-malformed-references-json', e);
  }

  /* -------------------------------------------------------------- *
   * 6. Safety: media path traversal still rejected                 *
   * -------------------------------------------------------------- */
  try {
    const worker = bootWorker();
    const reply = await call(worker, {
      id: 'build-traversal',
      cmd: 'build',
      mdText: '# x',
      sidecar: { annotations: [] },
      mediaFiles: [
        { path: '../etc/passwd', bytes: new Uint8Array([1]) },
        { path: '/abs/foo.png', bytes: new Uint8Array([2]) },
        { path: 'media/ok.png', bytes: new Uint8Array([3, 3]) },
      ],
    });

    assert.strictEqual(reply.ok, true);
    const outZip = await JSZip.loadAsync(reply.result.bytes);
    assert.strictEqual(
      outZip.file('../etc/passwd'),
      null,
      'path traversal should be rejected'
    );
    assert.strictEqual(
      outZip.file('/abs/foo.png'),
      null,
      'absolute path should be rejected'
    );
    assert.ok(outZip.file('media/ok.png'), 'safe media must survive');

    ok('media-path-traversal-still-rejected');
  } catch (e) {
    bad('media-path-traversal-still-rejected', e);
  }

  /* -------------------------------------------------------------- *
   * 7. Round-trip: build -> load yields referencesJson + referencesBib
   * -------------------------------------------------------------- */
  try {
    const build = bootWorker();
    const refsJson = { entries: [{ id: 'k1' }, { id: 'k2' }] };
    const refsBib = '@book{k1,\n  title={T}\n}\n@article{k2,\n  title={U}\n}\n';

    const built = await call(build, {
      id: 'rt-build',
      cmd: 'build',
      mdText: '# round trip',
      sidecar: { annotations: [{ id: 'a1' }] },
      referencesJson: refsJson,
      referencesBib: refsBib,
    });
    assert.strictEqual(built.ok, true);

    const load = bootWorker();
    const reply = await call(load, {
      id: 'rt-load',
      cmd: 'load',
      bytes: built.result.bytes,
    });
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.mdText, '# round trip');
    assert.deepEqual(reply.result.annotations, { annotations: [{ id: 'a1' }] });
    assert.deepEqual(reply.result.referencesJson, refsJson);
    assert.strictEqual(reply.result.referencesBib, refsBib);

    ok('round-trip-references');
  } catch (e) {
    bad('round-trip-references', e);
  }

  return tests;
}

(async () => {
  const results = await run();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n=== unit-zip-worker-citations ===');
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();