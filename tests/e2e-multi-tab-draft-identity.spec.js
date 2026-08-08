// e2e: delayed draft write must capture source document identity before single-slot replace
// (single-document page: open B replaces A in-page; A draft must still flush as A)
const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto('http://127.0.0.1:8787/index.html?v=draft-identity&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  const result = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    // Clear prior drafts for isolation
    try {
      const list = await M.DraftStore.list();
      for (const row of list || []) {
        if (row?.documentId) await M.DraftStore.deleteDraft(row.documentId);
      }
    } catch (_) {}

    M.loadMarkdownIntoEditor('a.mentor', '# A\n\nA_BASE\n', null, { documentId: 'doc-a' });
    M.State.editor.commands.setContent('<h1>A</h1><p>A_LATEST</p>');
    M.scheduleIdbCacheWrite();
    M.loadMarkdownIntoEditor('b.mentor', '# B\n\nB_ONLY\n', null, { documentId: 'doc-b' });
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      a: await M.DraftStore.getDraft('doc-a'),
      b: await M.DraftStore.getDraft('doc-b')
    };
  });

  if (!result.a?.body || !/A[_\\]*LATEST/.test(String(result.a.body))) {
    throw new Error('A draft missing A_LATEST: ' + JSON.stringify(result));
  }
  if (result.b?.body && /A[_\\]*LATEST/.test(String(result.b.body))) {
    throw new Error('draft crossed tab boundary: ' + JSON.stringify(result));
  }
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  console.log('PASS multi-tab-draft-identity');
  await browser.close();
  process.exit(0);
})().catch(async (error) => {
  console.error(error.stack || error);
  process.exit(1);
});
