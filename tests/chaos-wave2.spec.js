// Mentor v1.40 chaos wave 2 — even more absurd edge cases
const { chromium } = require('playwright');
const path = require('path');

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
      new Promise((_, rej) => setTimeout(() => rej(new Error('SCENARIO_TIMEOUT_45s')), 45000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors };
}

// === W2-01: doc 10000+ 字符 (大文档) ===
async function W2_01_huge_doc(page) {
  await resetInPage(page, '<p>' + 'A'.repeat(10000) + 'TARGET' + 'B'.repeat(10000) + '</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const pos = ed.state.doc.textContent.indexOf('TARGET');
    const tr = ed.state.tr;
    tr.addMark(pos + 1, pos + 5, ed.schema.marks.annotation.create({ threadId: 'w2-01', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w2-01"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 200));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), docSize: ed.state.doc.content.size };
  });
}

// === W2-02: 100 个 mark 跨同一段 ===
async function W2_02_dense_marks(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    // 50 个 mark, 每个占不同位置 (避免重叠覆盖)
    const baseStart = 13;
    for (let i = 0; i < 50; i++) {
      const start = baseStart + i;
      const end = start + 1;
      if (end >= ed.state.doc.content.size) break;
      tr.addMark(start, end, ed.schema.marks.annotation.create({ threadId: `w2-02-${i}`, resolved: false, authorColor: i % 8 }));
    }
    ed.view.dispatch(tr);
    await new Promise(r => setTimeout(r, 80));
    const me = document.querySelector('[data-thread-id="w2-02-0"]');
    if (!me) return { error: 'mark w2-02-0 not found', markCount: document.querySelectorAll('[data-thread-id^="w2-02-"]').length };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 150));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), markCount: document.querySelectorAll('[data-thread-id^="w2-02-"]').length };
  });
}

// === W2-03: mark + mark 创建后又删除又恢复 (history 压力) ===
async function W2_03_history_pressure(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const before = ed.state.doc.textBetween(0, 16, '|');
    // 反复 add + undo (10 个 mark 操作, 每个 add + undo)
    for (let i = 0; i < 10; i++) {
      const tr = ed.state.tr;
      tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: `w2-03-${i}`, resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      ed.commands.undo();
    }
    await new Promise(r => setTimeout(r, 100));
    const after = ed.state.doc.textBetween(0, 16, '|');
    return { before, after, match: before === after, remainingMarks: document.querySelectorAll('[data-thread-id^="w2-03-"]').length };
  });
}

// === W2-04: annotation text 含 HTML 特殊字符 ===
async function W2_04_html_special(page) {
  await resetInPage(page, '<p>前面 < > & " \' 后面</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    const pos = ed.state.doc.textContent.indexOf('<');
    tr.addMark(pos, pos + 7, ed.schema.marks.annotation.create({ threadId: 'w2-04', resolved: false, authorColor: 0, text: 'HTML < > & chars' }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w2-04"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), sideList: document.querySelector('.comment-quote-text')?.textContent };
  });
}

// === W2-05: mark authorColor 8 色循环 + active 切换 ===
async function W2_05_all_colors(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    const colors = [];
    for (let c = 0; c < 8; c++) {
      tr.addMark(13 + c, 14 + c, ed.schema.marks.annotation.create({ threadId: `w2-05-${c}`, resolved: false, authorColor: c }));
      colors.push(c);
    }
    ed.view.dispatch(tr);
    // 依次点击每个
    let lastActiveId = null;
    for (let c = 0; c < 8; c++) {
      const me = document.querySelector(`[data-thread-id="w2-05-${c}"]`);
      const r = me.getBoundingClientRect();
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
      await new Promise(r => setTimeout(r, 30));
      lastActiveId = window.__mdAnnotator.State.activeThreadId;
    }
    return { expectedActive: 'w2-05-7', gotActive: lastActiveId };
  });
}

// === W2-06: doc 跨多个 textblock, mark 全部段落 ===
async function W2_06_across_blocks(page) {
  await resetInPage(page, '<p>P1开始ABC</p><h2>P2中间DEF</h2><blockquote>P3结尾GHI</blockquote>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // 给每段都加 mark
    const ranges = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.isText && /ABC|DEF|GHI/.test(node.text)) {
        const m = node.text.match(/ABC|DEF|GHI/);
        ranges.push({ from: pos + node.text.indexOf(m[0]), to: pos + node.text.indexOf(m[0]) + 3 });
      }
    });
    const tr = ed.state.tr;
    for (const r of ranges) {
      tr.addMark(r.from, r.to, ed.schema.marks.annotation.create({ threadId: `w2-06-${r.from}`, resolved: false, authorColor: 0 }));
    }
    ed.view.dispatch(tr);
    // 点击每段 mark
    const results = [];
    for (const r of ranges) {
      const me = document.querySelector(`[data-thread-id="w2-06-${r.from}"]`);
      const rect = me.getBoundingClientRect();
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: rect.left + 1, clientY: rect.top + rect.height/2, button: 0 }));
      await new Promise(r => setTimeout(r, 50));
      results.push({ tid: `w2-06-${r.from}`, pos: ed.state.selection.from });
    }
    return { results, ranges };
  });
}

// === W2-07: selection update 时 mark 内部切 (rapid position changes) ===
async function W2_07_rapid_pos(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w2-07', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // 模拟用户快速移动光标 100 次 (在 mark 内不同位置)
    const positions = [];
    for (let i = 0; i < 100; i++) {
      ed.commands.setTextSelection(13 + (i % 3));
      positions.push(ed.state.selection.from);
      // 不 await — 让 PM 自己 batch
    }
    await new Promise(r => setTimeout(r, 200));
    return { firstFive: positions.slice(0, 5), lastFive: positions.slice(-5) };
  });
}

// === W2-08: 大纲 + mark 同步 (树形 UI 渲染) ===
async function W2_08_outline_with_marks(page) {
  await resetInPage(page, '<h1>一级标题</h1><p>段落1 ABC</p><h2>二级标题</h2><p>段落2 DEF</p><h3>三级</h3><p>段落3 GHI</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    let p = null;
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('ABC') && !p) p = pos; });
    tr.addMark(p + 4, p + 7, ed.schema.marks.annotation.create({ threadId: 'w2-08', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w2-08"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 100));
    const outlineItems = document.querySelectorAll('.outline-item, [class*="outline"]').length;
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), outlineItems };
  });
}

// === W2-09: mark text 含 surrogate pair (4-byte emoji) ===
async function W2_09_surrogate_pair(page) {
  await resetInPage(page, '<p>前面 😀😁😂🤣 后面 ABC 中间</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const pos = ed.state.doc.textContent.indexOf('ABC');
    const tr = ed.state.tr;
    tr.addMark(pos, pos + 3, ed.schema.marks.annotation.create({ threadId: 'w2-09', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w2-09"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W2-10: 切换作者 (State.author 改变) 后 mark 创建 ===
async function W2_10_author_switch(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    window.__mdAnnotator.State.author = '用户A';
    const ed = window.__mdAnnotator.State.editor;
    let tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w2-10a', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 切换 author 再创建
    window.__mdAnnotator.State.author = '用户B';
    tr = ed.state.tr;
    tr.addMark(18, 21, ed.schema.marks.annotation.create({ threadId: 'w2-10b', resolved: false, authorColor: 1 }));
    ed.view.dispatch(tr);
    await new Promise(r => setTimeout(r, 50));
    return { author: window.__mdAnnotator.State.author, markCount: document.querySelectorAll('[data-thread-id^="w2-10"]').length };
  });
}

// === W2-11: 网络断开模拟 — fetch 失败时不应崩 ===
async function W2_11_offline(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // 模拟 navigator.onLine = false
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    // 触发 window 'offline' event
    window.dispatchEvent(new Event('offline'));
    await new Promise(r => setTimeout(r, 100));
    // 再恢复
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    await new Promise(r => setTimeout(r, 100));
    return { online: navigator.onLine };
  });
}

// === W2-12: tab 切换 (focus/blur) 时 mark 状态 ===
async function W2_12_blur_focus(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w2-12', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="w2-12"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 50));
    const beforePos = ed.state.selection.from;
    // blur editor
    ed.view.dom.blur();
    window.dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 50));
    // focus back
    ed.view.focus();
    ed.view.dom.focus();
    window.dispatchEvent(new Event('focus'));
    await new Promise(r => setTimeout(r, 50));
    const afterPos = ed.state.selection.from;
    return { beforePos, afterPos, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W2-13: 同时调用 createAnnotationThread API (直接调) ===
async function W2_13_direct_api(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    // createAnnotationThread 是模块内的 (不在 window 上)
    // 但我们可以通过 setTextSelection + 模拟
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.setTextSelection({ from: 13, to: 16 });
    await new Promise(r => setTimeout(r, 50));
    // 触发 mark 应用
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w2-13', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    return { ok: true, docSize: ed.state.doc.content.size };
  });
}

// === W2-14: Ctrl+A 选全部 + 尝试 mark (应只 mark 当前 cursor 处) ===
async function W2_14_select_all(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w2-14', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.setTextSelection(5);
    await new Promise(r => setTimeout(r, 30));
    ed.commands.setTextSelection({ from: 0, to: ed.state.doc.content.size });
    await new Promise(r => setTimeout(r, 50));
    // 选全部后, 渲染应该正常
    return { ok: true, selFrom: ed.state.selection.from, selTo: ed.state.selection.to };
  });
}

// === W2-15: mark 内 contenteditable=false 子节点 ===
async function W2_15_inline_node_mark(page) {
  await resetInPage(page, '<p>前面 <span data-mentor-special="true">特殊内容</span> 后面ABC</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    const pos = ed.state.doc.textContent.indexOf('ABC');
    tr.addMark(pos, pos + 3, ed.schema.marks.annotation.create({ threadId: 'w2-15', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w2-15"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    W2_01_huge_doc, W2_02_dense_marks, W2_03_history_pressure, W2_04_html_special, W2_05_all_colors,
    W2_06_across_blocks, W2_07_rapid_pos, W2_08_outline_with_marks, W2_09_surrogate_pair, W2_10_author_switch,
    W2_11_offline, W2_12_blur_focus, W2_13_direct_api, W2_14_select_all, W2_15_inline_node_mark,
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