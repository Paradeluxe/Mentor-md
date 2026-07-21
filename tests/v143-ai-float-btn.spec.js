// v1.43.53 float AI 批注 button
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      fail++;
    }
  };

  console.log('=== v1.43.53 AI float button ===');
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('float bar has comment + ai buttons', async () => {
    const r = await page.evaluate(() => {
      const bar = document.querySelector('#float-comment-btn');
      const c = bar && bar.querySelector('[data-float-act="comment"]');
      const a = bar && bar.querySelector('[data-float-act="ai"]');
      return {
        bar: !!bar,
        c: !!c,
        a: !!a,
        aiClass: !!(a && a.classList.contains('float-ai-btn')),
      };
    });
    if (!r.bar || !r.c || !r.a || !r.aiClass) throw new Error(JSON.stringify(r));
  });

  await t('AI selection seeds @AI draft', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor(
        'ai-btn-test.md',
        '# Title\n\nHello world unique phrase for AI button.\n',
        null
      );
      const doc = M.State.editor.state.doc;
      let from = -1, to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text.includes('unique phrase')) {
          const i = node.text.indexOf('unique phrase');
          from = pos + i;
          to = from + 'unique phrase'.length;
        }
      });
      if (from < 0) return { err: 'range not found' };
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection({ ai: true });
      const tid = M.State.activeThreadId;
      const draft = M.State.replyDrafts[tid];
      const ta = document.querySelector(`[data-thread-input="${tid}"]`);
      return {
        tid: !!tid,
        draft,
        taVal: ta && ta.value,
        hasMarker: /@AI\b/i.test(draft || '') && /@AI\b/i.test((ta && ta.value) || ''),
      };
    });
    if (r.err) throw new Error(r.err);
    if (!r.hasMarker) throw new Error(JSON.stringify(r));
  });

  await t('normal comment does not force @AI', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1, to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text.includes('Hello world')) {
          from = pos;
          to = pos + Math.min(node.text.length, 5);
        }
      });
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection({ ai: false });
      const tid = M.State.activeThreadId;
      const draft = M.State.replyDrafts[tid] || '';
      return { draft, noAi: !/@AI\b/i.test(draft) };
    });
    if (!r.noAi) throw new Error('unexpected ai draft ' + r.draft);
  });

  await t('prefix-ai chip inserts marker', async () => {
    const r = await page.evaluate(() => {
      const btn = document.querySelector('[data-act="prefix-ai"]');
      if (!btn) return { err: 'no chip' };
      const tid = btn.dataset.thread;
      const ta = document.querySelector(`[data-thread-input="${tid}"]`);
      ta.value = 'fix the typo';
      btn.click();
      return { val: ta.value, ok: /^@AI\b/i.test(ta.value) };
    });
    if (r.err) throw new Error(r.err);
    if (!r.ok) throw new Error(r.val);
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
