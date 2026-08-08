/**
 * Single-document page contract (was multi-doc tabs S4).
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
} = require('../harness');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/03-tabs (single-document) ===');
  await boot(page);
  const { t, done } = createRunner(page, '03-tabs');

  await t('doc-tabs bar hidden (no + button)', async () => {
    const r = await page.evaluate(() => {
      const bar = document.querySelector('#doc-tabs');
      const cs = bar ? getComputedStyle(bar) : null;
      return {
        bar: !!bar,
        hidden: !bar || bar.hidden || bar.getAttribute('hidden') != null || (cs && cs.display === 'none'),
        add: !!document.querySelector('#doc-tab-new'),
        h: bar ? bar.getBoundingClientRect().height : 0,
      };
    });
    if (!r.bar) throw new Error('no #doc-tabs element');
    if (!r.hidden || r.add || r.h > 1) throw new Error(JSON.stringify(r));
    if (coverage) coverage.hitSurface('S4.plus');
  });

  await t('load A then B replaces — one slot', async () => {
    await loadDoc(page, 'tab-a.md', '# A\n\nUNIQUE_TAB_A\n');
    await loadDoc(page, 'tab-b.md', '# B\n\nUNIQUE_TAB_B\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        count: M.State.tabs.length,
        names: M.State.tabs.map((x) => x.name),
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
      };
    });
    if (r.count !== 1) throw new Error('expected 1 tab: ' + JSON.stringify(r));
    if (r.active !== 'tab-b.md' || !r.body.includes('UNIQUE_TAB_B')) throw new Error(JSON.stringify(r));
    if (r.body.includes('UNIQUE_TAB_A')) throw new Error('A should be replaced: ' + JSON.stringify(r));
  });

  await t('switchToTab is no-op', async () => {
    await loadDoc(page, 'only.md', '# Only\n\nONLY_MARK\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.tabs.push({
        id: 'ghost',
        name: 'ghost.md',
        html: '<p>GHOST</p>',
        annotations: [],
        dirty: false,
        currentFile: { documentId: 'g', name: 'ghost.md', content: 'GHOST', dirty: false },
      });
      const switched = M.switchToTab('ghost');
      M.enforceSingleDocumentSlot();
      return {
        switched,
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        count: M.State.tabs.length,
      };
    });
    if (r.switched) throw new Error('switch should fail');
    if (r.active !== 'only.md' || !r.body.includes('ONLY_MARK') || r.count !== 1) {
      throw new Error(JSON.stringify(r));
    }
  });

  await t('openNewTabBlank replaces still one tab', async () => {
    await loadDoc(page, 'keep.md', '# Keep\n\nKEEP_MARK\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      return {
        n: M.State.tabs.length,
        name: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        hasKeep: M.State.editor.state.doc.textContent.includes('KEEP_MARK'),
      };
    });
    if (r.n !== 1 || r.hasKeep) throw new Error(JSON.stringify(r));
    if (coverage) coverage.hitSurface('S4.plus');
  });

  await t('close active clears document', async () => {
    await loadDoc(page, 'close-me.md', '# Close\n\nCLOSE_MARK\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (M.State.currentFile) M.State.currentFile.dirty = false;
      const tab = M.State.tabs.find((x) => x.id === M.State.activeTabId);
      if (tab) tab.dirty = false;
      const ok = M.closeTab(M.State.activeTabId);
      return {
        ok,
        tabs: M.State.tabs.length,
        current: M.State.currentFile,
      };
    });
    if (!r.ok || r.tabs !== 0 || r.current) throw new Error(JSON.stringify(r));
  });

  await t('close dirty cancel keeps document', async () => {
    await loadDoc(page, 'dirty-stay.md', '# Dirty\n\nDIRTY_MARK\n');
    page.once('dialog', (d) => d.dismiss());
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile.dirty = true;
      const tab = M.State.tabs.find((x) => x.id === M.State.activeTabId);
      if (tab) tab.dirty = true;
      const ok = M.closeTab(M.State.activeTabId);
      return {
        ok,
        name: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        tabs: M.State.tabs.length,
      };
    });
    if (r.ok) throw new Error('should cancel: ' + JSON.stringify(r));
    if (r.name !== 'dirty-stay.md' || !r.body.includes('DIRTY_MARK')) throw new Error(JSON.stringify(r));
  });

  const result = done();
  if (coverage) {
    const rep = coverage.report();
    console.log('  surfaces hit:', Object.keys(rep.surfaces || {}).length);
  }
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
