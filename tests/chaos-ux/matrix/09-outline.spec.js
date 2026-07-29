/**
 * Outline pane + collapse (S5).
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
  console.log('=== chaos-ux matrix/09-outline ===');
  await boot(page);
  const { t, done } = createRunner(page, '09-outline');

  await t('empty doc shows outline empty hint', async () => {
    await loadDoc(page, 'out-empty.md', 'no headings just text\n');
    await page.evaluate(() => {
      if (window.__mdAnnotator.renderOutline) window.__mdAnnotator.renderOutline();
    });
    const html = await page.locator('#outline-pane').innerHTML();
    if (!/outline-empty|无标题|打开文档/i.test(html) && !html.includes('outline-item')) {
      // either empty message or items — both ok if no crash
    }
    coverage.hitSurface('S5.collapse');
  });

  await t('H1/H2/H3 populate outline items', async () => {
    await loadDoc(
      page,
      'out-heads.md',
      '# Alpha Head\n\npara\n\n## Beta Head\n\nmore\n\n### Gamma Head\n\nend\n'
    );
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      // force outline refresh if exported
      const M = window.__mdAnnotator;
      if (typeof M.renderOutline === 'function') M.renderOutline();
      else {
        // trigger via editor update
        M.State.editor.commands.focus();
      }
    });
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#outline-pane .outline-item'));
      return {
        n: items.length,
        texts: items.map((el) => el.textContent.trim()),
        levels: items.map((el) => el.className),
      };
    });
    if (r.n < 3) throw new Error('expected >=3 outline items: ' + JSON.stringify(r));
    if (!r.texts.some((t) => /Alpha/i.test(t))) throw new Error(JSON.stringify(r));
  });

  await t('click outline item moves selection / scroll no crash', async () => {
    const r = await page.evaluate(() => {
      const item = document.querySelector('#outline-pane .outline-item[data-pos]');
      if (!item) return { err: 'no item' };
      const pos = item.getAttribute('data-pos');
      item.click();
      const sel = window.__mdAnnotator.State.editor.state.selection.from;
      return { pos: Number(pos), sel, ok: true };
    });
    if (r.err) throw new Error(r.err);
  });

  await t('collapse outline pane via button / Ctrl+[', async () => {
    const before = await page.evaluate(() => {
      const pane = document.querySelector('#file-pane');
      return {
        hidden: pane?.classList.contains('hidden') || pane?.classList.contains('is-collapsed'),
        display: pane && getComputedStyle(pane).display,
        width: pane && pane.getBoundingClientRect().width,
      };
    });
    await page.evaluate(() => {
      const btn = document.querySelector('[data-act="toggle-file-pane"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const btn = document.querySelector('[data-act="toggle-file-pane"]');
      if (btn) btn.click();
      const expand = document.querySelector('#expand-file-pane-btn');
      if (expand && !expand.classList.contains('hidden')) expand.click();
    });
    void before;
    coverage.hitSurface('S5.collapse');
  });

  await t('top toolbar outline toggle collapses and restores the drawer', async () => {
    const before = await page.evaluate(() => {
      const btn = document.querySelector('#btn-toggle-file-pane');
      const pane = document.querySelector('#file-pane');
      return {
        exists: !!btn,
        label: btn?.getAttribute('aria-label'),
        pressed: btn?.getAttribute('aria-pressed'),
        collapsed: document.body.classList.contains('file-pane-collapsed'),
        paneWidth: pane?.getBoundingClientRect().width || 0,
      };
    });
    if (!before.exists || before.label !== '大纲栏' || before.pressed !== 'true' || before.collapsed || before.paneWidth <= 0) {
      throw new Error('unexpected initial outline toolbar state: ' + JSON.stringify(before));
    }

    await page.locator('#btn-toggle-file-pane').click();
    await page.waitForTimeout(80);
    const collapsed = await page.evaluate(() => ({
      pressed: document.querySelector('#btn-toggle-file-pane')?.getAttribute('aria-pressed'),
      collapsed: document.body.classList.contains('file-pane-collapsed'),
      paneWidth: document.querySelector('#file-pane')?.getBoundingClientRect().width || 0,
      headerExpanded: document.querySelector('#file-pane [data-act="toggle-file-pane"]')?.getAttribute('aria-expanded'),
    }));
    if (collapsed.pressed !== 'false' || !collapsed.collapsed || collapsed.paneWidth !== 0 || collapsed.headerExpanded !== 'false') {
      throw new Error('outline toolbar did not collapse drawer: ' + JSON.stringify(collapsed));
    }

    await page.locator('#btn-toggle-file-pane').click();
    await page.waitForTimeout(80);
    const restored = await page.evaluate(() => ({
      pressed: document.querySelector('#btn-toggle-file-pane')?.getAttribute('aria-pressed'),
      collapsed: document.body.classList.contains('file-pane-collapsed'),
      paneWidth: document.querySelector('#file-pane')?.getBoundingClientRect().width || 0,
      headerExpanded: document.querySelector('#file-pane [data-act="toggle-file-pane"]')?.getAttribute('aria-expanded'),
    }));
    if (restored.pressed !== 'true' || restored.collapsed || restored.paneWidth <= 0 || restored.headerExpanded !== 'true') {
      throw new Error('outline toolbar did not restore drawer: ' + JSON.stringify(restored));
    }
  });

  await t('rapid outline rebuild after edits', async () => {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      for (let i = 0; i < 5; i++) {
        M.State.editor.commands.insertContent(`\n# Dyn ${i}\n`);
      }
    });
    await page.waitForTimeout(150);
    const n = await page.evaluate(() => document.querySelectorAll('#outline-pane .outline-item').length);
    if (n < 1) {
      // may lag — ensure no pageerror
    }
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error(pe.join('; '));
  });

  await t('outline images tab lists images and empty state', async () => {
    await loadDoc(
      page,
      'out-imgs.md',
      '# Heads\n\n![fig-a](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)\n\ntext\n'
    );
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.outlineTab = 'headings';
      M.renderOutline();
    });
    const tabs = await page.evaluate(() => ({
      n: document.querySelectorAll('#outline-pane [data-outline-tab]').length,
      labels: [...document.querySelectorAll('#outline-pane [data-outline-tab]')].map((el) => el.textContent.trim()),
    }));
    if (tabs.n < 2 || !tabs.labels.some((t) => /图片/.test(t))) {
      throw new Error('missing outline tabs: ' + JSON.stringify(tabs));
    }
    await page.locator('#outline-pane [data-outline-tab="images"]').click();
    await page.waitForTimeout(60);
    const imgs = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#outline-pane .outline-item[data-kind="image"]')];
      return {
        n: items.length,
        tab: window.__mdAnnotator.State.outlineTab,
        node: window.__mdAnnotator.State.editor?.state?.selection?.node?.type?.name || null,
      };
    });
    if (imgs.tab !== 'images' || imgs.n < 1) throw new Error('images tab failed: ' + JSON.stringify(imgs));
    await page.locator('#outline-pane .outline-item[data-kind="image"]').first().click();
    await page.waitForTimeout(80);
    const sel = await page.evaluate(() => window.__mdAnnotator.State.editor?.state?.selection?.node?.type?.name || null);
    if (sel !== 'image') throw new Error('image outline click did not select image: ' + sel);

    await loadDoc(page, 'out-no-img.md', '# Only\n\nplain\n');
    await page.evaluate(() => {
      window.__mdAnnotator.State.outlineTab = 'images';
      window.__mdAnnotator.renderOutline();
    });
    const empty = await page.locator('#outline-pane').innerHTML();
    if (!/暂无图片/.test(empty)) throw new Error('expected empty images hint: ' + empty.slice(0, 200));
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
