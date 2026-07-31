// e2e: workspace session persists open tabs / active doc / close
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
    const aTab = M.State.tabs.find((t) => t.currentFile?.documentId === 'doc-a');
    if (aTab) M.switchToTab(aTab.id);
    await M.persistWorkspaceSessionNow();
    return M.HandleStore.getWorkspaceSession();
  });

  assert.ok(first, 'workspace session exists');
  assert.equal(first.tabs.length, 2, 'two tabs: ' + JSON.stringify(first));
  assert.equal(first.activeDocumentId, 'doc-a', 'active A: ' + JSON.stringify(first));
  const json = JSON.stringify(first);
  if (/token|html|annotations|references|media/i.test(json)) {
    throw new Error('workspace leaked document payload: ' + json);
  }

  const afterClose = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const b = M.State.tabs.find((t) => t.currentFile?.documentId === 'doc-b');
    if (b) M.closeTab(b.id);
    await M.persistWorkspaceSessionNow();
    return M.HandleStore.getWorkspaceSession();
  });
  assert.equal(afterClose.tabs.length, 1, 'after close B: ' + JSON.stringify(afterClose));
  assert.equal(afterClose.tabs[0].documentId, 'doc-a');

  const empty = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const a = M.State.tabs.find((t) => t.currentFile?.documentId === 'doc-a');
    if (a) M.closeTab(a.id);
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
