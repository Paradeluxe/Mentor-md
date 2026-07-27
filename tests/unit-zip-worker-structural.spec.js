/**
 * Node unit test: zip-worker structural document.html + manifest.json
 * Run: node tests/unit-zip-worker-structural.spec.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'workers', 'zip-worker.js'), 'utf8');

function bootWorker() {
  const messages = [];
  const fakeSelf = {
    postMessage(msg) { messages.push(msg); },
    onmessage: null,
  };
  const sandbox = {
    self: fakeSelf,
    importScripts: () => { sandbox.JSZip = JSZip; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(WORKER_SRC, sandbox, { filename: 'zip-worker.js' });
  fakeSelf.onmessage = vm.runInContext('self.onmessage', sandbox);
  return {
    dispatch(payload) {
      return Promise.resolve(fakeSelf.onmessage({ data: payload }));
    },
    messages,
  };
}

function awaitResponse(worker, id, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      const found = worker.messages.find((m) => m && m.id === id);
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout ' + id));
      setTimeout(poll, 5);
    })();
  });
}

async function call(worker, payload) {
  const reply = awaitResponse(worker, payload.id);
  await worker.dispatch(payload);
  return reply;
}

const results = [];
function ok(name) {
  results.push({ name, ok: true });
  console.log('PASS', name);
}
function bad(name, err) {
  results.push({ name, ok: false });
  console.error('FAIL', name, err && err.stack ? err.stack : err);
}

async function run() {
  try {
    const worker = bootWorker();
    const sidecarText = '{"annotations":[]}';
    const documentHtml = '<p><span data-thread-id="t1">A</span></p>';
    const manifestText = '{"schemaVersion":1}';
    const reply = await call(worker, {
      id: 'struct-build',
      cmd: 'build',
      mdText: '# A',
      sidecar: { annotations: [] },
      sidecarText,
      documentHtml,
      manifestText,
      mediaFiles: [],
    });
    assert.strictEqual(reply.ok, true, 'build ok');
    const outZip = await JSZip.loadAsync(reply.result.bytes);
    assert.strictEqual(await outZip.file('content.md').async('string'), '# A');
    assert.strictEqual(await outZip.file('annotations.json').async('string'), sidecarText);
    assert.strictEqual(await outZip.file('document.html').async('string'), documentHtml);
    assert.strictEqual(await outZip.file('manifest.json').async('string'), manifestText);
    ok('build-writes-structural-files');
  } catch (e) {
    bad('build-writes-structural-files', e);
  }

  try {
    const worker = bootWorker();
    const zip = new JSZip();
    zip.file('content.md', '# A');
    zip.file('annotations.json', '{"annotations":[]}');
    zip.file('document.html', '<p><span data-thread-id="t1">A</span></p>');
    zip.file('manifest.json', '{"schemaVersion":1}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const reply = await call(worker, {
      id: 'struct-load',
      cmd: 'load',
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.annotationsText, '{"annotations":[]}');
    assert.strictEqual(reply.result.documentHtml, '<p><span data-thread-id="t1">A</span></p>');
    assert.strictEqual(reply.result.manifestText, '{"schemaVersion":1}');
    ok('load-returns-structural-files');
  } catch (e) {
    bad('load-returns-structural-files', e);
  }

  try {
    const worker = bootWorker();
    const zip = new JSZip();
    zip.file('content.md', '# legacy');
    zip.file('annotations.json', '{"annotations":[]}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const reply = await call(worker, {
      id: 'legacy-load',
      cmd: 'load',
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.mdText, '# legacy');
    assert.strictEqual(reply.result.documentHtml, null);
    assert.strictEqual(reply.result.manifestText, null);
    ok('legacy-load-null-structural');
  } catch (e) {
    bad('legacy-load-null-structural', e);
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`TOTAL ${results.length} PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
