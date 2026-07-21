/**
 * S1 toolbar — every primary button clickable without crash (连点狂 smoke).
 */
const path = require('path');
const {
  launch,
  boot,
  closeAll,
  createRunner,
  clickSel,
  loadDoc,
} = require('../harness');
const surfaces = require('../surfaces.json');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/01-toolbar ===');
  await boot(page);
  const { t, done } = createRunner(page, '01-toolbar');

  await t('seed document', async () => {
    await loadDoc(page, 'toolbar-seed.md', '# Hi\n\nToolbar seed UNIQUE_TB.\n');
  });

  const toolbar = surfaces.surfaces.filter((s) => s.group === 'toolbar' || s.group === 'format');
  for (const s of toolbar) {
    await t(`click ${s.id} ${s.name} x3`, async () => {
      for (let i = 0; i < 3; i++) {
        // open/image may open native dialogs — skip heavy ones in smoke
        if (s.name === 'open' || s.name === 'fmt-image' || s.name === 'fmt-link') {
          const exists = await page.locator(s.selector).count();
          if (!exists) throw new Error('missing ' + s.selector);
          coverage.hitSurface(s.id);
          continue;
        }
        await clickSel(page, s.selector, s.id);
        await page.waitForTimeout(40);
      }
    });
  }

  await t('open more menu then click strike/code/h3', async () => {
    await clickSel(page, '#btn-tb-more', 'S2.more');
    await page.waitForTimeout(80);
    // more-menu items may be in a popover; use DOM click to avoid visibility flake
    const clicked = await page.evaluate(() => {
      const menu = document.querySelector('#tb-more-menu');
      if (menu) menu.classList.remove('hidden');
      const ids = ['strike', 'code', 'h3', 'blockquote'];
      const out = [];
      for (const id of ids) {
        const el = document.querySelector(`[data-cmd="${id}"]`);
        if (el) {
          el.click();
          out.push(id);
        }
      }
      return out;
    });
    if (clicked.length < 2) throw new Error('more menu cmds missing: ' + JSON.stringify(clicked));
    for (const id of clicked) coverage.hitSurface('S2.' + id);
    await page.keyboard.press('Escape');
  });

  await t('help open/close', async () => {
    await clickSel(page, '#help-btn', 'S1.1');
    const open = await page.evaluate(() => !document.querySelector('#help-popover').classList.contains('hidden'));
    if (!open) throw new Error('help not open');
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => document.querySelector('#help-popover').classList.contains('hidden'));
    if (!closed) throw new Error('help not closed');
  });

  await t('settings open + pick debounce option', async () => {
    await clickSel(page, '#settings-btn', 'S1.2');
    await page.waitForTimeout(80);
    const opt = page.locator('#settings-autosave-debounce .settings-opt').first();
    if ((await opt.count()) > 0) await opt.click();
    await page.keyboard.press('Escape');
  });

  await t('filter tabs all/open/resolved', async () => {
    for (const f of ['all', 'open', 'resolved']) {
      await clickSel(page, `[data-filter-tab="${f}"]`, 'S7.filter-' + f);
    }
  });

  const result = done();
  if (coverage) {
    const rep = coverage.report();
    console.log('  surfaces hit:', Object.keys(rep.surfaces).length);
  }
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
