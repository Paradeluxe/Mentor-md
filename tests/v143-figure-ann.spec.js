// v1.43.22 figure/image annotation coverage
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };

  console.log('=== v1.43.22 figure annotation ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=137&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });

  await t('data: image not stripped (allowBase64)', async () => {
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="fig1"><p>后文 BBB</p>',
        false
      );
      let n = 0;
      ed.state.doc.descendants(node => { if (node.type.name === 'image') n++; });
      return n;
    });
    if (r !== 1) throw new Error('expected 1 image, got ' + r);
  });

  await t('NodeSelection on image creates annotation + deco class', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="https://example.com/fig.png" alt="fig1"><p>后文 BBB</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      if (imgPos < 0) return { error: 'no image' };
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      const ann = M.State.annotations[0];
      M.refreshAnnotationImageDecos();
      const imgEl = document.querySelector('.ProseMirror img.annotation-image, #editor img.annotation-image');
      return {
        count: M.State.annotations.length,
        text: ann?.text,
        anchors: ann?.imageAnchors,
        hasClass: !!imgEl,
        threadAttr: imgEl?.getAttribute('data-thread-id'),
      };
    });
    if (r.error) throw new Error(r.error);
    if (r.count !== 1) throw new Error('count ' + r.count);
    if (r.text !== 'fig1') throw new Error('text ' + r.text);
    if (!r.anchors || r.anchors.length !== 1) throw new Error('anchors ' + JSON.stringify(r.anchors));
    if (!r.hasClass) throw new Error('no decoration class on img');
    if (!r.threadAttr) throw new Error('no data-thread-id');
  });

  await t('cross text+figure stores imageAnchors', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="https://example.com/fig2.png" alt="panel"><p>后文 BBB</p>',
        false
      );
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'paragraph' && n.textContent.includes('AAA')) from = pos + 1;
        if (n.type.name === 'paragraph' && n.textContent.includes('BBB')) to = pos + n.nodeSize - 1;
      });
      ed.commands.setTextSelection({ from, to });
      document.querySelector('#float-comment-btn button').click();
      const ann = M.State.annotations[0];
      M.refreshAnnotationImageDecos();
      return {
        count: M.State.annotations.length,
        ranges: ann?.ranges,
        anchors: ann?.imageAnchors,
        text: ann?.text,
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.count !== 1) throw new Error('count ' + r.count);
    if (!r.anchors || r.anchors.length !== 1) throw new Error('no imageAnchors');
    if (!r.ranges || r.ranges.length < 2) throw new Error('need 2 text ranges, got ' + JSON.stringify(r.ranges));
    if (!String(r.text).includes('panel') && !String(r.text).includes('图')) throw new Error('text missing panel: ' + r.text);
    if (!r.deco) throw new Error('no deco');
  });

  await t('delete removes image deco', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0]?.threadId;
      if (!tid) return { error: 'no tid' };
      // public test helper
      if (typeof M._testDeleteThread === 'function') M._testDeleteThread(tid);
      else if (typeof M.deleteThread === 'function') M.deleteThread(tid);
      else {
        M.State.annotations = M.State.annotations.filter(a => a.threadId !== tid);
        M.rebuildAnnotationMarks?.();
      }
      M.refreshAnnotationImageDecos();
      return {
        count: M.State.annotations.length,
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.error) throw new Error(r.error);
    if (r.count !== 0) throw new Error('count ' + r.count);
    if (r.deco) throw new Error('deco still present');
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
