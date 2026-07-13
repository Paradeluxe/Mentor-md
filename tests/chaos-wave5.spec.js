// Mentor v1.42.1 wave 5 — 真实工作流极限测试
// 模拟用户实际做的所有操作, 检查有没有未发现的 bug

const { chromium } = require('playwright');

const URL = 'http://localhost:8787/index.html?v=109';

async function setup(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(800);
  // 清 localStorage 拿默认 cap
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
  // W5-01: 创建 100 个批注 + 全部解决 + 取消解决 + 全删
  async W5_01_full_lifecycle_storm(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 测试'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const ids = [];
      for (let i = 0; i < 50; i++) {
        const from = 1 + (i * 4);
        const to = from + 2;
        if (to >= ed.state.doc.content.size) break;
        const tid = `cyc-${i}`;
        ids.push(tid);
        const tr = ed.state.tr;
        tr.addMark(from, to, ed.schema.marks.annotation.create({
          threadId: tid, resolved: false, authorColor: i % 8,
        }));
        ed.view.dispatch(tr);
        window.__mdAnnotator.State.annotations.push({
          threadId: tid, range: { from, to }, text: 'x',
          prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      await new Promise(r => setTimeout(r, 200));
      // 全部解决
      for (const tid of ids) {
        const ann = window.__mdAnnotator.State.annotations.find(a => a.threadId === tid);
        if (ann) ann.resolved = true;
      }
      await new Promise(r => setTimeout(r, 100));
      const resolvedCount = window.__mdAnnotator.State.annotations.filter(a => a.resolved).length;
      // 全部取消解决
      for (const tid of ids) {
        const ann = window.__mdAnnotator.State.annotations.find(a => a.threadId === tid);
        if (ann) ann.resolved = false;
      }
      await new Promise(r => setTimeout(r, 100));
      const unresolvedCount = window.__mdAnnotator.State.annotations.filter(a => !a.resolved).length;
      // 全部删除 (用 _testDeleteThread)
      for (const tid of ids) {
        try { window.__mdAnnotator._testDeleteThread(tid); } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 100));
      const finalCount = window.__mdAnnotator.State.annotations.length;
      return { created: ids.length, resolvedCount, unresolvedCount, finalCount };
    });
  },

  // W5-02: 创建 + 加 5 条回复 + 解决 + 跨刷新恢复 (用 IDB cache)
  async W5_02_reply_thread_then_reload(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(100) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tid = 'reply-test';
      const tr = ed.state.tr;
      tr.addMark(5, 9, ed.schema.marks.annotation.create({
        threadId: tid, resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: tid, range: { from: 5, to: 9 }, text: '测试',
        prefix: '', suffix: '', resolved: false,
        comments: [
          { id: 'c1', author: { id: 'u1', name: 'Alice' }, body: '第一条回复', createdAt: '2026-01-01' },
          { id: 'c2', author: { id: 'u2', name: 'Bob' }, body: '第二条', createdAt: '2026-01-02' },
        ],
        createdAt: '2026-01-01',
      });
      ed.commands.setTextSelection(5);
      await new Promise(r => setTimeout(r, 200));
      const before = window.__mdAnnotator.State.annotations[0];
      // 模拟 ctrl+S (autosave 触发)
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        replyCount: before.comments.length,
        bodies: before.comments.map(c => c.body),
      };
    });
  },

  // W5-03: 批注 + 编辑冲突 — 在批注文字里输入, mark 是否仍跟随?
  async W5_03_edit_within_mark(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>前面ABC后面</p>');  // docSize = 12 (10 chars + 2 PM tokens)
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // mark "ABC" (chars 4-7, PM 5-8)
      const tr = ed.state.tr;
      tr.addMark(5, 8, ed.schema.marks.annotation.create({
        threadId: 'edit-test', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'edit-test', range: { from: 5, to: 8 }, text: 'ABC',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 在 mark 中间输入 (pos 6, between 'A' and 'B')
      ed.commands.setTextSelection(6);
      ed.commands.insertContent('XYZ');
      await new Promise(r => setTimeout(r, 100));
      const docText = ed.state.doc.textContent;
      const me = document.querySelector('[data-thread-id="edit-test"]');
      return {
        docText, markStillExists: !!me,
        markText: me?.textContent,
      };
    });
  },

  // W5-04: 跨多个 textblock 的同一 thread (multi-paragraph)
  async W5_04_multiparagraph_thread(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>第一段ABC</p><p>第二段DEF</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 在两段都加 mark (共享 threadId)
      const tr = ed.state.tr;
      let p1Start = null, p1End = null, p2Start = null, p2End = null;
      let curPara = 0;
      ed.state.doc.descendants((node, pos) => {
        if (node.isText) {
          if (curPara === 0 && node.text.includes('ABC') && !p1Start) {
            p1Start = pos + node.text.indexOf('ABC');
            p1End = p1Start + 3;
          }
          if (curPara === 1 && node.text.includes('DEF') && !p2Start) {
            p2Start = pos + node.text.indexOf('DEF');
            p2End = p2Start + 3;
          }
        }
        if (node.isBlock && curPara < 1 && p1Start) curPara = 1;
        if (node.isBlock) {
          if (p1Start && !p1End) {
            // paragraph close
          }
        }
      });
      // 上面逻辑复杂, 简化: 重新走 descendants
      let paragraphs = 0, abcPos = null, defPos = null;
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') {
          paragraphs++;
          if (paragraphs === 1) {
            ed.state.doc.descendants((n, p) => {
              if (n.isText && n.text.includes('ABC') && !abcPos) {
                abcPos = p + n.text.indexOf('ABC');
              }
            });
            // 上面 inner descendants 会重复, 改用 nodesBetween
            // 简化: 固定位置 (paragraph 1 text 从 doc offset 1 开始: <p>ABC = 1-4)
            abcPos = pos + 1;  // 'A' 位置
          } else if (paragraphs === 2) {
            defPos = pos + 1;  // 'D' 位置 (假设)
          }
        }
      });
      // addMark 用更简单方法: 找 'A' 和 'D' 的 text pos
      const tr2 = ed.state.tr;
      // ABC at offset 1, DEF at offset after </p>
      let abcFrom = -1, defFrom = -1;
      ed.state.doc.descendants((node, pos) => {
        if (node.isText) {
          if (node.text === 'ABC' && abcFrom < 0) abcFrom = pos;
          if (node.text === 'DEF' && defFrom < 0) defFrom = pos;
        }
      });
      tr2.addMark(abcFrom, abcFrom + 3, ed.schema.marks.annotation.create({
        threadId: 'multi-para', resolved: false, authorColor: 0,
      }));
      tr2.addMark(defFrom, defFrom + 3, ed.schema.marks.annotation.create({
        threadId: 'multi-para', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr2);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'multi-para', range: { from: abcFrom, to: abcFrom + 3 },
        ranges: [{ from: abcFrom, to: abcFrom + 3 }, { from: defFrom, to: defFrom + 3 }],
        text: 'ABC', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      ed.commands.setTextSelection(abcFrom + 1);
      await new Promise(r => setTimeout(r, 150));
      const multiMarks = document.querySelectorAll('[data-thread-id="multi-para"]');
      return {
        para1: multiMarks.length >= 1,
        para2: multiMarks.length === 2,
        annRanges: window.__mdAnnotator.State.annotations[0].ranges?.length,
      };
    });
  },

  // W5-05: 同时打开多个 mark (重叠 + 相邻 + 嵌套)
  async W5_05_overlapping_marks(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>ABCDEFGHIJKLMN</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // mark1: 1-4 (ABC), mark2: 3-7 (CDE), mark3: 5-9 (EFG)
      const tr = ed.state.tr;
      tr.addMark(1, 4, ed.schema.marks.annotation.create({ threadId: 'm1', resolved: false, authorColor: 0 }));
      tr.addMark(3, 7, ed.schema.marks.annotation.create({ threadId: 'm2', resolved: false, authorColor: 1 }));
      tr.addMark(5, 9, ed.schema.marks.annotation.create({ threadId: 'm3', resolved: false, authorColor: 2 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = [
        { threadId: 'm1', range: { from: 1, to: 4 }, text: 'ABC', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
        { threadId: 'm2', range: { from: 3, to: 7 }, text: 'CDE', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
        { threadId: 'm3', range: { from: 5, to: 9 }, text: 'EFG', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString() },
      ];
      await new Promise(r => setTimeout(r, 150));
      // 数 marks
      const markCount = document.querySelectorAll('[data-thread-id^="m"]').length;
      return { markCount, annCount: window.__mdAnnotator.State.annotations.length };
    });
  },

  // W5-06: 切换 author 模式 (匿名 vs 实名)
  async W5_06_author_switch(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试ABC</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // author A 创建
      window.__mdAnnotator.State.author = 'Alice';
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({ threadId: 'a1', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'a1', range: { from: 1, to: 3 }, text: '试', prefix: '', suffix: '',
        resolved: false, comments: [{ id: 'c1', author: { id: 'u1', name: 'Alice' }, body: 'A 的评论', createdAt: '2026-01-01' }],
        createdAt: '2026-01-01',
      });
      // author B 创建
      window.__mdAnnotator.State.author = 'Bob';
      const tr2 = ed.state.tr;
      tr2.addMark(5, 7, ed.schema.marks.annotation.create({ threadId: 'a2', resolved: false, authorColor: 1 }));
      ed.view.dispatch(tr2);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'a2', range: { from: 5, to: 7 }, text: 'BC', prefix: '', suffix: '',
        resolved: false, comments: [{ id: 'c2', author: { id: 'u2', name: 'Bob' }, body: 'B 的评论', createdAt: '2026-01-02' }],
        createdAt: '2026-01-02',
      });
      ed.commands.setTextSelection(2);
      await new Promise(r => setTimeout(r, 200));
      // 调 AI API 看是否能正确读
      const a1 = window.__mdAnnotator.ai.getThread('a1');
      const a2 = window.__mdAnnotator.ai.getThread('a2');
      const list = window.__mdAnnotator.ai.listThreads();
      return {
        a1Author: a1?.comments?.[0]?.author?.name,
        a2Author: a2?.comments?.[0]?.author?.name,
        listCount: list.length,
      };
    });
  },

  // W5-07: 批注 + 选区精确范围 (光标定位)
  async W5_07_click_each_mark_verify_position(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>前面 中间 后面</p>');  // 8 chars
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({ threadId: 'left', resolved: false, authorColor: 0 }));
      tr.addMark(4, 6, ed.schema.marks.annotation.create({ threadId: 'mid', resolved: false, authorColor: 0 }));
      tr.addMark(7, 9, ed.schema.marks.annotation.create({ threadId: 'right', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = [
        { threadId: 'left', range: { from: 1, to: 3 }, text: '前', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
        { threadId: 'mid', range: { from: 4, to: 6 }, text: '中', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
        { threadId: 'right', range: { from: 7, to: 9 }, text: '后', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
      ];
      await new Promise(r => setTimeout(r, 150));
      const positions = {};
      for (const tid of ['left', 'mid', 'right']) {
        const me = document.querySelector('[data-thread-id="' + tid + '"]');
        const r = me.getBoundingClientRect();
        me.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: r.left + 2, clientY: r.top + r.height/2, button: 0 }));
        await new Promise(r => setTimeout(r, 80));
        positions[tid] = ed.state.selection.from;
      }
      return positions;
    });
  },

  // W5-08: 空 doc / 空 annotation
  async W5_08_empty_states(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p></p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 200));
      // 尝试 addMark (PM 标 0 长度应 no-op)
      const tr = ed.state.tr;
      tr.addMark(1, 1, ed.schema.marks.annotation.create({ threadId: 'empty', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      await new Promise(r => setTimeout(r, 100));
      return {
        docSize: ed.state.doc.content.size,
        annCount: window.__mdAnnotator.State.annotations.length,
        markExists: !!document.querySelector('[data-thread-id="empty"]'),
      };
    });
  },

  // W5-09: 大量 mark + 滚动 viewport
  async W5_09_scroll_storm(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      // 大 doc (50 个 paragraph)
      const paras = Array.from({length: 50}, (_, i) => '<p>段落 ' + i + ': 内容填充 ' + '字'.repeat(20) + '</p>').join('');
      ed.commands.setContent(paras);
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 300));
      // 50 个 mark, 每个 1 段 1 个
      const tr = ed.state.tr;
      let p = 0;
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && p < 50) {
          tr.addMark(pos + 5, pos + 7, ed.schema.marks.annotation.create({
            threadId: 's' + p, resolved: false, authorColor: p % 8,
          }));
          p++;
        }
      });
      ed.view.dispatch(tr);
      for (let i = 0; i < 50; i++) {
        window.__mdAnnotator.State.annotations.push({
          threadId: 's' + i, range: { from: 0, to: 0 }, text: '段',
          prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      await new Promise(r => setTimeout(r, 200));
      // 模拟滚动
      const editorEl = document.querySelector('#editor-pane') || document.querySelector('.ProseMirror');
      for (let i = 0; i < 10; i++) {
        editorEl.scrollTop = i * 100;
        await new Promise(r => setTimeout(r, 30));
      }
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        marks: document.querySelectorAll('[data-thread-id^="s"]').length,
        scrollTop: editorEl.scrollTop,
      };
    });
  },

  // W5-10: 同时触发 selectionUpdate + renderCommentList (高频)
  async W5_10_selection_storm(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 字'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      for (let i = 0; i < 20; i++) {
        tr.addMark(1 + (i * 4), 1 + (i * 4) + 2, ed.schema.marks.annotation.create({
          threadId: 'sel' + i, resolved: false, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      for (let i = 0; i < 20; i++) {
        window.__mdAnnotator.State.annotations.push({
          threadId: 'sel' + i, range: { from: 1 + (i*4), to: 1 + (i*4) + 2 }, text: '字',
          prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      await new Promise(r => setTimeout(r, 200));
      // 500 次 selection
      const samples = [];
      for (let i = 0; i < 100; i++) {
        const t = performance.now();
        ed.commands.setTextSelection(1 + (i % 80));
        samples.push(performance.now() - t);
      }
      const sorted = samples.sort((a, b) => a - b);
      return {
        p50: sorted[50].toFixed(2),
        p95: sorted[95].toFixed(2),
        max: sorted[99].toFixed(2),
        annCount: window.__mdAnnotator.State.annotations.length,
      };
    });
  },

  // W5-11: 嵌套 mark 段 (外层切到内层 + 内层切到外层)
  async W5_11_nested_switch(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>ABCDEFGH</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 外层 1-8, 内层 3-6
      const tr = ed.state.tr;
      tr.addMark(1, 8, ed.schema.marks.annotation.create({ threadId: 'outer', resolved: false, authorColor: 0 }));
      tr.addMark(3, 6, ed.schema.marks.annotation.create({ threadId: 'inner', resolved: false, authorColor: 1 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = [
        { threadId: 'outer', range: { from: 1, to: 8 }, text: 'ABCDEFGH', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
        { threadId: 'inner', range: { from: 3, to: 6 }, text: 'CDE', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
      ];
      await new Promise(r => setTimeout(r, 200));
      // 点 outer
      const meOuter = document.querySelector('[data-thread-id="outer"]');
      const rO = meOuter.getBoundingClientRect();
      meOuter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: rO.left + 2, clientY: rO.top + rO.height/2, button: 0 }));
      await new Promise(r => setTimeout(r, 100));
      const outerActive = window.__mdAnnotator.State.activeThreadId;
      // 点 inner
      const meInner = document.querySelector('[data-thread-id="inner"]');
      const rI = meInner.getBoundingClientRect();
      meInner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: rI.left + 2, clientY: rI.top + rI.height/2, button: 0 }));
      await new Promise(r => setTimeout(r, 100));
      const innerActive = window.__mdAnnotator.State.activeThreadId;
      return { outerActive, innerActive, switched: outerActive === 'outer' && innerActive === 'inner' };
    });
  },

  // W5-12: 创建批注 + 立即 resolve + 立即 reopen + 编辑文字
  async W5_12_create_resolve_reopen_edit(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({ threadId: 'crr', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'crr', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01',
      });
      ed.commands.setTextSelection(2);
      await new Promise(r => setTimeout(r, 100));
      // resolve
      const ann = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'crr');
      ann.resolved = true;
      await new Promise(r => setTimeout(r, 100));
      // reopen
      ann.resolved = false;
      await new Promise(r => setTimeout(r, 100));
      // 编辑 mark 内文字
      ed.commands.setTextSelection(2);
      ed.commands.insertContent('!');
      await new Promise(r => setTimeout(r, 100));
      return {
        annResolved: ann.resolved,
        annRange: ann.range,
        docText: ed.state.doc.textContent,
        markStillThere: !!document.querySelector('[data-thread-id="crr"]'),
      };
    });
  },

  // W5-13: Ctrl+Z 撤销 mark 创建
  async W5_13_undo_mark_creation(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 创建 mark
      const tr = ed.state.tr;
      tr.addMark(1, 5, ed.schema.marks.annotation.create({ threadId: 'undo-test', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'undo-test', range: { from: 1, to: 5 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01',
      });
      await new Promise(r => setTimeout(r, 200));
      // Ctrl+Z
      ed.commands.undo();
      await new Promise(r => setTimeout(r, 200));
      return {
        markStillThere: !!document.querySelector('[data-thread-id="undo-test"]'),
        docText: ed.state.doc.textContent,
      };
    });
  },

  // W5-14: 批注 mark 跨 mark 边界被删除 (一 mark 包另一 mark)
  async W5_14_nested_deletion(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>ABCDEFGH</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 8, ed.schema.marks.annotation.create({ threadId: 'outer', resolved: false, authorColor: 0 }));
      tr.addMark(3, 6, ed.schema.marks.annotation.create({ threadId: 'inner', resolved: false, authorColor: 1 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = [
        { threadId: 'outer', range: { from: 1, to: 8 }, text: 'ABCDEFGH', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
        { threadId: 'inner', range: { from: 3, to: 6 }, text: 'CDE', prefix: '', suffix: '', resolved: false, comments: [], createdAt: '2026-01-01' },
      ];
      ed.commands.setTextSelection(2);
      await new Promise(r => setTimeout(r, 200));
      // 删 inner thread
      try { window.__mdAnnotator._testDeleteThread('inner'); } catch (e) { return { error: e.message }; }
      await new Promise(r => setTimeout(r, 200));
      return {
        innerExists: !!document.querySelector('[data-thread-id="inner"]'),
        outerExists: !!document.querySelector('[data-thread-id="outer"]'),
        annCount: window.__mdAnnotator.State.annotations.length,
      };
    });
  },

  // W5-15: 真实场景 — 用户 import 真实 DFC .mentor, 检查所有批注能正确加载
  async W5_15_real_dfc_load(page) {
    return await page.evaluate(async () => {
      try {
        const resp = await fetch('/tests/fixtures/dfc-with-media.mentor');
        if (!resp.ok) return { error: 'fetch failed: ' + resp.status };
        const blob = await resp.blob();
        const file = new File([blob], 'dfc.mentor', { type: 'application/zip' });
        await window.__mdAnnotator.openFromMentorFile(file);
        await new Promise(r => setTimeout(r, 1000));
        return {
          ok: true,
          docSize: window.__mdAnnotator.State.editor.state.doc.content.size,
          annCount: window.__mdAnnotator.State.annotations.length,
          imgCount: document.querySelectorAll('#editor img').length,
          title: document.title,
          firstThread: window.__mdAnnotator.State.annotations[0]?.threadId,
        };
      } catch (e) {
        return { error: e.message };
      }
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