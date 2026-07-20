// v1.43.47: selection 不整表重渲
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

  console.log('=== v1.43.47 selection list perf ===');

  await t('API setActiveCommentCard exported', async () => {
    const ty = await page.evaluate(() => typeof window.__mdAnnotator.setActiveCommentCard);
    if (ty !== 'function') throw new Error(ty);
  });

  await t('switch thread: is-active moves; list node kept', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>aaa unique-a-sel end</p><p>bbb unique-b-sel end</p>');
      M.State.annotations = [];
      const mark = (needle) => {
        let from = -1, to = -1;
        M.State.editor.state.doc.descendants((n, pos) => {
          if (!n.isText || !n.text) return;
          const j = n.text.indexOf(needle);
          if (j >= 0 && from < 0) {
            from = pos + j;
            to = from + needle.length;
          }
        });
        return M._testCreateAnnotation(from, to, needle).threadId;
      };
      const t1 = mark('unique-a-sel');
      const t2 = mark('unique-b-sel');
      M.State.activeThreadId = t1;
      M.renderCommentList();
      const list = document.getElementById('comment-list');
      list.dataset.probe = 'keep';
      const ok1 = M.setActiveCommentCard(t2);
      const afterProbe = list.dataset.probe;
      const active = [...list.querySelectorAll('.comment-thread')].map((el) => ({
        tid: el.dataset.thread,
        on: el.classList.contains('is-active'),
      }));
      return { ok1, afterProbe, active, t1, t2 };
    });
    if (!r.ok1) throw new Error('setActive fail ' + JSON.stringify(r));
    if (r.afterProbe !== 'keep') throw new Error('list node replaced');
    const a2 = r.active.find((x) => x.tid === r.t2);
    if (!a2 || !a2.on) throw new Error('t2 not active ' + JSON.stringify(r.active));
    const a1 = r.active.find((x) => x.tid === r.t1);
    if (a1 && a1.on) throw new Error('t1 still active');
  });

  await t('same-thread setActive does not call renderCommentList', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      let renders = 0;
      const orig = M.renderCommentList;
      M.renderCommentList = (...args) => {
        renders++;
        return orig.apply(M, args);
      };
      const tid = M.State.activeThreadId;
      M.setActiveCommentCard(tid);
      M.setActiveCommentCard(tid);
      M.renderCommentList = orig;
      return {
        renders,
        tid,
        cards: document.querySelectorAll('.comment-thread').length,
      };
    });
    if (r.renders !== 0) throw new Error('unexpected full render ' + JSON.stringify(r));
    if (!r.tid || r.cards < 1) throw new Error(JSON.stringify(r));
  });

  await t('validate pure prepend: uiChanged false', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>xx unique-ui-only end</p>');
      M.State.annotations = [];
      let from = -1, to = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        const j = n.text.indexOf('unique-ui-only');
        if (j >= 0) {
          from = pos + j;
          to = from + 'unique-ui-only'.length;
        }
      });
      M._testCreateAnnotation(from, to, 'unique-ui-only');
      M.State.editor.commands.setTextSelection(1);
      M.State.editor.commands.insertContent('PRE ');
      const ui = M._validateMarksAfterEdit(M.State.editor, { phase: 'light' });
      const any = M._validateMarksAfterEdit._lastChanged;
      const a = M.State.annotations[0];
      return { ui, any, text: a.text, fuzzy: a.fuzzy, range: a.range };
    });
    if (r.ui) throw new Error('expected ui false on pure shift ' + JSON.stringify(r));
    if (r.text !== 'unique-ui-only') throw new Error(JSON.stringify(r));
  });

  await t('validate text edit inside mark: uiChanged true', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0].threadId;
      const ed = M.State.editor;
      const mt = ed.schema.marks.annotation;
      let from = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === tid) from = pos;
        }
      });
      ed.view.dispatch(ed.state.tr.insertText('Z', from + 3, from + 4));
      const ui = M._validateMarksAfterEdit(ed, { phase: 'light' });
      return {
        ui,
        text: M.State.annotations[0].text,
        fuzzy: M.State.annotations[0].fuzzy,
      };
    });
    if (!r.ui) throw new Error('expected ui true ' + JSON.stringify(r));
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
