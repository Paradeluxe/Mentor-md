// single-document: media revoke on replace/close (was multi-tab blob revoke)
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

  console.log('=== single-document media revoke ===');

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

  await t('close active document revokes its blob', async () => {
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
        M.State.tabs.forEach((x) => { if (x) x.dirty = false; });
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

  await t('openNewTabBlank revokes previous slot media (single-doc replace)', async () => {
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
          tabCount: (M.State.tabs || []).length,
          prevGone: !prev,
        };
      } finally {
        URL.revokeObjectURL = orig;
      }
    });
    if (!r.revoked.includes(r.u)) throw new Error('prev should revoke on blank replace ' + JSON.stringify(r));
    if (r.tabCount !== 1) throw new Error('one slot after blank ' + JSON.stringify(r));
    if (!r.prevGone) throw new Error('prev snapshot should be gone ' + JSON.stringify(r));
  });

  await t('enforceSingleDocumentSlot drops ghost tab media', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const revoked = [];
      const orig = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (u) => {
        revoked.push(u);
        return orig(u);
      };
      try {
        M.openNewTabBlank();
        const b1 = new Blob([new Uint8Array([1])], { type: 'image/png' });
        const b2 = new Blob([new Uint8Array([2])], { type: 'image/png' });
        const u1 = URL.createObjectURL(b1);
        const u2 = URL.createObjectURL(b2);
        M.State.mediaUrls = { 'media/a.png': u1 };
        M.State.mediaFiles = { 'media/a.png': b1 };
        M.State.currentFile = { name: 'A.mentor', content: '', dirty: false, handle: null };
        M.snapshotActiveTab();
        const keepId = M.State.activeTabId;
        M.State.tabs.push({
          id: 'ghost',
          name: 'ghost.mentor',
          html: '',
          annotations: [],
          dirty: false,
          mediaUrls: { 'media/g.png': u2 },
          mediaFiles: { 'media/g.png': b2 },
          currentFile: { documentId: 'g', name: 'ghost.mentor', content: '', dirty: false },
        });
        M.enforceSingleDocumentSlot();
        return {
          tabs: M.State.tabs.map((x) => x && x.id),
          revoked: revoked.slice(),
          u2,
          keepId,
        };
      } finally {
        URL.revokeObjectURL = orig;
      }
    });
    if (r.tabs.length !== 1 || r.tabs[0] !== r.keepId) throw new Error('slot ' + JSON.stringify(r));
    if (!r.revoked.includes(r.u2)) throw new Error('ghost media not revoked ' + JSON.stringify(r));
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
