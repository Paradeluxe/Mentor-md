/**
 * text/prefix/suffix context + quote shapes (C1–C8 samples).
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
  console.log('=== chaos-ux matrix/04f-ann-context ===');
  await boot(page);
  const { t, done } = createRunner(page, '04f-context');

  await t('C1 chinese quote fields', async () => {
    await loadDoc(page, 'c1.md', '# 中文\n\n这是一段中文UNIQUE中文测试内容。\n');
    const r = await annotateText(page, 'UNIQUE中文', { body: '中' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const thr = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return { text: a.text, prefix: a.prefix, suffix: a.suffix };
    }, r.tid);
    if (thr.text !== 'UNIQUE中文') throw new Error(JSON.stringify(thr));
    if (typeof thr.prefix !== 'string' || typeof thr.suffix !== 'string') throw new Error('ctx types');
    coverage.hitContent('C1');
  });

  await t('C2 ascii quote', async () => {
    await loadDoc(page, 'c2.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: 'a' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    coverage.hitContent('C2');
  });

  await t('C3 emoji in quote', async () => {
    await loadDoc(page, 'c3.md', '# E\n\nHello 👍EMOJI🎉 world\n');
    const r = await annotateText(page, '👍EMOJI🎉', { body: 'e' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const text = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return a && a.text;
    }, r.tid);
    if (!text || !text.includes('EMOJI')) throw new Error('text=' + text);
    coverage.hitContent('C3');
  });

  await t('C4 special md/html chars in quote safe in sidebar', async () => {
    await loadDoc(page, 'c4.md', '# S\n\nCode `x` and <b>y</b> and *z* END\n');
    // select a span with special chars if present
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('<b>')) {
          from = pos;
          to = pos + node.text.length;
        }
      });
      if (from < 0) {
        // fallback: any text node
        doc.descendants((node, pos) => {
          if (from < 0 && node.isText && node.text && node.text.length > 2) {
            from = pos;
            to = pos + Math.min(8, node.text.length);
          }
        });
      }
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      const tid = M.State.activeThreadId;
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      thr.comments = [
        {
          id: 'c',
          author: { id: 'u', name: 't' },
          body: '<img src=x onerror=alert(1)>',
          createdAt: new Date().toISOString(),
        },
      ];
      M.renderCommentList();
      const list = document.querySelector('#comment-list');
      return {
        tid,
        text: thr && thr.text,
        scripts: list ? list.querySelectorAll('script').length : -1,
        onerr: list ? list.querySelectorAll('img[onerror]').length : -1,
      };
    });
    if (r.scripts > 0 || r.onerr > 0) throw new Error(JSON.stringify(r));
    coverage.hitContent('C4');
    coverage.hitContent('B10');
  });

  await t('C6 ambiguous: two SAME_QUOTE keep distinct anchors', async () => {
    await loadDoc(page, 'c6.md', DOCS.ambiguous);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      const hits = [];
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        let idx = 0;
        while (true) {
          const i = node.text.indexOf('SAME_QUOTE', idx);
          if (i < 0) break;
          hits.push({ from: pos + i, to: pos + i + 'SAME_QUOTE'.length });
          idx = i + 1;
        }
      });
      if (hits.length < 2) return { err: 'need 2', hits: hits.length };
      M.State.editor.commands.setTextSelection(hits[0]);
      M.createAnnotationFromSelection();
      const t1 = M.State.activeThreadId;
      const a1 = M.State.annotations.find((a) => a.threadId === t1);
      M.State.editor.commands.setTextSelection(hits[1]);
      M.createAnnotationFromSelection();
      const t2 = M.State.activeThreadId;
      const a2 = M.State.annotations.find((a) => a.threadId === t2);
      return {
        t1,
        t2,
        sameId: t1 === t2,
        p1: a1 && a1.prefix,
        p2: a2 && a2.prefix,
        f1: a1 && a1.range && a1.range.from,
        f2: a2 && a2.range && a2.range.from,
      };
    });
    if (r.err) throw new Error(JSON.stringify(r));
    if (r.sameId) throw new Error('same thread for two quotes');
    if (r.f1 === r.f2) throw new Error('same from: ' + JSON.stringify(r));
    coverage.hitContent('C6');
  });

  await t('C7 start-of-doc empty-ish prefix allowed', async () => {
    await loadDoc(page, 'c7.md', 'HEADWORD rest of document here.\n');
    const r = await annotateText(page, 'HEADWORD', { body: 'h' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const thr = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return { prefix: a.prefix, suffix: a.suffix, text: a.text };
    }, r.tid);
    if (thr.text !== 'HEADWORD') throw new Error(JSON.stringify(thr));
    if (typeof thr.prefix !== 'string') throw new Error('prefix missing');
    coverage.hitContent('C7');
  });

  await t('C8 edit neighborhood keeps thread', async () => {
    await loadDoc(page, 'c8.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: 'n' });
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // insert before quote
      const doc = M.State.editor.state.doc;
      let from = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('UNIQUE_ALPHA')) {
          from = pos + node.text.indexOf('UNIQUE_ALPHA');
        }
      });
      M.State.editor.commands.setTextSelection(from);
      M.State.editor.commands.insertContent('>>>');
    });
    await page.waitForTimeout(300);
    const st = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return a ? { text: a.text, fuzzy: !!a.fuzzy, deleted: !!a.deleted } : null;
    }, r.tid);
    if (!st) throw new Error('lost');
    coverage.hitContent('C8');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
