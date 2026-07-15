// v1.43.30: cursor before/after image (gap click + arrow skip NodeSelection)
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

  console.log('=== v1.43.30 image caret nav ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=146&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

  const setup = async () => {
    await page.evaluate((src) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent(
        '<p>LINE1 前文 AAA</p><img src="' + src + '" width="320" height="160" alt="fig2"><p>LINE2 后文 BBB</p>',
        false
      );
    }, PNG);
    await page.waitForTimeout(150);
  };

  await t('ImageCaretNav extension registered', async () => {
    const names = await page.evaluate(() =>
      window.__mdAnnotator.State.editor.extensionManager.extensions.map(e => e.name)
    );
    if (!names.includes('imageCaretNav')) throw new Error('missing imageCaretNav: ' + names.filter(n => /gap|image|caret/i.test(n)));
    // single gapCursor
    const gaps = names.filter(n => n === 'gapCursor');
    if (gaps.length !== 1) throw new Error('gapCursor count ' + gaps.length);
  });

  await t('click gap BEFORE image inserts empty p and caret there', async () => {
    await setup();
    const layout = await page.evaluate(() => {
      const p = document.querySelector('.ProseMirror p');
      const img = document.querySelector('.ProseMirror img');
      const pr = p.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      return { x: pr.left + 40, y: (pr.bottom + ir.top) / 2, gap: ir.top - pr.bottom };
    });
    if (layout.gap < 8) throw new Error('gap too small ' + layout.gap);
    await page.mouse.click(layout.x, layout.y);
    await page.waitForTimeout(120);
    await page.evaluate(() => window.__mdAnnotator.State.editor.commands.focus());
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const html = ed.getHTML();
      const s = ed.state.selection;
      const nodes = [];
      ed.state.doc.forEach((n) => nodes.push({ name: n.type.name, text: n.textContent, empty: n.content.size === 0 }));
      return { html, from: s.from, empty: s.empty, nodes, text: ed.state.doc.textBetween(0, ed.state.doc.content.size, '|') };
    });
    // should have empty paragraph before image
    const imgIdx = r.nodes.findIndex(n => n.name === 'image');
    if (imgIdx < 1) throw new Error('no image or no node before: ' + JSON.stringify(r.nodes));
    const before = r.nodes[imgIdx - 1];
    if (before.name !== 'paragraph') throw new Error('before not p: ' + JSON.stringify(before));
    // caret in that empty (or newly inserted) paragraph — not on image node selection
    if (r.nodes.some(n => n.name === 'image') === false) throw new Error('image gone');
    await page.keyboard.type('BEFORE');
    await page.waitForTimeout(80);
    const html2 = await page.evaluate(() => window.__mdAnnotator.State.editor.getHTML());
    if (!html2.includes('BEFORE')) throw new Error('type failed: ' + html2.slice(0, 200));
    if (html2.indexOf('BEFORE') > html2.indexOf('<img')) throw new Error('BEFORE not before img: ' + html2.slice(0, 250));
    if (!html2.includes('alt="fig2"') && !html2.includes('<img')) throw new Error('image deleted: ' + html2.slice(0, 200));
  });

  await t('click gap AFTER image inserts empty p and caret there', async () => {
    await setup();
    const layout = await page.evaluate(() => {
      const img = document.querySelector('.ProseMirror img');
      const p2 = document.querySelectorAll('.ProseMirror p')[1];
      const ir = img.getBoundingClientRect();
      const p2r = p2.getBoundingClientRect();
      return { x: ir.left + 40, y: (ir.bottom + p2r.top) / 2 };
    });
    await page.mouse.click(layout.x, layout.y);
    await page.waitForTimeout(120);
    await page.evaluate(() => window.__mdAnnotator.State.editor.commands.focus());
    await page.keyboard.type('AFTER');
    await page.waitForTimeout(80);
    const html = await page.evaluate(() => window.__mdAnnotator.State.editor.getHTML());
    if (!html.includes('AFTER')) throw new Error('no AFTER: ' + html.slice(0, 250));
    const imgAt = html.indexOf('<img');
    const afterAt = html.indexOf('AFTER');
    if (!(imgAt >= 0 && afterAt > imgAt)) throw new Error('AFTER not after img: ' + html.slice(0, 250));
  });

  await t('ArrowRight at end of p1 skips image NodeSelection → p2', async () => {
    await setup();
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let end = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'paragraph' && end < 0) end = pos + n.nodeSize - 1;
      });
      ed.commands.setTextSelection(end);
      ed.commands.focus();
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const s = ed.state.selection;
      return {
        from: s.from,
        node: s.node?.type?.name,
        json: s.toJSON(),
        textAfter: ed.state.doc.textBetween(s.from, Math.min(s.from + 10, ed.state.doc.content.size), ''),
      };
    });
    if (r.node === 'image' || r.json?.type === 'node') throw new Error('stuck on NodeSelection: ' + JSON.stringify(r));
    await page.keyboard.type('X');
    const html = await page.evaluate(() => window.__mdAnnotator.State.editor.getHTML());
    if (!html.includes('<img')) throw new Error('image deleted by type: ' + html.slice(0, 200));
    if (!html.includes('X')) throw new Error('no X');
  });

  await t('ArrowRight from NodeSelection on image leaves to after', async () => {
    await setup();
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let imgPos = -1;
      ed.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && imgPos < 0) imgPos = pos; });
      ed.commands.setNodeSelection(imgPos);
      ed.commands.focus();
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const s = window.__mdAnnotator.State.editor.state.selection;
      return { node: s.node?.type?.name, json: s.toJSON(), from: s.from };
    });
    if (r.node === 'image' || r.json?.type === 'node') throw new Error('still on image: ' + JSON.stringify(r));
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
