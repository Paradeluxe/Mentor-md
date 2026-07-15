// v1.43 / v1.43.26 empty state + 看示例 in ? help popover
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

  console.log('=== v1.43.26 empty state + help demo ===');

  await page.goto('http://127.0.0.1:8787/index.html?v=141&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });

  await t('cold empty: no empty-demo-btn, foot mentions ?', async () => {
    const r = await page.evaluate(() => ({
      iconVisible: !!document.querySelector('.empty-hint-icon svg'),
      stepsCount: document.querySelectorAll('.empty-hint-steps li').length,
      hasDemoBtn: !!document.querySelector('#empty-demo-btn'),
      h2Text: document.querySelector('.empty-hint h2')?.textContent,
      hasFoot: !!document.querySelector('.empty-hint-foot'),
      footText: document.querySelector('.empty-hint-foot')?.textContent || '',
      mode: document.querySelector('#comment-empty')?.dataset.emptyMode,
    }));
    if (!r.iconVisible) throw new Error('no icon');
    if (r.stepsCount !== 3) throw new Error(`expected 3 steps, got ${r.stepsCount}`);
    if (r.hasDemoBtn) throw new Error('empty-demo-btn should be removed');
    if (r.h2Text !== '还没有批注') throw new Error(`bad h2: ${r.h2Text}`);
    if (!r.hasFoot) throw new Error('no foot');
    if (!r.footText.includes('?')) throw new Error(`foot missing ?: ${r.footText}`);
    if (r.mode !== 'cold') throw new Error(`expected mode cold, got ${r.mode}`);
  });

  await t('? help popover has 看示例 button', async () => {
    await page.evaluate(() => localStorage.removeItem('mentor.onboarded.v1'));
    await page.click('#help-btn');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      helpOpen: !document.querySelector('#help-popover')?.classList.contains('hidden'),
      demoBtn: !!document.querySelector('#help-demo-btn'),
      demoText: document.querySelector('#help-demo-btn')?.textContent?.trim(),
    }));
    if (!r.helpOpen) throw new Error('help not open');
    if (!r.demoBtn) throw new Error('no help-demo-btn');
    if (!r.demoText?.includes('看示例')) throw new Error(`bad demo btn: ${r.demoText}`);
  });

  await t('click 看示例 in help loads demo + closes help', async () => {
    await page.click('#help-demo-btn');
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
        helpOpen: !document.querySelector('#help-popover')?.classList.contains('hidden'),
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
    if (r.helpOpen) throw new Error('help should close after demo');
  });

  await t('demo has highlights in editor', async () => {
    const highlightCount = await page.evaluate(() => {
      return document.querySelectorAll('.ProseMirror [data-thread-id], .ProseMirror mark').length;
    });
    if (highlightCount < 2) throw new Error(`expected ≥2 highlights, got ${highlightCount}`);
  });

  await t('doc mode: clear anns keeps empty, no demo btn', async () => {
    await page.evaluate(() => {
      const s = window.__mdAnnotator.State;
      s.annotations = [];
      window.__mdAnnotator.renderCommentList();
    });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const e = document.querySelector('#comment-empty');
      return {
        emptyVisible: e && !e.classList.contains('hidden'),
        mode: e?.dataset.emptyMode,
        hasDemoBtn: !!document.querySelector('#empty-demo-btn'),
        lead: e?.querySelector('.hint-lead')?.textContent,
      };
    });
    if (!r.emptyVisible) throw new Error('empty not shown when annotations=0');
    if (r.mode !== 'doc') throw new Error(`expected doc mode, got ${r.mode}`);
    if (r.hasDemoBtn) throw new Error('empty-demo-btn should not exist');
    if (!r.lead?.includes('本篇')) throw new Error(`bad lead: ${r.lead}`);
  });

  await t('filter mode works', async () => {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('paper2.md', '# T\n\nhello world text here\n', null);
      M.State.annotations = [{
        threadId: 't-filter-1',
        text: 'hello',
        range: { from: 1, to: 6 },
        resolved: true,
        comments: [{ id: 'c1', author: 'T', body: 'x', createdAt: new Date().toISOString() }],
      }];
      M.State.filterOpen = true;
      M.State.filterResolved = false;
      M.renderCommentList();
    });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const e = document.querySelector('#comment-empty');
      return {
        emptyVisible: e && !e.classList.contains('hidden'),
        mode: e?.dataset.emptyMode,
        h2: e?.querySelector('h2')?.textContent,
      };
    });
    if (!r.emptyVisible || r.mode !== 'filter' || !r.h2?.includes('筛选')) throw new Error(JSON.stringify(r));
  });

  console.log(`\n=== RESULT: ${pass} pass / ${fail} fail ===`);
  console.log('Console errors:', errs.length ? errs.join('\n  ') : 'none');

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
