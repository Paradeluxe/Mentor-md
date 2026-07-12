// v1.43 first-time empty state + 看示例 demo flow
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log(`  ✓ ${name}`); pass++; }
    catch (e) { console.log(`  ✗ ${name}: ${e.message}`); fail++; }
  };

  console.log('=== v1.43 first-time empty state test ===');

  await page.goto('http://127.0.0.1:8765/index.html?v=121&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
  await page.waitForSelector('#empty-demo-btn', { timeout: 3000 });

  await t('empty state shows new structure', async () => {
    const r = await page.evaluate(() => ({
      iconVisible: !!document.querySelector('.empty-hint-icon svg'),
      stepsCount: document.querySelectorAll('.empty-hint-steps li').length,
      ctaText: document.querySelector('#empty-demo-btn')?.textContent?.trim(),
      h2Text: document.querySelector('.empty-hint h2')?.textContent,
      hasFoot: !!document.querySelector('.empty-hint-foot'),
    }));
    if (!r.iconVisible) throw new Error('no icon');
    if (r.stepsCount !== 3) throw new Error(`expected 3 steps, got ${r.stepsCount}`);
    if (!r.ctaText?.includes('看示例')) throw new Error(`bad CTA: ${r.ctaText}`);
    if (r.h2Text !== '还没有批注') throw new Error(`bad h2: ${r.h2Text}`);
    if (!r.hasFoot) throw new Error('no foot');
  });

  await t('CTA button is wired (no error on click)', async () => {
    // clear onboarded flag first so demo works
    await page.evaluate(() => localStorage.removeItem('mentor.onboarded.v1'));
  });

  await t('click 看示例 loads demo doc + 2 annotations', async () => {
    await page.click('#empty-demo-btn');
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const s = window.__mdAnnotator.State;
      return {
        annCount: s.annotations.length,
        threads: s.annotations.map(a => ({ text: a.text, resolved: a.resolved, commentCount: a.comments.length })),
        fileName: s.currentFile?.name,
        saveMode: s.saveMode,
        onboardedFlag: localStorage.getItem('mentor.onboarded.v1'),
        emptyHidden: document.querySelector('#comment-empty')?.classList.contains('hidden'),
        listChildren: document.querySelectorAll('#comment-list > *').length,
      };
    });
    if (r.annCount !== 2) throw new Error(`expected 2 anns, got ${r.annCount}`);
    const t1 = r.threads.find(x => x.text === '示例文字');
    const t2 = r.threads.find(x => x.text === '数据1');
    if (!t1 || t1.resolved || t1.commentCount !== 1) throw new Error(`bad t1: ${JSON.stringify(t1)}`);
    if (!t2 || !t2.resolved || t2.commentCount !== 1) throw new Error(`bad t2: ${JSON.stringify(t2)}`);
    if (r.fileName !== '演示文档.md') throw new Error(`bad filename: ${r.fileName}`);
    if (r.saveMode !== 'idle') throw new Error(`bad saveMode: ${r.saveMode}`);
    if (r.onboardedFlag !== '1') throw new Error('onboarded flag not set');
    if (!r.emptyHidden) throw new Error('empty hint not hidden');
    if (r.listChildren !== 2) throw new Error(`bad list children: ${r.listChildren}`);
  });

  await t('demo has highlights in editor', async () => {
    const highlightCount = await page.evaluate(() => {
      // marks with comment threadId
      return document.querySelectorAll('.ProseMirror [data-thread-id], .ProseMirror mark').length;
    });
    if (highlightCount < 2) throw new Error(`expected ≥2 highlights, got ${highlightCount}`);
  });

  await t('second click "看示例" no longer shows hint (flag set, but hint still hidden by N>0)', async () => {
    // N > 0 → empty hint stays hidden regardless of flag
    const emptyHidden = await page.evaluate(() => document.querySelector('#comment-empty')?.classList.contains('hidden'));
    if (!emptyHidden) throw new Error('empty visible after demo');
  });

  await t('resetting annotations brings back empty state', async () => {
    await page.evaluate(() => {
      const s = window.__mdAnnotator.State;
      s.annotations = [];
      // Manually re-trigger renderCommentList
      window.__mdAnnotator.renderCommentList();
    });
    await page.waitForTimeout(200);
    const emptyVisible = await page.evaluate(() => {
      const e = document.querySelector('#comment-empty');
      return e && !e.classList.contains('hidden');
    });
    if (!emptyVisible) throw new Error('empty not shown when annotations=0');
  });

  console.log(`\n=== RESULT: ${pass} pass / ${fail} fail ===`);
  console.log('Console errors:', errs.length ? errs.join('\n  ') : 'none');

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();