// v1.43.48: soft-limit 不整表空白 + 分窗外 ensure + authorColor preserve
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

  console.log('=== v1.43.48 unfinished opts ===');

  await t('API ensureCommentCardVisible', async () => {
    const ty = await page.evaluate(() => typeof window.__mdAnnotator.ensureCommentCardVisible);
    if (ty !== 'function') throw new Error(ty);
  });

  await t('soft-limit: over cap*2 still renders cards + banner', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      // soft = max*2; max=20 → soft 40. 创建时 cap=0 绕过硬上限，再把 max 调回 20 触发 soft 横幅
      M.State.maxAnnotations = 0;
      M.State.commentListLimit = 60;
      M.State.commentListShowAll = false;
      const parts = [];
      for (let i = 0; i < 50; i++) parts.push(`<p>r${i} soft-tok-${i} e</p>`);
      M.State.editor.commands.setContent(parts.join(''));
      M.State.annotations = [];
      for (let i = 0; i < 50; i++) {
        const needle = `soft-tok-${i}`;
        let from = -1, to = -1;
        M.State.editor.state.doc.descendants((n, pos) => {
          if (!n.isText || !n.text) return;
          const j = n.text.indexOf(needle);
          if (j >= 0 && from < 0) {
            from = pos + j;
            to = from + needle.length;
          }
        });
        M._testCreateAnnotation(from, to, needle);
      }
      M.State.maxAnnotations = 20; // soft=40, ann=50 → overSoft
      M.renderCommentList();
      return {
        ann: M.State.annotations.length,
        cards: document.querySelectorAll('#comment-list .comment-thread').length,
        banner: !!document.querySelector('.comment-overflow-warn'),
        empty: !document.querySelector('#comment-empty')?.classList.contains('hidden'),
      };
    });
    if (r.ann !== 50) throw new Error('ann ' + r.ann);
    if (r.cards < 1) throw new Error('no cards under soft ' + JSON.stringify(r));
    if (!r.banner) throw new Error('no banner ' + JSON.stringify(r));
    if (r.empty) throw new Error('empty shown ' + JSON.stringify(r));
  });

  await t('ensureCommentCardVisible expands window to late card', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.maxAnnotations = 0;
      M.State.commentListShowAll = false;
      M.State.commentListLimit = 10;
      M.State.commentListWindowStart = 0;
      M.State.activeThreadId = null;
      const parts = [];
      for (let i = 0; i < 30; i++) parts.push(`<p>e${i} ens-tok-${i} x</p>`);
      M.State.editor.commands.setContent(parts.join(''));
      M.State.annotations = [];
      const tids = [];
      for (let i = 0; i < 30; i++) {
        const needle = `ens-tok-${i}`;
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
      M.State.activeThreadId = null;
      M.State.commentListWindowStart = 0;
      M.renderCommentList();
      const before = document.querySelectorAll('#comment-list .comment-thread').length;
      const lastTid = tids[tids.length - 1];
      const beforeHas = !!document.querySelector(`#comment-list .comment-thread[data-thread="${lastTid}"]`);
      const ok = M.ensureCommentCardVisible(lastTid);
      const after = document.querySelectorAll('#comment-list .comment-thread').length;
      const has = !!document.querySelector(`#comment-list .comment-thread[data-thread="${lastTid}"]`);
      return {
        before, after, ok, has, beforeHas,
        limit: M.State.commentListLimit,
        n: tids.length,
      };
    });
    if (r.n !== 30) throw new Error('n ' + JSON.stringify(r));
    if (r.beforeHas) throw new Error('last already visible before ensure ' + JSON.stringify(r));
    if (!r.ok || !r.has) throw new Error(JSON.stringify(r));
    if (r.after <= r.before) throw new Error('did not expand ' + JSON.stringify(r));
    if (r.limit <= 10) throw new Error('limit not bumped ' + JSON.stringify(r));
  });

  await t('highlightActiveMark preserves authorColor', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>color unique-color-tok here</p>');
      M.State.annotations = [];
      let from = -1, to = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        const j = n.text.indexOf('unique-color-tok');
        if (j >= 0) {
          from = pos + j;
          to = from + 'unique-color-tok'.length;
        }
      });
      const thr = M._testCreateAnnotation(from, to, 'unique-color-tok');
      const ed = M.State.editor;
      const mt = ed.schema.marks.annotation;
      let colorBefore = null;
      ed.state.doc.descendants((n) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === thr.threadId) {
            colorBefore = m.attrs.authorColor;
          }
        }
      });
      M.State.activeThreadId = thr.threadId;
      M.highlightActiveMark();
      M.State.activeThreadId = null;
      M.highlightActiveMark();
      M.State.activeThreadId = thr.threadId;
      M.highlightActiveMark();
      let colorAfter = null;
      let active = null;
      ed.state.doc.descendants((n) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === thr.threadId) {
            colorAfter = m.attrs.authorColor;
            active = m.attrs.active;
          }
        }
      });
      return { colorBefore, colorAfter, active, tid: thr.threadId };
    });
    if (r.colorBefore == null && r.colorAfter == null) {
      // authorColor may be 0
    }
    if (r.colorBefore !== r.colorAfter) {
      throw new Error('color lost ' + JSON.stringify(r));
    }
    if (!r.active) throw new Error('not active ' + JSON.stringify(r));
  });

  await t('scrollToThread uses setActive path without wiping list probe', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.renderCommentList();
      const list = document.getElementById('comment-list');
      list.dataset.probe = 'keep48';
      const tid = M.State.annotations[0].threadId;
      M.scrollToThread(tid);
      return {
        probe: list.dataset.probe,
        active: M.State.activeThreadId === tid,
        cardOn: !!document.querySelector(
          `.comment-thread[data-thread="${tid}"].is-active`,
        ),
      };
    });
    if (r.probe !== 'keep48') throw new Error('list rebuilt ' + JSON.stringify(r));
    if (!r.active || !r.cardOn) throw new Error(JSON.stringify(r));
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
