// e2e: supervision pet survives F5 + fallback anchor modes
const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('Mentor:author', 'sup-f5'));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());

  let missingCurrent = false;
  await page.route('**/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) })
  );
  await page.route('**/supervision*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.includes('/supervision')) return route.continue();
    const name = url.searchParams.get('name') || '';
    const path = url.searchParams.get('path') || '';
    const key = name || path;
    if (key && !/supervised/i.test(key)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ v: 1, active: false })
      });
    }
    const currentThreadId = missingCurrent ? 'thread-missing' : 'thread-supervised';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        v: 1,
        active: true,
        phase: 'working',
        lockMode: 'pending-paragraphs',
        pendingThreadIds: ['thread-supervised'],
        currentThreadId,
        tool: 'AI'
      })
    });
  });

  async function waitPet(selector = '.ProseMirror .supervision-pet') {
    await page.waitForSelector(selector, { timeout: 15000 });
    return page.locator(selector).first().evaluate((el) => {
      const box = el.getBoundingClientRect();
      const editor = el.closest('.ProseMirror')?.getBoundingClientRect();
      return {
        visible: box.width > 0 && box.height > 0,
        inside: !!(editor && box.right >= editor.left && box.left <= editor.right && box.bottom >= editor.top && box.top <= editor.bottom),
        mode: el.dataset.anchorMode || '',
        thread: el.dataset.threadId || '',
        phase: el.dataset.phase || ''
      };
    });
  }

  await page.goto('http://127.0.0.1:8787/index.html?v=supf5&cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor && window.__mdAnnotator?.HandleStore, { timeout: 20000 });

  await page.evaluate(async () => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    const M = window.__mdAnnotator;
    const body = '# Supervised\n\nSUPERVISED_ANCHOR paragraph for pet placement.\n';
    const annotations = [{
      id: 'thread-supervised',
      type: 'comment',
      author: 'sup-f5',
      created: new Date().toISOString(),
      quote: 'SUPERVISED_ANCHOR',
      comments: [{ id: 'c1', author: 'sup-f5', text: 'fix me', created: new Date().toISOString() }]
    }];
    await M.DraftStore.putDraft({
      documentId: 'doc-supervised',
      name: 'supervised.mentor',
      body,
      annotations,
      ann: { annotations },
      updatedAt: Date.now()
    });
    await M.activateOpenedDocument({
      name: 'supervised.mentor',
      content: body,
      annotations,
      saveMode: 'download',
      documentId: 'doc-supervised',
      forceDisk: true
    });
    try { M.rebuildAnnotationMarks?.(); } catch (_) {}
    // Capture draft for the active tab so F5 restore has body+marks.
    try { await M.putAtomicDraftForCurrent({ immediate: true }); } catch (_) {}
    await M.persistWorkspaceSessionNow();
    try { M.startSupervisionPolling(); } catch (_) {}
  });

  let pet = await waitPet('.ProseMirror .supervision-pet[data-thread-id="thread-supervised"]');
  assert(pet.visible && pet.inside, 'initial pet visible: ' + JSON.stringify(pet));

  // Two reloads
  for (let i = 0; i < 2; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));
    // give restore + poll a beat via waitForSelector
    pet = await waitPet('.ProseMirror .supervision-pet');
    assert(pet.visible && pet.inside, 'reload pet ' + i + ': ' + JSON.stringify(pet));
  }

  // Fallback when currentThreadId missing from marks
  missingCurrent = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));
  pet = await waitPet('.ProseMirror .supervision-pet');
  assert(pet.visible && pet.inside, 'fallback pet visible: ' + JSON.stringify(pet));
  assert(
    pet.mode === 'pending-fallback' || pet.mode === 'document-fallback' || pet.mode === 'current',
    'fallback mode: ' + JSON.stringify(pet)
  );
  const lockedDoc = await page.evaluate(() =>
    !!document.querySelector('.supervision-locked-block[data-supervision-lock="document"]')
  );
  assert(!lockedDoc, 'must not escalate to document lock on fallback');

  console.log('PASS supervision-f5', pet);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
