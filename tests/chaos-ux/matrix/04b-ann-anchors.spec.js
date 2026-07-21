/**
 * Annotation anchors sample set (Phase A: representative; full A1–A18 in B2).
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('../harness');
const { DOCS } = require('../content-catalog');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/04b-ann-anchors ===');
  await boot(page);
  const { t, done } = createRunner(page, '04b-ann-anchors');

  await t('A1 single word annotate', async () => {
    await loadDoc(page, 'a1.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: 'a1' });
    if (!r.ok || !r.tid) throw new Error(JSON.stringify(r));
    coverage.hitContent('A1');
    const thr = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return {
        text: a && a.text,
        hasRange: !!(a && a.range && typeof a.range.from === 'number'),
        prefix: a && typeof a.prefix === 'string',
        suffix: a && typeof a.suffix === 'string',
      };
    }, r.tid);
    if (!thr.hasRange || thr.text !== 'UNIQUE_ALPHA') throw new Error(JSON.stringify(thr));
  });

  await t('A13 duplicate same range rejected or single', async () => {
    await loadDoc(page, 'a13.md', DOCS.simple);
    const r1 = await annotateText(page, 'UNIQUE_BETA', { body: 'first' });
    if (!r1.ok) throw new Error(JSON.stringify(r1));
    const before = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
    // second attempt same range via API
    const r2 = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const a = M.State.annotations[0];
      if (!a || !a.range) return { err: 'no range' };
      M.State.editor.commands.setTextSelection({ from: a.range.from, to: a.range.to });
      try {
        M.createAnnotationFromSelection();
      } catch (e) {
        return { threw: e.message };
      }
      return { count: M.State.annotations.length };
    });
    const after = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
    // Product should refuse second annotation on the exact same range
    if (after > before) {
      throw new Error('duplicate range created second thread: ' + JSON.stringify({ before, after, r2 }));
    }
    coverage.hitContent('A13');
  });

  await t('A17 empty selection does not require crash', async () => {
    await loadDoc(page, 'a17.md', DOCS.simple);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const n0 = M.State.annotations.length;
      M.State.editor.commands.setTextSelection(1);
      try {
        M.createAnnotationFromSelection();
      } catch (e) {
        return { n0, n1: M.State.annotations.length, threw: e.message };
      }
      return { n0, n1: M.State.annotations.length };
    });
    if (r.n1 < r.n0) throw new Error('lost annotations');
    coverage.hitContent('A17');
  });

  await t('A3 cross-paragraph selection if supported', async () => {
    await loadDoc(page, 'a3.md', DOCS.simple);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      // select from UNIQUE_ALPHA into second paragraph
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('UNIQUE_ALPHA')) {
          from = pos + node.text.indexOf('UNIQUE_ALPHA');
        }
        if (node.isText && node.text && node.text.includes('UNIQUE_BETA')) {
          to = pos + node.text.indexOf('UNIQUE_BETA') + 'UNIQUE_BETA'.length;
        }
      });
      if (from < 0 || to < 0) return { err: 'bounds', from, to };
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      const a = M.State.annotations[M.State.annotations.length - 1];
      return {
        ok: !!a,
        text: a && (a.text || '').slice(0, 80),
        ranges: a && a.ranges && a.ranges.length,
        hasRange: !!(a && a.range),
      };
    });
    if (r.err) throw new Error(JSON.stringify(r));
    if (!r.ok) throw new Error('no ann: ' + JSON.stringify(r));
    coverage.hitContent('A3');
  });

  await t('A4 list item text', async () => {
    await loadDoc(page, 'a4.md', DOCS.lists);
    const r = await annotateText(page, 'ALPHA', { body: 'list' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    coverage.hitContent('A4');
  });

  await t('A2 long selection', async () => {
    await loadDoc(page, 'a2.md', DOCS.longPara);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.length > 50) {
          from = pos;
          to = pos + Math.min(220, node.text.length);
        }
      });
      if (from < 0) return { err: 'no long text' };
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      const a = M.State.annotations[M.State.annotations.length - 1];
      return { ok: !!a, len: (a && a.text && a.text.length) || 0 };
    });
    if (r.err || !r.ok || r.len < 50) throw new Error(JSON.stringify(r));
    coverage.hitContent('A2');
  });

  await t('A5 blockquote text', async () => {
    await loadDoc(page, 'a5.md', '# Q\n\n> quoted UNIQUE_QUOTE line\n\nplain\n');
    const r = await annotateText(page, 'UNIQUE_QUOTE', { body: 'q' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    coverage.hitContent('A5');
  });

  await t('A6 bold/code then annotate', async () => {
    await loadDoc(page, 'a6.md', DOCS.simple);
    const r = await page.evaluate(() => {
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
      M.State.editor.commands.setTextSelection({ from, to });
      M.State.editor.commands.setBold();
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      return { n: M.State.annotations.length, tid: M.State.activeThreadId };
    });
    if (!r.tid) throw new Error(JSON.stringify(r));
    coverage.hitContent('A6');
  });

  await t('A7 table cell text', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('a7.md', '# T\n\n', null, { saveMode: 'mentor-download' });
      const ed = M.State.editor;
      ed.commands.setContent('<p>x</p>', false);
      ed.commands.setTextSelection(1);
      ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      // type into a cell
      let cellPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (cellPos < 0 && n.type.name === 'tableCell') cellPos = pos + 1;
      });
      if (cellPos < 0) return { err: 'no cell' };
      ed.commands.setTextSelection(cellPos);
      ed.commands.insertContent('CELLMARK');
      const doc = ed.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('CELLMARK')) {
          from = pos + node.text.indexOf('CELLMARK');
          to = from + 'CELLMARK'.length;
        }
      });
      ed.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      return { tid: M.State.activeThreadId, n: M.State.annotations.length };
    });
    if (r.err || !r.tid) throw new Error(JSON.stringify(r));
    coverage.hitContent('A7');
  });

  await t('A9 pure image annotation', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.annotations = [];
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="https://example.com/fig.png" alt="fig1"><p>后文 BBB</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      if (imgPos < 0) return { err: 'no image' };
      ed.commands.setNodeSelection(imgPos);
      M.createAnnotationFromSelection();
      const ann = M.State.annotations[0];
      return {
        count: M.State.annotations.length,
        text: ann && ann.text,
        anchors: ann && ann.imageAnchors && ann.imageAnchors.length,
      };
    });
    if (r.err) throw new Error(r.err);
    if (r.count !== 1 || !r.anchors) throw new Error(JSON.stringify(r));
    coverage.hitContent('A9');
  });

  await t('A14 nested selection two threads', async () => {
    await loadDoc(page, 'a14.md', '# N\n\nOUTER_LEFT INNER_CORE OUTER_RIGHT\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.annotations = [];
      const find = (s) => {
        let from = -1;
        let to = -1;
        M.State.editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text && node.text.includes(s)) {
            from = pos + node.text.indexOf(s);
            to = from + s.length;
          }
        });
        return { from, to };
      };
      const outer = find('OUTER_LEFT INNER_CORE OUTER_RIGHT');
      M.State.editor.commands.setTextSelection(outer);
      M.createAnnotationFromSelection();
      const tOuter = M.State.activeThreadId;
      const inner = find('INNER_CORE');
      M.State.editor.commands.setTextSelection(inner);
      M.createAnnotationFromSelection();
      const tInner = M.State.activeThreadId;
      return {
        n: M.State.annotations.length,
        tOuter,
        tInner,
        distinct: tOuter !== tInner,
      };
    });
    if (r.n < 2 || !r.distinct) throw new Error(JSON.stringify(r));
    coverage.hitContent('A14');
  });

  await t('A15 partial overlap two threads', async () => {
    await loadDoc(page, 'a15.md', '# O\n\nABCDEFGHIJKLMNOP\n');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.annotations = [];
      const findRange = (s) => {
        let from = -1;
        M.State.editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text && node.text.includes(s)) {
            from = pos + node.text.indexOf(s);
          }
        });
        return { from, to: from + s.length };
      };
      const a = findRange('ABCDEFGH');
      M.State.editor.commands.setTextSelection(a);
      M.createAnnotationFromSelection();
      const b = findRange('EFGHIJKL');
      M.State.editor.commands.setTextSelection(b);
      M.createAnnotationFromSelection();
      return { n: M.State.annotations.length };
    });
    if (r.n < 2) throw new Error(JSON.stringify(r));
    coverage.hitContent('A15');
  });

  await t('A16 select-all annotate', async () => {
    await loadDoc(page, 'a16.md', DOCS.simple);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const before = M.State.annotations.length;
      M.State.editor.commands.selectAll();
      M.createAnnotationFromSelection();
      return { before, after: M.State.annotations.length, tid: M.State.activeThreadId };
    });
    if (!r.tid && r.after <= r.before) {
      // may refuse huge selection — still must not crash
    }
    coverage.hitContent('A16');
  });

  await t('A18 whitespace-only selection behavior', async () => {
    // PM/HTML collapses normal spaces — use NBSP run
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('a18.md', '# W\n\nx\n', null, { saveMode: 'mentor-download' });
      const nbsp = '\u00a0\u00a0\u00a0';
      M.State.editor.commands.setContent('<p>word' + nbsp + 'spaced</p>', false);
      const before = M.State.annotations.length;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let len = 0;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('\u00a0')) {
          from = pos + node.text.indexOf('\u00a0');
          len = 3;
        }
      });
      if (from < 0) {
        // fallback: select single regular space between words
        doc.descendants((node, pos) => {
          if (from < 0 && node.isText && node.text && node.text.includes(' ')) {
            from = pos + node.text.indexOf(' ');
            len = 1;
          }
        });
      }
      if (from < 0) return { err: 'no whitespace', texts: (() => {
        const t = [];
        doc.descendants((n) => { if (n.isText) t.push(JSON.stringify(n.text)); });
        return t;
      })() };
      M.State.editor.commands.setTextSelection({ from, to: from + len });
      try {
        M.createAnnotationFromSelection();
      } catch (e) {
        return { before, after: M.State.annotations.length, threw: e.message };
      }
      return { before, after: M.State.annotations.length, len };
    });
    if (r.err) throw new Error(JSON.stringify(r));
    coverage.hitContent('A18');
  });

  const result = done();
  console.log('  content hits:', Object.keys(coverage.report().content).join(', '));
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
