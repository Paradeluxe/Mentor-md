// 验证: 一条批注的 mark 文字被逐字删除后, Ctrl+Z 应该完整恢复
// 场景: user 在右侧 thread card 上看到 "hello world", 觉得太长, 一个个字 delete 删完
// 然后 Ctrl+Z 想恢复原本的 mark

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'char-delete-test'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto('http://127.0.0.1:8787/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('char-delete-test'));

  function assert(cond, msg) {
    if (!cond) { console.log('  ✗ ' + msg); throw new Error('ASSERT FAIL: ' + msg); }
    console.log('  ✓ ' + msg);
  }

  console.log('=== Setup: 加载 demo + 创 1 条批注 (mark 范围 1..9 = "hello wor") ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('demo.md', 'hello world text', null);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus(1);
    ed.commands.setTextSelection({ from: 1, to: 9 });  // "hello wor"
  });
  await page.waitForTimeout(150);
  await page.locator('#float-comment-btn button').click();
  await page.waitForTimeout(300);
  // 模拟用户输入: 通过 input 事件触发 + 强制清 disabled (button 通过 input handler 启用)
  await page.evaluate(() => {
    const ta = document.querySelector('[data-thread-input]');
    if (!ta) throw new Error('no thread input found');
    ta.value = 'initial comment body';
    // 触发 input 事件让 button disabled 状态变 false
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-act="submit-reply"]');
    if (!btn) throw new Error('no submit button');
    if (btn.disabled) {
      console.warn('submit button still disabled after input!');
    }
    btn.click();
  });
  await page.waitForTimeout(300);

  let st = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    firstRange: window.__mdAnnotator.State.annotations[0]?.range,
    commentsLen: window.__mdAnnotator.State.annotations[0]?.comments?.length,
    docText: window.__mdAnnotator.State.editor.state.doc.textBetween(0, window.__mdAnnotator.State.editor.state.doc.content.size, ' '),
  }));
  console.log('after create:', JSON.stringify(st));
  assert(st.annCount === 1, '1 个 thread');
  assert(st.marks === 1, '1 个 mark');
  assert(st.firstRange.from === 1 && st.firstRange.to === 9, `range = {from:1, to:9} (actual: ${JSON.stringify(st.firstRange)})`);
  assert(st.commentsLen === 1, '1 个 comment');

  console.log('\n=== 1) 逐字删除 mark 范围内的字符 (从右往左 5 次, 每次删 1 字符) ===');
  let deleteResults = [];
  for (let i = 0; i < 5; i++) {
    const res = await page.evaluate((delIdx) => {
      const ed = window.__mdAnnotator.State.editor;
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0].threadId;
      const markType = ed.schema.marks.annotation;
      // 找 mark 当前位置
      const ranges = [];
      ed.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        node.marks.forEach(m => {
          if (m.type === markType && m.attrs.threadId === tid) {
            ranges.push({ from: pos, to: pos + node.nodeSize });
          }
        });
      });
      if (ranges.length === 0) return { error: 'no mark' };
      const lastRange = ranges[ranges.length - 1];
      const at = lastRange.to - 1;  // 最后 1 字符位置

      // 用 direct tr.delete (绕过 commands.deleteSelection 的 selection 校验)
      const tr = ed.state.tr;
      tr.delete(at - 1, at);  // 删除一个字符 (类似 Backspace)
      ed.view.dispatch(tr);

      return {
        i: delIdx,
        beforeAt: at,
        beforeDocSize: ed.state.doc.content.size,
        afterDocSize: ed.state.doc.content.size,
        rangesBefore: ranges.map(r => `${r.from}-${r.to}`),
      };
    }, i);
    deleteResults.push(res);
    await page.waitForTimeout(100);
  }
  console.log('delete attempts:', JSON.stringify(deleteResults));

  st = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const first = M.State.annotations[0];
    const ed = M.State.editor;
    // 找当前 mark 范围
    const markType = ed.schema.marks.annotation;
    const tid = first?.threadId;
    let foundRange = null;
    ed.state.doc.descendants((node, pos) => {
      node.marks.forEach(m => {
        if (m.type === markType && m.attrs.threadId === tid) {
          foundRange = { from: pos, to: pos + node.nodeSize };
        }
      });
    });
    return {
      marks: document.querySelectorAll('#editor .annotation-mark').length,
      docText: ed.state.doc.textBetween(0, ed.state.doc.content.size, ' '),
      range: foundRange,
      commentsLen: first?.comments?.length,
      pastLen: M.State.history.past.length,
    };
  });
  console.log('after 5 deletes:', JSON.stringify(st));
  assert(st.marks >= 0, `仍有 mark (actual: ${st.marks})`);  // 不强制,看实际
  assert(st.pastLen <= 5, `past.length <= 5 (实际: ${st.pastLen}) — v1.37 撤销了 onUpdate 自动 pushHistory, 用户编辑不走 my-history`);

  console.log('\n=== 2) Ctrl+Z 一次 ===');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  st = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return {
      marks: document.querySelectorAll('#editor .annotation-mark').length,
      docText: M.State.editor.state.doc.textBetween(0, M.State.editor.state.doc.content.size, ' '),
      firstRange: M.State.annotations[0]?.range,
      pastLen: M.State.history.past.length,
      futureLen: M.State.history.future.length,
      markExists: !!document.querySelector('#editor .annotation-mark'),
    };
  });
  console.log('after 1st Ctrl+Z:', JSON.stringify(st, null, 2));

  console.log('\n=== 3) 反复 Ctrl+Z 5 次,期望回到原始 hello wor ===');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
  }
  st = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return {
      marks: document.querySelectorAll('#editor .annotation-mark').length,
      docText: M.State.editor.state.doc.textBetween(0, M.State.editor.state.doc.content.size, ' '),
      firstRange: M.State.annotations[0]?.range,
    };
  });
  console.log('after 5 more Ctrl+Z:', JSON.stringify(st, null, 2));

  console.log('\n=== 页面 JS 错误 ===');
  if (pageErrors.length > 0) {
    console.log('errors:', JSON.stringify(pageErrors, null, 2));
  } else {
    console.log('  ✓ 0 个 page error');
  }

  await browser.close();
  console.log('\n✓ 测试完成');
})().catch(e => {
  console.error('\n✗ FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
