// e2e: workspace restore single-doc — skip missing active, fall back to recoverable entry
const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto('http://127.0.0.1:8787/index.html?v=ws-restore&cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor && window.__mdAnnotator?.DraftStore, { timeout: 20000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    try { await M.HandleStore.removeWorkspaceSession(); } catch (_) {}
    for (const id of ['doc-a', 'doc-b', 'doc-missing']) {
      try { await M.DraftStore.deleteDraft(id); } catch (_) {}
    }
    await M.DraftStore.putDraft({
      documentId: 'doc-a',
      name: 'a.mentor',
      body: '# A restored\n\nALPHA_MARK',
      annotations: [],
      sidecar: { version: '1', annotations: [] },
      references: null
    });
    await M.DraftStore.putDraft({
      documentId: 'doc-b',
      name: 'b.mentor',
      body: '# B restored\n\nBETA_MARK',
      annotations: [],
      sidecar: { version: '1', annotations: [] },
      references: null
    });
    await M.HandleStore.putWorkspaceSession({
      v: 1,
      id: 'current',
      activeDocumentId: 'doc-missing',
      tabs: [
        { documentId: 'doc-a', name: 'a.mentor', saveMode: 'mentor-download', dirty: true, order: 0 },
        { documentId: 'doc-missing', name: 'missing.mentor', saveMode: 'mentor-download', dirty: false, order: 1 },
        { documentId: 'doc-b', name: 'b.mentor', saveMode: 'mentor-download', dirty: true, order: 2 }
      ],
      updatedAt: Date.now()
    });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.tabs?.length === 1, { timeout: 20000 });

  const result = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const tabs = (M.State.tabs || []).map((t) => ({
      name: t.name,
      documentId: t.currentFile?.documentId || t.id
    }));
    const active = M.State.currentFile?.documentId || '';
    const body = M.State.editor ? M.State.editor.getText() : '';
    return { tabs, active, body, tabCount: tabs.length };
  });

  assert.equal(result.tabCount, 1, 'single restored slot: ' + JSON.stringify(result));
  assert.ok(result.active === 'doc-b' || result.active === 'doc-a', 'fallback to a recoverable draft: ' + JSON.stringify(result));
  assert.ok(/BETA_MARK|ALPHA_MARK|restored/i.test(result.body), 'active body: ' + result.body);
  assert.ok(result.tabs.every((t) => t.documentId !== 'doc-missing'));

  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  console.log('PASS workspace-restore-partial-single');
  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
