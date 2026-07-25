// v1.44.7 draft vs external disk write
// Pure decision tests + activateOpenedDocument preferDraft integration (no real FS handle).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      fail++;
    }
  };

  console.log('=== v1.44.7 draft vs external write ===');
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.resolveDraftConflict, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('resolveDraftConflict exported', async () => {
    const ty = await page.evaluate(() => typeof window.__mdAnnotator.resolveDraftConflict);
    if (ty !== 'function') throw new Error(ty);
  });

  await t('forceDisk → disk', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.resolveDraftConflict({
      diskBody: 'A',
      diskAnns: [{ threadId: '1' }],
      diskMtime: 100,
      draft: { body: 'B', annotations: [{ threadId: '2' }], updatedAt: 999 },
      forceDisk: true,
    }));
    if (r !== 'disk') throw new Error(r);
  });

  await t('identical → disk', async () => {
    const anns = [{ threadId: 't1', comments: [] }];
    const r = await page.evaluate((a) => window.__mdAnnotator.resolveDraftConflict({
      diskBody: 'same',
      diskAnns: a,
      diskMtime: 500,
      draft: { body: 'same', annotations: a, updatedAt: 999 },
    }), anns);
    if (r !== 'disk') throw new Error(r);
  });

  await t('draft older than disk + annDiff → disk (external win)', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.resolveDraftConflict({
      diskBody: 'disk-body',
      diskAnns: [{ threadId: 'disk', comments: [{ body: '@AI x' }, { body: 'AI reply' }] }],
      diskMtime: 2000,
      draft: {
        body: 'old-body',
        annotations: [{ threadId: 'disk', comments: [{ body: '@AI x' }] }],
        updatedAt: 1000,
      },
    }));
    if (r !== 'disk') throw new Error(r);
  });

  await t('draft newer than disk + bodyDiff → draft (crash recovery)', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.resolveDraftConflict({
      diskBody: 'old',
      diskAnns: [],
      diskMtime: 1000,
      draft: { body: 'unsaved-edit', annotations: [], updatedAt: 5000 },
    }));
    if (r !== 'draft') throw new Error(r);
  });

  await t('missing clocks + diff → prompt', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.resolveDraftConflict({
      diskBody: 'a',
      diskAnns: [],
      diskMtime: null,
      draft: { body: 'b', annotations: [], updatedAt: 0 },
    }));
    if (r !== 'prompt') throw new Error(r);
  });

  await t('preferDraft + older draft keeps disk AI reply', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const docId = 'test-draft-external-' + Date.now();
      const name = 'draft-external.mentor';
      const diskBody = '# Intro\n\nHello disk with cites.\n';
      const diskAnns = {
        version: '1',
        document: name,
        annotations: [{
          threadId: 'thr1',
          text: 'Hello disk',
          prefix: '',
          suffix: ' with cites',
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [
            { id: 'c1', author: { id: 'u', name: 'User' }, body: '@AI add cites', createdAt: new Date().toISOString() },
            { id: 'c2', author: { id: 'ai-reviewer', name: 'AI Reviewer' }, body: '已完成：补引用', createdAt: new Date().toISOString() },
          ],
        }],
      };
      const draftAnns = [{
        threadId: 'thr1',
        text: 'Hello disk',
        prefix: '',
        suffix: '',
        resolved: false,
        createdAt: new Date().toISOString(),
        comments: [
          { id: 'c1', author: { id: 'u', name: 'User' }, body: '@AI add cites', createdAt: new Date().toISOString() },
        ],
      }];
      // Stale draft (older than disk)
      await M.DraftStore.putDraft({
        documentId: docId,
        name,
        body: '# Intro\n\nHello OLD draft.\n',
        annotations: draftAnns,
        sidecar: { version: '1', document: name, annotations: draftAnns },
      });
      // Force draft.updatedAt older: putDraft sets Date.now(); overwrite via raw path —
      // re-put then manually decide using diskMtime far in future is enough:
      const diskMtime = Date.now() + 60_000;

      await M.activateOpenedDocument({
        name,
        content: diskBody,
        annotations: diskAnns,
        mediaFiles: null,
        handle: null,
        documentId: docId,
        saveMode: 'mentor-download',
        quiet: true,
        preferDraft: true,
        forceDisk: false,
        diskMtime,
      });

      const bodies = (M.State.annotations[0]?.comments || []).map((c) => c.body);
      const md = M.State.editor.getHTML();
      // draft should have been discarded
      const left = await M.DraftStore.getDraft(docId);
      return {
        bodies,
        hasAiReply: bodies.some((b) => b && b.includes('已完成')),
        htmlHasDisk: md.includes('cites') || md.includes('Hello disk'),
        draftGone: !left,
        nAnn: M.State.annotations.length,
      };
    });
    if (!r.hasAiReply) throw new Error('AI reply lost: ' + JSON.stringify(r));
    if (r.nAnn !== 1) throw new Error('nAnn ' + r.nAnn);
    // draft deleted after disk wins
    if (!r.draftGone) throw new Error('stale draft not deleted');
  });

  await t('preferDraft + newer draft restores unsaved body', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const docId = 'test-draft-newer-' + Date.now();
      const name = 'draft-newer.mentor';
      const diskBody = '# Title\n\nDisk only.\n';
      const draftBody = '# Title\n\nUnsaved crash recovery body UNIQUE_MARKER_XYZ.\n';
      await M.DraftStore.putDraft({
        documentId: docId,
        name,
        body: draftBody,
        annotations: [],
        sidecar: { version: '1', document: name, annotations: [] },
      });
      // draft.updatedAt is now; diskMtime in the past
      await M.activateOpenedDocument({
        name,
        content: diskBody,
        annotations: { version: '1', document: name, annotations: [] },
        mediaFiles: null,
        handle: null,
        documentId: docId,
        saveMode: 'mentor-download',
        quiet: true,
        preferDraft: true,
        forceDisk: false,
        diskMtime: Date.now() - 120_000,
      });
      const html = M.State.editor.getHTML();
      return { html, has: html.includes('UNIQUE_MARKER_XYZ') };
    });
    if (!r.has) throw new Error('draft body not restored: ' + r.html.slice(0, 200));
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
