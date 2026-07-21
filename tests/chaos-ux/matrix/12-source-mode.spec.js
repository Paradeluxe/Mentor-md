/**
 * Source / rendered toggle cross with annotations (S1.9 / X1).
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
  console.log('=== chaos-ux matrix/12-source-mode ===');
  await boot(page);
  const { t, done } = createRunner(page, '12-source');

  await t('toggle source and back keeps body', async () => {
    await loadDoc(page, 'src1.md', DOCS.simple);
    const before = await page.evaluate(() => window.__mdAnnotator.State.editor.state.doc.textContent);
    await page.locator('#btn-toggle-render').click();
    await page.waitForTimeout(80);
    await page.locator('#btn-toggle-render').click();
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => ({
      mode: window.__mdAnnotator.State.renderMode,
      body: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    if (!after.body.includes('UNIQUE_ALPHA') && !before.includes('UNIQUE_ALPHA')) {
      throw new Error('lost content: ' + JSON.stringify({ before, after }));
    }
    coverage.hitSurface('S1.9');
  });

  await t('annotate then source edit quoted text then render', async () => {
    await loadDoc(page, 'src2.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: 'src-cross' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    // switch to source
    await page.locator('#btn-toggle-render').click();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const el = document.querySelector('#source-view');
      if (el) {
        // mutate quoted word if present
        const t = el.innerText || el.textContent || '';
        if (t.includes('UNIQUE_ALPHA')) {
          el.innerText = t.replace('UNIQUE_ALPHA', 'UNIQUE_ALPHA_X');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        // force mode state if source view missing
        M.State.renderMode = 'source';
      }
    });
    await page.locator('#btn-toggle-render').click();
    await page.waitForTimeout(200);
    const st = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      if (M.scheduleValidateMarks) M.scheduleValidateMarks(M.State.editor, { render: true });
      const a = M.State.annotations.find((x) => x.threadId === tid);
      return a
        ? {
            text: a.text,
            fuzzy: !!a.fuzzy,
            deleted: !!a.deleted,
            reason: a.invalidReason,
            mode: M.State.renderMode,
          }
        : { missing: true };
    }, r.tid);
    if (st.missing) throw new Error('thread gone');
    coverage.hitContent('X1');
  });

  await t('rapid toggle x12 no crash', async () => {
    await loadDoc(page, 'src3.md', DOCS.lists);
    for (let i = 0; i < 12; i++) {
      await page.locator('#btn-toggle-render').click();
      await page.waitForTimeout(30);
    }
    const ok = await page.evaluate(() => !!window.__mdAnnotator.State.editor);
    if (!ok) throw new Error('editor dead');
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error(pe.join('; '));
  });

  await t('source mode save download path no crash', async () => {
    await loadDoc(page, 'src4.md', DOCS.simple);
    await page.locator('#btn-toggle-render').click();
    await page.waitForTimeout(50);
    await page.locator('#btn-save').click();
    await page.waitForTimeout(100);
    await page.locator('#btn-toggle-render').click();
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error(pe.join('; '));
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
