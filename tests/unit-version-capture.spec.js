// Version capture helpers — pure logic that app.js wires into save paths.
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const vh = await import(
  pathToFileURL(path.join(ROOT, 'modules/version-history.js')).href
);
const {
  packMediaForVersion,
  estimateVersionByteSize,
  createVersionRow,
  VERSION_MEDIA_MAX_BYTES,
} = vh;

// packMediaForVersion: keeps blobs within cap, omits overflow
{
  const small = { size: 100 };
  const big = { size: VERSION_MEDIA_MAX_BYTES }; // alone exceeds? exactly at cap fits
  const res1 = packMediaForVersion({ a: small, b: { size: 5 } }, { maxBytes: 200 });
  assert.deepStrictEqual(Object.keys(res1.mediaFiles).sort(), ['a', 'b']);
  assert.strictEqual(res1.mediaOmitted, false);
  assert.strictEqual(res1.mediaBytes, 105);

  const res2 = packMediaForVersion({ a: small, c: big }, { maxBytes: 150 });
  assert.deepStrictEqual(Object.keys(res2.mediaFiles), ['a']);
  assert.strictEqual(res2.mediaOmitted, true, 'overflow flagged');
  assert.strictEqual(res2.mediaBytes, 100);

  const res3 = packMediaForVersion(null);
  assert.deepStrictEqual(res3.mediaFiles, {});
  assert.strictEqual(res3.mediaOmitted, false);
  assert.strictEqual(res3.mediaBytes, 0);
}

// estimateVersionByteSize counts body + serializable payloads
{
  const n = estimateVersionByteSize({
    body: 'hello',
    annotations: [{ threadId: 'x' }],
    references: [{ key: 'a' }],
    mediaBytes: 10,
  });
  assert.ok(n > 20, 'byte size roughly counts payloads, got ' + n);
  assert.ok(n < 500, 'no runaway size, got ' + n);
}

// createVersionRow shape + defaults
{
  const row = createVersionRow({
    id: 'v-1',
    documentId: 'doc-1',
    name: 'paper.mentor',
    kind: 'named',
    label: 'pin-A',
    hash: 'h1',
    body: '# x',
    annotations: [{ threadId: 't' }],
  });
  assert.strictEqual(row.id, 'v-1');
  assert.strictEqual(row.documentId, 'doc-1');
  assert.strictEqual(row.name, 'paper.mentor');
  assert.strictEqual(row.kind, 'named');
  assert.strictEqual(row.label, 'pin-A');
  assert.strictEqual(row.mediaOmitted, false);
  assert.strictEqual(row.mediaFiles, null);
  assert.ok(typeof row.createdAt === 'number');

  const def = createVersionRow({ id: 'v-2', documentId: 'd' });
  assert.strictEqual(def.kind, 'manual');
  assert.strictEqual(def.name, 'd', 'name falls back to documentId');
}

// capture decision chain: shouldCaptureVersion gates row creation
{
  assert.strictEqual(vh.shouldCaptureVersion({ reason: 'autosave', prevHash: null, nextHash: 'h' }), true);
  assert.strictEqual(vh.shouldCaptureVersion({ reason: 'autosave', prevHash: 'h', nextHash: 'h' }), false, 'autosave dedup');
  assert.strictEqual(vh.shouldCaptureVersion({ reason: 'manual', prevHash: 'h', nextHash: 'h' }), false, 'manual dedup');
  assert.strictEqual(vh.shouldCaptureVersion({ reason: 'draft', prevHash: null, nextHash: 'h' }), false, 'draft never versions');
}

console.log('unit-version-capture: PASS');
