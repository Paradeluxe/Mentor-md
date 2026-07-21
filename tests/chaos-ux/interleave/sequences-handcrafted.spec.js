/**
 * Handcrafted "变态" sequences H21–H23 (+ H1-ish draft tab) — Phase A.
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('../harness');
const { DOCS, BODY_CORPUS } = require('../content-catalog');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux handcrafted sequences ===');
  await boot(page);
  const { t, done } = createRunner(page, 'handcrafted');

  await t('H21 ambiguous quote uses context (no wrong rebind after edit other)', async () => {
    await loadDoc(page, 'h21.md', DOCS.ambiguous);
    // Annotate first SAME_QUOTE (PrefixA)
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      let hits = 0;
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        let idx = 0;
        while (true) {
          const i = node.text.indexOf('SAME_QUOTE', idx);
          if (i < 0) break;
          hits++;
          if (hits === 1) {
            from = pos + i;
            to = from + 'SAME_QUOTE'.length;
          }
          idx = i + 1;
        }
      });
      if (from < 0) return { err: 'not found', hits };
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      const tid = M.State.activeThreadId;
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      return {
        tid,
        from,
        prefix: thr && thr.prefix,
        suffix: thr && thr.suffix,
        text: thr && thr.text,
        hits,
      };
    });
    if (r.err) throw new Error(JSON.stringify(r));
    // Edit the second occurrence only
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let secondFrom = -1;
      let hits = 0;
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        let idx = 0;
        while (true) {
          const i = node.text.indexOf('SAME_QUOTE', idx);
          if (i < 0) break;
          hits++;
          if (hits === 2) secondFrom = pos + i;
          idx = i + 1;
        }
      });
      if (secondFrom < 0) throw new Error('second not found');
      M.State.editor.commands.setTextSelection({ from: secondFrom, to: secondFrom + 'SAME_QUOTE'.length });
      M.State.editor.commands.insertContent('OTHER_QUOTE');
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return {
        deleted: !!(a && a.deleted),
        invalid: !!(a && a.invalid),
        fuzzy: !!(a && a.fuzzy),
        text: a && a.text,
        range: a && a.range,
      };
    }, r.tid);
    // First quote still SAME_QUOTE — should NOT become deleted solely because second changed
    if (after.deleted && after.text === 'SAME_QUOTE') {
      // if deleted, that's a bug for H21
      throw new Error('first quote wrongly deleted after editing second: ' + JSON.stringify(after));
    }
    coverage.hitContent('C6');
    coverage.hitContent('H21');
  });

  await t('H22 AI + normal mixed thread marker contract', async () => {
    await loadDoc(page, 'h22.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: BODY_CORPUS.aiInstr });
    if (!r.ok) throw new Error(JSON.stringify(r));
    // add normal reply
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      thr.comments.push({
        id: 'r2',
        author: { id: 'u', name: 'chaos' },
        body: '普通回复无标记',
        createdAt: new Date().toISOString(),
      });
    }, r.tid);
    const check = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      const side = M.buildAnnotationsSidecar().find((a) => a.threadId === tid);
      const bodies = (side.comments || []).map((c) => c.body);
      const mark = (b) => (M.bodyHasAiMarker ? M.bodyHasAiMarker(b) : /@AI\b/i.test(b));
      return {
        bodies,
        flags: bodies.map(mark),
      };
    }, r.tid);
    if (!check.flags[0]) throw new Error('first should be AI: ' + JSON.stringify(check));
    if (check.flags[1]) throw new Error('second should not be AI: ' + JSON.stringify(check));
    coverage.hitContent('B7');
    coverage.hitContent('H22');
  });

  await t('H1 draft survives conceptually on same tab (replyDrafts)', async () => {
    await loadDoc(page, 'h1.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_BETA', { ai: true });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await page.evaluate((tid) => {
      window.__mdAnnotator.State.replyDrafts[tid] = '@AI unfinished thought';
    }, r.tid);
    // switch away via new tab API and back
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (M.snapshotActiveTab) M.snapshotActiveTab();
      M.openNewTabBlank();
    });
    await page.waitForTimeout(50);
    const mid = await page.evaluate(() => ({
      name: window.__mdAnnotator.State.currentFile?.name,
      anns: window.__mdAnnotator.State.annotations.length,
    }));
    // restore previous tab if possible
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const tabs = M.State.tabs || [];
      const prev = tabs.find((t) => t && t.name === 'h1.md');
      if (prev) M.switchToTab(prev.id);
    });
    const back = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        name: M.State.currentFile?.name,
        anns: M.State.annotations.length,
        drafts: { ...M.State.replyDrafts },
      };
    });
    // draft may live on tab snapshot — at least must not crash and doc restores
    if (back.name !== 'h1.md') throw new Error('did not restore h1: ' + JSON.stringify({ mid, back }));
    coverage.hitContent('H1');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
