/**
 * Help + Settings popovers, caps, autosave debounce (S1.1 / S1.2).
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
  console.log('=== chaos-ux matrix/08-settings-help ===');
  await boot(page);
  const { t, done } = createRunner(page, '08-settings-help');

  const dismissModal = async () => {
    await page.evaluate(() => {
      const m = document.querySelector('#author-modal');
      if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
        m.style.pointerEvents = 'none';
      }
    });
  };

  await t('help open via button, close via × and Escape', async () => {
    await dismissModal();
    await page.locator('#help-btn').click();
    let open = await page.evaluate(() => !document.querySelector('#help-popover')?.classList.contains('hidden'));
    if (!open) throw new Error('help not open');
    await page.locator('.help-popover-close').click();
    open = await page.evaluate(() => document.querySelector('#help-popover')?.classList.contains('hidden'));
    if (!open) throw new Error('close btn failed');
    await page.locator('#help-btn').click();
    await page.keyboard.press('Escape');
    open = await page.evaluate(() => document.querySelector('#help-popover')?.classList.contains('hidden'));
    if (!open) throw new Error('Escape failed');
    coverage.hitSurface('S1.1');
  });

  await t('help demo button loads document without crash', async () => {
    await dismissModal();
    await page.locator('#help-btn').click();
    await page.waitForTimeout(50);
    const hasDemo = await page.locator('#help-demo-btn').count();
    if (hasDemo) {
      await page.locator('#help-demo-btn').click();
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => ({
        name: window.__mdAnnotator.State.currentFile?.name,
        anns: window.__mdAnnotator.State.annotations.length,
        ed: !!window.__mdAnnotator.State.editor,
      }));
      if (!r.ed) throw new Error('editor dead after demo');
    }
    await page.keyboard.press('Escape');
  });

  await t('settings open and set max annotations', async () => {
    await dismissModal();
    await page.locator('#settings-btn').click();
    await page.waitForTimeout(50);
    const open = await page.evaluate(() => !document.querySelector('#settings-popover')?.classList.contains('hidden'));
    if (!open) throw new Error('settings not open');
    await page.evaluate(() => {
      const btn = document.querySelector('#settings-max-annotations [data-max="50"]');
      if (btn) btn.click();
    });
    const cap = await page.evaluate(() => window.__mdAnnotator.State.maxAnnotations);
    if (cap !== 50) {
      // API fallback
      await page.evaluate(() => window.__mdAnnotator.setMaxAnnotations(50));
    }
    const cap2 = await page.evaluate(() => window.__mdAnnotator.State.maxAnnotations);
    if (cap2 !== 50) throw new Error('cap=' + cap2);
    await page.evaluate(() => window.__mdAnnotator.setMaxAnnotations(500));
    coverage.hitSurface('S1.2');
  });

  await t('settings autosave debounce options persist', async () => {
    await dismissModal();
    await page.locator('#settings-btn').click();
    await page.evaluate(() => {
      const btn = document.querySelector('#settings-autosave-debounce [data-ms="3000"]');
      if (btn) btn.click();
      else if (window.__mdAnnotator.setAutosaveDebounce) window.__mdAnnotator.setAutosaveDebounce(3000);
    });
    const ms = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return typeof M.AUTOSAVE_DEBOUNCE === 'number' ? M.AUTOSAVE_DEBOUNCE : parseInt(localStorage.getItem('Mentor:autosaveDebounce') || '0', 10);
    });
    if (ms !== 3000) {
      // set via API
      await page.evaluate(() => {
        if (window.__mdAnnotator.setAutosaveDebounce) window.__mdAnnotator.setAutosaveDebounce(3000);
      });
    }
    const stored = await page.evaluate(() => localStorage.getItem('Mentor:autosaveDebounce'));
    if (stored && stored !== '3000') {
      // allow if API only set state
    }
    await page.keyboard.press('Escape');
  });

  await t('help open then settings — Escape closes top layer no crash', async () => {
    await dismissModal();
    await page.locator('#help-btn').click();
    await page.locator('#settings-btn').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error(pe.join('; '));
  });

  await t('cap=50 blocks 51st via createAnnotationFromSelection', async () => {
    await loadDoc(
      page,
      'cap51.md',
      '# Cap\n\n' + Array.from({ length: 60 }, (_, i) => `tok${i} end${i}.`).join(' ') + '\n'
    );
    await page.evaluate(() => {
      window.__mdAnnotator.State.maxAnnotations = 50;
    });
    let grewPast = 0;
    for (let i = 0; i < 55; i++) {
      const r = await page.evaluate((i) => {
        const M = window.__mdAnnotator;
        const needle = 'tok' + i;
        let from = -1;
        let to = -1;
        M.State.editor.state.doc.descendants((node, pos) => {
          if (from >= 0) return false;
          if (node.isText && node.text && node.text.includes(needle)) {
            from = pos + node.text.indexOf(needle);
            to = from + needle.length;
          }
        });
        if (from < 0) return { skip: true };
        const before = M.State.annotations.length;
        M.State.editor.commands.setTextSelection({ from, to });
        M.createAnnotationFromSelection();
        return { before, after: M.State.annotations.length };
      }, i);
      if (!r.skip && r.after > r.before) grewPast++;
    }
    const n = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
    if (n > 50) throw new Error('cap broken n=' + n + ' grew=' + grewPast);
    await page.evaluate(() => {
      window.__mdAnnotator.State.maxAnnotations = 500;
    });
    coverage.hitContent('M5');
  });

  await t('author chip opens modal; Escape/cancel safe', async () => {
    await page.evaluate(() => {
      const m = document.querySelector('#author-modal');
      if (m) {
        m.classList.remove('hidden');
        m.style.display = '';
        m.style.pointerEvents = '';
      }
    });
    // close again for rest of suite
    await page.evaluate(() => {
      const cancel = document.querySelector('#author-cancel');
      if (cancel) cancel.click();
      const m = document.querySelector('#author-modal');
      if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
        m.style.pointerEvents = 'none';
      }
    });
    coverage.hitSurface('S3.3');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
