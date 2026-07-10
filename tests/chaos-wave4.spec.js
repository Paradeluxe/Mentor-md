// Mentor v1.40 chaos wave 4 — user workflow & integration tests
const { chromium } = require('playwright');

const URL = `http://localhost:8765/index.html?v=106`;

async function setupEditor(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function resetInPage(page, html) {
  await page.evaluate((h) => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.setContent(h || '<p>开始文本ABCDEFGH标记段HIJKLMN结束</p>');
    window.__mdAnnotator.State.annotations = [];
    window.__mdAnnotator.State.activeThreadId = null;
  }, html);
}

async function runScenario(browser, name, scenarioFn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
  let result;
  try {
    await setupEditor(page);
    result = await Promise.race([
      scenarioFn(page),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_60s')), 60000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors };
}

// === W4-01: 创建 mark → 输入评论 → resolve → 重新打开 ===
async function W4_01_full_thread_lifecycle(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w4-01', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-01', range: { from: 13, to: 16 }, text: '标记段',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 100));
    // 找 resolve 按钮
    const resolveBtn = document.querySelector('[data-act="resolve"][data-thread="w4-01"]');
    if (!resolveBtn) return { error: 'no resolve btn' };
    resolveBtn.click();
    await new Promise(r => setTimeout(r, 100));
    const resolved = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'w4-01')?.resolved;
    // 再点击 (重新打开)
    const reopenBtn = document.querySelector('[data-act="resolve"][data-thread="w4-01"]');
    if (reopenBtn) reopenBtn.click();
    await new Promise(r => setTimeout(r, 100));
    const reopened = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'w4-01')?.resolved;
    return { resolved, reopened, cycle: resolved === true && reopened === false };
  });
}

// === W4-02: 删除批注 (走 menu 路径) ===
async function W4_02_delete_thread(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w4-02', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-02', range: { from: 13, to: 16 }, text: '标记段',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 100));
    // 用 API 删
    const before = window.__mdAnnotator.State.annotations.length;
    try {
      window.__mdAnnotator._testDeleteThread('w4-02');
    } catch (e) { return { error: 'delete failed: ' + e.message }; }
    await new Promise(r => setTimeout(r, 100));
    const after = window.__mdAnnotator.State.annotations.length;
    return { before, after, deleted: after === before - 1 };
  });
}

// === W4-03: 添加回复 + submit ===
async function W4_03_add_reply(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w4-03', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-03', range: { from: 13, to: 16 }, text: '标记段',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 100));
    // 找 textarea
    const ta = document.querySelector(`[data-thread-input="w4-03"]`);
    if (!ta) return { error: 'no textarea' };
    ta.value = '这是我的评论内容';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    // 找 submit 按钮
    const submit = document.querySelector('[data-act="submit-reply"][data-thread="w4-03"]');
    if (!submit) return { error: 'no submit btn' };
    if (submit.disabled) return { error: 'submit disabled' };
    submit.click();
    await new Promise(r => setTimeout(r, 100));
    const ann = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'w4-03');
    return { commentCount: ann?.comments?.length, firstBody: ann?.comments?.[0]?.body };
  });
}

// === W4-04: 复制引文 ===
async function W4_04_copy_quote(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w4-04', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-04', range: { from: 13, to: 16 }, text: '需要复制的引文内容',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 100));
    // 直接调 __mdAnnotator API
    const text = window.__mdAnnotator.ai.getThread('w4-04')?.text;
    return { quoteText: text, found: !!text };
  });
}

// === W4-05: 列表 thread (调用 __mdAnnotator.listThreads) ===
async function W4_05_list_threads(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w4-05a', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({ threadId: 'w4-05a', range: { from: 13, to: 16 }, text: 'A', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() });
    // 第二个
    const tr2 = ed.state.tr;
    tr2.addMark(18, 21, ed.schema.marks.annotation.create({ threadId: 'w4-05b', resolved: true, authorColor: 1 }));
    ed.view.dispatch(tr2);
    window.__mdAnnotator.State.annotations.push({ threadId: 'w4-05b', range: { from: 18, to: 21 }, text: 'B', prefix: '', suffix: '', resolved: true, comments: [], createdAt: new Date().toISOString() });
    const all = window.__mdAnnotator.ai.listThreads({ filter: 'all' });
    const open = window.__mdAnnotator.ai.listThreads({ filter: 'open' });
    const resolved = window.__mdAnnotator.ai.listThreads({ filter: 'resolved' });
    return { all: all.length, open: open.length, resolved: resolved.length };
  });
}

// === W4-06: 文件路径含中文 / 长路径 ===
async function W4_06_chinese_filename(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // 模拟文件名变化 — 通过 State.fileHandle?.name
    if (window.__mdAnnotator.State.fileHandle) {
      window.__mdAnnotator.State.fileHandle.name = '中文文件名测试.mentor';
    }
    // 不应该崩
    return { ok: true, name: window.__mdAnnotator.State.fileHandle?.name };
  });
}

// === W4-07: 反复创建+删除 thread, 看内存 ===
async function W4_07_create_delete_storm(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // 创建 30 个, 删 30 个
    for (let i = 0; i < 30; i++) {
      const tr = ed.state.tr;
      const from = 13 + (i % 5);
      const to = from + 3;
      if (to >= ed.state.doc.content.size) break;
      tr.addMark(from, to, ed.schema.marks.annotation.create({ threadId: `w4-07-${i}`, resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: `w4-07-${i}`, range: { from, to }, text: 'x',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
    }
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 100));
    // 删所有
    for (let i = 0; i < 30; i++) {
      try { window.__mdAnnotator._testDeleteThread(`w4-07-${i}`); } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 100));
    return { final: window.__mdAnnotator.State.annotations.length, docSize: ed.state.doc.content.size };
  });
}

// === W4-08: LocalStorage / IDB 损坏 ===
async function W4_08_corrupt_storage(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // 写入垃圾到 localStorage
    localStorage.setItem('mentor-draft', 'not valid JSON {{{');
    localStorage.setItem('mentor-author', JSON.stringify({ broken: true }));
    // 触发可能读这些的代码
    try { window.__mdAnnotator.State.author = 'test'; } catch (e) {}
    return { ls: localStorage.getItem('mentor-draft')?.slice(0, 30) };
  });
}

// === W4-09: doc 含表格 + mark ===
async function W4_09_table_mark(page) {
  await resetInPage(page, '<table><tr><td>Cell 1 ABC</td><td>Cell 2 DEF</td></tr></table>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    let abcPos = null;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText && n.text.includes('ABC') && !abcPos) abcPos = pos;
    });
    const tr = ed.state.tr;
    tr.addMark(abcPos + 6, abcPos + 9, ed.schema.marks.annotation.create({ threadId: 'w4-09', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-09', range: { from: abcPos + 6, to: abcPos + 9 }, text: 'ABC',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(abcPos + 7);
    await new Promise(r => setTimeout(r, 100));
    const me = document.querySelector('[data-thread-id="w4-09"]');
    if (!me) return { error: 'mark not found' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W4-10: image 节点 + mark 临近 ===
async function W4_10_image_near_mark(page) {
  await resetInPage(page, '<p>前面 <img src="data:image/png;base64,iVBORw0KGgo=" alt="x" /> 后面ABC</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const pos = ed.state.doc.textContent.indexOf('ABC');
    const tr = ed.state.tr;
    tr.addMark(pos, pos + 3, ed.schema.marks.annotation.create({ threadId: 'w4-10', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-10', range: { from: pos, to: pos + 3 }, text: 'ABC',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(pos + 1);
    await new Promise(r => setTimeout(r, 100));
    return { ok: true, docSize: ed.state.doc.content.size };
  });
}

// === W4-11: 输入框 focus + 失焦反复 ===
async function W4_11_focus_blur_loop(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w4-11', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w4-11', range: { from: 13, to: 16 }, text: 'x',
      prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 80));
    const ta = document.querySelector(`[data-thread-input="w4-11"]`);
    if (!ta) return { error: 'no ta' };
    for (let i = 0; i < 30; i++) {
      ta.focus();
      ta.blur();
    }
    await new Promise(r => setTimeout(r, 100));
    return { ok: true, drafts: Object.keys(window.__mdAnnotator.State.replyDrafts || {}).length };
  });
}

// === W4-12: 跨 window/iframe 环境 (跨 realm) ===
async function W4_12_cross_realm(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // 用 iframe 跨 realm 调用
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    let result;
    try {
      win.__mdAnnotator = window.__mdAnnotator;
      result = win.__mdAnnotator.State.editor.state.doc.textContent.length;
    } catch (e) { result = 'err: ' + e.message; }
    document.body.removeChild(iframe);
    return { result };
  });
}

// === W4-13: service worker 注册 / IndexedDB 错误 ===
async function W4_13_idb_error(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // 模拟 IDB open 失败 — 不直接能模拟, 但能测 State.IDB 字段
    if (window.__mdAnnotator.State.IDB) {
      // 关闭 db 强制重连
      try { window.__mdAnnotator.State.IDB.close(); } catch (e) {}
    }
    return { hasIDB: !!window.__mdAnnotator.State.IDB };
  });
}

// === W4-14: ⌘+Z / Ctrl+Z 反复触发 ===
async function W4_14_undo_redo_storm(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    let result = [];
    for (let i = 0; i < 10; i++) {
      ed.commands.insertContent('A');
      ed.commands.undo();
      ed.commands.redo();
      ed.commands.undo();
    }
    await new Promise(r => setTimeout(r, 200));
    return { ok: true, docSize: ed.state.doc.content.size };
  });
}

// === W4-15: 全部 scenario 后内存检查 ===
async function W4_15_memory_check(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // 创建大量 mark 看内存增长
    const ed = window.__mdAnnotator.State.editor;
    const initial = performance.memory?.usedJSHeapSize || 0;
    for (let i = 0; i < 200; i++) {
      const tr = ed.state.tr;
      tr.addMark(13, 14, ed.schema.marks.annotation.create({ threadId: `w4-15-${i}`, resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
    }
    await new Promise(r => setTimeout(r, 200));
    const after = performance.memory?.usedJSHeapSize || 0;
    return { initial, after, delta: after - initial, markCount: document.querySelectorAll('[data-thread-id^="w4-15-"]').length };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    W4_01_full_thread_lifecycle, W4_02_delete_thread, W4_03_add_reply, W4_04_copy_quote, W4_05_list_threads,
    W4_06_chinese_filename, W4_07_create_delete_storm, W4_08_corrupt_storage, W4_09_table_mark, W4_10_image_near_mark,
    W4_11_focus_blur_loop, W4_12_cross_realm, W4_13_idb_error, W4_14_undo_redo_storm, W4_15_memory_check,
  ];
  const results = [];
  for (const sc of scenarios) {
    const r = await runScenario(browser, sc.name, sc);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    console.log(`${passed ? '✓' : '✗'} ${r.name} ${r.result.threw ? '— ' + r.result.threw : ''}`);
    if (r.errors.length) console.log(`   errors: ${r.errors.slice(0, 2).join(' | ')}`);
    if (r.result && Object.keys(r.result).length > 0 && !r.result.threw) {
      console.log(`   ${JSON.stringify(r.result).slice(0, 250)}`);
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log(`TOTAL: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });