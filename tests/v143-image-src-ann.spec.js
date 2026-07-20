// Probe + regression: change image src must keep image annotation
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8787/index.html?v=4&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  OK', name); pass++; }
    catch (e) { console.log('  FAIL', name + ':', e.message); fail++; }
  };

  await t('setImage on annotated image keeps ann + deco + new src', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>前文</p><img src="https://example.com/old.png" alt="figA"><p>后文</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      const tid = M.State.annotations[0]?.threadId;
      ed.commands.setNodeSelection(imgPos);
      if (typeof M.applyImageSrcChange === 'function') {
        M.applyImageSrcChange({ src: 'https://example.com/NEW.png', alt: 'figA' });
      } else {
        ed.chain().focus().setImage({ src: 'https://example.com/NEW.png', alt: 'figA' }).run();
      }
      await new Promise(r => setTimeout(r, 80));
      M.refreshAnnotationImageDecos();
      const ann = M.State.annotations.find(a => a.threadId === tid) || M.State.annotations[0];
      let imgSrc = '';
      ed.state.doc.descendants((n) => {
        if (n.type.name === 'image' && !imgSrc) imgSrc = n.attrs.src || '';
      });
      return {
        hasApply: typeof M.applyImageSrcChange === 'function',
        hasResync: typeof M.resyncImageAnchors === 'function',
        count: M.State.annotations.length,
        invalid: !!ann?.invalid,
        deleted: !!ann?.deleted,
        fuzzy: !!ann?.fuzzy,
        reason: ann?.invalidReason,
        anchors: ann?.imageAnchors,
        range: ann?.range,
        imgSrc,
        deco: !!document.querySelector('img.annotation-image'),
        threadAttr: document.querySelector('img.annotation-image')?.getAttribute('data-thread-id'),
      };
    });
    if (!r.hasApply) throw new Error('applyImageSrcChange not exported');
    if (!r.hasResync) throw new Error('resyncImageAnchors not exported');
    if (r.count !== 1) throw new Error('count ' + r.count);
    if (r.invalid || r.deleted) throw new Error('invalid/deleted ' + JSON.stringify(r));
    if (r.imgSrc !== 'https://example.com/NEW.png') throw new Error('src ' + r.imgSrc);
    if (!r.anchors || r.anchors[0]?.src !== 'https://example.com/NEW.png') throw new Error('anchor src ' + JSON.stringify(r.anchors));
    if (!r.deco) throw new Error('no deco');
    if (!r.threadAttr) throw new Error('no thread attr');
  });

  await t('raw setImage path also survives validate (onUpdate)', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>X</p><img src="https://example.com/a.png" alt="g1"><p>Y</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      ed.commands.setNodeSelection(imgPos);
      // raw setImage — only validate path protects
      ed.chain().focus().setImage({ src: 'https://example.com/b.png', alt: 'g1' }).run();
      await new Promise(r => setTimeout(r, 80));
      M.refreshAnnotationImageDecos();
      const ann = M.State.annotations[0];
      return {
        invalid: !!ann?.invalid,
        deleted: !!ann?.deleted,
        reason: ann?.invalidReason,
        anchorSrc: ann?.imageAnchors?.[0]?.src,
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.invalid || r.deleted) throw new Error(JSON.stringify(r));
    if (r.anchorSrc !== 'https://example.com/b.png') throw new Error('anchor ' + r.anchorSrc);
    if (!r.deco) throw new Error('no deco');
  });

  await t('delete real image still marks image-deleted', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>X</p><img src="https://example.com/z.png" alt="z"><p>Y</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      // delete image node
      ed.commands.setNodeSelection(imgPos);
      ed.commands.deleteSelection();
      await new Promise(r => setTimeout(r, 80));
      const ann = M.State.annotations[0];
      return {
        deleted: !!ann?.deleted,
        invalid: !!ann?.invalid,
        reason: ann?.invalidReason,
        anchorsLen: ann?.imageAnchors?.length,
      };
    });
    if (!r.deleted || !r.invalid) throw new Error('should be deleted ' + JSON.stringify(r));
    if (r.reason !== 'image-deleted') throw new Error('reason ' + r.reason);
  });

  // existing figure suite sanity
  console.log('--- legacy figure-ann ---');
  // inline minimal
  await t('legacy NodeSelection create still works', async () => {
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
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      M.refreshAnnotationImageDecos();
      return {
        count: M.State.annotations.length,
        text: M.State.annotations[0]?.text,
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.count !== 1 || r.text !== 'fig1' || !r.deco) throw new Error(JSON.stringify(r));
  });

  console.log('RESULT', pass, 'pass /', fail, 'fail');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
