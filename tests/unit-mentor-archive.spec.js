/**
 * Unit tests for modules/mentor-archive.js
 * Run: node tests/unit-mentor-archive.spec.js
 */
import assert from 'node:assert/strict';
import {
  STRUCTURAL_HTML_NAME,
  ARCHIVE_MANIFEST_NAME,
  STRUCTURAL_ARCHIVE_SCHEMA,
  sha256Hex,
  createArchiveManifest,
  verifyStructuralArchive,
} from '../modules/mentor-archive.js';

const results = [];
function ok(name) {
  results.push({ name, ok: true });
  console.log('PASS', name);
}
function bad(name, err) {
  results.push({ name, ok: false, err: String(err && err.message || err) });
  console.error('FAIL', name, err);
}

async function run() {
  try {
    assert.equal(STRUCTURAL_HTML_NAME, 'document.html');
    assert.equal(ARCHIVE_MANIFEST_NAME, 'manifest.json');
    assert.equal(STRUCTURAL_ARCHIVE_SCHEMA, 1);
    assert.equal(
      await sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    ok('constants-and-sha256');
  } catch (e) {
    bad('constants-and-sha256', e);
  }

  try {
    const manifest = await createArchiveManifest({
      mdText: '# A',
      annotationsText: '{"annotations":[]}',
      documentHtml: '<p>A</p>',
      createdAt: '2026-07-27T00:00:00.000Z',
    });
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.body, 'document.html');
    assert.equal(manifest.createdAt, '2026-07-27T00:00:00.000Z');
    assert.deepEqual(Object.keys(manifest.hashes).sort(), [
      'annotations.json',
      'content.md',
      'document.html',
    ]);
    assert.equal(manifest.hashes['content.md'], await sha256Hex('# A'));
    assert.equal(manifest.hashes['annotations.json'], await sha256Hex('{"annotations":[]}'));
    assert.equal(manifest.hashes['document.html'], await sha256Hex('<p>A</p>'));
    ok('create-archive-manifest');
  } catch (e) {
    bad('create-archive-manifest', e);
  }

  try {
    const files = {
      mdText: '# A',
      annotationsText: '{"annotations":[]}',
      documentHtml: '<p>A</p>',
    };
    const good = await createArchiveManifest({ ...files, createdAt: 'x' });
    assert.deepEqual(await verifyStructuralArchive({ ...files, manifest: good }), {
      usable: true,
      reason: 'verified',
    });
    assert.equal(
      (await verifyStructuralArchive({ ...files, manifest: null })).reason,
      'manifest-missing',
    );
    assert.equal(
      (await verifyStructuralArchive({ ...files, documentHtml: null, manifest: good })).reason,
      'document-html-missing',
    );
    assert.equal(
      (await verifyStructuralArchive({ ...files, mdText: '# changed', manifest: good })).reason,
      'content-md-mismatch',
    );
    assert.equal(
      (await verifyStructuralArchive({ ...files, annotationsText: '{}', manifest: good })).reason,
      'annotations-json-mismatch',
    );
    assert.equal(
      (await verifyStructuralArchive({ ...files, documentHtml: '<p>B</p>', manifest: good })).reason,
      'document-html-mismatch',
    );
    assert.equal(
      (await verifyStructuralArchive({
        ...files,
        manifest: { ...good, schemaVersion: 99 },
      })).reason,
      'manifest-version',
    );
    ok('verify-structural-archive');
  } catch (e) {
    bad('verify-structural-archive', e);
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`TOTAL ${results.length} PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

run();
