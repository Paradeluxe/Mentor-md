// e2e: single-document F5 restore — active body/annotations/refs
const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('Mentor:author', 'f5-restore-test'));
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());

  await page.goto('http://127.0.0.1:8787/index.html?v=f5ws&cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    try { await M.HandleStore.removeWorkspaceSession(); } catch (_) {}
    for (const id of ['doc-alpha', 'doc-beta']) {
      try { await M.DraftStore.deleteDraft(id); } catch (_) {}
    }

    const alphaAnn = {
      version: '1',
      document: 'alpha.mentor',
      updatedAt: new Date().toISOString(),
      author: { id: 't', name: 't' },
      annotations: [{
        threadId: 'thr-alpha-1',
        type: 'comment',
        status: 'open',
        createdAt: new Date().toISOString(),
        author: { id: 't', name: 't' },
        quote: 'ALPHA_MARKER',
        ranges: [{ from: 0, to: 12 }],
        comments: [{ id: 'c1', author: { id: 't', name: 't' }, body: 'alpha note', createdAt: new Date().toISOString() }]
      }]
    };
    const alphaRefs = M.createReferenceManifest({
      sourceName: '',
      sourceFormat: '',
      entries: [{ key: 'alpha2026', type: 'article', authors: 'A, Alpha', title: 'Alpha Paper', year: '2026' }],
      bibliography: { enabled: false, scope: 'cited', heading: 'References' }
    });
    // Open beta then alpha so active (and F5 restore target) is alpha
    await M.activateOpenedDocument({
      name: 'beta.mentor',
      content: '# Beta\n\nBETA_MARKER body\n',
      annotations: null,
      references: M.createReferenceManifest({
        sourceName: '', sourceFormat: '',
        entries: [{ key: 'beta2025', type: 'article', authors: 'B, Beta', title: 'Beta Paper', year: '2025' }],
        bibliography: { enabled: false, scope: 'cited', heading: 'References' }
      }),
      documentId: 'doc-beta',
      saveMode: 'mentor-download',
      quiet: true,
      forceDisk: true
    });
    await M.putAtomicDraftForCurrent();

    await M.activateOpenedDocument({
      name: 'alpha.mentor',
      content: '# Alpha\n\nALPHA_MARKER body\n',
      annotations: alphaAnn,
      references: alphaRefs,
      documentId: 'doc-alpha',
      saveMode: 'mentor-download',
      quiet: true,
      forceDisk: true
    });
    await M.putAtomicDraftForCurrent();
    await M.persistWorkspaceSessionNow();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const M = window.__mdAnnotator;
    return M?.State?.tabs?.length === 1 && M.State.currentFile?.documentId === 'doc-alpha';
  }, { timeout: 20000 });

  const restored = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return {
      tabCount: (M.State.tabs || []).length,
      names: M.State.tabs.map((tab) => tab.name),
      active: M.State.currentFile?.name,
      activeId: M.State.currentFile?.documentId,
      body: M.State.editor?.state?.doc?.textContent || '',
      annotations: (M.State.annotations || []).map((a) => a.threadId),
      refs: ((M.State.references && M.State.references.entries) || []).map((e) => e.key)
    };
  });

  assert.equal(restored.tabCount, 1, JSON.stringify(restored));
  assert.deepEqual(restored.names, ['alpha.mentor'], JSON.stringify(restored));
  assert.equal(restored.active, 'alpha.mentor', JSON.stringify(restored));
  assert.ok(String(restored.body).includes('ALPHA_MARKER'), 'alpha body: ' + restored.body);
  assert.ok(restored.refs.includes('alpha2026'), 'alpha refs: ' + JSON.stringify(restored.refs));
  assert.ok(!restored.refs.includes('beta2025'), 'must not mix beta refs: ' + JSON.stringify(restored.refs));
  assert.ok(!String(restored.body).includes('BETA_MARKER'), 'must not restore beta body');

  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  console.log('PASS workspace-f5-restore-single');
  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
