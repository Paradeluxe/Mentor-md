// Single-document page contract (was v1.43.31 multi-doc tabs)
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

  console.log('=== single-document page (no in-page multi-doc tabs) ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=274&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('doc-tabs bar hidden (no + button)', async () => {
    const r = await page.evaluate(() => {
      const bar = document.querySelector('#doc-tabs');
      const cs = bar ? getComputedStyle(bar) : null;
      return {
        bar: !!bar,
        hidden: !bar || bar.hidden || bar.getAttribute('hidden') != null || cs.display === 'none',
        add: !!document.querySelector('#doc-tab-new'),
        h: bar ? bar.getBoundingClientRect().height : 0,
      };
    });
    if (!r.bar) throw new Error('no #doc-tabs element (keep for API compat)');
    if (!r.hidden) throw new Error('doc-tabs should be hidden');
    if (r.add) throw new Error('+ button must not render');
    if (r.h > 1) throw new Error('doc-tabs height ' + r.h);
  });

  await t('open A then B replaces — still one slot', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('dfc-paper.md', '# DFC Paper\n\nThis is the precious dFC content UNIQUE_DFC_MARKER.\n', null);
      const afterA = {
        tabCount: M.State.tabs.length,
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
      };
      M.loadMarkdownIntoEditor('test-scratch.md', '# Scratch\n\nAgent test content UNIQUE_TEST_MARKER.\n', null);
      const afterB = {
        tabCount: M.State.tabs.length,
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        names: M.State.tabs.map(t => t.name),
      };
      return { afterA, afterB };
    });
    if (!r.afterA.body.includes('UNIQUE_DFC_MARKER')) throw new Error('A not loaded');
    if (r.afterA.tabCount > 1) throw new Error('A stacked tabs: ' + r.afterA.tabCount);
    if (r.afterB.tabCount !== 1) throw new Error('expected 1 tab after B, got ' + r.afterB.tabCount + ' ' + JSON.stringify(r.afterB.names));
    if (r.afterB.active !== 'test-scratch.md') throw new Error('active not B: ' + r.afterB.active);
    if (!r.afterB.body.includes('UNIQUE_TEST_MARKER')) throw new Error('B body wrong');
    if (r.afterB.body.includes('UNIQUE_DFC_MARKER')) throw new Error('A content should be replaced');
  });

  await t('switchToTab is no-op in single-doc mode', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('only.md', '# Only\n\nONLY_MARKER\n', null, { documentId: 'doc-only' });
      const ghostId = 'ghost-tab-id';
      M.State.tabs.push({
        id: ghostId,
        name: 'ghost.md',
        html: '<p>GHOST</p>',
        annotations: [],
        dirty: false,
        currentFile: { documentId: 'ghost', name: 'ghost.md', content: 'GHOST', dirty: false },
      });
      const switched = M.switchToTab(ghostId);
      M.enforceSingleDocumentSlot();
      return {
        switched,
        active: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        tabCount: M.State.tabs.length,
      };
    });
    if (r.switched) throw new Error('switchToTab should return false');
    if (r.active !== 'only.md') throw new Error('active changed: ' + r.active);
    if (!r.body.includes('ONLY_MARKER')) throw new Error('body lost');
    if (r.tabCount !== 1) throw new Error('enforce should leave 1 tab, got ' + r.tabCount);
  });

  await t('openNewTabBlank replaces (still one tab)', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('keep.md', '# Keep\n\nKEEP_MARKER\n', null);
      M.openNewTabBlank();
      return {
        tabCount: M.State.tabs.length,
        name: M.State.currentFile?.name,
        body: M.State.editor.state.doc.textContent,
        hasKeep: M.State.editor.state.doc.textContent.includes('KEEP_MARKER'),
      };
    });
    if (r.tabCount !== 1) throw new Error('tabCount ' + r.tabCount);
    if (r.hasKeep) throw new Error('old content should be gone');
    if (!/新文档|untitled/i.test(r.name + r.body)) throw new Error('expected blank/new: ' + r.name + ' / ' + r.body);
  });

  await t('prepareOpenDocument never returns new-tab', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('a.md', '# A\n', null, { documentId: 'doc-a' });
      const m1 = M.prepareOpenDocument('b.md', 'doc-b');
      M.loadMarkdownIntoEditor('b.md', '# B\n', null, { documentId: 'doc-b' });
      const m2 = M.prepareOpenDocument('b.md', 'doc-b');
      return { m1: m1.mode, m2: m2.mode, tabs: M.State.tabs.length };
    });
    if (r.m1 === 'new-tab' || r.m1 === 'reuse-tab') throw new Error('unexpected mode m1=' + r.m1);
    if (r.m2 !== 'reload-same') throw new Error('same doc should reload-same, got ' + r.m2);
    if (r.tabs !== 1) throw new Error('tabs ' + r.tabs);
  });

  if (errs.length) {
    console.log('pageerrors', errs.slice(0, 5));
    fail++;
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
