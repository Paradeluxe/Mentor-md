// v1.43.49: multi-tab blob revoke — close active must free; other tab keep
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  let pass = 0, fail = 0;
  const t = async (n, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + n);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + n + ': ' + e.message);
      fail++;
    }
  };

  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  console.log('=== v1.43.49 multi-tab media revoke ===');

  await t('API revokeTabMedia / collectKeptMediaUrls', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        rev: typeof M.revokeTabMedia,
        keep: typeof M.collectKeptMediaUrls,
        close: typeof M.closeTab,
      };
    });
    if (r.rev !== 'function' || r.keep !== 'function' || r.close !== 'function') {
      throw new Error(JSON.stringify(r));
    }
  });

  await t('close last active tab revokes its blob (not kept by State self-ref)', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const revoked = [];
      const orig = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (u) => {
        revoked.push(u);
        return orig(u);
      };
      try {
        M.openNewTabBlank();
        // force clean single tab with one blob
        M.State.tabs = [];
        M.State.activeTabId = null;
        const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        M.State.mediaUrls = { 'media/a.png': url };
        M.State.mediaFiles = { 'media/a.png': blob };
        M.State.currentFile = { name: 'only.mentor', content: '', dirty: false, handle: null };
        M.State.annotations = [];
        M.snapshotActiveTab();
        const tid = M.State.activeTabId;
        // dirty false → no confirm
        M.State.tabs.forEach((x) => {
          if (x) x.dirty = false;
        });
        if (M.State.currentFile) M.State.currentFile.dirty = false;
        const ok = M.closeTab(tid);
        return {
          ok,
          revoked: revoked.slice(),
          had: url,
          mediaLeft: Object.keys(M.State.mediaUrls || {}).length,
          tabs: (M.State.tabs || []).length,
        };
      } finally {
        URL.revokeObjectURL = orig;
      }
    });
    if (!r.ok) throw new Error('close fail ' + JSON.stringify(r));
    if (!r.revoked.includes(r.had)) throw new Error('not revoked ' + JSON.stringify(r));
    if (r.mediaLeft !== 0) throw new Error('media left ' + JSON.stringify(r));
    if (r.tabs !== 0) throw new Error('tabs ' + JSON.stringify(r));
  });

  await t('close tab A keeps tab B blob; revokes only A', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const revoked = [];
      const orig = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (u) => {
        revoked.push(u);
        return orig(u);
      };
      try {
        M.State.tabs = [];
        M.State.activeTabId = null;
        M.State.annotations = [];
        const b1 = new Blob([new Uint8Array([9])], { type: 'image/png' });
        const b2 = new Blob([new Uint8Array([8])], { type: 'image/png' });
        const u1 = URL.createObjectURL(b1);
        const u2 = URL.createObjectURL(b2);
        // tab A
        M.State.mediaUrls = { 'media/a.png': u1 };
        M.State.mediaFiles = { 'media/a.png': b1 };
        M.State.currentFile = { name: 'A.mentor', content: '', dirty: false, handle: null };
        M.snapshotActiveTab();
        const idA = M.State.activeTabId;
        // switch to B via new blank then set media
        M.openNewTabBlank();
        M.State.mediaUrls = { 'media/b.png': u2 };
        M.State.mediaFiles = { 'media/b.png': b2 };
        M.State.currentFile = { name: 'B.mentor', content: '', dirty: false, handle: null };
        M.snapshotActiveTab();
        const idB = M.State.activeTabId;
        // clear dirty
        M.State.tabs.forEach((x) => {
          if (x) x.dirty = false;
        });
        // close A while on B
        const ok = M.closeTab(idA);
        const keepB = M.collectKeptMediaUrls({ includeState: true });
        return {
          ok,
          revoked: revoked.slice(),
          u1,
          u2,
          stillB: !!M.State.tabs.find((x) => x && x.id === idB),
          bUrlInTab: (M.State.tabs.find((x) => x && x.id === idB) || {}).mediaUrls,
          keepHasU2: keepB.has(u2),
          tabs: M.State.tabs.map((x) => x && x.name),
        };
      } finally {
        URL.revokeObjectURL = orig;
      }
    });
    if (!r.ok) throw new Error('close A fail ' + JSON.stringify(r));
    if (!r.revoked.includes(r.u1)) throw new Error('A not revoked ' + JSON.stringify(r));
    if (r.revoked.includes(r.u2)) throw new Error('B wrongly revoked ' + JSON.stringify(r));
    if (!r.stillB || !r.keepHasU2) throw new Error('B lost ' + JSON.stringify(r));
  });

  await t('openNewTabBlank after snapshot does not revoke previous tab media', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const revoked = [];
      const orig = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (u) => {
        revoked.push(u);
        return orig(u);
      };
      try {
        M.State.tabs = [];
        M.State.activeTabId = null;
        const b = new Blob([new Uint8Array([7])], { type: 'image/png' });
        const u = URL.createObjectURL(b);
        M.State.mediaUrls = { 'media/x.png': u };
        M.State.mediaFiles = { 'media/x.png': b };
        M.State.currentFile = { name: 'X.mentor', content: 'hi', dirty: false, handle: null };
        M.State.editor.commands.setContent('<p>hi<img src="' + u + '"></p>');
        M.snapshotActiveTab();
        const prevId = M.State.activeTabId;
        M.openNewTabBlank();
        const prev = M.State.tabs.find((x) => x && x.id === prevId);
        return {
          revoked: revoked.slice(),
          u,
          prevUrl: prev && prev.mediaUrls && prev.mediaUrls['media/x.png'],
          prevKept: !!(prev && prev.mediaUrls && prev.mediaUrls['media/x.png'] === u),
        };
      } finally {
        URL.revokeObjectURL = orig;
      }
    });
    if (r.revoked.includes(r.u)) throw new Error('prev revoked on blank ' + JSON.stringify(r));
    if (!r.prevKept) throw new Error('prev media lost ' + JSON.stringify(r));
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
