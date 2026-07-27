// unit-cross-tab-sync — pure protocol for multi-page live sync
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  let pass = 0;
  const t = (name, fn) => {
    try {
      fn();
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      throw e;
    }
  };

  console.log('=== unit-cross-tab-sync ===');
  const M = await import(pathToFileURL(path.resolve(__dirname, '../modules/cross-tab-sync.js')).href);

  t('channelName stable for same documentKey', () => {
    assert.strictEqual(M.channelNameForDocument('doc-A'), M.channelNameForDocument('doc-A'));
  });
  t('channelName differs across documentKeys', () => {
    assert.notStrictEqual(M.channelNameForDocument('doc-A'), M.channelNameForDocument('doc-B'));
  });
  t('channelName has mentor-live-v1- prefix', () => {
    assert.ok(M.channelNameForDocument('doc-A').startsWith('mentor-live-v1-'));
  });
  t('compareLease higher term wins', () => {
    assert.ok(M.compareLease({ term: 2, ownerId: 'a' }, { term: 1, ownerId: 'z' }) > 0);
  });
  t('compareLease same term ownerId tiebreak', () => {
    assert.ok(M.compareLease({ term: 2, ownerId: 'z' }, { term: 2, ownerId: 'a' }) > 0);
  });
  t('nextLease increments term and sets owner', () => {
    assert.deepStrictEqual(M.nextLease({ term: 4, ownerId: 'old' }, 'new'), { term: 5, ownerId: 'new' });
  });

  const gate = M.createEnvelopeGate('doc-A');
  t('gate rejects other documentKey', () => {
    assert.strictEqual(gate.accept({ schema: 1, documentKey: 'doc-B', lease: { term: 1, ownerId: 'a' }, seq: 1 }), false);
  });
  t('gate accepts first valid envelope', () => {
    assert.strictEqual(gate.accept({ schema: 1, documentKey: 'doc-A', lease: { term: 1, ownerId: 'a' }, seq: 1 }), true);
  });
  t('gate rejects duplicate seq', () => {
    assert.strictEqual(gate.accept({ schema: 1, documentKey: 'doc-A', lease: { term: 1, ownerId: 'a' }, seq: 1 }), false);
  });
  t('gate accepts higher lease (seq resets)', () => {
    assert.strictEqual(gate.accept({ schema: 1, documentKey: 'doc-A', lease: { term: 2, ownerId: 'b' }, seq: 1 }), true);
  });

  t('mapImageSources rewrites image src without mutating input', () => {
    const json = { type: 'doc', content: [{ type: 'image', attrs: { src: 'blob:x', alt: 'x' } }] };
    const portable = M.mapImageSources(json, (src) => (src === 'blob:x' ? 'media/x.png' : src));
    assert.strictEqual(portable.content[0].attrs.src, 'media/x.png');
    assert.strictEqual(json.content[0].attrs.src, 'blob:x', 'input must not mutate');
  });

  t('mediaRevision stable for same blob meta', () => {
    const a = { 'media/a.png': { size: 3, type: 'image/png' } };
    const b = { 'media/a.png': { size: 3, type: 'image/png' } };
    assert.strictEqual(M.mediaRevision(a), M.mediaRevision(b));
  });
  t('mediaRevision changes when size changes', () => {
    const a = { 'media/a.png': { size: 3, type: 'image/png' } };
    const b = { 'media/a.png': { size: 4, type: 'image/png' } };
    assert.notStrictEqual(M.mediaRevision(a), M.mediaRevision(b));
  });

  console.log('\n=== RESULT:', pass, 'pass / 0 fail ===');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
