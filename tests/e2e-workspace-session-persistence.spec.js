// e2e: workspace session persists single open doc / replace / close
const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto('http://127.0.0.1:8787/index.html?v=ws-persist&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  const first = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    await M.activateOpenedDocument({ name: 'a.mentor', content: '# A', documentId: 'doc-a', quiet: true });
    await M.activateOpenedDocument({ name: 'b.mentor', content: '# B', documentId: 'doc-b', quiet: true });
    // single-doc: B replaced A
    await M.persistWorkspaceSessionNow();
    return {
      session: await M.HandleStore.getWorkspaceSession(),
      tabCount: (M.State.tabs || []).length,
      active: M.State.currentFile?.documentId,
      name: M.State.currentFile?.name,
    };
  });

  assert.ok(first.session, 'workspace session exists');
  assert.equal(first.tabCount, 1, 'one in-page slot: ' + JSON.stringify(first));
  assert.equal(first.session.tabs.length, 1, 'session one tab: ' + JSON.stringify(first.session));
  assert.equal(first.session.activeDocumentId, 'doc-b', 'active B: ' + JSON.stringify(first.session));
  assert.equal(first.active, 'doc-b');
  const json = JSON.stringify(first.session);
  if (/token|html|annotations|references|media/i.test(json)) {
    throw new Error('workspace leaked document payload: ' + json);
  }

  const empty = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const id = M.State.activeTabId;
    if (id) M.closeTab(id);
    await M.persistWorkspaceSessionNow();
    return M.HandleStore.getWorkspaceSession();
  });
  assert.equal(empty, null, 'empty workspace clears session');

  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  console.log('PASS workspace-session-persistence');
  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
