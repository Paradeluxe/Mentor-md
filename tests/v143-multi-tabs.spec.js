// v1.43.31 multi-doc tabs
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };

  console.log('=== v1.43.31 multi-doc tabs ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=147&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('doc-tabs bar exists + + button', async () => {
    const r = await page.evaluate(() => {
      const bar = document.querySelector('#doc-tabs');
      return { bar: !!bar, add: !!document.querySelector('#doc-tab-new') };
    });
    if (!r.bar) throw new Error('no #doc-tabs');
    if (!r.add) throw new Error('no +');
  });

  await t('load doc A then doc B keeps both tabs', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('dfc-paper.md', '# DFC Paper\n\nThis is the precious dFC content UNIQUE_DFC_MARKER.\n', null);
      const afterA = {
        tabs: M.State.tabs.map(t => t.name),
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
      };
      M.loadMarkdownIntoEditor('test-scratch.md', '# Scratch\n\nAgent test content UNIQUE_TEST_MARKER.\n', null);
      const afterB = {
        tabs: M.State.tabs.map(t => ({ name: t.name, id: t.id })),
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        tabCount: M.State.tabs.length,
      };
      return { afterA, afterB };
    });
    if (!r.afterA.body.includes('UNIQUE_DFC_MARKER')) throw new Error('A not loaded: ' + r.afterA.body);
    if (r.afterB.tabCount < 2) throw new Error('expected 2 tabs, got ' + r.afterB.tabCount + ' ' + JSON.stringify(r.afterB.tabs));
    if (r.afterB.active !== 'test-scratch.md') throw new Error('active not B: ' + r.afterB.active);
    if (!r.afterB.body.includes('UNIQUE_TEST_MARKER')) throw new Error('B body wrong');
    if (!r.afterB.tabs.some(t => t.name === 'dfc-paper.md')) throw new Error('dfc tab missing');
  });

  await t('switch back to dFC tab restores content', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const dfc = M.State.tabs.find(t => t.name === 'dfc-paper.md');
      if (!dfc) return { err: 'no dfc tab' };
      M.switchToTab(dfc.id);
      return {
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        hasMarker: M.State.editor.state.doc.textContent.includes('UNIQUE_DFC_MARKER'),
        noTest: !M.State.editor.state.doc.textContent.includes('UNIQUE_TEST_MARKER'),
      };
    });
    if (r.err) throw new Error(r.err);
    if (r.active !== 'dfc-paper.md') throw new Error('active ' + r.active);
    if (!r.hasMarker) throw new Error('dfc content lost: ' + r.body);
    if (!r.noTest) throw new Error('still has test marker');
  });

  await t('UI tab click switches', async () => {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // ensure two tabs and on dfc
      const dfc = M.State.tabs.find(t => t.name === 'dfc-paper.md');
      if (dfc) M.switchToTab(dfc.id);
      M.renderDocTabs();
    });
    await page.waitForTimeout(100);
    // click test-scratch tab via UI
    const clicked = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.doc-tab')];
      const t = tabs.find(el => el.textContent.includes('test-scratch'));
      if (!t) return false;
      t.click();
      return true;
    });
    if (!clicked) throw new Error('no ui tab for scratch');
    await page.waitForTimeout(100);
    const body = await page.evaluate(() => window.__mdAnnotator.State.editor.state.doc.textContent);
    if (!body.includes('UNIQUE_TEST_MARKER')) throw new Error('ui switch failed: ' + body);
  });

  await t('new tab + keeps previous', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const before = M.State.tabs.length;
      M.openNewTabBlank();
      return {
        before,
        after: M.State.tabs.length,
        names: M.State.tabs.map(t => t.name),
        active: M.State.currentFile?.name,
      };
    });
    if (r.after < r.before + 1) throw new Error(JSON.stringify(r));
    if (r.active !== 'untitled.md') throw new Error('active ' + r.active);
    if (!r.names.includes('dfc-paper.md')) throw new Error('dfc gone ' + r.names);
  });

  await t('close tab does not delete other', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const scratch = M.State.tabs.find(t => t.name === 'test-scratch.md');
      if (scratch) {
        // clear dirty to avoid confirm
        scratch.dirty = false;
        M.closeTab(scratch.id);
      }
      return {
        names: M.State.tabs.map(t => t.name),
        hasDfc: M.State.tabs.some(t => t.name === 'dfc-paper.md'),
      };
    });
    if (!r.hasDfc) throw new Error('dfc closed wrongly: ' + r.names);
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
