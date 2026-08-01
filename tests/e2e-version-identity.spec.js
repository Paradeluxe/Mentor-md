// e2e: reopen / restore preserve documentId for VersionStore continuity
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;
const DOC_ID = 'identity-doc-' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://127.0.0.1:${PORT}/index.html?as=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    localStorage.setItem('Mentor:versionHistory', '1');
  });

  // Seed document + one version under stable documentId
  const seed = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    M.loadMarkdownIntoEditor(
      'identity.mentor',
      '# v1\n\nbody-one\n',
      { annotations: [], version: '1' },
      { alreadyPrepared: true, documentId: docId, saveMode: 'mentor-download', references: null }
    );
    M.State.mediaFiles = {};
    M.State.fileMtime = null;
    const snap = M.createSaveSnapshot();
    const cap = await M.recordVersionFromSnapshot(snap, { kind: 'manual' });
    return {
      documentId: M.State.currentFile.documentId,
      versionOk: !!(cap && (cap.ok || cap.skipped)),
      capId: cap && cap.id,
    };
  }, DOC_ID);
  assert.strictEqual(seed.documentId, DOC_ID, 'seed documentId');
  assert.ok(seed.versionOk, 'seed version captured');

  // Soft reopen via activateOpenedDocument with same documentId
  const reopen = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    await M.activateOpenedDocument({
      name: 'identity.mentor',
      content: '# v1\n\nbody-one\nreopened\n',
      annotations: { annotations: [], version: '1' },
      references: null,
      mediaFiles: {},
      handle: null,
      saveMode: 'mentor-download',
      documentId: docId,
      forceDisk: true,
      preferDraft: false,
      quiet: true,
    });
    const rows = await M.VersionStore.listByDocumentId(docId);
    return {
      documentId: M.State.currentFile.documentId,
      rowCount: rows.length,
      kinds: rows.map((r) => r.kind),
    };
  }, DOC_ID);
  assert.strictEqual(reopen.documentId, DOC_ID, 'reopen keeps documentId');
  assert.ok(reopen.rowCount >= 1, 'history still listed under same id, got ' + reopen.rowCount);

  // Capture second version after reopen
  const second = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    M.State.editor.commands.setContent('<p>body-two</p>', false);
    try { M.markDirty(); } catch (_) {}
    const snap = M.createSaveSnapshot();
    await M.recordVersionFromSnapshot(snap, { kind: 'manual' });
    const rows = await M.VersionStore.listByDocumentId(docId);
    return { count: rows.length, bodies: rows.map((r) => (r.body || '').slice(0, 40)) };
  }, DOC_ID);
  assert.ok(second.count >= 2, 'second version under same documentId, got ' + second.count);

  // Restore oldest version still under same documentId; restore leaves dirty
  const restored = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    const rows = await M.VersionStore.listByDocumentId(docId);
    // pick oldest (last in newest-first list)
    const oldest = rows[rows.length - 1];
    const res = await M.restoreVersion(oldest.id);
    return {
      ok: !!(res && res.ok),
      documentId: M.State.currentFile.documentId,
      dirty: !!(M.State.currentFile && M.State.currentFile.dirty),
      body: M.State.editor ? M.State.editor.getText() : '',
    };
  }, DOC_ID);
  assert.strictEqual(restored.ok, true, 'restore ok');
  assert.strictEqual(restored.documentId, DOC_ID, 'restore keeps documentId');
  assert.strictEqual(restored.dirty, true, 'restore marks dirty');

  // Stale-tab mismatch: switch documentId then reject restore of other doc version
  const mismatch = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    const otherId = docId + '-other';
    // create a version under original id while still on it
    const rows = await M.VersionStore.listByDocumentId(docId);
    const targetId = rows[0] && rows[0].id;
    // switch document identity
    M.State.currentFile.documentId = otherId;
    const res = await M.restoreVersion(targetId);
    return { res, activeId: M.State.currentFile.documentId };
  }, DOC_ID);
  assert.ok(mismatch.res && mismatch.res.ok === false, 'cross-doc restore rejected');
  assert.ok(
    mismatch.res.error === 'document-mismatch' || mismatch.res.error === 'missing',
    'mismatch error code, got ' + JSON.stringify(mismatch.res)
  );

  await browser.close();
  console.log('PASS e2e-version-identity');
})().catch((e) => {
  console.error('FAIL e2e-version-identity', e);
  process.exit(1);
});
