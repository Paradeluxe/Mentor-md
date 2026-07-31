// e2e: version history drawer — capture on save, named pin, restore, dedup, disable.
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;
const DOC_ID = 'vh-e2e-doc-' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?as=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  // clean doc with stable documentId
  await page.evaluate((docId) => {
    const A = window.__mdAnnotator;
    A.loadMarkdownIntoEditor('vh-e2e.mentor', '# hello\n\nworld\n', { annotations: [], version: '1' }, { alreadyPrepared: true, documentId: docId, saveMode: 'mentor-download', references: null });
    localStorage.removeItem('Mentor:versionHistory');
  }, DOC_ID);
  await page.waitForTimeout(300);

  // 1. drawer opens with empty state
  await page.click('#btn-version-history');
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => !document.querySelector('#version-history-drawer').classList.contains('hidden')), 'drawer visible');
  assert.ok(await page.evaluate(() => !document.querySelector('#version-history-empty').classList.contains('hidden')), 'empty state shown');

  // 2. named pin creates a row (dialog auto-accepted with default label)
  await page.evaluate(() => window.__mdAnnotator.runNamedVersionPin());
  await page.waitForTimeout(400);
  let rows = await page.evaluate((id) => window.__mdAnnotator.VersionStore.listByDocumentId(id), DOC_ID);
  assert.strictEqual(rows.length, 1, 'one version after pin');
  assert.strictEqual(rows[0].kind, 'named', 'pin kind named');
  assert.ok(rows[0].label && rows[0].label.length > 0, 'pin has label');

  // 3. manual capture of identical content dedups (no new row)
  await page.evaluate(() => {
    const A = window.__mdAnnotator;
    const snap = A.createSaveSnapshot();
    return A.recordVersionFromSnapshot(snap, { kind: 'manual' });
  });
  await page.waitForTimeout(300);
  rows = await page.evaluate((id) => window.__mdAnnotator.VersionStore.listByDocumentId(id), DOC_ID);
  assert.strictEqual(rows.length, 1, 'identical content deduped');

  // 4. edit body, capture manual (new row), restore to pinned version
  await page.evaluate(() => window.__mdAnnotator.State.editor.commands.setContent('<p>CHANGED</p>'));
  await page.evaluate(() => {
    const A = window.__mdAnnotator;
    const snap = A.createSaveSnapshot();
    return A.recordVersionFromSnapshot(snap, { kind: 'manual' });
  });
  await page.waitForTimeout(300);
  rows = await page.evaluate((id) => window.__mdAnnotator.VersionStore.listByDocumentId(id), DOC_ID);
  assert.strictEqual(rows.length, 2, 'second version after change');
  assert.ok(rows.some((r) => r.kind === 'manual'), 'manual kind present');

  const pinnedId = rows.find((r) => r.kind === 'named').id;
  await page.evaluate((id) => window.__mdAnnotator.restoreVersion(id), pinnedId);
  await page.waitForTimeout(400);
  const bodyText = await page.evaluate(() => window.__mdAnnotator.State.editor.getText());
  assert.ok(bodyText.startsWith('hello'), 'restored body is pre-change content, got: ' + JSON.stringify(bodyText.slice(0, 10)));
  const dirty = await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty);
  assert.strictEqual(dirty, true, 'restore leaves dirty (no auto disk write)');

  // 5. render list: items + restore buttons
  await page.evaluate(() => window.__mdAnnotator.renderVersionHistory());
  await page.waitForTimeout(200);
  assert.ok((await page.locator('.version-item').count()) >= 2, 'list renders items');
  assert.ok((await page.locator('[data-version-restore]').count()) >= 2, 'restore buttons rendered');

  // 6. master disable skips capture
  await page.evaluate(() => localStorage.setItem('Mentor:versionHistory', '0'));
  const capOff = await page.evaluate(() => {
    const A = window.__mdAnnotator;
    const snap = A.createSaveSnapshot();
    return A.recordVersionFromSnapshot(snap, { kind: 'manual' });
  });
  assert.strictEqual(capOff.skipped, true, 'capture skipped when disabled');
  await page.evaluate(() => localStorage.removeItem('Mentor:versionHistory'));

  // 7. delete version
  const before = (await page.evaluate((id) => window.__mdAnnotator.VersionStore.listByDocumentId(id), DOC_ID)).length;
  await page.evaluate((id) => window.__mdAnnotator.deleteVersion(id), pinnedId);
  await page.waitForTimeout(300);
  const after = (await page.evaluate((id) => window.__mdAnnotator.VersionStore.listByDocumentId(id), DOC_ID)).length;
  assert.strictEqual(after, before - 1, 'delete removes one version');

  assert.strictEqual(errors.length, 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();
  console.log('PASS e2e-version-history');
})().catch((e) => { console.error('FAIL e2e-version-history', e); process.exit(1); });
