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

    console.log('\n=== Two-row toolbar structure ===');
    const rowContract = await page.evaluate(() => {
      const names = (selector) => [...document.querySelectorAll(selector)]
        .map((el) => el.getAttribute('data-toolbar-group'));
      const rowOf = (selector) => document.querySelector(selector)
        ?.closest('[data-toolbar-row]')
        ?.getAttribute('data-toolbar-row') || null;
      return {
        rows: [...document.querySelectorAll('#toolbar > [data-toolbar-row]')]
          .map((el) => el.getAttribute('data-toolbar-row')),
        documentGroups: names('#toolbar > [data-toolbar-row="document"] > [data-toolbar-group]'),
        editorGroups: names('#toolbar > [data-toolbar-row="editor"] > [data-toolbar-group]'),
        documentLabel: document.querySelector('[data-toolbar-row="document"]')?.getAttribute('aria-label') || null,
        editorLabel: document.querySelector('[data-toolbar-row="editor"]')?.getAttribute('aria-label') || null,
        newRow: rowOf('#btn-new'),
        titleRow: rowOf('#title-group'),
        boldRow: rowOf('#format-toolbar [data-cmd="bold"]'),
        sourceRow: rowOf('#btn-toggle-render'),
      };
    });

    assert(rowContract.rows.join(',') === 'document,editor',
      `toolbar rows document,editor (got ${rowContract.rows.join(',')})`);
    assert(rowContract.documentGroups.join(',') === 'chrome,document,save,export,references,title',
      `document row groups (got ${rowContract.documentGroups.join(',')})`);
    assert(rowContract.editorGroups.join(',') === 'history,format,view',
      `editor row groups (got ${rowContract.editorGroups.join(',')})`);
    assert(rowContract.documentLabel === '文档与全局操作', 'document row aria-label');
    assert(rowContract.editorLabel === '编辑与视图操作', 'editor row aria-label');
    assert(rowContract.newRow === 'document' && rowContract.titleRow === 'document',
      'new/title belong to document row');
    assert(rowContract.boldRow === 'editor', 'format belongs to editor row');
    assert(rowContract.sourceRow === 'editor', 'source/view belongs to editor row');
    const viewLeft = await page.evaluate(() => {
      const format = document.querySelector('#format-toolbar')?.getBoundingClientRect();
      const view = document.querySelector('[data-toolbar-group="view"]')?.getBoundingClientRect();
      const history = document.querySelector('[data-toolbar-group="history"]')?.getBoundingClientRect();
      return {
        formatRight: format?.right,
        viewLeft: view?.left,
        viewRight: view?.right,
        historyRight: history?.right,
        viewTop: view?.top,
        formatTop: format?.top,
      };
    });
    assert(viewLeft.viewLeft >= viewLeft.formatRight - 1, 'view group is after format on editor row');
    assert(Math.abs((viewLeft.viewTop || 0) - (viewLeft.formatTop || 0)) <= 2,
      'view group shares editor row vertical band with format');

    console.log('\n=== Two-row toolbar geometry ===');
    // adversarial identity text must stay single-line and not inflate toolbar height
    await page.evaluate(() => {
      const nameEl = document.querySelector('#current-file-name');
      const authorEl = document.querySelector('#author-chip-name');
      if (nameEl) {
        nameEl.textContent =
          'toolbar-contract-extremely-long-manuscript-filename-with-revision-notes.mentor';
      }
      if (authorEl) {
        authorEl.textContent = 'toolbar-contract-very-long-author-name';
      }
    });
    async function readToolbarGeometry(width) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(80);
      return page.evaluate(() => {
        const box = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const overlaps = (a, b) => !!a && !!b
          && Math.max(a.left, b.left) < Math.min(a.right, b.right)
          && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
        const toolbar = document.querySelector('#toolbar');
        const documentRow = document.querySelector('[data-toolbar-row="document"]');
        const editorRow = document.querySelector('[data-toolbar-row="editor"]');
        const title = box('#title-group');
        const format = box('#format-toolbar');
        const view = box('[data-toolbar-group="view"]');
        const history = box('[data-toolbar-group="history"]');
        const fileName = document.querySelector('#current-file-name');
        const authorName = document.querySelector('#author-chip-name');
        return {
          toolbarHeight: toolbar.getBoundingClientRect().height,
          document: box('[data-toolbar-row="document"]'),
          editor: box('[data-toolbar-row="editor"]'),
          documentOverflow: documentRow.scrollWidth > documentRow.clientWidth + 1,
          editorOverflow: editorRow.scrollWidth > editorRow.clientWidth + 1,
          toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth + 1,
          titleFormatOverlap: overlaps(title, format),
          titleViewOverlap: overlaps(title, view),
          formatViewOverlap: overlaps(format, view),
          historyViewOverlap: overlaps(history, view),
          titleRightGap: documentRow.getBoundingClientRect().right - title.right,
          viewOnEditorRow: view && editorRow.contains(document.querySelector('[data-toolbar-group="view"]')),
          fileSingleLine: !fileName || fileName.scrollHeight <= fileName.clientHeight + 1,
          authorSingleLine: !authorName || authorName.scrollHeight <= authorName.clientHeight + 1,
        };
      });
    }

    for (const width of [1500, 1024, 900, 640]) {
      const g = await readToolbarGeometry(width);
      assert(g.toolbarHeight >= 64 && g.toolbarHeight <= 74,
        `${width}px toolbar stays compact (got ${g.toolbarHeight})`);
      assert(g.document.height >= 28 && g.editor.height >= 28,
        `${width}px has two visible rows`);
      assert(g.document.bottom <= g.editor.top + 1,
        `${width}px document row is above editor row`);
      assert(!g.toolbarOverflow && !g.documentOverflow && !g.editorOverflow,
        `${width}px toolbar has no horizontal overflow`);
      assert(!g.titleFormatOverlap && !g.formatViewOverlap && !g.titleViewOverlap && !g.historyViewOverlap,
        `${width}px toolbar groups do not overlap`);
      assert(g.viewOnEditorRow, `${width}px view group stays on editor row`);
      assert(Math.abs(g.titleRightGap) <= 1,
        `${width}px title/author stays right aligned (gap ${g.titleRightGap})`);
      assert(g.fileSingleLine && g.authorSingleLine,
        `${width}px file and author stay single-line`);
    }
    // restore default viewport used by later checks
    await page.setViewportSize({ width: 1400, height: 900 });

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
        versionClass: document.querySelector('#btn-version-history')?.classList.contains('tb-icon-text'),
        versionControls: document.querySelector('#btn-version-history')?.getAttribute('aria-controls'),
        versionPressed: document.querySelector('#btn-version-history')?.getAttribute('aria-pressed'),
        versionExpanded: document.querySelector('#btn-version-history')?.getAttribute('aria-expanded'),
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
    assert(staticState.versionClass === true, 'version uses standard toolbar button class');
    assert(staticState.versionControls === 'version-history-drawer', 'version controls drawer');
    assert(staticState.versionPressed === 'false', 'version initial pressed false');
    assert(staticState.versionExpanded === 'false', 'version initial expanded false');

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

    console.log('\n=== Version button visual state ===');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openVersionHistory();
      M.syncToolbarActionState();
    });
    // Wait past the 0.12s background/color transition so computed style is final.
    await page.waitForFunction(() => {
      const btn = document.querySelector('#btn-version-history');
      if (!btn || btn.getAttribute('aria-pressed') !== 'true') return false;
      const bg = getComputedStyle(btn).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }, { timeout: 2000 });
    const versionVisual = await page.evaluate(() => {
      const btn = document.querySelector('#btn-version-history');
      const save = document.querySelector('#btn-save');
      const cs = getComputedStyle(btn);
      return {
        pressed: btn.getAttribute('aria-pressed'),
        versionHeight: btn.getBoundingClientRect().height,
        saveHeight: save.getBoundingClientRect().height,
        background: cs.backgroundColor,
        color: cs.color,
      };
    });
    assert(versionVisual.pressed === 'true', 'version pressed when drawer open');
    assert(Math.abs(versionVisual.versionHeight - versionVisual.saveHeight) <= 1,
      'version matches standard toolbar height');
    assert(versionVisual.background !== 'rgba(0, 0, 0, 0)' && versionVisual.background !== 'transparent',
      `pressed version has visible background (got ${versionVisual.background})`);
    await page.evaluate(() => {
      window.__mdAnnotator.closeVersionHistory();
      window.__mdAnnotator.syncToolbarActionState();
    });

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
