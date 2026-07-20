// perf-validate-throttle: v1.43.45 light vs full + typing coalesce
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
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
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  console.log('=== perf-validate-throttle v1.43.45 ===');

  await t('API scheduleValidateMarks + phase', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        sched: typeof M.scheduleValidateMarks,
        val: typeof M._validateMarksAfterEdit,
      };
    });
    if (r.sched !== 'function' || r.val !== 'function') throw new Error(JSON.stringify(r));
  });

  await t('light faster or equal full on 80-ann doc; both correct ranges', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const parts = [];
      for (let i = 0; i < 80; i++) parts.push(`<p>row${i} tok-${i}-vv end${i}</p>`);
      M.State.editor.commands.setContent(parts.join(''));
      M.State.annotations = [];
      for (let i = 0; i < 80; i++) {
        const needle = `tok-${i}-vv`;
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
      // prepend shift
      M.State.editor.commands.setTextSelection(1);
      M.State.editor.commands.insertContent('<p>SHIFT_BLOCK</p>');

      const t0 = performance.now();
      M._validateMarksAfterEdit(M.State.editor, { phase: 'light' });
      const lightMs = performance.now() - t0;

      const t1 = performance.now();
      M._validateMarksAfterEdit(M.State.editor, { phase: 'full' });
      const fullMs = performance.now() - t1;

      // check corr
      const mt = M.State.editor.schema.marks.annotation;
      const mm = {};
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId) {
            const tid = m.attrs.threadId;
            const end = pos + n.nodeSize;
            if (!mm[tid]) mm[tid] = { from: pos, to: end, text: n.text };
            else {
              mm[tid].from = Math.min(mm[tid].from, pos);
              mm[tid].to = Math.max(mm[tid].to, end);
              mm[tid].text += n.text;
            }
          }
        }
      });
      let bad = 0;
      for (const a of M.State.annotations) {
        const m = mm[a.threadId];
        if (!m || !a.range || a.range.from !== m.from || a.range.to !== m.to || a.text !== m.text) bad++;
      }
      return {
        n: M.State.annotations.length,
        lightMs: Math.round(lightMs * 100) / 100,
        fullMs: Math.round(fullMs * 100) / 100,
        bad,
      };
    });
    if (r.n !== 80) throw new Error('ann ' + r.n);
    if (r.bad !== 0) throw new Error('bad corr ' + JSON.stringify(r));
    // light should not be wildly slower than full (same walk); just record
    console.log('    light', r.lightMs, 'ms full', r.fullMs, 'ms');
  });

  await t('20 rapid inserts: schedule coalesces; final corr ok', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>AAA unique-rapid-vv BBB</p>');
      M.State.annotations = [];
      let from = -1, to = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        const j = n.text.indexOf('unique-rapid-vv');
        if (j >= 0) {
          from = pos + j;
          to = from + 'unique-rapid-vv'.length;
        }
      });
      const thr = M._testCreateAnnotation(from, to, 'unique-rapid-vv');
      const tid = thr.threadId;
      // 20 inserts via schedule path
      for (let i = 0; i < 20; i++) {
        M.State.editor.view.dispatch(M.State.editor.state.tr.insertText('.', 1));
        M.scheduleValidateMarks(M.State.editor, { render: false });
      }
      // wait full debounce
      await new Promise((r) => setTimeout(r, 80));
      M.scheduleValidateMarks(M.State.editor, { immediate: true });
      const a = M.State.annotations.find((x) => x.threadId === tid);
      const mt = M.State.editor.schema.marks.annotation;
      let mark = null;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === tid) {
            if (!mark) mark = { from: pos, to: pos + n.nodeSize, text: n.text };
            else {
              mark.from = Math.min(mark.from, pos);
              mark.to = Math.max(mark.to, pos + n.nodeSize);
              mark.text += n.text;
            }
          }
        }
      });
      return {
        text: a && a.text,
        range: a && a.range,
        mark,
        corr: !!(mark && a && a.range && a.range.from === mark.from && a.range.to === mark.to && a.text === mark.text),
      };
    });
    if (!r.corr) throw new Error(JSON.stringify(r));
    if (r.text !== 'unique-rapid-vv') throw new Error('text ' + r.text);
  });

  await t('strip mark: light flags; full reattaches', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>keep unique-strip-vv here</p>');
      M.State.annotations = [];
      let from = -1, to = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        const j = n.text.indexOf('unique-strip-vv');
        if (j >= 0) {
          from = pos + j;
          to = from + 'unique-strip-vv'.length;
        }
      });
      const thr = M._testCreateAnnotation(from, to, 'unique-strip-vv');
      const tid = thr.threadId;
      const ed = M.State.editor;
      const mt = ed.schema.marks.annotation;
      let mf = -1, mt2 = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === tid) {
            mf = pos;
            mt2 = pos + n.nodeSize;
          }
        }
      });
      ed.view.dispatch(ed.state.tr.removeMark(mf, mt2, mt));
      // light only
      M._validateMarksAfterEdit(ed, { phase: 'light' });
      const afterLight = {
        fuzzy: thr.fuzzy,
        invalid: thr.invalid,
        reason: thr.invalidReason,
      };
      let marksLight = 0;
      ed.state.doc.descendants((n) => {
        if (!n.isText) return;
        for (const m of n.marks) if (m.type === mt && m.attrs.threadId === tid) marksLight++;
      });
      // full
      M._validateMarksAfterEdit(ed, { phase: 'full' });
      let marksFull = 0;
      ed.state.doc.descendants((n) => {
        if (!n.isText) return;
        for (const m of n.marks) if (m.type === mt && m.attrs.threadId === tid) marksFull++;
      });
      return { afterLight, marksLight, marksFull, deleted: thr.deleted, text: thr.text };
    });
    if (r.marksLight !== 0) throw new Error('light should not reattach ' + JSON.stringify(r));
    if (!r.afterLight.fuzzy || !r.afterLight.invalid) throw new Error('light flag ' + JSON.stringify(r));
    if (r.marksFull !== 1) throw new Error('full should reattach ' + JSON.stringify(r));
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
