// Toolbar DOM contract: labels, groups, ARIA. Requires server on 8787.
const { chromium } = require('playwright');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}&cb=${Date.now()}`;

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'toolbar-contract'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => {
      document.querySelector('#author-modal')?.classList.add('hidden');
    });

    console.log('\n=== Static labels + groups ===');
    const staticState = await page.evaluate(() => {
      const labelOf = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const span = el.querySelector('.tb-label') || el.querySelector('span:not(.tb-icon)');
        return (span?.textContent || el.textContent || '').trim();
      };
      return {
        groups: [...document.querySelectorAll('#toolbar [data-toolbar-group]')].map((g) => g.getAttribute('data-toolbar-group')),
        saveAs: labelOf('#btn-save-as'),
        refs: labelOf('#btn-refs'),
        blockquoteAria: document.querySelector('[data-cmd="blockquote"]')?.getAttribute('aria-label') || null,
        saveKey: document.querySelector('#btn-save')?.getAttribute('aria-keyshortcuts') || null,
        refsPressed: document.querySelector('#btn-refs')?.getAttribute('aria-pressed') || null,
        refsControls: document.querySelector('#btn-refs')?.getAttribute('aria-controls') || null,
        saveTitle: document.querySelector('#btn-save')?.getAttribute('title') || null,
        saveAsTitle: document.querySelector('#btn-save-as')?.getAttribute('title') || null,
        exportDocxTitle: document.querySelector('#btn-export-docx')?.getAttribute('title') || null,
        blockquoteTitle: document.querySelector('[data-cmd="blockquote"]')?.getAttribute('title') || null,
      };
    });

    assert(staticState.groups.includes('document'), 'group document');
    assert(staticState.groups.includes('save'), 'group save');
    assert(staticState.groups.includes('export'), 'group export');
    assert(staticState.groups.length >= 5, `groups >= 5 (got ${staticState.groups.length})`);
    assert(staticState.saveAs === '另存', `save-as label 另存 (got ${staticState.saveAs})`);
    assert(staticState.refs === '文献', `refs label 文献 (got ${staticState.refs})`);
    assert(staticState.blockquoteAria === '块引用', `blockquote aria 块引用 (got ${staticState.blockquoteAria})`);
    assert(staticState.saveKey === 'Control+S Meta+S', `save aria-keyshortcuts (got ${staticState.saveKey})`);
    assert(staticState.refsPressed === 'false', `refs aria-pressed false (got ${staticState.refsPressed})`);
    assert(staticState.refsControls === 'refs-pane', `refs aria-controls (got ${staticState.refsControls})`);
    assert(staticState.saveAsTitle.includes('.mentor'), `save-as title mentions .mentor (got ${staticState.saveAsTitle})`);
    assert(staticState.exportDocxTitle.includes('仅正文'), `docx title 仅正文 (got ${staticState.exportDocxTitle})`);
    assert(staticState.blockquoteTitle === '块引用', `blockquote title (got ${staticState.blockquoteTitle})`);

    console.log('\n=== After load document: dirty/save state ===');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank?.();
      M.loadMarkdownIntoEditor('toolbar-state.md', '# State\n\nhello\n', null);
      M.State.editor.commands.insertContent('x');
      M.syncToolbarActionState?.();
    });
    await page.waitForTimeout(100);

    const afterEdit = await page.evaluate(() => ({
      saveDirty: document.querySelector('#btn-save')?.dataset.dirty || null,
      saveDisabled: !!document.querySelector('#btn-save')?.disabled,
      refsPressed: document.querySelector('#btn-refs')?.getAttribute('aria-pressed'),
      hasSync: typeof window.__mdAnnotator?.syncToolbarActionState === 'function',
    }));
    assert(afterEdit.hasSync, 'syncToolbarActionState exported');
    assert(afterEdit.saveDirty === 'true', `save data-dirty=true (got ${afterEdit.saveDirty})`);
    assert(afterEdit.saveDisabled === false, 'save not disabled with document');
    assert(afterEdit.refsPressed === 'false', 'refs still not pressed');

    console.log('\n=== Refs toggle pressed ===');
    await page.locator('#btn-refs').click();
    await page.waitForTimeout(50);
    const refsOpen = await page.evaluate(() => ({
      pressed: document.querySelector('#btn-refs')?.getAttribute('aria-pressed'),
      expanded: document.querySelector('#btn-refs')?.getAttribute('aria-expanded'),
      paneHidden: document.querySelector('#refs-pane')?.classList.contains('hidden'),
    }));
    assert(refsOpen.paneHidden === false, 'refs pane visible');
    assert(refsOpen.pressed === 'true', `refs pressed true (got ${refsOpen.pressed})`);
    assert(refsOpen.expanded === 'true', `refs expanded true (got ${refsOpen.expanded})`);

    assert(pageErrors.length === 0, `no page errors: ${pageErrors.join(' | ')}`);
    console.log('\nPASS e2e-toolbar-contract');
  } finally {
    await ctx.close();
    await browser.close();
  }
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
