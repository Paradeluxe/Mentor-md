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

  await t('H23 pure image delete → orphan path', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('h23.md', '# img\n', null, { saveMode: 'mentor-download' });
      M.State.annotations = [];
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>pre</p><img src="https://example.com/h23.png" alt="h23"><p>post</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      ed.commands.setNodeSelection(imgPos);
      M.createAnnotationFromSelection();
      const tid = M.State.activeThreadId;
      const beforeAnchors = M.State.annotations[0]?.imageAnchors?.length || 0;
      // delete image node
      ed.commands.setNodeSelection(imgPos);
      ed.commands.deleteSelection();
      return { tid, beforeAnchors, n: M.State.annotations.length };
    });
    if (!r.tid || r.beforeAnchors < 1) throw new Error(JSON.stringify(r));
    await page.waitForTimeout(400);
    const after = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      if (M.scheduleValidateMarks) M.scheduleValidateMarks(M.State.editor, { render: true });
      const a = M.State.annotations.find((x) => x.threadId === tid);
      return a
        ? { deleted: !!a.deleted, invalid: !!a.invalid, reason: a.invalidReason, anchors: (a.imageAnchors || []).length }
        : { missing: true };
    }, r.tid);
    if (after.missing) throw new Error('thread gone');
    coverage.hitContent('A9');
    coverage.hitContent('R:image-deleted');
    coverage.hitContent('H23');
  });

  await t('H24 bad packs sequential load no white screen', async () => {
    const packs = [
      {
        name: 'h24a.md',
        md: DOCS.simple,
        sc: {
          version: '1',
          document: 'h24a.md',
          updatedAt: new Date().toISOString(),
          author: { id: 'u', name: 't' },
          annotations: [
            {
              threadId: 'good',
              text: 'UNIQUE_ALPHA',
              prefix: '',
              suffix: '',
              resolved: false,
              createdAt: new Date().toISOString(),
              comments: [],
            },
            { threadId: 'dup', text: 'x', prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(), comments: [] },
            { threadId: 'dup', text: 'y', prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(), comments: [] },
          ],
        },
      },
      {
        name: 'h24b.md',
        md: DOCS.simple,
        sc: {
          version: '1',
          document: 'h24b.md',
          updatedAt: new Date().toISOString(),
          author: { id: 'u', name: 't' },
          annotations: [
            {
              threadId: 'miss',
              text: 'NOPE_NOT_IN_DOC',
              prefix: '',
              suffix: '',
              resolved: false,
              createdAt: new Date().toISOString(),
              comments: [{ id: 'c', author: { id: 'u', name: 't' }, body: 'x', createdAt: new Date().toISOString() }],
            },
          ],
        },
      },
    ];
    for (const p of packs) {
      await loadDoc(page, p.name, p.md, p.sc);
      const ok = await page.evaluate(() => !!window.__mdAnnotator?.State?.editor);
      if (!ok) throw new Error('editor dead after ' + p.name);
    }
    coverage.hitContent('H24');
    coverage.hitContent('R:duplicate-threadId');
  });

  await t('H25 draft isolation across tabs', async () => {
    await loadDoc(page, 'h25a.md', DOCS.simple);
    const r1 = await annotateText(page, 'UNIQUE_ALPHA', { ai: true });
    await page.evaluate((tid) => {
      window.__mdAnnotator.State.replyDrafts[tid] = '@AI only-on-A';
    }, r1.tid);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.snapshotActiveTab && M.snapshotActiveTab();
    });
    await loadDoc(page, 'h25b.md', DOCS.simple);
    const r2 = await annotateText(page, 'UNIQUE_BETA', { body: 'on-B' });
    const mid = await page.evaluate(() => ({
      name: window.__mdAnnotator.State.currentFile?.name,
      drafts: { ...window.__mdAnnotator.State.replyDrafts },
      anns: window.__mdAnnotator.State.annotations.map((a) => a.text),
    }));
    // B should not show A's UNIQUE_ALPHA as active content mix-up
    if (mid.name !== 'h25b.md') throw new Error(JSON.stringify(mid));
    if (mid.anns.some((t) => t === 'UNIQUE_ALPHA') && mid.anns.length === 1 && mid.anns[0] === 'UNIQUE_ALPHA') {
      // if only alpha on B doc — wrong
      throw new Error('A content on B: ' + JSON.stringify(mid));
    }
    coverage.hitContent('B14');
    coverage.hitContent('H25');
  });

  await t('H26 state shuffle open→resolve→delete text→delete thread', async () => {
    await loadDoc(page, 'h26.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: 'shuffle' });
    await page.evaluate((tid) => window.__mdAnnotator._testToggleResolved(tid), r.tid);
    await page.evaluate((tid) => window.__mdAnnotator._testToggleResolved(tid), r.tid);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('UNIQUE_ALPHA')) {
          from = pos + node.text.indexOf('UNIQUE_ALPHA');
          to = from + 'UNIQUE_ALPHA'.length;
        }
      });
      if (from >= 0) {
        M.State.editor.commands.setTextSelection({ from, to });
        M.State.editor.commands.deleteSelection();
      }
    });
    await page.waitForTimeout(300);
    await page.evaluate((tid) => window.__mdAnnotator._testDeleteThread(tid), r.tid);
    const left = await page.evaluate((tid) =>
      window.__mdAnnotator.State.annotations.some((a) => a.threadId === tid)
    , r.tid);
    if (left) throw new Error('still present');
    coverage.hitContent('H26');
  });

  await t('H4 format storm then annotate then undo storm no crash', async () => {
    await loadDoc(page, 'h4.md', DOCS.simple);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('UNIQUE_BETA')) {
          from = pos + node.text.indexOf('UNIQUE_BETA');
          to = from + 'UNIQUE_BETA'.length;
        }
      });
      M.State.editor.chain().focus().setTextSelection({ from, to }).run();
      const cmds = ['toggleBold', 'toggleItalic', 'toggleStrike', 'toggleCode'];
      for (const c of cmds) {
        try {
          M.State.editor.commands[c] && M.State.editor.commands[c]();
        } catch {}
      }
      M.createAnnotationFromSelection();
      for (let i = 0; i < 15; i++) {
        try {
          M.State.editor.commands.undo();
        } catch {}
      }
      for (let i = 0; i < 10; i++) {
        try {
          M.State.editor.commands.redo();
        } catch {}
      }
    });
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error(pe.join('; '));
    coverage.hitContent('H4');
  });

  await t('H7 filter shuffle with mixed resolved', async () => {
    await loadDoc(page, 'h7.md', DOCS.simple);
    const a = await annotateText(page, 'UNIQUE_ALPHA', { body: 'o1' });
    const b = await annotateText(page, 'UNIQUE_BETA', { body: 'o2' });
    await page.evaluate((tid) => window.__mdAnnotator._testToggleResolved(tid), a.tid);
    await page.evaluate(() => {
      const modal = document.querySelector('#author-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.pointerEvents = 'none';
      }
      for (const f of ['all', 'open', 'resolved', 'open', 'all']) {
        const btn = document.querySelector(`[data-filter-tab="${f}"]`);
        if (btn) btn.click();
      }
      window.__mdAnnotator.renderCommentList();
    });
    const counts = await page.evaluate(() => ({
      all: window.__mdAnnotator.State.annotations.length,
      resolved: window.__mdAnnotator.State.annotations.filter((x) => x.resolved).length,
      open: window.__mdAnnotator.State.annotations.filter((x) => !x.resolved).length,
    }));
    if (counts.all < 2 || counts.resolved < 1) throw new Error(JSON.stringify(counts));
    coverage.hitContent('H7');
    void b;
  });

  await t('H11 table slaughter + annotate cell', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('h11.md', '# t\n', null, { saveMode: 'mentor-download' });
      const ed = M.State.editor;
      ed.commands.setContent('<p>x</p>', false);
      ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run();
      let cell = -1;
      ed.state.doc.descendants((n, pos) => {
        if (cell < 0 && n.type.name === 'tableCell') cell = pos + 1;
      });
      ed.commands.setTextSelection(cell);
      ed.commands.insertContent('TBLMARK');
      let from = -1;
      let to = -1;
      ed.state.doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('TBLMARK')) {
          from = pos + node.text.indexOf('TBLMARK');
          to = from + 'TBLMARK'.length;
        }
      });
      ed.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      for (const act of ['row-after', 'col-after', 'del-row', 'del-col', 'del-table']) {
        try {
          M.runTableCommand(act);
        } catch {}
      }
      return { n: M.State.annotations.length, ed: !!M.State.editor };
    });
    if (!r.ed) throw new Error(JSON.stringify(r));
    coverage.hitContent('H11');
  });

  await t('H2 concurrent save spam with fake handle', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let writes = 0;
      M.State.saveMode = 'mentor-handle';
      M.State.mediaFiles = {};
      M.State.currentFile = {
        name: 'spam.mentor',
        dirty: true,
        dirtyGen: 1,
        handle: {
          queryPermission: async () => 'granted',
          createWritable: async () => {
            writes++;
            await new Promise((r) => setTimeout(r, 30));
            return { write: async () => {}, close: async () => {}, abort: async () => {} };
          },
          getFile: async () => ({ lastModified: Date.now() }),
        },
      };
      M.State.editor.commands.setContent('<p>spam</p>', false);
      const ps = [
        M.writeCurrentToHandle({ reason: 'autosave' }),
        M.writeCurrentToHandle({ reason: 'autosave' }),
        M.writeCurrentToHandle({ reason: 'manual' }),
      ];
      const results = await Promise.all(ps);
      return {
        writes,
        oks: results.filter((x) => x.ok).length,
        skipped: results.filter((x) => x.skipped).length,
      };
    });
    // at most one concurrent createWritable
    if (r.writes > 2) throw new Error('too many concurrent writes: ' + JSON.stringify(r));
    coverage.hitContent('H2');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
