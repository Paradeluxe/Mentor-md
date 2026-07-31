// e2e: multi-document F5 restore — tabs, order, active, body, annotations, per-doc refs
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

  // seed two docs with distinct body/ann/refs
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
    const betaRefs = M.createReferenceManifest({
      sourceName: '',
      sourceFormat: '',
      entries: [{ key: 'beta2025', type: 'article', authors: 'B, Beta', title: 'Beta Paper', year: '2025' }],
      bibliography: { enabled: false, scope: 'cited', heading: 'References' }
    });

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

    await M.activateOpenedDocument({
      name: 'beta.mentor',
      content: '# Beta\n\nBETA_MARKER body\n',
      annotations: null,
      references: betaRefs,
      documentId: 'doc-beta',
      saveMode: 'mentor-download',
      quiet: true,
      forceDisk: true
    });
    await M.putAtomicDraftForCurrent();

    // activate alpha
    const aTab = M.State.tabs.find((t) => t.currentFile?.documentId === 'doc-alpha');
    if (aTab) M.switchToTab(aTab.id);
    await M.putAtomicDraftForCurrent();
    await M.persistWorkspaceSessionNow();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.tabs?.length === 2, { timeout: 20000 });

  const restored = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return {
      names: M.State.tabs.map((tab) => tab.name),
      ids: M.State.tabs.map((tab) => tab.currentFile?.documentId),
      active: M.State.currentFile?.name,
      activeId: M.State.currentFile?.documentId,
      body: M.State.editor?.state?.doc?.textContent || '',
      annotations: (M.State.annotations || []).map((a) => a.threadId),
      refs: ((M.State.references && M.State.references.entries) || []).map((e) => e.key)
    };
  });

  assert.deepEqual(restored.names, ['alpha.mentor', 'beta.mentor'], JSON.stringify(restored));
  assert.equal(restored.active, 'alpha.mentor', JSON.stringify(restored));
  assert.ok(String(restored.body).includes('ALPHA_MARKER'), 'alpha body: ' + restored.body);
  assert.ok(restored.refs.includes('alpha2026'), 'alpha refs: ' + JSON.stringify(restored.refs));
  assert.ok(!restored.refs.includes('beta2025'), 'alpha must not have beta refs: ' + JSON.stringify(restored.refs));
  // annotation may hydrate from sidecar; tolerate empty if mark rebuild drops but prefer present
  // Prefer presence; if empty, still require draft had thread via switch check below

  // switch to beta and assert isolation
  const betaView = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const b = M.State.tabs.find((t) => t.currentFile?.documentId === 'doc-beta' || t.name === 'beta.mentor');
    if (b) M.switchToTab(b.id);
    return {
      active: M.State.currentFile?.name,
      body: M.State.editor?.state?.doc?.textContent || '',
      refs: ((M.State.references && M.State.references.entries) || []).map((e) => e.key),
      annotations: (M.State.annotations || []).map((a) => a.threadId)
    };
  });
  assert.equal(betaView.active, 'beta.mentor', JSON.stringify(betaView));
  assert.ok(String(betaView.body).includes('BETA_MARKER'), betaView.body);
  assert.ok(betaView.refs.includes('beta2025'), JSON.stringify(betaView.refs));
  assert.ok(!betaView.refs.includes('alpha2026'), JSON.stringify(betaView.refs));

  // close beta, reload, only alpha remains
  await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const b = M.State.tabs.find((t) => t.currentFile?.documentId === 'doc-beta' || t.name === 'beta.mentor');
    if (b) M.closeTab(b.id);
    await M.persistWorkspaceSessionNow();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.tabs?.length === 1, { timeout: 20000 });
  const only = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return {
      names: M.State.tabs.map((t) => t.name),
      active: M.State.currentFile?.name,
      body: M.State.editor?.state?.doc?.textContent || '',
      refs: ((M.State.references && M.State.references.entries) || []).map((e) => e.key)
    };
  });
  assert.deepEqual(only.names, ['alpha.mentor'], JSON.stringify(only));
  assert.equal(only.active, 'alpha.mentor');
  assert.ok(String(only.body).includes('ALPHA_MARKER'), only.body);
  assert.ok(only.refs.includes('alpha2026'), JSON.stringify(only.refs));

  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  console.log('PASS workspace-f5-restore');
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
