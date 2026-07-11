// Mentor v1.40 chaos wave 3 — really absurd stress tests
const { chromium } = require('playwright');

const { URL_BASE, CURRENT_VERSION } = require('./_config');
const URL = URL_BASE + '?v=' + CURRENT_VERSION;

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

// === W3-01: 嵌套 mark (mark 在 mark 内) - 应该允许, 因为 PM mark 可叠加 ===
async function W3_01_nested_marks(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    // 外层 13-20, 内层 14-18
    tr.addMark(13, 20, ed.schema.marks.annotation.create({ threadId: 'w3-01-outer', resolved: false, authorColor: 0 }));
    tr.addMark(14, 18, ed.schema.marks.annotation.create({ threadId: 'w3-01-inner', resolved: false, authorColor: 1 }));
    ed.view.dispatch(tr);
    await new Promise(r => setTimeout(r, 50));
    // 点击外层 mark 中间
    const me = document.querySelector('[data-thread-id="w3-01-outer"]');
    if (!me) return { error: 'outer mark not found' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return {
      pos: ed.state.selection.from,
      marks: ed.state.selection.$head.marks().map(m => ({ type: m.type.name, threadId: m.attrs.threadId })),
    };
  });
}

// === W3-02: mark 然后改 doc, mark 应该跟随 PM 重渲染 (auto-move) ===
async function W3_02_mark_survives_edit(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-02', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 在 mark 前插入文字 (mark 位置应右移)
    ed.commands.insertContentAt(5, 'XXX');
    await new Promise(r => setTimeout(r, 80));
    // 找 mark 新位置 (应该是 16-19)
    const me = document.querySelector('[data-thread-id="w3-02"]');
    if (!me) return { error: 'mark lost after edit' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W3-03: 切 filter tab 时 mark 状态保持 ===
async function W3_03_filter_tabs(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-03', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 切 filter tab
    const allBtn = document.querySelector('[data-count-for="all"]');
    if (allBtn) allBtn.click();
    await new Promise(r => setTimeout(r, 50));
    const openBtn = document.querySelector('[data-count-for="open"]');
    if (openBtn) openBtn.click();
    await new Promise(r => setTimeout(r, 50));
    const me = document.querySelector('[data-thread-id="w3-03"]');
    return { markExists: !!me, filterOpen: window.__mdAnnotator.State.filterOpen, filterResolved: window.__mdAnnotator.State.filterResolved };
  });
}

// === W3-04: AI protocol 接口被反复调用 (emitAI storm) ===
async function W3_04_ai_storm(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    let aiCalls = 0;
    const origEmit = window.__mdAnnotator.emitAI || window.emitAI;
    // 模拟 emitAI — 不直接调用, 触发 updateDocMeta 多次
    const ed = window.__mdAnnotator.State.editor;
    for (let i = 0; i < 50; i++) {
      ed.commands.insertContent('A');
    }
    await new Promise(r => setTimeout(r, 100));
    return { docSize: ed.state.doc.content.size, content: ed.state.doc.textContent.length };
  });
}

// === W3-05: mark + 复制粘贴内容包含 mark (PM transformPasted) ===
async function W3_05_paste_preserves_mark(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // 先创建源 mark
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-05-src', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 复制 mark 区域到位置 18
    ed.commands.setTextSelection({ from: 13, to: 16 });
    const slice = ed.state.selection.content();
    ed.commands.setTextSelection(18);
    ed.commands.insertContent(slice.content.toJSON ? slice.content.toJSON() : slice.content);
    await new Promise(r => setTimeout(r, 100));
    // 检查是否生成了新的 mark
    const marks = document.querySelectorAll('[data-thread-id="w3-05-src"]').length;
    return { markCount: marks, docSize: ed.state.doc.content.size };
  });
}

// === W3-06: window resize 多次 ===
async function W3_06_resize_storm(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-06', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // resize 50 次
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(new Event('resize'));
      await new Promise(r => setTimeout(r, 10));
    }
    const me = document.querySelector('[data-thread-id="w3-06"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W3-07: 在 mark 内连续拖选 (mousedown→mousemove→mouseup) ===
async function W3_07_drag_select_in_mark(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-07', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w3-07"]');
    const r = me.getBoundingClientRect();
    // mousedown
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 1, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 30));
    // mousemove to right edge
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: r.right - 1, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 30));
    // mouseup
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: r.right - 1, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { selection: { from: ed.state.selection.from, to: ed.state.selection.to }, empty: ed.state.selection.empty };
  });
}

// === W3-08: mark + contenteditable=false 嵌套 ===
async function W3_08_mark_around_codeblock(page) {
  await resetInPage(page, '<p>上面ABC</p><pre><code>code block 1</code></pre><p>下面DEF</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // 用 nodesBetween 找 ABC / DEF 精确位置
    let abcPos = null, defPos = null;
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText) return;
      const idx = n.text.indexOf('ABC');
      if (idx >= 0 && abcPos === null) abcPos = pos + idx;
      const idx2 = n.text.indexOf('DEF');
      if (idx2 >= 0 && defPos === null) defPos = pos + idx2;
    });
    if (abcPos === null || defPos === null) return { error: 'text not found', abcPos, defPos };
    const tr = ed.state.tr;
    tr.addMark(abcPos, abcPos + 3, ed.schema.marks.annotation.create({ threadId: 'w3-08a', resolved: false, authorColor: 0 }));
    tr.addMark(defPos, defPos + 3, ed.schema.marks.annotation.create({ threadId: 'w3-08b', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    await new Promise(r => setTimeout(r, 50));
    const meA = document.querySelector('[data-thread-id="w3-08a"]');
    const meB = document.querySelector('[data-thread-id="w3-08b"]');
    if (!meA || !meB) return { error: 'marks missing', foundA: !!meA, foundB: !!meB };
    const rA = meA.getBoundingClientRect();
    const rB = meB.getBoundingClientRect();
    meA.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: rA.left + 2, clientY: rA.top + rA.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const posA = ed.state.selection.from;
    meB.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: rB.left + 2, clientY: rB.top + rB.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const posB = ed.state.selection.from;
    return { posA, posB, hasMarkA: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W3-09: mark + State.expandedThreadIds / manuallyCollapsedIds 状态 ===
async function W3_09_collapsed_state(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-09', resolved: true, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.annotations.push({
      threadId: 'w3-09', range: { from: 13, to: 16 }, text: '标记段',
      prefix: '', suffix: '', resolved: true, comments: [], createdAt: new Date().toISOString(),
    });
    // 触发 renderCommentList 通过 selection change
    ed.commands.setTextSelection(14);
    await new Promise(r => setTimeout(r, 150));
    const card = document.querySelector('[data-thread="w3-09"]');
    if (!card) return { error: 'no card', count: document.querySelectorAll('[data-thread]').length, annLen: window.__mdAnnotator.State.annotations.length };
    const initialClass = card.className;
    const quote = card.querySelector('.comment-quote');
    if (quote) quote.click();
    await new Promise(r => setTimeout(r, 80));
    const afterClass = document.querySelector('[data-thread="w3-09"]')?.className;
    return { initialClass, afterClass, cardFound: true };
  });
}

// === W3-10: 文本超长 (1000 chars 单段) ===
async function W3_10_very_long_text(page) {
  await resetInPage(page, '<p>' + '测'.repeat(1000) + 'TARGET' + '字'.repeat(1000) + '</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const pos = ed.state.doc.textContent.indexOf('TARGET');
    const tr = ed.state.tr;
    tr.addMark(pos + 1, pos + 5, ed.schema.marks.annotation.create({ threadId: 'w3-10', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w3-10"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), docSize: ed.state.doc.content.size };
  });
}

// === W3-11: mark + drag handle (浮动按钮) ===
async function W3_11_float_button(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-11', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="w3-11"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    // 检查 float-comment-btn 是否显示
    const btn = document.querySelector('#float-comment-btn');
    const visible = btn && !btn.classList.contains('hidden');
    return { hasFloatBtn: !!btn, visible, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W3-12: 大纲跳转 ===
async function W3_12_outline_jump(page) {
  await resetInPage(page, '<h1>章节1</h1><p>内容1</p><h2>小节1.1</h2><p>内容2 ABC</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    const pos = ed.state.doc.textContent.indexOf('ABC');
    tr.addMark(pos, pos + 3, ed.schema.marks.annotation.create({ threadId: 'w3-12', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 模拟大纲跳转 — 通过设置 selection
    ed.commands.setTextSelection(1);
    await new Promise(r => setTimeout(r, 30));
    const me = document.querySelector('[data-thread-id="w3-12"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W3-13: mark + 反复 trigger selectionUpdate ===
async function W3_13_selection_storm(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-13', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 反复触发 selection
    for (let i = 0; i < 200; i++) {
      ed.commands.setTextSelection(i % 16);
    }
    await new Promise(r => setTimeout(r, 200));
    const me = document.querySelector('[data-thread-id="w3-13"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

// === W3-14: 多 mark 跨段后, 在中间段落点击 ===
async function W3_14_marks_across_with_gap(page) {
  await resetInPage(page, '<p>P1ABC</p><p>P2中间</p><p>P3DEF</p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    let abcPos = null, defPos = null;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText && n.text.includes('ABC') && !abcPos) abcPos = pos;
      if (n.isText && n.text.includes('DEF') && !defPos) defPos = pos;
    });
    // 两个独立 mark (共享 threadId 模拟 multi-paragraph)
    tr.addMark(abcPos, abcPos + 3, ed.schema.marks.annotation.create({ threadId: 'w3-14', resolved: false, authorColor: 0 }));
    tr.addMark(defPos, defPos + 3, ed.schema.marks.annotation.create({ threadId: 'w3-14', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    await new Promise(r => setTimeout(r, 50));
    // 数 mark DOM 元素
    const marks = document.querySelectorAll('[data-thread-id="w3-14"]');
    return { markCount: marks.length, docSize: ed.state.doc.content.size };
  });
}

// === W3-15: 复制粘贴 mark 区域 (clipboard) ===
async function W3_15_clipboard(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 'w3-15', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    // 模拟 Ctrl+C + Ctrl+V
    ed.commands.setTextSelection({ from: 13, to: 16 });
    await new Promise(r => setTimeout(r, 30));
    const me = document.querySelector('[data-thread-id="w3-15"]');
    return { markCount: document.querySelectorAll('[data-thread-id="w3-15"]').length, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    W3_01_nested_marks, W3_02_mark_survives_edit, W3_03_filter_tabs, W3_04_ai_storm, W3_05_paste_preserves_mark,
    W3_06_resize_storm, W3_07_drag_select_in_mark, W3_08_mark_around_codeblock, W3_09_collapsed_state, W3_10_very_long_text,
    W3_11_float_button, W3_12_outline_jump, W3_13_selection_storm, W3_14_marks_across_with_gap, W3_15_clipboard,
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