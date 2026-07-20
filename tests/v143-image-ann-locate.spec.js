// v1.43.41: pure-image annotation locate must not toast "位置已失效"
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const toasts = [];
  page.on('console', m => {
    const t = m.text();
    if (/失效|toast|scrollTo/i.test(t)) toasts.push(t);
  });

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };

  console.log('=== v1.43.41 image ann locate ===');
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
  });

  // Hook showToast
  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    window.__toasts = [];
    const orig = window.showToast || M.showToast;
    // showToast is module-scoped; patch via DOM observer on toast element if needed
    const host = document.body;
    const mo = new MutationObserver(() => {
      const el = document.querySelector('.toast, #toast, [class*="toast"]');
      if (el && el.textContent) window.__toasts.push(el.textContent.trim());
    });
    mo.observe(host, { childList: true, subtree: true, characterData: true });
    window.__toastMo = mo;
  });

  await t('create image ann then scrollToThread succeeds (no失效 toast)', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      M.State.activeThreadId = null;
      window.__toasts = [];
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="https://example.com/fig.png" alt="fig1"><p>后文 BBB</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      const ann = M.State.annotations[0];
      if (!ann) return { error: 'no ann created' };

      // Capture toast via temporary monkeypatch on DOM toast container text after locate
      const beforeToasts = (window.__toasts || []).slice();
      // Prefer exported API
      if (typeof M.scrollToThread === 'function') M.scrollToThread(ann.threadId);
      else if (typeof M.scrollToCommentText === 'function') M.scrollToCommentText(ann.threadId);
      else {
        // click card body
        const card = document.querySelector(`.comment-thread[data-thread="${ann.threadId}"]`);
        const body = card && card.querySelector('.comment-body-wrap');
        if (body) body.click();
        else return { error: 'no scroll API and no body' };
      }

      const sel = ed.state.selection;
      const node = sel.node || ed.state.doc.nodeAt(sel.from);
      const deco = document.querySelector(`img.annotation-image[data-thread-id="${ann.threadId}"]`);
      const toastText = (window.__toasts || []).slice(beforeToasts.length).join('|');
      const toastHit = /位置已失效|失效/.test(toastText)
        || [...document.querySelectorAll('.toast, #toast, [class*="toast"]')].some(el => /失效/.test(el.textContent || ''));

      return {
        count: M.State.annotations.length,
        invalid: !!ann.invalid,
        deleted: !!ann.deleted,
        anchors: ann.imageAnchors,
        selFrom: sel.from,
        selTo: sel.to,
        nodeName: node && node.type && node.type.name,
        hasDeco: !!deco,
        active: M.State.activeThreadId === ann.threadId,
        toastHit,
        toastText,
        imgPos,
      };
    });
    if (r.error) throw new Error(r.error);
    if (r.count !== 1) throw new Error('count ' + r.count);
    if (r.invalid || r.deleted) throw new Error('marked invalid/deleted');
    if (r.nodeName !== 'image') throw new Error('sel not image, got ' + r.nodeName + ' from=' + r.selFrom);
    if (r.selFrom !== r.imgPos) throw new Error('sel from ' + r.selFrom + ' want ' + r.imgPos);
    if (!r.hasDeco) throw new Error('missing deco');
    if (!r.active) throw new Error('not active');
    if (r.toastHit) throw new Error('toast 失效 fired: ' + r.toastText);
  });

  await t('card body click locates image without 失效', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>前文</p><img src="https://example.com/x.png" alt="panel"><p>后文</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      const ann = M.State.annotations[0];
      // blur selection away first
      ed.commands.setTextSelection(1);
      const card = document.querySelector(`.comment-thread[data-thread="${ann.threadId}"]`);
      if (!card) return { error: 'no card' };
      const body = card.querySelector('.comment-body-wrap') || card;
      body.click();
      const sel = ed.state.selection;
      const node = sel.node || ed.state.doc.nodeAt(sel.from);
      const toastEls = [...document.querySelectorAll('.toast, #toast, [class*="toast"]')];
      const toastHit = toastEls.some(el => /失效/.test(el.textContent || ''));
      return {
        nodeName: node && node.type && node.type.name,
        from: sel.from,
        imgPos,
        toastHit,
        toastTexts: toastEls.map(e => e.textContent.trim()).filter(Boolean).slice(0, 5),
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.error) throw new Error(r.error);
    if (r.nodeName !== 'image') throw new Error('expected image sel, got ' + r.nodeName);
    if (r.from !== r.imgPos) throw new Error('from mismatch');
    if (r.toastHit) throw new Error('toast: ' + JSON.stringify(r.toastTexts));
    if (!r.deco) throw new Error('no deco');
  });

  await t('goto menu locates pure image ann', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>前文</p><img src="https://example.com/y.png"><p>后文</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setNodeSelection(imgPos);
      document.querySelector('#float-comment-btn button').click();
      const ann = M.State.annotations[0];
      ed.commands.setTextSelection(1);
      const gotoBtn = document.querySelector(`[data-act="goto"][data-thread="${ann.threadId}"]`);
      if (gotoBtn) gotoBtn.click();
      else if (typeof M.scrollToThread === 'function') M.scrollToThread(ann.threadId);
      else return { error: 'no goto' };
      const sel = ed.state.selection;
      const node = sel.node || ed.state.doc.nodeAt(sel.from);
      const toastHit = [...document.querySelectorAll('.toast, #toast, [class*="toast"]')]
        .some(el => /失效/.test(el.textContent || ''));
      return {
        nodeName: node && node.type && node.type.name,
        from: sel.from,
        imgPos,
        toastHit,
        text: ann.text,
      };
    });
    if (r.error) throw new Error(r.error);
    if (r.nodeName !== 'image') throw new Error('not image: ' + r.nodeName);
    if (r.toastHit) throw new Error('toast 失效');
    if (r.text !== '[图片]') throw new Error('text ' + r.text);
  });

  await t('float mousedown preserves NodeSelection (real mouse)', async () => {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      M.State.annotations = [];
      ed.commands.setContent(
        '<p>前文 AAA</p><img src="https://example.com/fig.png" alt="fig1"><p>后文 BBB</p>',
        false
      );
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setNodeSelection(imgPos);
    });
    const box = await page.evaluate(() => {
      const wrap = document.querySelector('#float-comment-btn');
      const b = wrap && wrap.querySelector('button');
      const r = b.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        hidden: wrap.classList.contains('hidden'),
        w: r.width,
      };
    });
    if (box.hidden || box.w < 1) throw new Error('float not visible ' + JSON.stringify(box));
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ann = M.State.annotations[0];
      return {
        count: M.State.annotations.length,
        anchors: ann && ann.imageAnchors,
        text: ann && ann.text,
        deco: !!document.querySelector('img.annotation-image'),
      };
    });
    if (r.count !== 1) throw new Error('real mouse did not create ann, count=' + r.count);
    if (!r.anchors || !r.anchors.length) throw new Error('no anchors');
    if (r.text !== 'fig1') throw new Error('text ' + r.text);
    if (!r.deco) throw new Error('no deco');
  });

  console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
