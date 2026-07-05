// 简化的定向验证脚本
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8765/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const results = [];
  function record(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  // 跟踪 dialog
  let dialogLog = [];
  page.on('dialog', async d => {
    dialogLog.push({ type: d.type(), msg: d.message() });
    await d.dismiss();  // 默认取消, 测试取消路径
  });

  await page.goto(URL);
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('verify-user'));
  // boot 后 400ms 会弹 first-time modal, 关掉它免得干扰点击
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  // 注入一个测试文件 + 加载 + 标 dirty
  await page.evaluate(() => {
    const md = `| A | B | C |
| --- | --- | --- |
| a1 | b1 | c1 |
| a2 | b2 | c2 |
| a3 | b3 | c3 |
`;
    const mockHandle = {
      name: 'sample.md',
      async getFile() { return new File([md], 'sample.md', { type: 'text/markdown' }); },
      async queryPermission() { return 'granted'; },
    };
    window.__mdAnnotator.loadMarkdownIntoEditor('sample.md', md, null);
    // mock 一个 fileList + currentFile.handle 让 reload 能真正读到 (单 .md 模式)
    window.__mdAnnotator.State.fileList = [new File([md], 'sample.md', { type: 'text/markdown' })];
    window.__mdAnnotator.State.currentFile.handle = mockHandle;
    window.__mdAnnotator.State.currentFile.dirty = true;
    window.__mdAnnotator.State.currentFile.name = 'sample.md';
  });

  // ============== FIX 1 ==============
  console.log('\n=== FIX 1: dirty reload confirm ===');

  // 1A. dirty 状态确认
  const dirty1 = await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty);
  record('1A: 初始 dirty=true', dirty1 === true, `dirty=${dirty1}`);

  // 1B. 调 handleTreeAction('reload', 'sample.md'), 应该弹 confirm → 取消 → dirty 保持
  dialogLog = [];
  await page.evaluate(() => window.__mdAnnotator.handleTreeAction('reload', 'sample.md'));
  await page.waitForTimeout(300);
  const dirtyAfter1B = await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty);
  record('1B: dirty reload 弹 confirm (取消后 dirty 保持)', dirtyAfter1B === true && dialogLog.length === 1, `dialogs=${dialogLog.length}, dirty=${dirtyAfter1B}`);
  if (dialogLog.length > 0) {
    record('1B: confirm 消息含"未保存"', /未保存|修改/.test(dialogLog[0].msg), `msg="${dialogLog[0].msg.slice(0, 80)}"`);
  }

  // 1C. 改成接受, 应该 reload (dirty → false)
  page.removeAllListeners('dialog');
  page.once('dialog', async d => {
    dialogLog.push({ type: d.type(), msg: d.message() });
    await d.accept();
  });
  dialogLog = [];
  await page.evaluate(() => window.__mdAnnotator.handleTreeAction('reload', 'sample.md'));
  await page.waitForTimeout(300);
  const dirtyAfter1C = await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty);
  record('1C: dirty reload 接受后 → dirty=false', dirtyAfter1C === false && dialogLog.length === 1, `dialogs=${dialogLog.length}, dirty=${dirtyAfter1C}`);

  // 1D. 不 dirty 时 reload 不弹 confirm
  page.removeAllListeners('dialog');
  let dialogFiredOnClean = false;
  page.once('dialog', async d => {
    dialogFiredOnClean = true;
    await d.dismiss();
  });
  await page.evaluate(() => window.__mdAnnotator.handleTreeAction('reload', 'sample.md'));
  await page.waitForTimeout(300);
  record('1D: 非 dirty reload 不弹 confirm', dialogFiredOnClean === false, `dialog=${dialogFiredOnClean}`);

  // 1E. reload 其他文件 (不是 current) 且 dirty 时, 不弹 confirm (只 reload 当前时弹)
  page.removeAllListeners('dialog');
  let dialogFiredOnOtherFile = false;
  page.once('dialog', async d => {
    dialogFiredOnOtherFile = true;
    await d.dismiss();
  });
  await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty = true);
  await page.evaluate(() => window.__mdAnnotator.handleTreeAction('reload', 'other.md'));
  await page.waitForTimeout(300);
  record('1E: reload 非当前文件 (dirty) 不弹 confirm', dialogFiredOnOtherFile === false, `dialog=${dialogFiredOnOtherFile}`);

  // ============== FIX 2 ==============
  console.log('\n=== FIX 2: table multi-cell annotation ===');

  // 重新加载干净的表格文件
  await page.evaluate(() => {
    window.__mdAnnotator.State.currentFile.dirty = false;
  });
  const sampleMd = `| A | B | C |
| --- | --- | --- |
| a1 | b1 | c1 |
| a2 | b2 | c2 |
| a3 | b3 | c3 |
`;
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('table.md', md, null);
  }, sampleMd);

  // 找 cell 位置
  const cellPositions = await page.evaluate(() => {
    const editor = window.__mdAnnotator.State.editor;
    const positions = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        positions.push({
          type: node.type.name,
          pos: pos,
          contentSize: node.content.size,
          text: node.textContent,
        });
      }
    });
    return positions;
  });
  record('2A: 表格有 ≥3 cells (3 列 × 1 header + 3 行)', cellPositions.length >= 3, `count=${cellPositions.length}, types=${cellPositions.slice(0,4).map(c=>c.type).join(',')}`);

  if (cellPositions.length >= 3) {
    // 跨 cell1(cell index 0) 和 cell3 (cell index 2): from 在 cell1 末, to 在 cell3 末
    // cellPositions[0] = first th (A), cellPositions[1] = th (B), cellPositions[2] = th (C)
    // 我想跨 3 个 cell: cell[0] + cell[1] + cell[2] 这三个 header cell
    // cell[0] 末 ("A" 后) → cell[2] 末 ("C" 后)
    const cell1Start = cellPositions[0].pos + 1;
    const cell1End = cell1Start + cellPositions[0].contentSize;
    const cell3Start = cellPositions[2].pos + 1;
    const cell3End = cell3Start + cellPositions[2].contentSize;

    const from = cell1End - 1;  // 落在 cell1 最后一个字符
    const to = cell3End - 1;    // 落在 cell3 最后一个字符

    console.log(`  选区 from=${from} to=${to} (跨 3 个 header cell)`);

    // 验证 from/to 确实在不同 parent
    const parentsBefore = await page.evaluate((args) => {
      const editor = window.__mdAnnotator.State.editor;
      const $from = editor.state.doc.resolve(args.from);
      const $to = editor.state.doc.resolve(args.to);
      return { fromType: $from.parent.type.name, toType: $to.parent.type.name, same: $from.parent === $to.parent };
    }, { from, to });
    record('2B: from/to 在不同 cell parent (跨 cell)', parentsBefore.same === false, JSON.stringify(parentsBefore));

    // 设置选区, 触发 handleSelectionChange
    await page.evaluate((args) => {
      const editor = window.__mdAnnotator.State.editor;
      editor.chain().focus().setTextSelection({ from: args.from, to: args.to }).run();
    }, { from, to });
    await page.waitForTimeout(200);

    // 2C: 批注按钮显示
    const btnVisible = await page.evaluate(() => {
      const btn = document.querySelector('#float-comment-btn');
      return btn && !btn.classList.contains('hidden');
    });
    record('2C: 跨 cell 选区后批注按钮显示', btnVisible === true, `visible=${btnVisible}`);

    // 2D: status 提示 (status-right 现在会被 updateDocMeta 覆盖, 所以也查 status-left + 全文档)
    const statusText = await page.evaluate(() => {
      const a = document.querySelector('#status-left');
      const b = document.querySelector('#status-right');
      return {
        left: a ? a.textContent : '',
        right: b ? b.textContent : '',
        combined: (a ? a.textContent : '') + '|' + (b ? b.textContent : ''),
      };
    });
    // 自动落到起始 / 跨 cell 提示 / 或 setStatus '提示' 都算提示成功
    const got = /起始单元格|起始|自动/.test(statusText.combined) || statusText.left === '提示';
    record('2D: status 提示"批注已自动落到起始单元格"', got, `left="${statusText.left}" right="${statusText.right}"`);

    // 2E: 选区已被 clamp 到 cell1 内
    const afterSel = await page.evaluate(() => {
      const editor = window.__mdAnnotator.State.editor;
      const { from, to } = editor.state.selection;
      const $from = editor.state.doc.resolve(from);
      const $to = editor.state.doc.resolve(to);
      return {
        from, to,
        fromType: $from.parent.type.name,
        toType: $to.parent.type.name,
        same: $from.parent === $to.parent,
      };
    });
    record('2E: 选区 clamp 后在同一 cell parent', afterSel.same === true, JSON.stringify(afterSel));

    // 2F: 点击批注按钮 → 创建成功
    const beforeCount = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
    await page.click('#float-comment-btn button');
    await page.waitForTimeout(300);
    const afterCount = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
    record('2F: 点击批注按钮创建成功', afterCount === beforeCount + 1, `before=${beforeCount} after=${afterCount}`);

    // 2G: 批注 mark 落在起始 cell 内
    if (afterCount > beforeCount) {
      const lastAnn = await page.evaluate(() => {
        const anns = window.__mdAnnotator.State.annotations;
        const last = anns[anns.length - 1];
        return last && last.range ? { from: last.range.from, to: last.range.to } : null;
      });
      if (lastAnn) {
        const inCell = await page.evaluate((args) => {
          const editor = window.__mdAnnotator.State.editor;
          const $from = editor.state.doc.resolve(args.from);
          const $to = editor.state.doc.resolve(args.to);
          // 找 tableCell/Header 在 ancestor
          let inTableCell = false;
          for (let d = $from.depth; d > 0; d--) {
            const t = $from.node(d).type.name;
            if (t === 'tableCell' || t === 'tableHeader') { inTableCell = true; break; }
          }
          return {
            same: $from.parent === $to.parent,
            parentType: $from.parent.type.name,
            inTableCell,
          };
        }, lastAnn);
        record('2G: 批注 mark 同一 parent 且在 tableCell 内', inCell.same === true && inCell.inTableCell === true, JSON.stringify(inCell));
      } else {
        record('2G: 批注 thread 有 range', false, 'no range');
      }
    }
  }

  console.log('\n=== 总结 ===');
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`${passed}/${total} 通过`);
  results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.name} — ${r.detail}`));

  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
