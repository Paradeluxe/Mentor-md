// v1.43.40: pure-image ann survives save sidecar + reload
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8787/index.html?v=5&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  OK', name); pass++; }
    catch (e) { console.log('  FAIL', name + ':', e.message); fail++; }
  };

  await t('serializeAnnotationThread keeps imageAnchors as media path', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.State.annotations = [];
      M.State.mediaUrls = M.State.mediaUrls || {};
      const blob = 'blob:http://127.0.0.1/fake-img-1';
      M.State.mediaUrls['media/image6.png'] = blob;
      const thr = {
        threadId: 'aaaaaaaaaaaa',
        text: '[图片]',
        prefix: '',
        suffix: '',
        resolved: false,
        createdAt: new Date().toISOString(),
        comments: [{ id: 'c1', author: { id: 'u', name: 'U' }, body: 'x', createdAt: new Date().toISOString() }],
        range: { from: 10, to: 11 },
        imageAnchors: [{ from: 10, to: 11, src: blob, alt: 'fig', title: '' }],
      };
      M.State.annotations = [thr];
      const side = M.buildAnnotationsSidecar();
      return {
        n: side.length,
        hasIA: !!(side[0] && side[0].imageAnchors && side[0].imageAnchors[0]),
        src: side[0]?.imageAnchors?.[0]?.src,
        hasRange: !!(side[0] && side[0].range),
      };
    });
    if (r.n !== 1) throw new Error('n ' + r.n);
    if (!r.hasIA) throw new Error('no imageAnchors in sidecar');
    if (r.src !== 'media/image6.png') throw new Error('src not media path: ' + r.src);
    if (!r.hasRange) throw new Error('no range');
  });

  await t('load pure-image ann with imageAnchors → valid + deco', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.State.annotations = [];
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/png' });
      await M.injectMediaFiles({ 'media/t1.png': blob });
      const md = '前文\n\n![](media/t1.png)\n\n后文\n';
      const side = {
        version: '1',
        document: 't.mentor',
        annotations: [{
          threadId: 'bbbbbbbbbbbb',
          text: '[图片]',
          prefix: '',
          suffix: '',
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [{ id: 'c', author: { id: 'u', name: 'U' }, body: '@AI x', createdAt: new Date().toISOString() }],
          imageAnchors: [{ from: 0, to: 1, src: 'media/t1.png', alt: '', title: '' }],
        }],
      };
      M.loadMarkdownIntoEditor('persist-img-test.mentor', md, side);
      await new Promise(r => setTimeout(r, 50));
      if (M.refreshAnnotationImageDecos) M.refreshAnnotationImageDecos();
      const ann = M.State.annotations[0];
      let docImgs = 0;
      M.State.editor.state.doc.descendants(node => { if (node.type.name === 'image') docImgs++; });
      return {
        count: M.State.annotations.length,
        invalid: !!ann?.invalid,
        reason: ann?.invalidReason,
        iaLen: ann?.imageAnchors?.length || 0,
        range: ann?.range,
        deco: !!document.querySelector('img.annotation-image'),
        docImgs,
      };
    });
    if (r.count !== 1) throw new Error('count ' + r.count + ' ' + JSON.stringify(r));
    if (r.invalid) throw new Error('invalid ' + r.reason + ' ' + JSON.stringify(r));
    if (!r.iaLen) throw new Error('no ia after load');
    if (r.docImgs < 1) throw new Error('no img in doc');
    if (!r.deco) throw new Error('no deco ' + JSON.stringify(r));
  });

  await t('roundtrip: create pure image ann → sidecar → reload keeps valid', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.State.annotations = [];
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/png' });
      await M.injectMediaFiles({ 'media/rt.png': blob });
      const md = '# T\n\n![](media/rt.png)\n\np\n';
      M.loadMarkdownIntoEditor('rt.mentor', md, { version: '1', annotations: [] });
      await new Promise(r => setTimeout(r, 30));
      let imgPos = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      if (imgPos < 0) return { err: 'no img' };
      M.State.editor.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      await new Promise(r => setTimeout(r, 30));
      const ann0 = M.State.annotations[0];
      if (ann0) {
        ann0.comments = [{ id: 'x', author: { id: 'u', name: 'U' }, body: 'note', createdAt: new Date().toISOString() }];
        ann0.pending = false;
      }
      const sideAnns = M.buildAnnotationsSidecar();
      const md2 = M.htmlToMarkdownMedia(M.State.editor.getHTML());
      M.loadMarkdownIntoEditor('rt.mentor', md2, { version: '1', document: 'rt.mentor', annotations: sideAnns });
      await new Promise(r => setTimeout(r, 50));
      if (M.refreshAnnotationImageDecos) M.refreshAnnotationImageDecos();
      const a = M.State.annotations[0];
      return {
        sideHasIA: !!(sideAnns[0]?.imageAnchors?.length),
        sideSrc: sideAnns[0]?.imageAnchors?.[0]?.src,
        count: M.State.annotations.length,
        invalid: !!a?.invalid,
        reason: a?.invalidReason,
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.err) throw new Error(r.err);
    if (!r.sideHasIA) throw new Error('sidecar lost IA ' + JSON.stringify(r));
    if (r.sideSrc !== 'media/rt.png') throw new Error('side src ' + r.sideSrc);
    if (r.count !== 1 || r.invalid) throw new Error('after reload ' + JSON.stringify(r));
    if (!r.deco) throw new Error('no deco after reload ' + JSON.stringify(r));
  });

  console.log('RESULT', pass, 'pass /', fail, 'fail');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
