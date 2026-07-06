// Mentor History + Autosave E2E
// 验证:
//  1) 工具栏 ↶ ↷ 按钮初始 disabled, 创建批注后 enabled
//  2) undo/redo round-trip (创建 → undo → redo)
//  3) resolve 操作的 undo/redo
//  4) reply 操作的 undo/redo
//  5) 撤销后 doc 内 annotation mark 同步消失 (rebuildAnnotationMarks)
//  6) history 容量 100: 第 101 个 push 丢弃最早
//  7) 切文件清空 history
//  8) Ctrl+Alt+Z 快捷键
//  9) autosaveNow: handle 模式 + dirty=true → markClean
// 10) autosaveNow: download 模式不写
// 11) autosaveNow: handle 模式 + dirty=false 不写

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('Mentor:author', '张三'); } catch (e) {} });
  const page = await ctx.newPage();
  const pageErrors = [];
  // 接受 confirm 对话框 (loadMarkdownIntoEditor 切文件时弹"未保存修改"确认)
  // 不接受会 dismiss → return false → resetHistory 不调 → 后续断言失败
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('张三'));

  console.log('=== 1) 工具栏按钮初始 disabled ===');
  assert(await page.locator('#btn-undo').isDisabled(), 'btn-undo 初始 disabled');
  assert(await page.locator('#btn-redo').isDisabled(), 'btn-redo 初始 disabled');

  console.log('\n=== 2) 创建批注 → undo/redo round-trip ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('h.md', 'hello world text', null);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus(1);
    ed.commands.setTextSelection({ from: 1, to: 5 });
  });
  await page.waitForTimeout(200);
  await page.locator('#float-comment-btn button').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ta = document.querySelector('[data-thread-input]');
    ta.value = 'first';
    document.querySelector('button[data-act="submit-reply"]').click();
  });
  await page.waitForTimeout(300);
  const afterCreate = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    comments: window.__mdAnnotator.State.annotations[0]?.comments?.length,
    pastLen: window.__mdAnnotator.State.history.past.length,
  }));
  assert(afterCreate.annCount === 1, `1 个批注 (实际 ${afterCreate.annCount})`);
  assert(afterCreate.comments === 1, `1 条 comment (实际 ${afterCreate.comments})`);
  assert(afterCreate.pastLen >= 2, `past 长度 = ${afterCreate.pastLen} (创建+reply 各 push 1)`);
  assert(await page.locator('#btn-undo').isEnabled(), 'btn-undo enabled');

  // undo 撤销 reply
  await page.evaluate(() => window.__mdAnnotator.undo());
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({
    comments: window.__mdAnnotator.State.annotations[0]?.comments?.length,
    pastLen: window.__mdAnnotator.State.history.past.length,
    futureLen: window.__mdAnnotator.State.history.future.length,
  }));
  assert(s.comments === 0, `undo 后 comments = ${s.comments} (期望 0)`);
  assert(s.pastLen === afterCreate.pastLen - 1, `past 减 1 (${s.pastLen} vs ${afterCreate.pastLen - 1})`);
  assert(s.futureLen === 1, `future 增 1 = ${s.futureLen}`);

  // redo
  await page.evaluate(() => window.__mdAnnotator.redo());
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({
    comments: window.__mdAnnotator.State.annotations[0]?.comments?.length,
    pastLen: window.__mdAnnotator.State.history.past.length,
    futureLen: window.__mdAnnotator.State.history.future.length,
  }));
  assert(s.comments === 1, `redo 后 comments = ${s.comments} (期望 1)`);
  assert(s.futureLen === 0, `future 清空 = ${s.futureLen}`);

  console.log('\n=== 3) resolve 操作的 undo ===');
  // 解决 → 撤销 → 撤销后 resolved=false
  await page.evaluate(() => window.__mdAnnotator.State.annotations[0].resolved = false);  // 改回去先
  await page.evaluate(() => {
    const tid = window.__mdAnnotator.State.annotations[0].threadId;
    window.__mdAnnotator.pushHistory();
    window.__mdAnnotator.State.annotations[0].resolved = true;
  });
  await page.waitForTimeout(200);
  s = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].resolved);
  assert(s === true, `resolved = true`);
  await page.evaluate(() => window.__mdAnnotator.undo());
  await page.waitForTimeout(200);
  s = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].resolved);
  assert(s === false, `undo 后 resolved = ${s} (期望 false)`);

  console.log('\n=== 4) rebuildAnnotationMarks: undo 后 doc 内 mark 同步 ===');
  // 验证 doc 中 mark 数跟 annotations 对应
  const markCount = await page.evaluate(() => {
    let count = 0;
    window.__mdAnnotator.State.editor.state.doc.descendants((node) => {
      node.marks.forEach(m => { if (m.type.name === 'annotation') count++; });
    });
    return count;
  });
  assert(markCount === 1, `doc 内 annotation mark 数 = ${markCount} (期望 1)`);

  // 撤销到底 (annotations 长度 0) → mark 也应清
  await page.evaluate(() => {
    while (window.__mdAnnotator.State.history.past.length > 0) window.__mdAnnotator.undo();
  });
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({
    annCount: window.__mdAnnotator.State.annotations.length,
    markCount: (() => {
      let count = 0;
      window.__mdAnnotator.State.editor.state.doc.descendants((node) => {
        node.marks.forEach(m => { if (m.type.name === 'annotation') count++; });
      });
      return count;
    })(),
  }));
  assert(s.annCount === 0, `全部 undo 后 annotations = ${s.annCount} (期望 0)`);
  assert(s.markCount === 0, `全部 undo 后 mark = ${s.markCount} (期望 0, rebuildAnnotationMarks 工作)`);

  console.log('\n=== 5) history 容量 100: 第 101 个 push 丢弃最早 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('cap.md', 'capacity test text', null);
  });
  await page.waitForTimeout(500);
  // 连续 push 110 次 (push 空 state)
  await page.evaluate(() => {
    for (let i = 0; i < 110; i++) window.__mdAnnotator.pushHistory();
  });
  s = await page.evaluate(() => window.__mdAnnotator.State.history.past.length);
  assert(s === 100, `past 容量 = ${s} (期望 100, capacity 触发 shift)`);

  console.log('\n=== 6) 切文件清空 history ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('new.md', 'fresh', null);
  });
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({
    past: window.__mdAnnotator.State.history.past.length,
    future: window.__mdAnnotator.State.history.future.length,
  }));
  assert(s.past === 0, `切文件后 past = ${s.past} (期望 0)`);
  assert(s.future === 0, `切文件后 future = ${s.future} (期望 0)`);
  assert(await page.locator('#btn-undo').isDisabled(), '切文件后 btn-undo disabled');
  assert(await page.locator('#btn-redo').isDisabled(), '切文件后 btn-redo disabled');

  console.log('\n=== 7) Ctrl+Alt+Z 快捷键 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('k.md', 'keyboard shortcut test', null);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus(1);
    ed.commands.setTextSelection({ from: 1, to: 5 });
  });
  await page.waitForTimeout(200);
  await page.locator('#float-comment-btn button').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ta = document.querySelector('[data-thread-input]');
    ta.value = 'kbd test';
    document.querySelector('button[data-act="submit-reply"]').click();
  });
  await page.waitForTimeout(300);
  const beforeKbd = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  assert(beforeKbd === 1, `创建后 1 个批注`);

  await page.keyboard.press('Control+Alt+z');
  await page.waitForTimeout(300);
  let afterKbd = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  assert(afterKbd === 1, `Ctrl+Alt+Z 撤销 reply: annotations = ${afterKbd} (期望 1, 批注还在, reply 撤销)`);

  // 再 undo 撤销批注本身
  await page.keyboard.press('Control+Alt+z');
  await page.waitForTimeout(300);
  afterKbd = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  assert(afterKbd === 0, `第二次 Ctrl+Alt+Z 撤销批注本身: annotations = ${afterKbd} (期望 0)`);

  // redo 1 次 → 批注本身回来 (空批注, 无 reply)
  await page.keyboard.press('Control+Alt+Shift+z');
  await page.waitForTimeout(300);
  const afterKbdRedo = await page.evaluate(() => window.__mdAnnotator.State.annotations.length);
  assert(afterKbdRedo === 1, `Ctrl+Alt+Shift+Z 重做批注: annotations = ${afterKbdRedo} (期望 1, 批注本身回来)`);

  // redo 2 次 → reply 一起回来
  await page.keyboard.press('Control+Alt+Shift+z');
  await page.waitForTimeout(300);
  const afterKbdRedo2 = await page.evaluate(() => {
    const anns = window.__mdAnnotator.State.annotations;
    return { count: anns.length, comments: anns[0]?.comments?.length };
  });
  assert(afterKbdRedo2.count === 1, `第 2 次 redo: annotations = ${afterKbdRedo2.count} (期望 1)`);
  assert(afterKbdRedo2.comments === 1, `第 2 次 redo: comments = ${afterKbdRedo2.comments} (期望 1, reply 一起回来)`);

  console.log('\n=== 8) autosaveNow: handle + dirty=true → markClean ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.currentFile = window.__mdAnnotator.State.currentFile || {};
    window.__mdAnnotator.State.currentFile.handle = {
      name: 'fake.mentor', kind: 'file',
      queryPermission: async () => 'granted',
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    };
    window.__mdAnnotator.State.currentFile.name = 'fake.mentor';
    window.__mdAnnotator.State.currentFile.dirty = true;
    window.__mdAnnotator.State.saveMode = 'mentor-handle';
  });
  await page.evaluate(() => window.__mdAnnotator.autosaveNow());
  await page.waitForTimeout(300);
  const afterAuto = await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty);
  assert(afterAuto === false, `autosave 后 dirty = ${afterAuto} (期望 false)`);

  console.log('\n=== 9) autosaveNow: download 模式不写 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.saveMode = 'mentor-download';
    window.__mdAnnotator.State.currentFile.dirty = true;
  });
  await page.evaluate(() => window.__mdAnnotator.autosaveNow());
  await page.waitForTimeout(200);
  const afterDownload = await page.evaluate(() => window.__mdAnnotator.State.currentFile.dirty);
  assert(afterDownload === true, `download 模式 autosave 不写: dirty 仍 = ${afterDownload} (期望 true)`);

  console.log('\n=== 10) autosaveNow: dirty=false 不写 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.saveMode = 'mentor-handle';
    window.__mdAnnotator.State.currentFile.dirty = false;
  });
  // 把 writable 调用计数, 验证没被调
  let writeCallCount = 0;
  await page.evaluate(() => {
    const origHandle = window.__mdAnnotator.State.currentFile.handle;
    window.__mdAnnotator.State.currentFile.handle = {
      name: 'fake.mentor', kind: 'file',
      queryPermission: async () => 'granted',
      createWritable: async () => ({
        write: async () => { window.__writeCalled = (window.__writeCalled || 0) + 1; },
        close: async () => {},
      }),
    };
  });
  await page.evaluate(() => window.__mdAnnotator.autosaveNow());
  await page.waitForTimeout(200);
  const writeCalls = await page.evaluate(() => window.__writeCalled || 0);
  assert(writeCalls === 0, `dirty=false 时 write 次数 = ${writeCalls} (期望 0)`);

  console.log('\n=== 11) 页面无 JS 错误 ===');
  assert(pageErrors.length === 0, `page errors = ${pageErrors.length} (期望 0); errors=${JSON.stringify(pageErrors)}`);

  console.log('\n✓ 全部 11 步通过');
  await browser.close();
})().catch(e => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
