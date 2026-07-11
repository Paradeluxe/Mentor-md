// Mentor v1.39 chaos test — 40 scenarios, each isolated with try/catch
// Run each scenario in a fresh page.evaluate with separate timeouts.
// If a scenario hangs the page, the next browser context is fresh.

const { chromium } = require('playwright');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const { URL_BASE, CURRENT_VERSION } = require('./_config');
const URL = URL_BASE + '?v=' + CURRENT_VERSION;

async function setupEditor(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(800);  // 等待 MD load + IDB 预热
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
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });

  let result;
  try {
    await setupEditor(page);
    // 给每个 scenario 30s 超时
    result = await Promise.race([
      scenarioFn(page),
      new Promise((_, rej) => setTimeout(() => rej(new Error('SCENARIO_TIMEOUT_30s')), 30000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }

  await ctx.close();
  return { name, result, errors };
}

async function S01(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's01', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const me = document.querySelector('[data-thread-id="s01"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const ed = window.__mdAnnotator.State.editor;
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S02(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's02', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const me = document.querySelector('[data-thread-id="s02"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.right - 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const ed = window.__mdAnnotator.State.editor;
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S03_zero_length_mark(page) {
  await resetInPage(page);
  return await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 13, ed.schema.marks.annotation.create({ threadId: 's03', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    return { markEl: !!document.querySelector('[data-thread-id="s03"]') };
  });
}

async function S04_whole_doc_mark(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(1, ed.state.doc.content.size - 1, ed.schema.marks.annotation.create({ threadId: 's04', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="s04"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S05_rapid_clicks(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's05', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const positions = [];
    for (let i = 0; i < 50; i++) {
      const me = document.querySelector('[data-thread-id="s05"]');
      if (!me) break;
      const r = me.getBoundingClientRect();
      const x = r.left + (i % 2 ? 2 : r.width - 2);
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: r.top + r.height/2, button: 0 }));
      await new Promise(r => setTimeout(r, 8));
      const ed = window.__mdAnnotator.State.editor;
      positions.push(ed.state.selection.from);
    }
    return { first: positions.slice(0, 3), last: positions.slice(-3), unique: [...new Set(positions)].length };
  });
}

async function S06_spam_typing(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's06', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const me = document.querySelector('[data-thread-id="s06"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.insertContent('X'.repeat(200));
    await new Promise(r => setTimeout(r, 50));
    let xTotal = 0, xWithMark = 0;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) {
        if (n.text[i] === 'X') {
          xTotal++;
          if (n.marks.some(m => m.type.name === 'annotation')) xWithMark++;
        }
      }
    });
    return { xTotal, xWithMark };
  });
}

async function S07_enter_in_mark(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's07', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s07"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const before = ed.state.doc.textContent;
    try { ed.commands.splitBlock(); } catch (e) { return { threw: e.message }; }
    await new Promise(r => setTimeout(r, 50));
    return { before, after: ed.state.doc.textContent, changed: before !== ed.state.doc.textContent };
  });
}

async function S08_backspace_left(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's08', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s08"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const before = ed.state.doc.textContent;
    const handled = ed.commands.deleteRange({ from: ed.state.selection.from - 1, to: ed.state.selection.from });
    await new Promise(r => setTimeout(r, 50));
    return { before, after: ed.state.doc.textContent, handled: !!handled };
  });
}

async function S09_delete_right(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's09', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s09"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.right - 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const before = ed.state.doc.textContent;
    const handled = ed.commands.deleteRange({ from: ed.state.selection.from, to: ed.state.selection.from + 1 });
    await new Promise(r => setTimeout(r, 50));
    return { before, after: ed.state.doc.textContent, handled: !!handled };
  });
}

async function S10_select_delete_mark(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's10', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s10"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const before = ed.state.doc.textContent;
    ed.commands.setTextSelection({ from: ed.state.selection.from, to: 16 });
    ed.commands.deleteSelection();
    await new Promise(r => setTimeout(r, 50));
    return { before, after: ed.state.doc.textContent, markStillExists: !!document.querySelector('[data-thread-id="s10"]') };
  });
}

async function S11_overlapping_marks(page) {
  await resetInPage(page);
  return await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's11a', resolved: false, authorColor: 0 }));
    tr.addMark(14, 15, ed.schema.marks.annotation.create({ threadId: 's11b', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    let middleChar = null;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) {
        if (pos + i === 14 && !middleChar) middleChar = { ch: n.text[i], marks: n.marks.map(m => m.type.name) };
      }
    });
    return { middleChar };
  });
}

async function S12_click_outside_mark(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's12', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const pmEl = document.querySelector('.ProseMirror');
    const r = pmEl.getBoundingClientRect();
    pmEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 5, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, activeId: window.__mdAnnotator.State.activeThreadId };
  });
}

async function S13_h1_mark(page) {
  await resetInPage(page, '<h1>标题ABC文字DEF</h1>');
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(5, 8, ed.schema.marks.annotation.create({ threadId: 's13', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s13"]');
    if (!me) return { error: 'no mark el' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S14_list_item_mark(page) {
  await resetInPage(page, '<ul><li>列表项ABC</li></ul>');
  const pos = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    let p = null;
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('ABC') && !p) p = pos; });
    if (p !== null) {
      const tr = ed.state.tr;
      tr.addMark(p + 4, p + 7, ed.schema.marks.annotation.create({ threadId: 's14', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
    }
    return p;
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s14"]');
    if (!me) return { error: 'no mark el' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S15_blockquote_mark(page) {
  await resetInPage(page, '<blockquote>引用文字ABC内容</blockquote>');
  const pos = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    let p = null;
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('ABC') && !p) p = pos; });
    if (p !== null) {
      const tr = ed.state.tr;
      tr.addMark(p + 4, p + 7, ed.schema.marks.annotation.create({ threadId: 's15', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
    }
    return p;
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s15"]');
    if (!me) return { error: 'no mark el' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S16_emoji_mark(page) {
  await resetInPage(page, '<p>测试 😀🎉💻 符号 ✨⭐ 文字</p>');
  const pos = await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    let p = null;
    ed.state.doc.descendants((n, pos) => { if (n.isText && /😀/.test(n.text) && !p) p = pos; });
    if (p !== null) {
      const tr = ed.state.tr;
      tr.addMark(p, p + 4, ed.schema.marks.annotation.create({ threadId: 's16', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
    }
    return p;
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s16"]');
    if (!me) return { error: 'no mark el', emojiPos: pos };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S17_huge_mark(page) {
  await resetInPage(page, '<p>' + 'A'.repeat(500) + 'MIDDLE' + 'B'.repeat(500) + '</p>');
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    let p = null;
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('MIDDLE') && !p) p = pos; });
    if (p !== null) {
      const tr = ed.state.tr;
      tr.addMark(p, p + 6, ed.schema.marks.annotation.create({ threadId: 's17', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
    }
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s17"]');
    if (!me) return { error: 'no mark' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), width: r.width };
  });
}

async function S18_corrupted_annotations(page) {
  await resetInPage(page);
  page.on('pageerror', e => console.log('  [S18 pageerror]', e.message));
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    window.__mdAnnotator.State.annotations = [null, { threadId: 'a' }, { threadId: 'b', range: null }, { threadId: 'c', range: { from: 999, to: 1000 } }, { threadId: 'd', range: { from: -5, to: 5 } }, 'string'];
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's18', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="s18"]');
    const r = me.getBoundingClientRect();
    let clickError = null;
    try {
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    } catch (e) { clickError = e.message; }
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, activeId: window.__mdAnnotator.State.activeThreadId, annLen: window.__mdAnnotator.State.annotations.length, clickError };
  });
}

async function S19_extend_by_typing(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's19', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s19"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.right - 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    ed.commands.insertContent('XYZ');
    await new Promise(r => setTimeout(r, 50));
    let withMark = 0, without = 0;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) {
        if ('XYZ'.includes(n.text[i])) {
          if (n.marks.some(m => m.type.name === 'annotation')) withMark++;
          else without++;
        }
      }
    });
    return { withMark, without };
  });
}

async function S20_cross_boundary_selection(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's20', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.setTextSelection({ from: 5, to: 14 });
    const sel = ed.state.selection;
    let withMark = 0, without = 0;
    ed.state.doc.nodesBetween(5, 14, (n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) {
        if (n.marks.some(m => m.type.name === 'annotation')) withMark++;
        else without++;
      }
    });
    return { from: sel.from, to: sel.to, withMark, without };
  });
}

async function S21_undo_after_insert(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's21', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s21"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    ed.commands.insertContent('Q');
    ed.commands.undo();
    await new Promise(r => setTimeout(r, 50));
    return { markStillExists: !!document.querySelector('[data-thread-id="s21"]') };
  });
}

async function S22_100_marks(page) {
  await resetInPage(page, '<p>' + Array.from({length: 100}, (_, i) => `段${i}`).join('') + '</p>');
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    let cnt = 0;
    ed.state.doc.descendants((node, p) => {
      if (node.isText && node.text.length >= 2) {
        for (let i = 0; i + 2 <= node.text.length; i += 2) {
          if (cnt >= 100) return false;
          tr.addMark(p + i, p + i + 2, ed.schema.marks.annotation.create({ threadId: `s22-${cnt}`, resolved: false, authorColor: cnt % 8 }));
          cnt++;
        }
      }
    });
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s22-0"]');
    if (!me) return { error: 'no mark' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 150));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S23_click_bubble(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's23', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const bubble = document.querySelector('.annotation-bubble');
    if (bubble) {
      const br = bubble.getBoundingClientRect();
      bubble.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: br.left + br.width/2, clientY: br.top + br.height/2, button: 0 }));
    }
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation'), bubbleFound: !!bubble };
  });
}

async function S24_concurrent_different_marks(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's24a', resolved: false, authorColor: 0 }));
    tr.addMark(18, 21, ed.schema.marks.annotation.create({ threadId: 's24b', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const me1 = document.querySelector('[data-thread-id="s24a"]');
    const r1 = me1.getBoundingClientRect();
    me1.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r1.left + 2, clientY: r1.top + r1.height/2, button: 0 }));
    const me2 = document.querySelector('[data-thread-id="s24b"]');
    const r2 = me2.getBoundingClientRect();
    me2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r2.left + 2, clientY: r2.top + r2.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { activeId: window.__mdAnnotator.State.activeThreadId };
  });
}

async function S25_readonly(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's25', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    ed.setEditable(false);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s25"]');
    const r = me.getBoundingClientRect();
    const before = ed.state.selection.from;
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const after = ed.state.selection.from;
    ed.setEditable(true);
    return { before, after, isEditable: ed.isEditable };
  });
}

async function S26_right_click(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's26', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s26"]');
    const r = me.getBoundingClientRect();
    const before = ed.state.selection.from;
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 2 }));
    await new Promise(r => setTimeout(r, 80));
    return { before, after: ed.state.selection.from };
  });
}

async function S27_zero_height(page) {
  await resetInPage(page, '<p></p>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(1, 1, ed.schema.marks.annotation.create({ threadId: 's27', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="s27"]');
    const r = me ? me.getBoundingClientRect() : null;
    if (me) {
      try {
        me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: 100, clientY: 100, button: 0 }));
      } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 80));
    return { markExists: !!me, rect: r ? { w: r.width, h: r.height } : null };
  });
}

async function S28_mouseup_only(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's28', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s28"]');
    const r = me.getBoundingClientRect();
    const before = ed.state.selection.from;
    me.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { before, after: ed.state.selection.from };
  });
}

async function S29_resolved_mark(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's29', resolved: true, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s29"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S30_click_same_mark_twice(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's30', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const me = document.querySelector('[data-thread-id="s30"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const a = window.__mdAnnotator.State.activeThreadId;
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.right - 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    const b = window.__mdAnnotator.State.activeThreadId;
    return { first: a, second: b, stable: a === b };
  });
}

async function S31_undo_past_mark(page) {
  await resetInPage(page, '<p>原始文字</p>');
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(2, 4, ed.schema.marks.annotation.create({ threadId: 's31', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const before = ed.state.doc.textContent;
    ed.commands.undo();
    await new Promise(r => setTimeout(r, 50));
    return { before, after: ed.state.doc.textContent, markStillExists: !!document.querySelector('[data-thread-id="s31"]') };
  });
}

async function S32_external_tr(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's32', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s32"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    const extTr = ed.state.tr.insertText('Q', 1);
    ed.view.dispatch(extTr);
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S33_huge_annotations(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's33', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const big = [];
    for (let i = 0; i < 10000; i++) big.push({ threadId: `noise-${i}`, range: { from: 0, to: 0 }, text: 'noise', comments: [], resolved: false, prefix: '', suffix: '', createdAt: '2026-01-01' });
    window.__mdAnnotator.State.annotations = big;
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s33"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 200));
    return { annCount: window.__mdAnnotator.State.annotations.length, pos: ed.state.selection.from };
  });
}

async function S34_minimal_1char(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 14, ed.schema.marks.annotation.create({ threadId: 's34', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s34"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width/2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S35_link_plus_annotation(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's35', resolved: false, authorColor: 0 }));
    try {
      tr.addMark(13, 16, ed.schema.marks.link.create({ href: 'https://example.com' }));
    } catch (e) {
      return { error: 'no link mark: ' + e.message };
    }
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="s35"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, marks: ed.state.selection.$head.marks().map(m => m.type.name) };
  });
}

async function S36_repeated_setContent(page) {
  await resetInPage(page);
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // addMark 在每个 setContent 后的稳定位置 ('AB' 在 'ABCDEFG' 中)
    for (let i = 0; i < 20; i++) {
      ed.commands.setContent('<p>迭代 ' + i + ' 文字ABCDEFGHIJ</p>');
      // 'AB' 在 '迭代 i 文字' 之后, 位置约 6+i (中文 + 数字长度变化)
      // 用更鲁棒的方法: 用 string find
      const pos = ed.state.doc.textContent.indexOf('AB');
      if (pos >= 0) {
        const tr = ed.state.tr;
        tr.addMark(pos + 1, pos + 3, ed.schema.marks.annotation.create({ threadId: 's36-' + i, resolved: false, authorColor: 0 }));
        ed.view.dispatch(tr);
      }
    }
    await new Promise(r => setTimeout(r, 50));
    // 找最后那个 mark (i=19, threadId 's36-19')
    const me = document.querySelector('[data-thread-id="s36-19"]');
    if (!me) return { error: 'no mark after setContent', docSize: ed.state.doc.content.size, docText: ed.state.doc.textContent };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S37_orphan_active_id(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's37', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.activeThreadId = 'non-existent-xyz';
  });
  return await page.evaluate(async () => {
    const me = document.querySelector('[data-thread-id="s37"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { before: 'non-existent-xyz', after: window.__mdAnnotator.State.activeThreadId };
  });
}

async function S38_extreme_spam(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's38', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    for (let i = 0; i < 200; i++) {
      const me = document.querySelector('[data-thread-id="s38"]');
      if (!me) break;
      const r = me.getBoundingClientRect();
      const x = r.left + (i % 3 === 0 ? 2 : (i % 3 === 1 ? r.width/2 : r.width - 2));
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: r.top + r.height/2, button: 0 }));
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 1));
    }
    await new Promise(r => setTimeout(r, 80));
    const ed = window.__mdAnnotator.State.editor;
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

async function S39_paste_in_mark(page) {
  await resetInPage(page);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(13, 16, ed.schema.marks.annotation.create({ threadId: 's39', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
  });
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const me = document.querySelector('[data-thread-id="s39"]');
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    ed.commands.insertContent('粘贴了一大段文字测试包含换行\n第二行内容');
    await new Promise(r => setTimeout(r, 50));
    let totalChars = 0, withMark = 0;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) {
        totalChars++;
        if (n.marks.some(m => m.type.name === 'annotation')) withMark++;
      }
    });
    return { totalChars, withMark };
  });
}

async function S40_markdown_escape(page) {
  await resetInPage(page, '<h2>测试\\*有\\*转义</h2>');
  return await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const tr = ed.state.tr;
    tr.addMark(5, 7, ed.schema.marks.annotation.create({ threadId: 's40', resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);
    const me = document.querySelector('[data-thread-id="s40"]');
    if (!me) return { error: 'no mark' };
    const r = me.getBoundingClientRect();
    me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
    await new Promise(r => setTimeout(r, 80));
    return { pos: ed.state.selection.from, hasMark: ed.state.selection.$head.marks().some(m => m.type.name === 'annotation') };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    S01, S02, S03_zero_length_mark, S04_whole_doc_mark, S05_rapid_clicks,
    S06_spam_typing, S07_enter_in_mark, S08_backspace_left, S09_delete_right, S10_select_delete_mark,
    S11_overlapping_marks, S12_click_outside_mark, S13_h1_mark, S14_list_item_mark, S15_blockquote_mark,
    S16_emoji_mark, S17_huge_mark, S18_corrupted_annotations, S19_extend_by_typing, S20_cross_boundary_selection,
    S21_undo_after_insert, S22_100_marks, S23_click_bubble, S24_concurrent_different_marks, S25_readonly,
    S26_right_click, S27_zero_height, S28_mouseup_only, S29_resolved_mark, S30_click_same_mark_twice,
    S31_undo_past_mark, S32_external_tr, S33_huge_annotations, S34_minimal_1char, S35_link_plus_annotation,
    S36_repeated_setContent, S37_orphan_active_id, S38_extreme_spam, S39_paste_in_mark, S40_markdown_escape,
  ];
  const results = [];
  for (const sc of scenarios) {
    const r = await runScenario(browser, sc.name, sc);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    console.log(`${passed ? '✓' : '✗'} ${r.name} ${r.result.threw ? '— ' + r.result.threw : ''}`);
    if (r.errors.length) console.log(`   errors: ${r.errors.slice(0, 3).join(' | ')}`);
    if (r.result && Object.keys(r.result).length > 0 && !r.result.threw) {
      console.log(`   ${JSON.stringify(r.result).slice(0, 200)}`);
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log(`TOTAL: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });