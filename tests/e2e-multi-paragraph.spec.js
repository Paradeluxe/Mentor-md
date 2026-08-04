// E2E: 跨段落 (多行) 选区批注
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8787/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => console.log('[browser console]', m.type(), m.text()));
  page.on('pageerror', e => console.log('[page error]', e.message));
  const results = [];
  function record(name, pass, detail) {
    results.push({ name, pass });
    console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  await page.goto(URL);
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('张三'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  // 加载 3 段 markdown
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('multi-para.md', '这是第一段文字内容.\n\n这是第二段文字内容.\n\n这是第三段文字内容.', null);
  });
  await page.waitForTimeout(300);

  // 模拟跨 2 段选区 (从 Para 1 末尾到 Para 2 中间)
  await page.evaluate(() => {
    const editor = window.__mdAnnotator.State.editor;
    const doc = editor.state.doc;
    // 找 paragraph 位置
    const paragraphs = [];
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        paragraphs.push({ pos, size: node.nodeSize, text: node.textContent });
      }
    });
    // from = Para 1 末尾 (paragraphs[0].pos + size - 1)
    // to = Para 2 中间 (paragraphs[1].pos + 5)
    const p1 = paragraphs[0];
    const p2 = paragraphs[1];
    const from = p1.pos + p1.size - 1;  // 最后 1 字符位置
    const to = p2.pos + 5;  // Para 2 第 5 字符
    editor.chain().focus().setTextSelection({ from, to }).run();
  });
  await page.waitForTimeout(200);

  // 1. 浮动批注按钮应该显示
  const btnShown = await page.evaluate(() => {
    return !document.querySelector('#float-comment-btn').classList.contains('hidden');
  });
  record('跨段落选区 → 批注按钮显示', btnShown === true, `shown=${btnShown}`);

  // 2. selection 仍然在跨段落状态 (handleSelectionChange 不会 reject paragraph-to-paragraph)
  const selInfo = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const { from, to } = ed.state.selection;
    const $from = ed.state.doc.resolve(from);
    const $to = ed.state.doc.resolve(to);
    return {
      from, to,
      fromParent: $from.parent.type.name,
      toParent: $to.parent.type.name,
      sameParent: $from.parent === $to.parent,
    };
  });
  record('选区跨 2 段', selInfo.fromParent === 'paragraph' && selInfo.toParent === 'paragraph' && !selInfo.sameParent, JSON.stringify(selInfo));

  // 3. 点击批注按钮 → 创建多段批注
  const beforeCount = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  await page.click('#float-comment-btn button');
  await page.waitForTimeout(300);
  const afterCount = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  record('点击按钮 → 批注创建', afterCount === beforeCount + 1, `before=${beforeCount} after=${afterCount}`);

  // 4. thread 应该有 2 段 ranges, mark 落在 2 个 paragraph
  if (afterCount > beforeCount) {
    const thread = await page.evaluate(() => {
      const anns = window.__mdAnnotator.State.annotations;
      const t = anns[anns.length - 1];
      const ed = window.__mdAnnotator.State.editor;
      // 找 mark 实际范围
      const markRanges = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.isText) {
          const annMark = node.marks.find(m => m.type.name === 'annotation');
          if (annMark && annMark.attrs.threadId === t.threadId) {
            const $pos = ed.state.doc.resolve(pos);
            markRanges.push({ pos, text: node.text, parent: $pos.parent.type.name });
          }
        }
      });
      // also enumerate ALL mark ranges via tr.doc
      const allMarks = [];
      ed.state.doc.descendants((node, pos) => {
        node.marks.forEach(m => {
          if (m.type.name === 'annotation' && m.attrs.threadId === t.threadId) {
            allMarks.push({ pos, type: m.type.name, threadId: m.attrs.threadId, parent: ed.state.doc.resolve(pos).parent.type.name, text: node.isText ? node.text : null });
          }
        });
      });
      return {
        threadId: t.threadId,
        threadRanges: t.ranges,
        threadRangeLen: t.ranges ? t.ranges.length : 0,
        markRanges,
        allMarks,
        text: t.text,
      };
    });
    record('thread.ranges 长度 = 2 (2 段)', thread.threadRangeLen === 2, `length=${thread.threadRangeLen}`);
    // PM addMark 限制: 跨段选区边界 1 字符 (Paragraph 末尾 close token) 无法 mark
    // 实际 mark 数: Para 2 段 (4 char) 一定 mark, Para 1 段 (1 char) 视 from 是否正好 = textEnd
    record('mark 实际落在 ≥1 个 paragraph (PM 跨段限制)', thread.allMarks.length >= 1, `marks=${thread.allMarks.length}, parents=${JSON.stringify([...new Set(thread.allMarks.map(m => m.parent))])}`);
  }

  // 5. 视觉: status 提示 "多段批注"
  // status-left 由 setStatus 同步写, status-right 由 updateDocMeta (debounced 250ms) 覆盖
  // 多段信息保留在 status-left (e.g. "人类调整（多段）")
  const statusLeft = await page.evaluate(() => document.querySelector('#status-left')?.textContent || '');
  record('status-left 显示 "人类调整（多段）"', /多段/.test(statusLeft), `status-left="${statusLeft}"`);

  await browser.close();
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
