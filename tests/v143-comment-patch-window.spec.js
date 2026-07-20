// v1.43.50: patch card + sliding window around active
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  let pass = 0, fail = 0;
  const t = async (n, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + n);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + n + ': ' + e.message);
      fail++;
    }
  };

  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  console.log('=== v1.43.50 comment patch + window ===');

  await t('API patchCommentCard / scheduleCommentListUi', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        p: typeof M.patchCommentCard,
        s: typeof M.scheduleCommentListUi,
        f: typeof M.flushCommentListUi,
      };
    });
    if (r.p !== 'function' || r.s !== 'function' || r.f !== 'function') throw new Error(JSON.stringify(r));
  });

  await t('patchCommentCard updates quote + fuzzy without full rebuild', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>aa unique-patch-tok bb</p>');
      M.State.annotations = [];
      let from = -1, to = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        const j = n.text.indexOf('unique-patch-tok');
        if (j >= 0) {
          from = pos + j;
          to = from + 'unique-patch-tok'.length;
        }
      });
      const thr = M._testCreateAnnotation(from, to, 'unique-patch-tok');
      M.renderCommentList();
      const list = document.getElementById('comment-list');
      list.dataset.probe = 'keep50';
      thr.text = 'unique-patch-tok-EDITED';
      thr.fuzzy = true;
      const ok = M.patchCommentCard(thr);
      const el = list.querySelector(`.comment-thread[data-thread="${thr.threadId}"]`);
      return {
        ok,
        probe: list.dataset.probe,
        fuzzy: el && el.classList.contains('is-fuzzy'),
        quote: el && el.querySelector('.comment-quote-text')?.textContent,
        banner: !!el?.querySelector('.fuzzy-banner'),
      };
    });
    if (!r.ok || r.probe !== 'keep50') throw new Error(JSON.stringify(r));
    if (!r.fuzzy || !r.banner) throw new Error('fuzzy ui ' + JSON.stringify(r));
    if (!r.quote || r.quote.indexOf('EDITED') === -1) throw new Error('quote ' + JSON.stringify(r));
  });

  await t('flushCommentListUi patches touched ids without renderCommentList', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      let renders = 0;
      const orig = M.renderCommentList;
      M.renderCommentList = (...a) => {
        renders++;
        return orig.apply(M, a);
      };
      const thr = M.State.annotations[0];
      thr.text = 'unique-patch-tok-FLUSH';
      thr.fuzzy = true;
      M._validateMarksAfterEdit._lastUiTouchedIds = new Set([thr.threadId]);
      M._validateMarksAfterEdit._lastUiChanged = true;
      M.flushCommentListUi();
      M.renderCommentList = orig;
      const el = document.querySelector(`.comment-thread[data-thread="${thr.threadId}"]`);
      return {
        renders,
        quote: el?.querySelector('.comment-quote-text')?.textContent,
      };
    });
    if (r.renders !== 0) throw new Error('full render ' + JSON.stringify(r));
    if (!r.quote || r.quote.indexOf('FLUSH') === -1) throw new Error(JSON.stringify(r));
  });

  await t('sliding window includes active late card', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.maxAnnotations = 0;
      M.State.commentListShowAll = false;
      M.State.commentListLimit = 15;
      M.State.commentListWindowStart = 0;
      const parts = [];
      for (let i = 0; i < 40; i++) parts.push(`<p>w${i} win-tok-${i} z</p>`);
      M.State.editor.commands.setContent(parts.join(''));
      M.State.annotations = [];
      const tids = [];
      for (let i = 0; i < 40; i++) {
        const needle = `win-tok-${i}`;
        let from = -1, to = -1;
        M.State.editor.state.doc.descendants((n, pos) => {
          if (!n.isText || !n.text) return;
          const j = n.text.indexOf(needle);
          if (j >= 0 && from < 0) {
            from = pos + j;
            to = from + needle.length;
          }
        });
        const thr = M._testCreateAnnotation(from, to, needle);
        if (thr) tids.push(thr.threadId);
      }
      // without active: first window
      M.State.activeThreadId = null;
      M.State.commentListWindowStart = 0;
      M.renderCommentList();
      const firstOnly = !!document.querySelector(
        `#comment-list .comment-thread[data-thread="${tids[0]}"]`,
      );
      const lastHidden = !document.querySelector(
        `#comment-list .comment-thread[data-thread="${tids[35]}"]`,
      );
      // activate late
      M.State.activeThreadId = tids[35];
      M.renderCommentList();
      const lateVisible = !!document.querySelector(
        `#comment-list .comment-thread[data-thread="${tids[35]}"].is-active`,
      );
      const firstHiddenAfter = !document.querySelector(
        `#comment-list .comment-thread[data-thread="${tids[0]}"]`,
      );
      const nums = [...document.querySelectorAll('.comment-number-badge')].map((b) =>
        parseInt(b.getAttribute('data-number') || b.textContent, 10),
      );
      return {
        firstOnly,
        lastHidden,
        lateVisible,
        firstHiddenAfter,
        minNum: Math.min(...nums),
        maxNum: Math.max(...nums),
        cards: nums.length,
      };
    });
    if (!r.firstOnly || !r.lastHidden) throw new Error('baseline window ' + JSON.stringify(r));
    if (!r.lateVisible) throw new Error('late not visible ' + JSON.stringify(r));
    if (!r.firstHiddenAfter) throw new Error('window did not slide off first ' + JSON.stringify(r));
    if (r.minNum < 10) throw new Error('global numbers should shift ' + JSON.stringify(r));
    if (r.maxNum < 30) throw new Error('global numbers ' + JSON.stringify(r));
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
