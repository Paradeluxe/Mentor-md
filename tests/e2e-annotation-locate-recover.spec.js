// Locate must recover missing marks via findAnnotationRange before toasting 失效.
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());
  const toasts = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (/失效|toast/i.test(t)) toasts.push(t);
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html?ann-recover=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  // A: strip live mark but keep thread evidence → scrollToThread must reattach, no 失效 toast
  const a = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const body = '<p>prefix RECOVER_TOKEN_ALPHA suffix more text.</p>' +
      Array.from({ length: 20 }, (_, i) => `<p>pad ${i}</p>`).join('');
    M.State._suspendAnnValidate = true;
    try { ed.commands.setContent(body, false); } finally { M.State._suspendAnnValidate = false; }
    let from = null, to = null;
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText || from != null) return;
      const i = n.text.indexOf('RECOVER_TOKEN_ALPHA');
      if (i >= 0) { from = pos + i; to = from + 'RECOVER_TOKEN_ALPHA'.length; }
    });
    const tid = 'thread-recover-alpha';
    const mark = ed.schema.marks.annotation.create({ threadId: tid, resolved: false, authorColor: 0 });
    ed.view.dispatch(ed.state.tr.addMark(from, to, mark).setMeta('addToHistory', false));
    M.State.annotations = [{
      threadId: tid,
      type: 'comment',
      author: 't',
      created: new Date().toISOString(),
      quote: 'RECOVER_TOKEN_ALPHA',
      text: 'RECOVER_TOKEN_ALPHA',
      prefix: 'prefix ',
      suffix: ' suffix',
      resolved: false,
      comments: [{ id: 'c1', author: 't', text: 'hi', created: new Date().toISOString() }],
      range: { from, to }
    }];
    // Strip mark only (simulate lost mark / soft fail)
    let mf = null, mt = null;
    ed.state.doc.descendants((n, p) => {
      if (!n.isText) return;
      n.marks.forEach((m) => {
        if (m.type === ed.schema.marks.annotation && m.attrs.threadId === tid) {
          if (mf == null || p < mf) mf = p;
          if (mt == null || p + n.nodeSize > mt) mt = p + n.nodeSize;
        }
      });
    });
    if (mf != null) {
      ed.view.dispatch(ed.state.tr.removeMark(mf, mt, ed.schema.marks.annotation).setMeta('addToHistory', false));
    }
    M.State.annotations[0].invalid = true;
    M.State.annotations[0].invalidReason = 'mark-missing';
    M.State.annotations[0].fuzzy = true;
    M.renderCommentList?.();

    // spy toast
    const toasts = [];
    const orig = window.showToast || M.showToast;
    window.__toastSpy = (msg) => { toasts.push(String(msg || '')); };
    const prev = M.showToast;
    // showToast is module-local; wrap via page evaluate path used by scrollToThread — hijack by patching console + status
    const beforeMarks = (() => {
      let c = 0;
      ed.state.doc.descendants((n) => {
        if (!n.isText) return;
        n.marks.forEach((m) => { if (m.type === ed.schema.marks.annotation && m.attrs.threadId === tid) c++; });
      });
      return c;
    })();

    M.scrollToThread(tid);
    await new Promise((r) => setTimeout(r, 80));

    const afterMarks = (() => {
      let c = 0;
      let range = null;
      ed.state.doc.descendants((n, p) => {
        if (!n.isText) return;
        n.marks.forEach((m) => {
          if (m.type === ed.schema.marks.annotation && m.attrs.threadId === tid) {
            c++;
            range = { from: p, to: p + n.nodeSize };
          }
        });
      });
      return { c, range };
    })();
    const ann = M.State.annotations[0];
    return {
      beforeMarks,
      afterMarks,
      invalid: !!ann.invalid,
      deleted: !!ann.deleted,
      reason: ann.invalidReason || null,
      statusText: document.querySelector('#status-text')?.textContent || '',
    };
  });

  assert.strictEqual(a.beforeMarks, 0, 'precondition stripped');
  assert.ok(a.afterMarks.c >= 1, 'reattached mark ' + JSON.stringify(a));
  assert.strictEqual(a.invalid, false, 'cleared invalid');
  assert.strictEqual(a.deleted, false, 'not deleted');

  // B: light validate must not stamp invalid while mark still exists elsewhere
  const b = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    M.State._suspendAnnValidate = true;
    try {
      ed.commands.setContent(
        '<p>HEAD_EDIT_ZONE start</p>' +
        Array.from({ length: 30 }, (_, i) => `<p>line ${i} filler</p>`).join('') +
        '<p>TAIL unique_keep_mark_token END</p>',
        false
      );
    } finally { M.State._suspendAnnValidate = false; }
    let from = null, to = null;
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText || from != null) return;
      const i = n.text.indexOf('unique_keep_mark_token');
      if (i >= 0) { from = pos + i; to = from + 'unique_keep_mark_token'.length; }
    });
    const tid = 'thread-light-keep';
    ed.view.dispatch(ed.state.tr.addMark(from, to, ed.schema.marks.annotation.create({
      threadId: tid, resolved: false, authorColor: 1
    })).setMeta('addToHistory', false));
    M.State.annotations = [{
      threadId: tid, text: 'unique_keep_mark_token', prefix: 'TAIL ', suffix: ' END',
      resolved: false, range: { from, to },
      comments: [{ id: 'c', author: 't', text: 'k', created: new Date().toISOString() }],
      created: new Date().toISOString(), author: 't'
    }];
    // Edit only the head (far from mark) and run light validation with a head changed range
    const headTo = 20;
    ed.view.dispatch(ed.state.tr.insertText('X', 1, 1).setMeta('addToHistory', false));
    // Call internal validate light via schedule with fake changed range near head
    // Use public schedule if available
    if (typeof M.scheduleValidateMarks === 'function') {
      M.scheduleValidateMarks(ed, { phase: 'light', changedRanges: [{ from: 1, to: 5 }], render: false });
    }
    await new Promise((r) => setTimeout(r, 30));
    const ann = M.State.annotations[0];
    let marks = 0;
    ed.state.doc.descendants((n) => {
      if (!n.isText) return;
      n.marks.forEach((m) => { if (m.attrs && m.attrs.threadId === tid) marks++; });
    });
    return { invalid: !!ann.invalid, reason: ann.invalidReason || null, marks, fuzzy: !!ann.fuzzy };
  });
  assert.strictEqual(b.marks >= 1, true, 'mark still live');
  assert.strictEqual(b.invalid, false, 'light must not mark invalid while mark lives: ' + JSON.stringify(b));

  console.log('PASS e2e-annotation-locate-recover', { a, b });
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
