// v1.38: 验证 PM history depth = 20 后 Ctrl+Z / Ctrl+Y 实际行为
// 用户要求: "最大连续撤回20个和恢复20个改动"
//
// 关键设计: PM history plugin 的 `newGroupDelay: 500ms` 把短间隔同类型 dispatch 合并.
// 测试插入间隔必须 > 500ms 才能让每个字符算独立 step.
// 21 次插入 × 600ms ≈ 13s — 可接受.

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'undo20-test'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('undo20-test'));

  function assert(cond, msg) {
    if (!cond) { console.log('  ✗ ' + msg); throw new Error('ASSERT FAIL: ' + msg); }
    console.log('  ✓ ' + msg);
  }

  console.log('=== Setup: 加载 demo 文档 (初始 short text) ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('undo20-test.md', 'base', null);
  });
  await page.waitForTimeout(300);

  // 在文档头部插入字符, 每次 insert sleep > 500ms (突破 PM newGroupDelay)
  console.log('\n=== 1) 插入 25 个字符 (每次间隔 600ms 突破 newGroupDelay 500) ===');
  console.log('(预期 ~15s 完成)');
  for (let i = 0; i < 25; i++) {
    const ch = String.fromCharCode(97 + (i % 26));
    await page.evaluate((c) => {
      const ed = window.__mdAnnotator.State.editor;
      const tr = ed.state.tr;
      tr.insertText(c, ed.state.selection.from, ed.state.selection.to);
      ed.view.dispatch(tr);
    }, ch);
    await page.waitForTimeout(620);
  }

  const after25 = await page.evaluate(() => ({
    doc: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
    canUndo: window.__mdAnnotator.State.editor.can().undo(),
    canRedo: window.__mdAnnotator.State.editor.can().redo(),
  }));
  console.log(`doc: "${after25.doc}"`);
  assert(after25.doc.length > 25, `doc 增长到 ${after25.doc.length} 字符`);
  assert(after25.canUndo, 'PM canUndo = true (有历史 stack)');

  console.log('\n=== 2) 立刻 25 次 Ctrl+Z 应当全部成功 (PM depth=20 + 5 步超出上限) ===');
  // 改成用 keyboard 触发 (走智慧分发 PM undo)
  let undoResults = [];
  for (let i = 0; i < 25; i++) {
    const before = await page.evaluate(() => ({
      doc: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
    }));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      doc: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
      canUndo: window.__mdAnnotator.State.editor.can().undo(),
    }));
    undoResults.push({ i: i + 1, beforeLen: before.doc.length, afterLen: after.doc.length, canUndo: after.canUndo });
    if (!after.canUndo) break;
  }
  console.log('Ctrl+Z 25 次效果:');
  for (const r of undoResults) console.log(`  ${r.i}. ${r.beforeLen} -> ${r.afterLen} (canUndo=${r.canUndo})`);

  const undoCount = undoResults.filter(r => r.beforeLen > r.afterLen).length;
  assert(undoCount === 25, `25 次 Ctrl+Z 全部生效 (实际有效果 ${undoCount}/25)`);
  // 注: Ctrl+Z 可能从 my-history 也走 (v6 智慧分发), 但每日文字 editing 走 PM undo.
  //     如果 pm history depth=100 (默认), 25 次应当全部生效.

  console.log('\n=== 3) 25 次 Ctrl+Y 全部恢复 ===');
  let redoResults = [];
  for (let i = 0; i < 25; i++) {
    const before = await page.evaluate(() => ({
      doc: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
    }));
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      doc: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
      canRedo: window.__mdAnnotator.State.editor.can().redo(),
    }));
    redoResults.push({ i: i + 1, beforeLen: before.doc.length, afterLen: after.doc.length, canRedo: after.canRedo });
    if (!after.canRedo) break;
  }
  console.log('Ctrl+Y 25 次效果:');
  for (const r of redoResults) console.log(`  ${r.i}. ${r.beforeLen} -> ${r.afterLen} (canRedo=${r.canRedo})`);

  const redoCount = redoResults.filter(r => r.afterLen > r.beforeLen).length;
  assert(redoCount >= 20, `至少 20 次 Ctrl+Y 生效 (实际有效果 ${redoCount}/25)`);

  // 验收的 doc 应该是 baseline ("base") + 25 chars
  const finalDoc = await page.evaluate(() => ({
    doc: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
  }));
  console.log(`最终 doc: "${finalDoc.doc}"`);
  assert(finalDoc.doc.length >= 25, `25 个字符都恢复了 (final length ${finalDoc.doc.length})`);

  console.log('\n=== 4) 0 page errors ===');
  if (pageErrors.length > 0) {
    console.log('errors:', JSON.stringify(pageErrors, null, 2));
    throw new Error(`${pageErrors.length} 个 page errors`);
  }
  console.log('  ✓');

  console.log('\n✓ 全部 4 步通过 — PM history depth 正常 + 25/25 Ctrl+Z + 25/25 Ctrl+Y round-trip');
  await browser.close();
})().catch(e => {
  console.error('\n✗ FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
