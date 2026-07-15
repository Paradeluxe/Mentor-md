// v1.43.28/29 figure select + annotate + drag-through-image
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

  console.log('=== v1.43.29 figure select / drag swallow image ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=144&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
    try {
      localStorage.setItem('Mentor:author', 'Tester');
      localStorage.setItem('Mentor:authorId', 'test-id-1');
    } catch {}
    if (window.__mdAnnotator?.State) {
      window.__mdAnnotator.State.author = 'Tester';
      window.__mdAnnotator.State.authorId = 'test-id-1';
    }
  });

  const SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await t('setNodeSelection + click 批注 creates image ann', async () => {
    const r = await page.evaluate((src) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent('<p>前文 AAA</p><img src="' + src + '" alt="fig1"><p>后文 BBB</p>', false);
      M.State.annotations = [];
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setNodeSelection(imgPos);
      const isImg = M.isImageNodeSelection(ed.state.selection);
      document.querySelector('#float-comment-btn button').click();
      M.refreshAnnotationImageDecos();
      return {
        isImg,
        count: M.State.annotations.length,
        text: M.State.annotations[0]?.text,
        anchors: M.State.annotations[0]?.imageAnchors?.length,
        deco: !!document.querySelector('img.annotation-image'),
      };
    }, SRC);
    if (!r.isImg) throw new Error('not image sel');
    if (r.count !== 1) throw new Error('count ' + r.count);
    if (r.text !== 'fig1') throw new Error('text ' + r.text);
    if (r.anchors !== 1) throw new Error('anchors');
    if (!r.deco) throw new Error('no deco');
  });

  await t('real mouse click on img selects + float visible', async () => {
    await page.evaluate((src) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent('<p>前文 AAA</p><img src="' + src + '" alt="panelA" width="200" height="120"><p>后文 BBB</p>', false);
      M.State.annotations = [];
    }, SRC);
    await page.waitForTimeout(200);
    const box = await page.locator('.ProseMirror img').boundingBox();
    if (!box) throw new Error('no img box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const s = M.State.editor.state.selection;
      const btn = document.querySelector('#float-comment-btn');
      return {
        node: s.node?.type?.name,
        isImg: M.isImageNodeSelection(s),
        floatHidden: btn?.classList.contains('hidden'),
      };
    });
    if (!r.isImg && r.node !== 'image') throw new Error(JSON.stringify(r));
    if (r.floatHidden) throw new Error('float hidden after click ' + JSON.stringify(r));
  });

  await t('drag from text stop ON image includes image (no need extra line)', async () => {
    // 复现 PM 卡在图前的选区, 再走生产路径 mousedown(p)+mouseup(img) 补吞
    const r = await page.evaluate(async (src) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>LINE_A_前行文字若干字</p><img src="' + src + '" alt="figX" width="400" height="180"><p>LINE_B_后行文字若干字</p>',
        false
      );
      M.State.annotations = [];
      const fb = document.querySelector('#float-comment-btn');
      if (fb) fb.classList.add('hidden');

      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      // PM 拖到图上时的典型卡点: to 停在 image pos, 不含图
      const stuckTo = imgPos; // == end of prev block gap
      // 合法 text 终点在 prev paragraph 内: imgPos-1 (闭合前最后内容位)
      ed.commands.setTextSelection({ from: 2, to: imgPos - 1 });

      const p = document.querySelector('.ProseMirror p');
      const img = document.querySelector('.ProseMirror img');
      const pr = p.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      const opts = (x, y, buttons) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, view: window });
      p.dispatchEvent(new MouseEvent('mousedown', opts(pr.left + 40, (pr.top + pr.bottom) / 2, 1)));
      // 保持 stuck 选区 (PM mousedown 可能改选区, 再写回)
      ed.commands.setTextSelection({ from: 2, to: imgPos - 1 });
      img.dispatchEvent(new MouseEvent('mousemove', opts(ir.left + 40, (ir.top + ir.bottom) / 2, 1)));
      img.dispatchEvent(new MouseEvent('mouseup', opts(ir.left + 40, (ir.top + ir.bottom) / 2, 0)));
      await new Promise(r => setTimeout(r, 80));

      const s = ed.state.selection;
      const imgs = [];
      if (!s.empty) ed.state.doc.nodesBetween(s.from, s.to, (n, pos) => { if (n.type.name === 'image') imgs.push(pos); });
      if (s.node && s.node.type.name === 'image') imgs.push(s.from);
      return {
        imgPos,
        stuckTo,
        from: s.from,
        to: s.to,
        empty: s.empty,
        node: s.node?.type?.name,
        isImg: M.isImageNodeSelection(s),
        imgs: [...new Set(imgs)],
        text: ed.state.doc.textBetween(s.from, s.to, '|'),
        floatHidden: document.querySelector('#float-comment-btn')?.classList.contains('hidden'),
      };
    }, SRC);
    if (!r.imgs.length && !r.isImg) {
      throw new Error('image not in selection (still need extra line?) ' + JSON.stringify(r));
    }
    if (r.floatHidden) throw new Error('float hidden ' + JSON.stringify(r));
  });

  await t('drag stop on image then 批注 keeps imageAnchors', async () => {
    const r = await page.evaluate(async (src) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>前文 AAAXYZ</p><img src="' + src + '" alt="panelDrag" width="300" height="150"><p>后文 BBB</p>',
        false
      );
      M.State.annotations = [];
      const fb0 = document.querySelector('#float-comment-btn');
      if (fb0) fb0.classList.add('hidden');

      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setTextSelection({ from: 2, to: imgPos - 1 });

      const p = document.querySelector('.ProseMirror p');
      const img = document.querySelector('.ProseMirror img');
      const pr = p.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      const opts = (x, y, buttons) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, view: window });
      p.dispatchEvent(new MouseEvent('mousedown', opts(pr.left + 30, (pr.top + pr.bottom) / 2, 1)));
      ed.commands.setTextSelection({ from: 2, to: imgPos - 1 });
      img.dispatchEvent(new MouseEvent('mousemove', opts(ir.left + 30, (ir.top + ir.bottom) / 2, 1)));
      img.dispatchEvent(new MouseEvent('mouseup', opts(ir.left + 30, (ir.top + ir.bottom) / 2, 0)));
      await new Promise(r => setTimeout(r, 80));

      const fb = document.querySelector('#float-comment-btn');
      if (!fb || fb.classList.contains('hidden')) {
        return { count: 0, anchors: 0, deco: false, err: 'float still hidden after swallow' };
      }
      fb.querySelector('button')?.click();
      M.refreshAnnotationImageDecos();
      const ann = M.State.annotations[0];
      return {
        count: M.State.annotations.length,
        anchors: ann?.imageAnchors?.length || 0,
        deco: !!document.querySelector('img.annotation-image'),
        text: ann?.text,
        selFrom: ed.state.selection.from,
        selTo: ed.state.selection.to,
      };
    }, SRC);
    if (r.err) throw new Error(r.err + ' ' + JSON.stringify(r));
    if (r.count !== 1) throw new Error('count ' + r.count + ' ' + JSON.stringify(r));
    if (r.anchors < 1) throw new Error('no imageAnchors ' + JSON.stringify(r));
    if (!r.deco) throw new Error('no deco');
  });

  await t('cross text+fig stores imageAnchors', async () => {
    const r = await page.evaluate((src) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent('<p>前文 AAA</p><img src="' + src + '" alt="panel"><p>后文 BBB</p>', false);
      M.State.annotations = [];
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'paragraph' && n.textContent.includes('AAA')) from = pos + 1;
        if (n.type.name === 'paragraph' && n.textContent.includes('BBB')) to = pos + n.nodeSize - 1;
      });
      ed.commands.setTextSelection({ from, to });
      document.querySelector('#float-comment-btn button').click();
      M.refreshAnnotationImageDecos();
      const ann = M.State.annotations[0];
      return {
        count: M.State.annotations.length,
        anchors: ann?.imageAnchors?.length,
        deco: !!document.querySelector('img.annotation-image'),
      };
    }, SRC);
    if (r.count !== 1) throw new Error('count ' + r.count);
    if (r.anchors !== 1) throw new Error('no anchors ' + JSON.stringify(r));
    if (!r.deco) throw new Error('no deco');
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
