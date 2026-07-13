// 完整 e2e: 单 cell 拖选 + 跨 cell 拖选 + 创建批注 + 验证批注覆盖多 cell
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8787/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', msg => {
    console.log('[browser]', msg.type(), msg.text());
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto(URL);
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('e2e-user'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  const tableMd = `| AAA | BBB | CCC |
| --- | --- | --- |
| aaa1 | bbb1 | ccc1 |
| aaa2 | bbb2 | ccc2 |
`;
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('table.md', md, null);
  }, tableMd);
  await page.waitForTimeout(300);

  // === TEST 1: 单 cell 拖选 aaa1 ===
  console.log('=== TEST 1: 单 cell 拖选 aaa1 ===');
  let cellRects = await page.evaluate(() => {
    const cells = document.querySelectorAll('.tiptap table td');
    return Array.from(cells).map(c => {
      const r = c.getBoundingClientRect();
      return { text: c.textContent.trim(), x: r.left, y: r.top, w: r.width, h: r.height, midX: r.left + r.width/2, midY: r.top + r.height/2 };
    });
  });
  // 单 cell 拖选: aaa1 文字左 → 文字右 (确保有 text 选)
  await page.mouse.move(cellRects[0].x + 5, cellRects[0].y + cellRects[0].h / 2);
  await page.mouse.down();
  await page.mouse.move(cellRects[0].x + cellRects[0].w - 5, cellRects[0].y + cellRects[0].h / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);  // wait for PM to update selection
  let info = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const sel = ed.state.selection;
    return {
      selType: sel.constructor.name,
      from: sel.from, to: sel.to,
      text: ed.state.doc.textBetween(sel.from, sel.to, ' '),
    };
  });
  let btn = await page.evaluate(() => {
    const b = document.querySelector('#float-comment-btn');
    return { hidden: b.classList.contains('hidden') };
  });
  console.log('  sel:', JSON.stringify(info), 'btn hidden:', btn.hidden);
  console.log('  ', info.selType === 's' && info.text.length > 0 ? '✓ 单 cell TextSelection 正常' : '✗');

  // === TEST 2: 跨 cell 拖选 aaa1 → ccc1 ===
  console.log('\n=== TEST 2: 跨 cell 拖选 aaa1 → ccc1 ===');
  // 先点空白处清空选区
  await page.mouse.click(50, 50);
  await page.waitForTimeout(100);
  await page.mouse.move(cellRects[0].midX, cellRects[0].midY);
  await page.mouse.down();
  await page.mouse.move(cellRects[1].midX, cellRects[0].midY, { steps: 5 });
  await page.mouse.move(cellRects[2].midX, cellRects[2].midY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  info = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const sel = ed.state.selection;
    return {
      selType: sel.constructor.name,
      from: sel.from, to: sel.to,
      text: ed.state.doc.textBetween(sel.from, sel.to, ' '),
    };
  });
  btn = await page.evaluate(() => {
    const b = document.querySelector('#float-comment-btn');
    return { hidden: b.classList.contains('hidden') };
  });
  console.log('  sel:', JSON.stringify(info), 'btn hidden:', btn.hidden);
  // 验证: CellSelection 特征 = forEachCell + $anchorCell
  const hasCellSel = info.selType && await page.evaluate(() => {
    const sel = window.__mdAnnotator.State.editor.state.selection;
    return !!(sel.forEachCell && sel.$anchorCell && sel.$headCell);
  });
  console.log('  ', hasCellSel ? '✓ CellSelection 创建成功 (多 cell 选区)' : '✗ 不是 CellSelection: ' + info.selType);
  await page.screenshot({ path: '/tmp/cellsel.png' });

  // === TEST 3: 点击批注按钮, 验证 mark 覆盖所有 3 个 cell ===
  console.log('\n=== TEST 3: 点击批注按钮 → 验证多 cell mark ===');
  const before = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  await page.click('#float-comment-btn button');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  console.log('  annotations:', before, '→', after);
  if (after > before) {
    const thread = await page.evaluate(() => {
      const anns = window.__mdAnnotator.State.annotations;
      const t = anns[anns.length - 1];
      const ed = window.__mdAnnotator.State.editor;
      // 验证 mark 实际范围
      const markedPositions = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.isText) {
          const annMark = node.marks.find(m => m.type.name === 'annotation');
          if (annMark && annMark.attrs.threadId === t.threadId) {
            // 找 ancestor cell
            const $pos = ed.state.doc.resolve(pos);
            let cellText = '';
            for (let d = $pos.depth; d > 0; d--) {
              const tn = $pos.node(d).type.name;
              if (tn === 'tableCell' || tn === 'tableHeader') {
                cellText = $pos.node(d).textContent;
                break;
              }
            }
            markedPositions.push({ pos, text: node.text, cellText });
          }
        }
      });
      return { threadId: t.threadId, ranges: t.ranges, text: t.text, markedPositions };
    });
    console.log('  thread:', JSON.stringify(thread, null, 2));
    console.log('  ', thread.ranges && thread.ranges.length === 3 ? '✓ 批注 3 个 cell 各一段 mark' : '✗ 预期 3 段, 实际 ' + (thread.ranges?.length));
  }

  await page.screenshot({ path: '/tmp/cellsel-after.png' });
  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
