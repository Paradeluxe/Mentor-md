// v1.43.27: image gapcursor + NodeSelection coverage
//
// 6 场景:
//   1. Gapcursor extension is registered
//   2. CSS for .ProseMirror-gapcursor exists
//   3. Image margin creates gap region that PM posAtCoords recognizes
//   4. typing at gap inserts new paragraph
//   5. NodeSelection on image (programmatic dispatch — mouse.click flaky in headless)
//   6. Cross-block TextSelection still spans correctly

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errs.push('[console] ' + msg.text());
  });

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  \u2713', name); pass++; }
    catch (e) { console.log('  \u2717', name + ':', e.message); fail++; }
  };

  console.log('=== v1.43.27 image gapcursor + NodeSelection ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=142&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
  await page.waitForTimeout(400);

  // === 1. Extension registered ===
  await t('Gapcursor extension is registered', async () => {
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const names = ed.extensionManager.extensions.map(e => e.name || e.constructor?.name);
      return { names, hasGapcursor: names.includes('gapCursor') };
    });
    if (!r.hasGapcursor) throw new Error('gapCursor not in extensions: ' + JSON.stringify(r.names));
  });

  // === 2. CSS for .ProseMirror-gapcursor ===
  await t('CSS .ProseMirror-gapcursor exists in stylesheet', async () => {
    const found = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.selectorText && rule.selectorText.includes('ProseMirror-gapcursor')) {
              return { selector: rule.selectorText, cssText: rule.cssText.slice(0, 300) };
            }
          }
        } catch (e) {}
      }
      return null;
    });
    if (!found) throw new Error('no CSS rule for .ProseMirror-gapcursor');
    if (/display\s*:\s*none/i.test(found.cssText)) {
      throw new Error('parent is display:none, gapcursor invisible');
    }
  });

  // Helper: reset doc, return gap positions
  const setupDoc = async () => {
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      ed.commands.setContent(
        '<p>\u524d\u6587 AAA</p><img src="' + PNG + '" width="40" height="20" alt="fig"><p>\u540e\u6587 BBB</p>',
        false
      );
    });
    await page.waitForTimeout(100);
    return await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let imgPos = -1, imgNodeSize = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) { imgPos = pos; imgNodeSize = n.nodeSize; }
      });
      return { imgPos, imgNodeSize, gapBefore: imgPos, gapAfter: imgPos + imgNodeSize };
    });
  };

  // === 3. Gap region recognized by PM ===
  await t('image margin creates \u226510px gap that PM recognizes', async () => {
    const { gapBefore } = await setupDoc();
    if (gapBefore !== 8) throw new Error('expected gapBefore=8, got ' + gapBefore);

    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const p = document.querySelector('#editor .ProseMirror p');
      const img = document.querySelector('#editor .ProseMirror img');
      const pRect = p.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const x = pRect.left + 20;
      const aboveY = (pRect.bottom + imgRect.top) / 2;
      const abovePos = ed.view.posAtCoords({ left: x, top: aboveY });
      return {
        aboveGapPx: imgRect.top - pRect.bottom,
        aboveInside: abovePos?.inside,
        abovePos: abovePos?.pos,
        recognized: abovePos?.inside === -1,
      };
    });
    if (r.aboveGapPx < 8) throw new Error('gap too small: ' + r.aboveGapPx + 'px');
    if (!r.recognized) throw new Error('PM does not recognize gap: ' + JSON.stringify(r));
  });

  // === 4. Typing at gap inserts paragraph ===
  await t('typing at gap before image inserts paragraph BEFORE image', async () => {
    const { gapBefore } = await setupDoc();
    const r = await page.evaluate((gp) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus();
      ed.commands.insertContentAt(gp, 'XY');
      const html = ed.getHTML();
      const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n');
      return { text, xyBeforeImg: html.indexOf('<p>XY</p>') < html.indexOf('<img') };
    }, gapBefore);
    if (!r.xyBeforeImg) throw new Error('XY not before image: ' + r.text);
  });

  await t('typing at gap after image inserts paragraph AFTER image', async () => {
    const { gapAfter } = await setupDoc();
    const r = await page.evaluate((gp) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus();
      ed.commands.insertContentAt(gp, 'Z');
      const html = ed.getHTML();
      const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n');
      return { text, zAfterImg: html.indexOf('<p>Z</p>') > html.indexOf('<img') };
    }, gapAfter);
    if (!r.zAfterImg) throw new Error('Z not after image: ' + r.text);
  });

  // === 5. NodeSelection on image (programmatic) ===
  await t('NodeSelection on image selects only the image', async () => {
    const { imgPos } = await setupDoc();
    await page.evaluate(() => window.__mdAnnotator.State.editor.commands.focus());
    await page.waitForTimeout(50);

    const r = await page.evaluate((ip) => {
      const ed = window.__mdAnnotator.State.editor;
      // Use Tiptap's setNodeSelection command (creates proper NodeSelection)
      ed.commands.setNodeSelection(ip);
      const sel = ed.state.selection;
      return {
        selHasNode: !!sel.node,
        selNodeType: sel.node?.type?.name,
        from: sel.from, to: sel.to,
        nodeSize: sel.node?.nodeSize,
        hasSelectedClass: !!document.querySelector('img.ProseMirror-selectednode'),
      };
    }, imgPos);
    if (!r.selHasNode) throw new Error('no node in selection: ' + JSON.stringify(r));
    if (r.selNodeType !== 'image') throw new Error('expected image, got ' + r.selNodeType);
    if (r.to - r.from !== r.nodeSize) throw new Error('from/to delta != nodeSize: ' + JSON.stringify(r));
    if (!r.hasSelectedClass) throw new Error('img missing .ProseMirror-selectednode class');
  });

  // === 6. Cross-block TextSelection ===
  await t('cross-block TextSelection across image spans correctly', async () => {
    await setupDoc();
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText && n.text.includes('AAA')) from = pos + n.text.indexOf('AAA');
        if (n.isText && n.text.includes('BBB')) to = pos + n.text.indexOf('BBB') + 3;
      });
      ed.commands.setTextSelection({ from, to });
      const sel = ed.state.selection;
      const selectedText = ed.state.doc.textBetween(from, to, '\n');
      return {
        isNodeSel: !!sel.node,
        from, to,
        selectedText,
        crossesImage: from < 8 && to > 9,
      };
    });
    if (r.isNodeSel) throw new Error('should be TextSelection, got NodeSelection');
    if (!r.crossesImage) throw new Error('range did not cross image (from=' + r.from + ', to=' + r.to + ')');
    if (!r.selectedText.includes('AAA') || !r.selectedText.includes('BBB')) {
      throw new Error('missing AAA or BBB in selection: ' + r.selectedText);
    }
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
