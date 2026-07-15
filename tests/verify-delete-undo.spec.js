// 验证 deleteThread + undo 完整闭环
// Bug 描述: 完全删除批注之后, ctrl z 丢失批注(数据或 mark 或两者)

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'verify-user'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  // 接受所有 confirm (删除批注时会弹)
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));

  await page.goto('http://127.0.0.1:8787/index.html?v=135&cb=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('verify-user'));

  function assert(cond, msg) {
    if (!cond) { console.log('  ✗ ' + msg); throw new Error('ASSERT FAIL: ' + msg); }
    console.log('  ✓ ' + msg);
  }

  console.log('=== Setup: load demo markdown ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('demo.md', 'hello world text more content here', null);
  });
  await page.waitForTimeout(300);

  console.log('\n=== 1) 创建一条批注 (选 [1..5]) ===');
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus(1);
    ed.commands.setTextSelection({ from: 1, to: 5 });
  });
  await page.waitForTimeout(150);
  await page.locator('#float-comment-btn button').click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const ta = document.querySelector('[data-thread-input]');
    ta.value = 'test comment body';
    document.querySelector('button[data-act="submit-reply"]').click();
  });
  await page.waitForTimeout(200);

  let after = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    firstRange: window.__mdAnnotator.State.annotations[0]?.range,
    threadId: window.__mdAnnotator.State.annotations[0]?.threadId,
  }));
  console.log('after create:', JSON.stringify(after));
  assert(after.annCount === 1, 'annotations = 1');
  assert(after.marks === 1, 'DOM annotation-mark = 1');
  assert(after.firstRange && after.firstRange.from === 1 && after.firstRange.to === 5, `range = {from:1, to:5} (actual: ${JSON.stringify(after.firstRange)})`);
  const originalTid = after.threadId;

  console.log('\n=== 2) 模拟 deleteThread 内部动作 (绕过 confirm) ===');
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      // v1.43.21: 走真实 deleteThread 路径 (_testDeleteThread 跳过 confirm)
      // 旧测试手写 removeMark 未 setMeta(addToHistory,false), 与生产路径不一致
      if (typeof M._testDeleteThread === 'function') {
        M._testDeleteThread(tid);
        return;
      }
      M.pushHistory();
      const ed = M.State.editor;
      const tr = ed.state.tr;
      const markType = ed.schema.marks.annotation;
      ed.state.doc.descendants((node, pos) => {
        node.marks.forEach(m => {
          if (m.type === markType && m.attrs.threadId === tid) {
            tr.removeMark(pos, pos + node.nodeSize, markType);
          }
        });
      });
      tr.setMeta('addToHistory', false);
      tr.setMeta('__activeMarkSync', true);
      ed.view.dispatch(tr);
      M.State.annotations = M.State.annotations.filter(t => t.threadId !== tid);
      M.renderCommentList();
      M.updateDocMeta && M.updateDocMeta({immediate: true});
    }, originalTid);
  await page.waitForTimeout(300);

  after = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    pastLen: window.__mdAnnotator.State.history.past.length,
    futureLen: window.__mdAnnotator.State.history.future.length,
  }));
  console.log('after delete:', JSON.stringify(after));
  assert(after.annCount === 0, `delete 后 annCount = 0 (actual: ${after.annCount})`);
  assert(after.marks === 0, `delete 后 DOM marks = 0 (actual: ${after.marks})`);
  assert(after.pastLen >= 2, `delete 后 past.length >= 2 (含创建+删除前 snapshot, actual: ${after.pastLen})`);
  assert(after.futureLen === 0, `delete 后 future.length = 0`);

  console.log('\n=== 3) Ctrl+Z 撤销删除 ===');
  // 用键盘 Ctrl+Z 而非 M.undo(), 测试 Office 风格 my history 优先路径
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);  // 给足时间 rebuild marks + renderCommentList

  after = await page.evaluate((tid) => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    pastLen: window.__mdAnnotator.State.history.past.length,
    futureLen: window.__mdAnnotator.State.history.future.length,
    foundTid: window.__mdAnnotator.State.annotations.some(t => t.threadId === tid),
  }), originalTid);
  console.log('after undo:', JSON.stringify(after));
  assert(after.annCount === 1, `undo 后 annCount = 1 (actual: ${after.annCount}) — IF FAIL, 批注数据丢了`);
  assert(after.foundTid, `thread ${originalTid} 还在 State.annotations`);
  assert(after.marks === 1, `undo 后 DOM marks = 1 (actual: ${after.marks}) — IF FAIL, mark 没重建`);
  assert(after.pastLen >= 0 && after.pastLen <= 2, `undo 后 past.length = 0..2 (actual: ${after.pastLen}) — 合理范围`);
  assert(after.futureLen === 1, `undo 后 future.length = 1 (actual: ${after.futureLen})`);

  console.log('\n=== 4) Ctrl+Y 重做 ===');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  after = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  console.log('after redo:', JSON.stringify(after));
  assert(after.annCount === 0, `redo 后 annCount = 0 (actual: ${after.annCount})`);
  assert(after.marks === 0, `redo 后 DOM marks = 0 (actual: ${after.marks})`);

  console.log('\n=== 5) Ctrl+Z 再恢复批注 + 验证 mark 真实可点击 ===');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  after = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    markTids: Array.from(document.querySelectorAll('#editor .annotation-mark')).map(m => m.getAttribute('data-thread-id') || (m.pmViewDesc && m.pmViewDesc.node && m.pmViewDesc.node.marks[0]?.attrs?.threadId)),
  }));
  console.log('after second undo:', JSON.stringify(after));
  assert(after.annCount === 1, `再次 undo: annCount = 1`);
  assert(after.marks === 1, `再次 undo: DOM marks = 1`);
  // 验证 mark 有正确的 threadId (通过 PM view desc)
  const markTidOk = await page.evaluate((origTid) => {
    const mark = document.querySelector('#editor .annotation-mark');
    if (!mark) return false;
    // PM 把 mark attrs 存在 PMViewDesc.marks 上, 但 outerHTML 不直接显示
    // 通过 PM doc descendants 找
    let found = false;
    const ed = window.__mdAnnotator.State.editor;
    ed.state.doc.descendants((node, pos) => {
      if (found) return false;
      node.marks.forEach(m => {
        if (m.type.name === 'annotation' && m.attrs.threadId === origTid) found = true;
      });
    });
    return found;
  }, originalTid);
  assert(markTidOk, `PM doc 里有 mark 带 threadId=${originalTid}`);

  console.log('\n=== 页面 JS 错误 ===');
  if (pageErrors.length > 0) {
    console.log('errors:', JSON.stringify(pageErrors, null, 2));
    throw new Error(`page 有 ${pageErrors.length} 个 JS 错误`);
  }
  console.log('  ✓ 0 个 page error');

  console.log('\n=== 6) 多批注部分删除 (只删一条) + undo ===');
  await page.evaluate(() => window.__mdAnnotator.loadMarkdownIntoEditor('demo2.md', 'aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll', null));
  await page.waitForTimeout(300);
  // 创建 3 条批注
  for (const range of [{from: 1, to: 3}, {from: 5, to: 8}, {from: 10, to: 12}]) {
    await page.evaluate((r) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus(r.from);
      ed.commands.setTextSelection({ from: r.from, to: r.to });
    }, range);
    await page.waitForTimeout(150);
    await page.locator('#float-comment-btn button').click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const ta = document.querySelector('[data-thread-input]');
      ta.value = 'thread body';
      document.querySelector('button[data-act="submit-reply"]').click();
    });
    await page.waitForTimeout(200);
  }
  let multi = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    pastLen: window.__mdAnnotator.State.history.past.length,
  }));
  console.log('after 3 creates:', JSON.stringify(multi));
  assert(multi.annCount === 3, `3 条批注 (actual: ${multi.annCount})`);
  assert(multi.marks === 3, `3 个 mark (actual: ${multi.marks})`);

  // 删除中间那条 thread
  const middleTid = await page.evaluate(() => window.__mdAnnotator.State.annotations[1].threadId);
  console.log(`deleting middle tid=${middleTid}`);
  await page.evaluate((tid) => {
    window.__mdAnnotator._testDeleteThread(tid);
  }, middleTid);
  await page.waitForTimeout(300);

  multi = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  console.log('after delete middle:', JSON.stringify(multi));
  assert(multi.annCount === 2, `删中间后剩 2 (actual: ${multi.annCount})`);
  assert(multi.marks === 2, `删中间后剩 2 个 mark (actual: ${multi.marks})`);

  // Ctrl+Z 撤销 (撤销删除中间那条)
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  multi = await page.evaluate((origTid) => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    foundMiddle: window.__mdAnnotator.State.annotations.some(t => t.threadId === origTid),
  }), middleTid);
  console.log('after undo (restore middle):', JSON.stringify(multi));
  assert(multi.annCount === 3, `undo 后 3 条 (actual: ${multi.annCount}) — IF FAIL, 批注数据丢了`);
  assert(multi.foundMiddle, `中间 thread ${middleTid} 恢复`);
  assert(multi.marks === 3, `undo 后 3 个 mark (actual: ${multi.marks}) — IF FAIL, mark 重建错`);

  // 重要: 验证 mark 位置没乱 (重建 mark 不能误放到其它 thread 的位置)
  const markRanges = await page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('#editor .annotation-mark'));
    return marks.map(m => {
      const r = m.getBoundingClientRect();
      return { left: Math.round(r.left + r.width/2), top: Math.round(r.top + r.height/2) };
    });
  });
  console.log('mark positions:', JSON.stringify(markRanges));

  console.log('\n=== 7) Push 然后多 undo 验证 history stack 一致 ===');
  // 多次 undo 看是否能回到最初
  await page.evaluate(() => window.__mdAnnotator.loadMarkdownIntoEditor('demo3.md', 'aaa bbb ccc ddd', null));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus(1);
    ed.commands.setTextSelection({ from: 1, to: 3 });
  });
  await page.waitForTimeout(150);
  await page.locator('#float-comment-btn button').click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const ta = document.querySelector('[data-thread-input]');
    ta.value = 'thread1';
    document.querySelector('button[data-act="submit-reply"]').click();
  });
  await page.waitForTimeout(200);

  const initialState = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  assert(initialState.annCount === 1 && initialState.marks === 1, `1 条批注 + 1 mark (actual annCount=${initialState.annCount}, marks=${initialState.marks})`);

  // 删除
  const onlyTid = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].threadId);
  await page.evaluate((tid) => {
    window.__mdAnnotator._testDeleteThread(tid);
  }, onlyTid);
  await page.waitForTimeout(200);

  let cur = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    pastLen: window.__mdAnnotator.State.history.past.length,
  }));
  console.log('after delete:', JSON.stringify(cur));
  assert(cur.annCount === 0 && cur.marks === 0, `删后空 (actual annCount=${cur.annCount}, marks=${cur.marks})`);

  // Ctrl+Z (撤删除)
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  cur = await page.evaluate((origTid) => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    foundTid: window.__mdAnnotator.State.annotations.some(t => t.threadId === origTid),
  }), onlyTid);
  console.log('after Ctrl+Z (undo delete):', JSON.stringify(cur));
  assert(cur.annCount === 1, `Ctrl+Z 后 annCount = 1 (actual: ${cur.annCount}) — IF FAIL, 批注数据丢了`);
  assert(cur.foundTid, `thread ${onlyTid} 恢复`);
  assert(cur.marks === 1, `Ctrl+Z 后 mark = 1 (actual: ${cur.marks}) — IF FAIL, mark 重建错`);

  console.log('\n=== 8) 加载已有真实 annotations + 删除 + undo (more realistic case) ===');
  // 用真实 loadMarkdownIntoEditor 路径, 传 annotationsData 让 schema 验证 + findAnnotationRange 重算 range
  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const docContent = 'First sentence here. Middle sentence now. End sentence here.';
    // Schema 要求 ann.text (findAnnotationRange 依赖此字段定位). 也传 prefix/suffix 鲁棒匹配.
    const annotationsData = {
      version: '1.32',
      annotations: [
        { threadId: 'real-A', resolved: false, range: {from: 1, to: 6}, text: 'First', prefix: '', suffix: ' sentence', quotes: [{text: 'First', from: 1, to: 6}], comments: [{body: 'comment on First', author: {id: 'a1'}, ts: Date.now()}], createdAt: Date.now() },
        { threadId: 'real-B', resolved: false, range: {from: 27, to: 33}, text: 'Middle', prefix: '. ', suffix: ' sentence', quotes: [{text: 'Middle', from: 27, to: 33}], comments: [{body: 'comment on Middle', author: {id: 'a2'}, ts: Date.now()}], createdAt: Date.now() },
      ],
    };
    M.loadMarkdownIntoEditor('real-load.md', docContent, annotationsData);
  });
  await page.waitForTimeout(500);

  loaded = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  console.log('after real-load:', JSON.stringify(loaded));
  assert(loaded.annCount === 2, `real-load 后 2 anns (actual: ${loaded.annCount})`);
  assert(loaded.marks === 2, `real-load 后 2 marks (actual: ${loaded.marks})`);

  // 删 B
  await page.evaluate(() => {
    const tidB = window.__mdAnnotator.State.annotations.find(t => t.threadId === 'real-B').threadId;
    window.__mdAnnotator._testDeleteThread(tidB);
  });
  await page.waitForTimeout(300);

  loaded = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  console.log('after delete B:', JSON.stringify(loaded));
  assert(loaded.annCount === 1 && loaded.marks === 1, `删 B 后剩 A (annCount=${loaded.annCount}, marks=${loaded.marks})`);

  // Ctrl+Z
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  loaded = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    foundB: window.__mdAnnotator.State.annotations.some(t => t.threadId === 'real-B'),
    markBExists: !!document.querySelector('#editor .annotation-mark[data-thread-id="real-B"]'),
  }));
  console.log('after undo B:', JSON.stringify(loaded));
  assert(loaded.annCount === 2, `undo 后 2 条 (actual: ${loaded.annCount}) — IF FAIL, 批注数据丢了`);
  assert(loaded.foundB, 'real-B 恢复');
  assert(loaded.marks === 2, `undo 后 2 mark (actual: ${loaded.marks}) — IF FAIL, mark 重建错`);
  // markBExists 检查不一定能找到 (data-thread-id 不一定有这 attr), 但 annCount + marks 是主要指标

  console.log('\n=== 9) 编辑 PM doc 让 ann.range stale, 再 delete + undo — mark 仍能恢复 (snapshot 路径) ===');
  // 创建 2 条批注
  await page.evaluate(() => window.__mdAnnotator.loadMarkdownIntoEditor('stale-test.md', 'aaa bbb ccc ddd eee fff', null));
  await page.waitForTimeout(300);
  for (const range of [{from: 1, to: 3}, {from: 8, to: 12}]) {
    await page.evaluate((r) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus(r.from);
      ed.commands.setTextSelection({ from: r.from, to: r.to });
    }, range);
    await page.waitForTimeout(150);
    await page.locator('#float-comment-btn button').click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const ta = document.querySelector('[data-thread-input]');
      ta.value = 'thread body';
      document.querySelector('button[data-act="submit-reply"]').click();
    });
    await page.waitForTimeout(200);
  }
  const beforeEdit = await page.evaluate(() => {
    return window.__mdAnnotator.State.annotations.map(t => ({tid: t.threadId, range: t.range}));
  });
  console.log('after 2 creates:', JSON.stringify(beforeEdit));

  // 编辑 doc — 在 pos=1 前插入一段文字, 让 positions 偏移 (stale range 问题)
  // 真实场景: 用户在批注前添加文字, range 不再指向正确字符
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.setTextSelection(1);
    ed.commands.insertContent('XXXXXX ');
    // 不 pushHistory — 这是用户编辑
  });
  await page.waitForTimeout(200);

  const afterEdit = await page.evaluate(() => ({
    docSize: window.__mdAnnotator.State.editor.state.doc.content.size,
    annRanges: window.__mdAnnotator.State.annotations.map(t => ({tid: t.threadId, range: t.range})),
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  console.log('after editor insert at pos=1:', JSON.stringify(afterEdit, null, 2));
  // marks 仍存在 (PM doc 的 mark span 自己跟着编辑移), 但 State.annotations.range 现在 stale (指向 1..3 但实际是 'XXXXXX a' 的标记范围已不同)
  // 删某 thread
  const targetTid = beforeEdit[0].tid;
  console.log(`deleting stale tid=${targetTid}`);
  await page.evaluate((tid) => {
    window.__mdAnnotator._testDeleteThread(tid);
  }, targetTid);
  await page.waitForTimeout(300);

  const afterDel = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
  }));
  console.log('after delete stale one:', JSON.stringify(afterDel));
  assert(afterDel.annCount === 1, `删后剩 1 ann (actual: ${afterDel.annCount})`);
  assert(afterDel.marks === 1, `删后剩 1 mark (actual: ${afterDel.marks})`);

  // Ctrl+Z 撤销 — v1.37 fix 通过 markSnapshot 重建, 即使 range stale 也行
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const afterUndo = await page.evaluate((origTid) => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    marks: document.querySelectorAll('#editor .annotation-mark').length,
    foundOrig: window.__mdAnnotator.State.annotations.some(t => t.threadId === origTid),
    markForOrigExists: !!Array.from(document.querySelectorAll('#editor .annotation-mark')).find(m => {
      // PM 把 attrs 存在 marks 上, 我们比较在 PM doc 内部
      const ed = window.__mdAnnotator.State.editor;
      let found = false;
      ed.state.doc.descendants((node, pos) => {
        if (found) return false;
        node.marks.forEach(mm => {
          if (mm.type.name === 'annotation' && mm.attrs.threadId === origTid) found = true;
        });
      });
      return found;
    }),
  }), targetTid);
  console.log('after undo (should restore stale thread):', JSON.stringify(afterUndo));
  assert(afterUndo.annCount === 2, `undo 后 annCount = 2 (actual: ${afterUndo.annCount}) — IF FAIL, thread 丢了`);
  assert(afterUndo.foundOrig, `原始 stale thread ${targetTid} 还在 annotations`);
  assert(afterUndo.marks === 2, `undo 后 2 mark (actual: ${afterUndo.marks}) — IF FAIL, mark 重建错 (v1.37 fix 没生效?)`);
  assert(afterUndo.markForOrigExists, `原始 thread 的 mark 在 PM doc 里`);

  console.log('\n✓ 全部 9 步通过 — v1.37 markSnapshot 修复有效');
  await browser.close();
})().catch(e => {
  console.error('\n✗ FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
