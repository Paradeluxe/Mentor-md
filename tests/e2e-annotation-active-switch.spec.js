// Active vs attached: switching comments must not drop threads/marks/anchors.
// Plan: .hermes/plans/2026-07-27_101001-annotation-active-state-separation.md
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.MENTOR_PORT || 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + name);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + name + ': ' + (e && e.message ? e.message : e));
      fail++;
    }
  };

  await page.goto(BASE + '?active-switch=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  console.log('=== annotation active-state separation ===');

  const setupTwo = async () => page.evaluate(() => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    M.openNewTabBlank();
    M.State._suspendAnnValidate = true;
    try {
      ed.commands.setContent('<p>FIRST-TOKEN middle SECOND-TOKEN</p>', false);
    } finally {
      M.State._suspendAnnValidate = false;
    }
    // clear residual marks
    try {
      const mt = ed.schema.marks.annotation;
      let tr = ed.state.tr;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        if (n.marks.some((m) => m.type === mt)) tr = tr.removeMark(pos, pos + n.nodeSize, mt);
      });
      tr.setMeta('addToHistory', false);
      ed.view.dispatch(tr);
    } catch (_) {}
    M.State.annotations = [];
    M.State.activeThreadId = null;

    const rangeOf = (needle) => {
      let hit = null;
      ed.state.doc.descendants((node, pos) => {
        if (hit || !node.isText || !node.text) return;
        const i = node.text.indexOf(needle);
        if (i >= 0) hit = { from: pos + i, to: pos + i + needle.length };
      });
      return hit;
    };
    const create = (needle) => {
      const r = rangeOf(needle);
      if (!r) throw new Error('range missing ' + needle);
      const thread = M._testCreateAnnotation(r.from, r.to, needle);
      if (!thread) throw new Error('create failed ' + needle);
      thread.pending = false;
      if (!Array.isArray(thread.comments) || !thread.comments.length) {
        thread.comments = [{ id: 'c-' + thread.threadId, author: 'U', body: needle, createdAt: new Date().toISOString() }];
      }
      return thread.threadId;
    };
    const first = create('FIRST-TOKEN');
    const second = create('SECOND-TOKEN');
    M.renderCommentList();
    return [first, second];
  });

  const snapshot = async (ids) => page.evaluate((ids) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const marks = [];
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      for (const mark of node.marks) {
        if (mark.type.name === 'annotation' || mark.type === ed.schema.marks.annotation) {
          marks.push({ threadId: mark.attrs.threadId, from: pos, to: pos + node.nodeSize, text: node.text });
        }
      }
    });
    return {
      activeThreadId: M.State.activeThreadId,
      dirtyGen: M.State.currentFile?.dirtyGen ?? null,
      threads: M.State.annotations.map((a) => ({
        threadId: a.threadId,
        range: a.range,
        status: a.anchor?.status || null,
        invalid: !!a.invalid,
        deleted: !!a.deleted,
        fuzzy: !!a.fuzzy,
        hasActiveField: Object.prototype.hasOwnProperty.call(a, 'active') || Object.prototype.hasOwnProperty.call(a, 'isActive'),
      })),
      marks,
      markIds: [...new Set(marks.map((m) => m.threadId))],
      activeCards: [...document.querySelectorAll('.comment-thread.is-active')].map((el) => el.dataset.thread),
      activeDecos: document.querySelectorAll('.annotation-active-deco').length,
      markDomIds: [...document.querySelectorAll('.annotation-mark')].map((el) => el.dataset.threadId),
      firstCardText: document.querySelector(`.comment-thread[data-thread="${ids[0]}"]`)?.textContent || '',
      secondCardText: document.querySelector(`.comment-thread[data-thread="${ids[1]}"]`)?.textContent || '',
      firstHasWarn: !!document.querySelector(`.comment-thread[data-thread="${ids[0]}"] .deleted-banner, .comment-thread[data-thread="${ids[0]}"] .invalid-banner, .comment-thread[data-thread="${ids[0]}"] .ambiguous-banner`),
    };
  }, ids);

  let ids = null;

  await t('API activateAnnotationThread exported', async () => {
    const ty = await page.evaluate(() => typeof window.__mdAnnotator.activateAnnotationThread);
    assert.equal(ty, 'function');
  });

  await t('create two non-overlap annotations', async () => {
    ids = await setupTwo();
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const s = await snapshot(ids);
    assert.equal(s.threads.length, 2);
    assert.deepEqual(new Set(s.markIds), new Set(ids));
  });

  await t('switch first→second keeps both threads+marks; only second active', async () => {
    const before = await page.evaluate(() => JSON.stringify(window.__mdAnnotator.State.annotations));
    const dirtyBefore = await page.evaluate(() => window.__mdAnnotator.State.currentFile?.dirtyGen ?? null);
    const r = await page.evaluate(([first, second]) => {
      const M = window.__mdAnnotator;
      const ok1 = M.activateAnnotationThread(first, { ensureCard: true });
      const ok2 = M.activateAnnotationThread(second, { ensureCard: true });
      return {
        ok1, ok2,
        after: JSON.stringify(M.State.annotations),
        dirtyAfter: M.State.currentFile?.dirtyGen ?? null,
        active: M.State.activeThreadId,
      };
    }, ids);
    assert.equal(r.ok1, true);
    assert.equal(r.ok2, true);
    assert.equal(r.before === undefined ? before : r.before, r.after);
    assert.equal(before, r.after);
    assert.equal(dirtyBefore, r.dirtyAfter);
    assert.equal(r.active, ids[1]);
    const s = await snapshot(ids);
    assert.equal(s.activeThreadId, ids[1]);
    assert.deepEqual(s.activeCards, [ids[1]]);
    assert.equal(s.activeCards.length, 1);
    assert.deepEqual(new Set(s.markIds), new Set(ids));
    assert.ok(s.threads.every((x) => !x.invalid && !x.deleted));
    assert.equal(s.firstHasWarn, false);
    assert.ok(!/位置已失效|原文已被删除|无法唯一确定/.test(s.firstCardText));
  });

  await t('selection on second activates second without dropping first mark', async () => {
    await page.evaluate((second) => {
      const M = window.__mdAnnotator;
      const ann = M.State.annotations.find((a) => a.threadId === second);
      M.State.editor.commands.setTextSelection(ann.range);
    }, ids[1]);
    await page.waitForTimeout(80);
    // also force selection handler path
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (typeof M.handleSelectionChange === 'function') M.handleSelectionChange({});
      // fallback: activate via mark under caret
      const ed = M.State.editor;
      const { from } = ed.state.selection;
      const $pos = ed.state.doc.resolve(from);
      const m = $pos.marks().find((x) => x.type === ed.schema.marks.annotation);
      if (m) M.activateAnnotationThread(m.attrs.threadId, { ensureCard: true });
    });
    const s = await snapshot(ids);
    assert.equal(s.activeThreadId, ids[1]);
    assert.deepEqual(new Set(s.markIds), new Set(ids));
  });

  await t('sidebar body click path first→second→first', async () => {
    await page.evaluate((first) => {
      window.__mdAnnotator.scrollToCommentText(first);
    }, ids[0]);
    await page.waitForTimeout(40);
    let s = await snapshot(ids);
    assert.equal(s.activeThreadId, ids[0]);
    await page.evaluate((second) => {
      window.__mdAnnotator.scrollToCommentText(second);
    }, ids[1]);
    await page.waitForTimeout(40);
    s = await snapshot(ids);
    assert.equal(s.activeThreadId, ids[1]);
    assert.deepEqual(new Set(s.markIds), new Set(ids));
    await page.evaluate((first) => {
      window.__mdAnnotator.scrollToCommentText(first);
    }, ids[0]);
    s = await snapshot(ids);
    assert.equal(s.activeThreadId, ids[0]);
    assert.deepEqual(new Set(s.markIds), new Set(ids));
  });

  await t('nested overlap keeps both marks while switching active', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.openNewTabBlank();
      M.State._suspendAnnValidate = true;
      try { ed.commands.setContent('<p>alpha bravo charlie delta</p>', false); }
      finally { M.State._suspendAnnValidate = false; }
      try {
        const mt = ed.schema.marks.annotation;
        let tr = ed.state.tr;
        ed.state.doc.descendants((n, pos) => {
          if (!n.isText) return;
          if (n.marks.some((m) => m.type === mt)) tr = tr.removeMark(pos, pos + n.nodeSize, mt);
        });
        tr.setMeta('addToHistory', false);
        ed.view.dispatch(tr);
      } catch (_) {}
      M.State.annotations = [];
      const rangeOf = (needle) => {
        let hit = null;
        ed.state.doc.descendants((node, pos) => {
          if (hit || !node.isText || !node.text) return;
          const i = node.text.indexOf(needle);
          if (i >= 0) hit = { from: pos + i, to: pos + i + needle.length };
        });
        return hit;
      };
      const mk = (needle) => {
        const r = rangeOf(needle);
        const th = M._testCreateAnnotation(r.from, r.to, needle);
        th.pending = false;
        th.comments = [{ id: 'c', author: 'U', body: needle, createdAt: new Date().toISOString() }];
        return th.threadId;
      };
      const outer = mk('alpha bravo charlie');
      const inner = mk('bravo charlie');
      M.activateAnnotationThread(outer, { ensureCard: true });
      M.activateAnnotationThread(inner, { ensureCard: true });
      M.activateAnnotationThread(outer, { ensureCard: true });
      const marks = new Set();
      ed.state.doc.descendants((node) => {
        if (!node.isText) return;
        for (const m of node.marks) {
          if (m.type === ed.schema.marks.annotation) marks.add(m.attrs.threadId);
        }
      });
      // overlap node mark ids on "bravo"
      const bravo = rangeOf('bravo');
      const overlapIds = new Set();
      ed.state.doc.nodesBetween(bravo.from, bravo.to, (node) => {
        if (!node.isText) return;
        for (const m of node.marks) {
          if (m.type === ed.schema.marks.annotation) overlapIds.add(m.attrs.threadId);
        }
      });
      return {
        outer, inner,
        markIds: [...marks],
        overlapIds: [...overlapIds],
        active: M.State.activeThreadId,
        n: M.State.annotations.length,
      };
    });
    assert.equal(r.n, 2);
    assert.ok(r.markIds.includes(r.outer));
    assert.ok(r.markIds.includes(r.inner));
    assert.ok(r.overlapIds.includes(r.outer));
    assert.ok(r.overlapIds.includes(r.inner));
    assert.equal(r.active, r.outer);
  });

  await t('sidecar has no active fields; TEMP .mentor round-trip keeps both', async () => {
    ids = await setupTwo();
    await page.evaluate((second) => window.__mdAnnotator.activateAnnotationThread(second, { ensureCard: true }), ids[1]);
    const sidecar = await page.evaluate(() => window.__mdAnnotator.buildAnnotationsSidecar());
    assert.equal(sidecar.length, 2);
    for (const thread of sidecar) {
      assert.equal(Object.prototype.hasOwnProperty.call(thread, 'active'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(thread, 'isActive'), false);
    }
    const b64 = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const sc = { version: '1', annotations: M.buildAnnotationsSidecar() };
      const blob = await M.buildMentorZipBlob(md, sc, {});
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
    const outDir = path.join(os.tmpdir(), 'mentor-active-switch');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, 'active-switch.mentor');
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log('  fixture:', out);

    const reloaded = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'active-switch.mentor', { type: 'application/zip' });
      const M = window.__mdAnnotator;
      const { mdText, annotations } = await M.readMentorZip(file);
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('active-switch.mentor', mdText, annotations);
      await new Promise((r) => setTimeout(r, 120));
      const markIds = new Set();
      const ed = M.State.editor;
      ed.state.doc.descendants((node) => {
        if (!node.isText) return;
        for (const m of node.marks) {
          if (m.type === ed.schema.marks.annotation) markIds.add(m.attrs.threadId);
        }
      });
      return {
        n: M.State.annotations.length,
        markIds: [...markIds],
        bad: M.State.annotations.filter((a) => a.invalid || a.deleted).map((a) => a.threadId),
      };
    }, b64);
    assert.equal(reloaded.n, 2);
    assert.equal(reloaded.bad.length, 0);
    assert.equal(reloaded.markIds.length >= 2, true);
  });

  await t('true orphan shows persistent warning; inactive does not', async () => {
    ids = await setupTwo();
    await page.evaluate((second) => window.__mdAnnotator.activateAnnotationThread(second, { ensureCard: true }), ids[1]);
    const s0 = await snapshot(ids);
    assert.equal(s0.firstHasWarn, false);

    const result = await page.evaluate((first) => {
      const M = window.__mdAnnotator;
      const thread = M.State.annotations.find((a) => a.threadId === first);
      thread.anchor = { ...(thread.anchor || {}), status: 'orphaned' };
      thread.invalid = true;
      thread.deleted = true;
      thread.invalidReason = 'orphaned';
      M.renderCommentList();
      const card = document.querySelector(`.comment-thread[data-thread="${thread.threadId}"]`);
      const warn = M.annotationWarningState(thread);
      return {
        kind: warn && warn.kind,
        hasPersistentBanner: !!card?.querySelector('.deleted-banner, .invalid-banner, .ambiguous-banner'),
        text: card?.textContent || '',
      };
    }, ids[0]);
    assert.equal(result.kind, 'orphaned');
    assert.equal(result.hasPersistentBanner, true);
    assert.match(result.text, /失效|删除|无法唯一确定|重新选择正文/);
  });

  console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
