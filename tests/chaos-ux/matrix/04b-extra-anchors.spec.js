/**
 * Remaining hard anchors: A8 multi-cell, A10 mixed image+text, A11 multi-image, A12 katex-ish.
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
} = require('../harness');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/04b-extra-anchors ===');
  await boot(page);
  const { t, done } = createRunner(page, '04b-extra');

  await t('A8 multi-cell table annotation if supported', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('a8.md', '# T\n', null, { saveMode: 'mentor-download' });
      const ed = M.State.editor;
      ed.commands.setContent('<p>x</p>', false);
      ed.commands.setTextSelection(1);
      ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run();
      // fill two cells
      const cells = [];
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') cells.push(pos);
      });
      if (cells.length < 2) return { err: 'cells' };
      ed.commands.setTextSelection(cells[0] + 1);
      ed.commands.insertContent('C0');
      ed.commands.setTextSelection(cells[1] + 1);
      ed.commands.insertContent('C1');
      // try select across — use text selection from C0 to C1 if findable
      let from = -1;
      let to = -1;
      ed.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'C0') from = pos;
        if (node.isText && node.text === 'C1') to = pos + node.nodeSize;
      });
      M.State.annotations = [];
      if (from >= 0 && to > from) {
        ed.commands.setTextSelection({ from, to });
        M.createAnnotationFromSelection();
      } else {
        // fallback annotate C0 only then C1
        ed.state.doc.descendants((node, pos) => {
          if (node.isText && node.text === 'C0') {
            ed.commands.setTextSelection({ from: pos, to: pos + 2 });
            M.createAnnotationFromSelection();
          }
        });
        ed.state.doc.descendants((node, pos) => {
          if (node.isText && node.text === 'C1') {
            ed.commands.setTextSelection({ from: pos, to: pos + 2 });
            M.createAnnotationFromSelection();
          }
        });
      }
      const last = M.State.annotations[M.State.annotations.length - 1];
      return {
        n: M.State.annotations.length,
        ranges: last && last.ranges && last.ranges.length,
        hasRange: !!(last && last.range),
      };
    });
    if (r.err) throw new Error(JSON.stringify(r));
    if (r.n < 1) throw new Error(JSON.stringify(r));
    coverage.hitContent('A8');
  });

  await t('A10 cross text+figure stores imageAnchors', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.annotations = [];
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="https://example.com/fig2.png" alt="panel"><p>后文 BBB</p>',
        false
      );
      let from = -1;
      let to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'paragraph' && n.textContent.includes('AAA')) from = pos + 1;
        if (n.type.name === 'paragraph' && n.textContent.includes('BBB')) to = pos + n.nodeSize - 1;
      });
      ed.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      const ann = M.State.annotations[0];
      return {
        count: M.State.annotations.length,
        anchors: ann && ann.imageAnchors && ann.imageAnchors.length,
        ranges: ann && ann.ranges && ann.ranges.length,
        text: ann && ann.text,
      };
    });
    if (r.count !== 1) throw new Error(JSON.stringify(r));
    if (!r.anchors) throw new Error('no imageAnchors: ' + JSON.stringify(r));
    coverage.hitContent('A10');
  });

  await t('A11 second of two images', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.annotations = [];
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>a</p><img src="https://example.com/1.png" alt="one"><p>b</p><img src="https://example.com/2.png" alt="two"><p>c</p>',
        false
      );
      const imgs = [];
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image') imgs.push(pos);
      });
      if (imgs.length < 2) return { err: 'need 2 imgs', n: imgs.length };
      ed.commands.setNodeSelection(imgs[1]);
      M.createAnnotationFromSelection();
      const ann = M.State.annotations[0];
      return {
        count: M.State.annotations.length,
        text: ann && ann.text,
        anchors: ann && ann.imageAnchors && ann.imageAnchors.length,
        src: ann && ann.imageAnchors && ann.imageAnchors[0] && ann.imageAnchors[0].src,
      };
    });
    if (r.err) throw new Error(JSON.stringify(r));
    if (r.count !== 1 || !r.anchors) throw new Error(JSON.stringify(r));
    coverage.hitContent('A11');
  });

  await t('A12 annotate near plain text standing in for formula', async () => {
    // full KaTeX node may not be trivial; select text around $...$
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor(
        'a12.md',
        '# Math\n\nBefore EQ_MARK after. Also E=mc2 nearby.\n',
        null,
        { saveMode: 'mentor-download' }
      );
      M.State.annotations = [];
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text && node.text.includes('EQ_MARK')) {
          from = pos + node.text.indexOf('EQ_MARK');
          to = from + 'EQ_MARK'.length;
        }
      });
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      return { n: M.State.annotations.length, tid: M.State.activeThreadId };
    });
    if (r.n < 1) throw new Error(JSON.stringify(r));
    coverage.hitContent('A12');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
