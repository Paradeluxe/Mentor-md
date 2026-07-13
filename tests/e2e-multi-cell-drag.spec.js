// 端到端: 跨 4 cell 拖选 → 创建批注 → 验证批注 mark 落在起始 cell
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8787/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('e2e-user'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  const tableMd = `| AAA | BBB | CCC | DDD |
| --- | --- | --- | --- |
| aaa1 | bbb1 | ccc1 | ddd1 |
| aaa2 | bbb2 | ccc2 | ddd2 |
`;
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('table.md', md, null);
  }, tableMd);
  await page.waitForTimeout(300);

  // 拖选 aaa1 (cell 0) → ddd1 (cell 3) — 跨 4 cell
  const cellRects = await page.evaluate(() => {
    const cells = document.querySelectorAll('.tiptap table td');
    return Array.from(cells).map(c => {
      const r = c.getBoundingClientRect();
      return { text: c.textContent.trim(), midX: r.left + r.width/2, midY: r.top + r.height/2 };
    });
  });
  console.log(`drag from "${cellRects[0].text}" (${cellRects[0].midX}) → "${cellRects[3].text}" (${cellRects[3].midX})`);

  await page.mouse.move(cellRects[0].midX, cellRects[0].midY);
  await page.mouse.down();
  // 经过 2 个中间 cell
  await page.mouse.move(cellRects[1].midX, cellRects[0].midY, { steps: 5 });
  await page.mouse.move(cellRects[2].midX, cellRects[0].midY, { steps: 5 });
  await page.mouse.move(cellRects[3].midX, cellRects[3].midY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const sel1 = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const { from, to } = ed.state.selection;
    return { from, to, text: ed.state.doc.textBetween(from, to, ' ') };
  });
  console.log('after drag selection:', JSON.stringify(sel1));

  const btn = await page.evaluate(() => {
    const b = document.querySelector('#float-comment-btn');
    return { hidden: b.classList.contains('hidden'), top: b.style.top, left: b.style.left };
  });
  console.log('按钮:', JSON.stringify(btn));

  // 点击批注按钮创建批注
  const beforeCount = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  await page.click('#float-comment-btn button');
  await page.waitForTimeout(300);
  const afterCount = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  console.log(`annotation count: ${beforeCount} → ${afterCount}`);

  // 验证批注 mark 落在起始 cell
  if (afterCount > beforeCount) {
    const ann = await page.evaluate(() => {
      const anns = window.__mdAnnotator.State.annotations;
      const last = anns[anns.length - 1];
      if (!last || !last.range) return null;
      const ed = window.__mdAnnotator.State.editor;
      const $from = ed.state.doc.resolve(last.range.from);
      const $to = ed.state.doc.resolve(last.range.to);
      let inTableCell = false;
      for (let d = $from.depth; d > 0; d--) {
        const t = $from.node(d).type.name;
        if (t === 'tableCell' || t === 'tableHeader') { inTableCell = true; break; }
      }
      return {
        range: last.range,
        text: ed.state.doc.textBetween(last.range.from, last.range.to, ' '),
        sameParent: $from.parent === $to.parent,
        inTableCell,
      };
    });
    console.log('批注 thread:', JSON.stringify(ann, null, 2));
  }

  // 截图
  await page.screenshot({ path: '/tmp/e2e-multi-cell-final.png' });
  console.log('截图: /tmp/e2e-multi-cell-final.png');

  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
