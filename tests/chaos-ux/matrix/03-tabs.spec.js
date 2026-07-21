/**
 * Multi-doc tabs — open/switch/close/dirty confirm (S4).
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('../harness');
const { DOCS } = require('../content-catalog');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/03-tabs ===');
  await boot(page);
  const { t, done } = createRunner(page, '03-tabs');

  await t('tab bar + new button exist', async () => {
    const r = await page.evaluate(() => ({
      bar: !!document.querySelector('#doc-tabs'),
      add: !!document.querySelector('#doc-tab-new'),
    }));
    if (!r.bar || !r.add) throw new Error(JSON.stringify(r));
    coverage.hitSurface('S4.plus');
  });

  await t('load A then B keeps two tabs', async () => {
    await loadDoc(page, 'tab-a.md', '# A\n\nUNIQUE_TAB_A\n');
    await loadDoc(page, 'tab-b.md', '# B\n\nUNIQUE_TAB_B\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        names: M.State.tabs.map((x) => x.name),
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
      };
    });
    if (r.names.filter((n) => n === 'tab-a.md' || n === 'tab-b.md').length < 2) {
      throw new Error(JSON.stringify(r));
    }
    if (r.active !== 'tab-b.md' || !r.body.includes('UNIQUE_TAB_B')) throw new Error(JSON.stringify(r));
  });

  await t('switchToTab restores A content and annotations', async () => {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const a = M.State.tabs.find((x) => x.name === 'tab-a.md');
      if (a) M.switchToTab(a.id);
    });
    await annotateText(page, 'UNIQUE_TAB_A', { body: 'on-A' });
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const b = M.State.tabs.find((x) => x.name === 'tab-b.md');
      M.switchToTab(b.id);
    });
    const onB = await page.evaluate(() => ({
      name: window.__mdAnnotator.State.currentFile?.name,
      anns: window.__mdAnnotator.State.annotations.length,
      body: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    if (onB.name !== 'tab-b.md' || !onB.body.includes('UNIQUE_TAB_B')) throw new Error(JSON.stringify(onB));
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const a = M.State.tabs.find((x) => x.name === 'tab-a.md');
      M.switchToTab(a.id);
    });
    const onA = await page.evaluate(() => ({
      name: window.__mdAnnotator.State.currentFile?.name,
      anns: window.__mdAnnotator.State.annotations.length,
      body: window.__mdAnnotator.State.editor.state.doc.textContent,
      texts: window.__mdAnnotator.State.annotations.map((a) => a.text),
    }));
    if (onA.name !== 'tab-a.md' || !onA.body.includes('UNIQUE_TAB_A')) throw new Error(JSON.stringify(onA));
    if (onA.anns < 1 || !onA.texts.includes('UNIQUE_TAB_A')) throw new Error('ann lost: ' + JSON.stringify(onA));
  });

  await t('UI + creates blank tab', async () => {
    const before = await page.evaluate(() => window.__mdAnnotator.State.tabs.length);
    await page.locator('#doc-tab-new').click();
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => ({
      n: window.__mdAnnotator.State.tabs.length,
      name: window.__mdAnnotator.State.currentFile?.name,
    }));
    if (after.n < before) throw new Error(JSON.stringify({ before, after }));
    coverage.hitSurface('S4.plus');
  });

  await t('close non-active tab without confirm when clean', async () => {
    await loadDoc(page, 'close-clean.md', '# Clean\n\nCLEAN_MARK\n');
    // make sure not dirty
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (M.State.currentFile) M.State.currentFile.dirty = false;
      const t = M.State.tabs.find((x) => x.id === M.State.activeTabId);
      if (t) t.dirty = false;
    });
    await loadDoc(page, 'close-other.md', '# Other\n\nOTHER_MARK\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const target = M.State.tabs.find((x) => x.name === 'close-clean.md');
      if (!target) return { err: 'no clean tab' };
      target.dirty = false;
      const before = M.State.tabs.length;
      const ok = M.closeTab(target.id);
      return { ok, before, after: M.State.tabs.length, names: M.State.tabs.map((x) => x.name) };
    });
    if (r.err) throw new Error(r.err);
    if (!r.ok || r.after !== r.before - 1) throw new Error(JSON.stringify(r));
    if (r.names.includes('close-clean.md')) throw new Error('still there');
  });

  await t('close dirty tab cancel keeps tab', async () => {
    await loadDoc(page, 'dirty-stay.md', DOCS.simple);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile.dirty = true;
      const t = M.State.tabs.find((x) => x.id === M.State.activeTabId);
      if (t) t.dirty = true;
    });
    // open second so close isn't last
    await loadDoc(page, 'keep-open.md', '# Keep\n\nKEEP\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const dirty = M.State.tabs.find((x) => x.name === 'dirty-stay.md');
      dirty.dirty = true;
      const orig = window.confirm;
      window.confirm = () => false;
      let ok;
      try {
        ok = M.closeTab(dirty.id);
      } finally {
        window.confirm = orig;
      }
      return {
        ok,
        still: M.State.tabs.some((x) => x.name === 'dirty-stay.md'),
      };
    });
    if (r.ok) throw new Error('close should fail on cancel');
    if (!r.still) throw new Error('tab removed on cancel');
  });

  await t('close dirty tab accept removes', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const dirty = M.State.tabs.find((x) => x.name === 'dirty-stay.md');
      if (!dirty) return { err: 'missing' };
      dirty.dirty = true;
      const orig = window.confirm;
      window.confirm = () => true;
      let ok;
      try {
        ok = M.closeTab(dirty.id);
      } finally {
        window.confirm = orig;
      }
      return { ok, still: M.State.tabs.some((x) => x.name === 'dirty-stay.md') };
    });
    if (r.err) throw new Error(r.err);
    if (!r.ok || r.still) throw new Error(JSON.stringify(r));
  });

  await t('rapid new x8 does not crash', async () => {
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__mdAnnotator.openNewTabBlank());
    }
    const n = await page.evaluate(() => window.__mdAnnotator.State.tabs.length);
    if (n < 5) throw new Error('tabs=' + n);
    const ed = await page.evaluate(() => !!window.__mdAnnotator.State.editor);
    if (!ed) throw new Error('editor gone');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
