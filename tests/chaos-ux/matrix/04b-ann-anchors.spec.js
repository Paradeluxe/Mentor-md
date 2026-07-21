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

  const result = done();
  console.log('  content hits:', Object.keys(coverage.report().content).join(', '));
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
