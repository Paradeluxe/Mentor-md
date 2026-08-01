// e2e: official save commit lifecycle — dirtyGen, draft align, version, copy/export.
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;
const DOC_ID = 'save-lifecycle-' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?as=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  // Seed document with write handle mock
  await page.evaluate((docId) => {
    const M = window.__mdAnnotator;
    localStorage.removeItem('Mentor:versionHistory');
    localStorage.setItem('Mentor:autoSave', '1');
    M.loadMarkdownIntoEditor(
      'lifecycle.mentor',
      '# saved\n\nbody\n',
      { annotations: [], version: '1' },
      { alreadyPrepared: true, documentId: docId, saveMode: 'mentor-handle', references: null }
    );
    M.State.currentFile.handle = {
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} }),
      getFile: async () => ({ lastModified: Date.now(), name: 'lifecycle.mentor' }),
    };
    M.State.saveMode = 'mentor-handle';
    M.State.mediaFiles = {};
    // null mtime disables external-modified gate (mock handle has no real disk clock).
    M.State.fileMtime = null;
    M.State.readOnlyMode = false;
  }, DOC_ID);
  await page.waitForTimeout(200);

  // 1. Same generation: disk commit clears dirty, aligns DraftStore, records one version.
  const r1 = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    M.State.editor.commands.setContent('<p>saved</p>', false);
    M.markDirty();
    const res = await M.writeCurrentToHandle({ reason: 'manual', showProgress: false });
    const draft = await M.DraftStore.getDraft(docId);
    const rows = await M.VersionStore.listByDocumentId(docId);
    return {
      ok: !!res.ok,
      clean: !M.State.currentFile.dirty,
      draftBody: draft && draft.body,
      versionKinds: rows.map((r) => r.kind),
      warnings: res.warnings || [],
    };
  }, DOC_ID);
  assert.strictEqual(r1.ok, true, 'save ok');
  assert.strictEqual(r1.clean, true, 'clears dirty');
  assert.ok(r1.draftBody && r1.draftBody.includes('saved'), 'draft aligned, got ' + JSON.stringify(r1.draftBody));
  assert.ok(r1.versionKinds.includes('manual'), 'manual version recorded: ' + JSON.stringify(r1.versionKinds));

  // 2. Edit during write: saved snapshot versioned, newer editor remains dirty.
  const r2 = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    let resolveWrite;
    const gate = new Promise((res) => { resolveWrite = res; });
    M.State.editor.commands.setContent('<p>v1</p>', false);
    M.markDirty();
    const genAtStart = M.State.currentFile.dirtyGen;
    const fixedMtime = Date.now();
    M.State.fileMtime = fixedMtime;
    M.State.currentFile.handle = {
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => ({
        write: async () => { await gate; },
        close: async () => {},
        abort: async () => {},
      }),
      getFile: async () => ({ lastModified: fixedMtime, name: 'lifecycle.mentor' }),
    };
    const p = M.writeCurrentToHandle({ reason: 'manual', showProgress: false });
    M.State.editor.commands.setContent('<p>v2-edited</p>', false);
    M.markDirty();
    resolveWrite();
    const res = await p;
    const rows = await M.VersionStore.listByDocumentId(docId);
    const newest = rows[0];
    return {
      ok: !!res.ok,
      dirty: !!M.State.currentFile.dirty,
      genStart: genAtStart,
      genNow: M.State.currentFile.dirtyGen,
      versionBody: newest && newest.body,
    };
  }, DOC_ID);
  assert.strictEqual(r2.ok, true, 'mid-edit save ok');
  assert.strictEqual(r2.dirty, true, 'remains dirty after mid-edit');
  assert.ok(r2.genNow > r2.genStart, 'gen advanced');
  assert.ok(r2.versionBody && r2.versionBody.includes('v1'), 'versioned pre-edit body, got ' + JSON.stringify(r2.versionBody));

  // 3. Copy/export does not clear dirty or create a history row.
  const r3 = await page.evaluate(async (docId) => {
    const M = window.__mdAnnotator;
    M.State.editor.commands.setContent('<p>copy-me</p>', false);
    M.markDirty();
    const before = (await M.VersionStore.listByDocumentId(docId)).length;
    // stub downloadBlob to avoid navigation
    const orig = M.downloadBlob;
    window.__dl = 0;
    // downloadMentorSnapshot uses downloadBlob from module scope — patch via evaluate override of a.createElement is hard;
    // call with markCleanOnSuccess:false through createSaveSnapshot path:
    const snap = M.createSaveSnapshot();
    // Intercept anchor click downloads
    const clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download || this.href); };
    const copyResult = await M.downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
    HTMLAnchorElement.prototype.click = origClick;
    const after = (await M.VersionStore.listByDocumentId(docId)).length;
    return {
      ok: !!copyResult.ok,
      dirty: !!M.State.currentFile.dirty,
      versionCountDelta: after - before,
      clicks: clicks.length,
    };
  }, DOC_ID);
  assert.strictEqual(r3.ok, true, 'copy ok');
  assert.strictEqual(r3.dirty, true, 'copy keeps dirty');
  assert.strictEqual(r3.versionCountDelta, 0, 'copy does not add version');

  // 4. classifySaveOutcome is exported
  const cls = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return M.classifySaveOutcome({
      officialCommit: true,
      snapshotGen: 1,
      currentGen: 2,
      activeDocument: true,
    });
  });
  assert.strictEqual(cls.markClean, false);
  assert.strictEqual(cls.queueFollowup, true);

  // 5. Version button pressed state
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    document.querySelector('#author-modal')?.setAttribute('aria-hidden', 'true');
  });
  await page.evaluate(() => window.__mdAnnotator.openVersionHistory());
  await page.waitForTimeout(150);
  const pressedOpen = await page.getAttribute('#btn-version-history', 'aria-pressed');
  assert.strictEqual(pressedOpen, 'true', 'version btn pressed when open');
  await page.evaluate(() => window.__mdAnnotator.closeVersionHistory());
  await page.waitForTimeout(100);
  const pressedClosed = await page.getAttribute('#btn-version-history', 'aria-pressed');
  assert.strictEqual(pressedClosed, 'false', 'version btn unpressed when closed');

  assert.strictEqual(errors.length, 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();
  console.log('PASS e2e-save-commit-lifecycle');
})().catch((e) => {
  console.error('FAIL e2e-save-commit-lifecycle', e);
  process.exit(1);
});
