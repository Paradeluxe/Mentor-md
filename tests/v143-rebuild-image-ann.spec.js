// v1.43.42: rebuildAnnotationMarks restores pure-image deco after undo/history restore
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8787/index.html?v=7&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  OK', name); pass++; }
    catch (e) { console.log('  FAIL', name + ':', e.message); fail++; }
  };

  await t('rebuildAnnotationMarks after pure-image create keeps deco', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.State.annotations = [];
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/png' });
      await M.injectMediaFiles({ 'media/rb.png': blob });
      M.loadMarkdownIntoEditor('rb.mentor', '# T\n\n![](media/rb.png)\n\np\n', { version: '1', annotations: [] });
      await new Promise(r => setTimeout(r, 40));
      let imgPos = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      if (imgPos < 0) return { err: 'no img' };
      M.State.editor.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      await new Promise(r => setTimeout(r, 40));
      const a0 = M.State.annotations[0];
      if (a0) {
        a0.comments = [{ id: 'x', author: { id: 'u', name: 'U' }, body: 'n', createdAt: new Date().toISOString() }];
        a0.pending = false;
      }
      // strip deco DOM then rebuild — must restore
      document.querySelectorAll('img.annotation-image').forEach(el => el.classList.remove('annotation-image'));
      const before = !!document.querySelector('img.annotation-image');
      M.rebuildAnnotationMarks();
      await new Promise(r => setTimeout(r, 30));
      const a = M.State.annotations[0];
      return {
        before,
        afterDeco: !!document.querySelector('img.annotation-image'),
        invalid: !!a?.invalid,
        ia: a?.imageAnchors?.length || 0,
        hasRebuild: typeof M.rebuildAnnotationMarks === 'function',
      };
    });
    if (r.err) throw new Error(r.err);
    if (r.before) throw new Error('expected deco stripped before rebuild');
    if (!r.afterDeco) throw new Error('no deco after rebuild ' + JSON.stringify(r));
    if (r.invalid) throw new Error('invalid after rebuild');
    if (!r.ia) throw new Error('lost ia');
  });

  await t('restoreFromSnapshot (undo path) keeps pure-image deco', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.State.annotations = [];
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await M.injectMediaFiles({ 'media/u.png': new Blob([arr], { type: 'image/png' }) });
      M.loadMarkdownIntoEditor('u.mentor', 'x\n\n![](media/u.png)\n\ny\n', { version: '1', annotations: [] });
      await new Promise(r => setTimeout(r, 40));
      let imgPos = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      M.State.editor.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      await new Promise(r => setTimeout(r, 40));
      const a0 = M.State.annotations[0];
      if (a0) {
        a0.comments = [{ id: 'c', author: { id: 'u', name: 'U' }, body: 'c', createdAt: new Date().toISOString() }];
        a0.pending = false;
      }
      // emulate history restore: clone snap then wipe deco and annotations array swap
      const snap = {
        annotations: JSON.parse(JSON.stringify(M.State.annotations)),
        markSnapshot: [],
        ts: Date.now(),
      };
      document.querySelectorAll('img.annotation-image').forEach(el => el.classList.remove('annotation-image'));
      M.State.annotations = snap.annotations;
      M.rebuildAnnotationMarks(snap.markSnapshot);
      await new Promise(r => setTimeout(r, 30));
      const a = M.State.annotations[0];
      return {
        deco: !!document.querySelector('img.annotation-image'),
        invalid: !!a?.invalid,
        ia: !!(a?.imageAnchors?.length),
      };
    });
    if (!r.deco) throw new Error('no deco after snapshot restore ' + JSON.stringify(r));
    if (r.invalid || !r.ia) throw new Error(JSON.stringify(r));
  });

  await t('save sidecar still keeps imageAnchors (regression)', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.State.mediaUrls = M.State.mediaUrls || {};
      const blob = 'blob:http://127.0.0.1/x';
      M.State.mediaUrls['media/s.png'] = blob;
      M.State.annotations = [{
        threadId: 'cccccccccccc',
        text: '[图片]',
        prefix: '', suffix: '',
        resolved: false,
        createdAt: new Date().toISOString(),
        comments: [],
        range: { from: 1, to: 2 },
        imageAnchors: [{ from: 1, to: 2, src: blob, alt: '', title: '' }],
      }];
      const side = M.buildAnnotationsSidecar();
      return side[0]?.imageAnchors?.[0]?.src;
    });
    if (r !== 'media/s.png') throw new Error('src ' + r);
  });

  console.log('RESULT', pass, 'pass /', fail, 'fail');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
