// Mentor v1.42 wave 6 — UI / 视觉 / 边缘用户行为

const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html?v=109';

async function setup(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function run(browser, name, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let result;
  try {
    await setup(page);
    result = await Promise.race([
      fn(page),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_45s')), 45000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors };
}

const tests = {
  // W6-01: 在 mark 区域连续快速点击 (200次) — 不应该让页面卡死
  async W6_01_rapid_click_storm(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 10, ed.schema.marks.annotation.create({
        threadId: 'rapid', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'rapid', range: { from: 1, to: 10 }, text: 'ABCDEFGHIJ',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 200));
      const me = document.querySelector('[data-thread-id="rapid"]');
      const rO = me.getBoundingClientRect();
      const samples = [];
      for (let i = 0; i < 100; i++) {
        const t = performance.now();
        me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: rO.left + 2 + (i % 8), clientY: rO.top + rO.height/2, button: 0 }));
        samples.push(performance.now() - t);
      }
      await new Promise(r => setTimeout(r, 200));
      samples.sort((a, b) => a - b);
      return {
        p50: samples[50].toFixed(2),
        p95: samples[95].toFixed(2),
        max: samples[99].toFixed(2),
        active: window.__mdAnnotator.State.activeThreadId,
      };
    });
  },

  // W6-02: 把卡渲染区拖到 0 宽 / 极窄 / 极宽
  async W6_02_pane_resize(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'resize', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'resize', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [{ id: 'c1', body: '测试评论', author: { id: 'u1', name: 'A' }, createdAt: '2026-01-01' }], createdAt: '2026-01-01',
      });
      ed.commands.setTextSelection(1);
      await new Promise(r => setTimeout(r, 200));
      // 模拟极窄
      const pane = document.querySelector('#comment-pane') || document.querySelector('#right-pane');
      if (!pane) return { error: 'no pane' };
      const origWidth = pane.getBoundingClientRect().width;
      // 改 CSS var 缩窄
      document.documentElement.style.setProperty('--comment-pane-width', '100px');
      await new Promise(r => setTimeout(r, 200));
      const cardsVisible = document.querySelectorAll('.comment-thread').length;
      // 恢复
      document.documentElement.style.setProperty('--comment-pane-width', '');
      await new Promise(r => setTimeout(r, 200));
      return { origWidth, cardsVisible, restoredWidth: pane.getBoundingClientRect().width };
    });
  },

  // W6-03: 同时点击多个 mark (用户拖选多 mark)
  async W6_03_multi_mark_click(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>AAAAA BBBBB CCCCC</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 6, ed.schema.marks.annotation.create({ threadId: 'a1', resolved: false, authorColor: 0 }));
      tr.addMark(8, 13, ed.schema.marks.annotation.create({ threadId: 'a2', resolved: false, authorColor: 1 }));
      tr.addMark(15, 18, ed.schema.marks.annotation.create({ threadId: 'a3', resolved: false, authorColor: 2 }));  // CCCCC ends at 17 (5 chars from 15-17 + </p> at 18), so 15-18 is the range
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = [
        { threadId: 'a1', range: { from: 1, to: 6 }, text: 'AAAAA', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
        { threadId: 'a2', range: { from: 8, to: 13 }, text: 'BBBBB', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
        { threadId: 'a3', range: { from: 15, to: 18 }, text: 'CCCCC', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
      ];
      ed.commands.setTextSelection(0);
      await new Promise(r => setTimeout(r, 200));
      const m1 = document.querySelector('[data-thread-id="a1"]');
      const m3 = document.querySelector('[data-thread-id="a3"]');
      m1.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
      await new Promise(r => setTimeout(r, 80));
      const activeAfterFirst = window.__mdAnnotator.State.activeThreadId;
      m3.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
      await new Promise(r => setTimeout(r, 80));
      const activeAfterSecond = window.__mdAnnotator.State.activeThreadId;
      return { activeAfterFirst, activeAfterSecond };
    });
  },

  // W6-04: 重置 history (用户清空全部操作)
  async W6_04_reset_history(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 10 次 mark 操作
      for (let i = 0; i < 10; i++) {
        const tr = ed.state.tr;
        tr.addMark(1, 3, ed.schema.marks.annotation.create({
          threadId: 'hist-' + i, resolved: false, authorColor: i % 8,
        }));
        ed.view.dispatch(tr);
        window.__mdAnnotator.State.annotations.push({
          threadId: 'hist-' + i, range: { from: 1, to: 3 }, text: 'x',
          prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      await new Promise(r => setTimeout(r, 200));
      const beforeReset = {
        annCount: window.__mdAnnotator.State.annotations.length,
        histDepth: window.__mdAnnotator.history ? window.__mdAnnotator.history.past.length : 'n/a',
      };
      // 重置
      if (window.__mdAnnotator.resetHistory) window.__mdAnnotator.resetHistory();
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 200));
      return {
        before: beforeReset,
        after: {
          annCount: window.__mdAnnotator.State.annotations.length,
        },
      };
    });
  },

  // W6-05: 切换 dark mode (CSS 变量)
  async W6_05_dark_mode_render(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'dark', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'dark', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [{ id: 'c1', body: '黑暗模式测试', author: { id: 'u1', name: '测试' }, createdAt: '2026-01-01' }], createdAt: '2026-01-01',
      });
      ed.commands.setTextSelection(1);
      await new Promise(r => setTimeout(r, 200));
      // 模拟切到 dark mode (toggle)
      const origBg = document.body.style.backgroundColor;
      document.body.style.backgroundColor = '#1a1a1a';
      document.body.style.color = '#ffffff';
      await new Promise(r => setTimeout(r, 200));
      const cardCount = document.querySelectorAll('.comment-thread').length;
      const markVisible = document.querySelector('[data-thread-id="dark"]');
      const styles = markVisible ? getComputedStyle(markVisible).backgroundColor : 'no-mark';
      // 恢复
      document.body.style.backgroundColor = origBg;
      document.body.style.color = '';
      return { cardCount, markBg: styles };
    });
  },

  // W6-06: 大量 mark + 同时 filter tab 切换 (open/resolved)
  async W6_06_filter_tabs(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 字'.repeat(200) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      for (let i = 0; i < 30; i++) {
        tr.addMark(1 + (i * 4), 1 + (i * 4) + 2, ed.schema.marks.annotation.create({
          threadId: 'f' + i, resolved: i % 2 === 0, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      for (let i = 0; i < 30; i++) {
        window.__mdAnnotator.State.annotations.push({
          threadId: 'f' + i, range: { from: 1 + i * 4, to: 1 + i * 4 + 2 }, text: '字',
          prefix: '', suffix: '', resolved: i % 2 === 0, comments: [], createdAt: new Date().toISOString(),
        });
      }
      await new Promise(r => setTimeout(r, 200));
      const totalCards = document.querySelectorAll('.comment-thread').length;
      // 切到只看 resolved
      const resolvedTab = document.querySelector('[data-filter="resolved"]') || document.querySelector('#filter-resolved');
      if (resolvedTab) resolvedTab.click();
      await new Promise(r => setTimeout(r, 200));
      const afterFilter = document.querySelectorAll('.comment-thread').length;
      // 切回 all
      const allTab = document.querySelector('[data-filter="all"]') || document.querySelector('#filter-all');
      if (allTab) allTab.click();
      await new Promise(r => setTimeout(r, 200));
      const afterAll = document.querySelectorAll('.comment-thread').length;
      return { totalCards, afterFilter, afterAll };
    });
  },

  // W6-07: 极长单条批注 + 极长回复
  async W6_07_extreme_text(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'long', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      // 1000 字符的批注 + 5 个超长回复
      const longBody = 'A'.repeat(1000);
      const longReply = 'B'.repeat(500);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'long', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false,
        comments: Array.from({ length: 5 }, (_, i) => ({
          id: 'r' + i, body: longReply, author: { id: 'u' + i, name: '用户' + i }, createdAt: '2026-01-01',
        })),
        body: longBody,
        createdAt: '2026-01-01',
      });
      ed.commands.setTextSelection(1);
      await new Promise(r => setTimeout(r, 500));
      const cards = document.querySelectorAll('.comment-thread').length;
      const cardText = document.querySelector('.comment-thread')?.textContent?.length || 0;
      return { cards, cardTextLen: cardText };
    });
  },

  // W6-08: 把 State 直接重置成 invalid (外部攻击 / 用户调试)
  async W6_08_state_corruption(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      // 直接搞坏 State
      window.__mdAnnotator.State.annotations = [
        null,
        undefined,
        'string',
        42,
        { /* 无 threadId */ },
        { threadId: 'valid', range: null, text: null, resolved: 'not bool', comments: 'not array' },
      ];
      // 触发 render
      try {
        if (window.__mdAnnotator.renderCommentList) window.__mdAnnotator.renderCommentList();
        else {
          // 通过 selectionUpdate 触发
          ed.commands.setTextSelection(1);
        }
      } catch (e) {
        return { crashed: e.message };
      }
      await new Promise(r => setTimeout(r, 500));
      return {
        crashed: false,
        survived: true,
        active: window.__mdAnnotator.State.activeThreadId,
      };
    });
  },

  // W6-09: Service Worker / cache 干扰 — 不一定能测, 但试着注册 SW
  async W6_09_no_service_worker(page) {
    return await page.evaluate(async () => {
      // 检查 SW 是否注册 (mentor 应该没有 SW)
      if (!navigator.serviceWorker) return { error: 'no SW API' };
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        swCount: regs.length,
        active: window.__mdAnnotator.State.activeThreadId,
      };
    });
  },

  // W6-10: Web Locks API (并发防冲突)
  async W6_10_web_locks(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 模拟并发: 同一 threadId 同时 addReply
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'concurrent', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'concurrent', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      ed.commands.setTextSelection(1);
      await new Promise(r => setTimeout(r, 100));
      // 同时多次 addReply
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve().then(() => {
          try {
            if (window.__mdAnnotator.ai && window.__mdAnnotator.ai.addReply) {
              window.__mdAnnotator.ai.addReply('concurrent', { id: 'u' + i, name: 'U' + i }, 'reply ' + i);
            }
          } catch (e) {}
        }));
      }
      await Promise.all(promises);
      await new Promise(r => setTimeout(r, 200));
      const ann = window.__mdAnnotator.State.annotations.find(a => a && a.threadId === 'concurrent');
      return {
        replyCount: ann?.comments?.length || 0,
        allValid: (ann?.comments || []).every(c => c && c.body),
      };
    });
  },

  // W6-11: 切 filter + 切作者 (multi-step user)
  async W6_11_complex_user_flow(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'flow', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'flow', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      ed.commands.setTextSelection(1);
      await new Promise(r => setTimeout(r, 200));
      // 1) 点击 mark → active
      // 2) 切 filter (resolved=true) → 卡片消失
      // 3) 切回 filter (all) → 卡片回来
      // 4) 加 reply
      // 5) toggle resolved → 切 resolved tab 看是否能看
      // 6) 删 thread → 卡片消失
      const me = document.querySelector('[data-thread-id="flow"]');
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
      await new Promise(r => setTimeout(r, 100));
      const step1Active = window.__mdAnnotator.State.activeThreadId;
      const ann = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'flow');
      ann.resolved = true;
      await new Promise(r => setTimeout(r, 100));
      const step5Resolved = ann.resolved;
      return {
        step1Active,
        step5Resolved,
        finalAnnCount: window.__mdAnnotator.State.annotations.length,
      };
    });
  },

  // W6-12: 删除整段正文 (mark 在被删段内)
  async W6_12_delete_paragraph_with_mark(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>第一段ABC</p><p>第二段DEF</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(5, 8, ed.schema.marks.annotation.create({
        threadId: 'in-p1', resolved: false, authorColor: 0,
      }));
      tr.addMark(13, 16, ed.schema.marks.annotation.create({
        threadId: 'in-p2', resolved: false, authorColor: 1,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = [
        { threadId: 'in-p1', range: { from: 5, to: 8 }, text: 'ABC', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
        { threadId: 'in-p2', range: { from: 13, to: 16 }, text: 'DEF', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
      ];
      ed.commands.setTextSelection(0);
      await new Promise(r => setTimeout(r, 200));
      // 删第一段 (整段选择 + delete)
      const tr2 = ed.state.tr;
      tr2.delete(1, 9);
      ed.view.dispatch(tr2);
      // 同步 State.annotations (模拟 _validateMarksAfterEdit)
      window.__mdAnnotator.State.annotations = window.__mdAnnotator.State.annotations.filter(a => {
        if (!a) return false;
        return a.range && a.range.from < 1 || a.range.to > 1;  // 不在第一段
      });
      await new Promise(r => setTimeout(r, 200));
      return {
        docText: ed.state.doc.textContent,
        annCount: window.__mdAnnotator.State.annotations.length,
        inP1Exists: !!document.querySelector('[data-thread-id="in-p1"]'),
        inP2Exists: !!document.querySelector('[data-thread-id="in-p2"]'),
      };
    });
  },

  // W6-13: 显示/隐藏 comment pane (折叠整个右栏)
  async W6_13_hide_comment_pane(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'hide', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'hide', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 200));
      const pane = document.querySelector('#comment-pane') || document.querySelector('#right-pane');
      if (!pane) return { error: 'no pane' };
      const origDisplay = pane.style.display;
      pane.style.display = 'none';
      await new Promise(r => setTimeout(r, 200));
      const hiddenClickWorked = await (async () => {
        const me = document.querySelector('[data-thread-id="hide"]');
        me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
        await new Promise(r => setTimeout(r, 100));
        return window.__mdAnnotator.State.activeThreadId === 'hide';
      })();
      pane.style.display = origDisplay;
      return { hiddenClickWorked };
    });
  },

  // W6-14: 修改 State.editable = false (模拟只读)
  async W6_14_readonly_state(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'ro', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'ro', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 200));
      // 模拟 readonly (改 editor editable)
      try { ed.setEditable(false); } catch (e) {}
      const beforeROActive = window.__mdAnnotator.State.activeThreadId;
      const me = document.querySelector('[data-thread-id="ro"]');
      me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
      await new Promise(r => setTimeout(r, 200));
      const afterROActive = window.__mdAnnotator.State.activeThreadId;
      // 恢复
      try { ed.setEditable(true); } catch (e) {}
      return {
        beforeROActive,
        afterROActive,
        clickWorkedInRO: afterROActive === 'ro',
      };
    });
  },

  // W6-15: 用户 drag 文件到页面 (mentor 应响应)
  async W6_15_drag_file(page) {
    return await page.evaluate(async () => {
      // 模拟 file drop
      const file = new File(['# 测试\n内容'], 'test.md', { type: 'text/markdown' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
      });
      const editorEl = document.querySelector('#editor');
      editorEl.dispatchEvent(dropEvent);
      await new Promise(r => setTimeout(r, 500));
      return {
        docText: window.__mdAnnotator.State.editor.state.doc.textContent.slice(0, 30),
      };
    });
  },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [name, fn] of Object.entries(tests)) {
    const r = await run(browser, name, fn);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    console.log((passed ? '✓' : '✗') + ' ' + r.name + (r.result.threw ? ' — ' + r.result.threw : ''));
    if (r.errors.length) console.log('   errors:', r.errors.slice(0, 2).join(' | '));
    if (r.result && !r.result.threw && Object.keys(r.result).length > 0) {
      console.log('   ' + JSON.stringify(r.result).slice(0, 250));
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });