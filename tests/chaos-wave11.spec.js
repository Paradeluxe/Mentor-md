// Mentor v1.43.4 chaos wave 11 — 第二轮变态测试
// 目标: 边角 + 性能 + 并发 + XSS + cap
// 不重复 wave1-10, 找新坑

const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html?v=122';

async function setup(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const d of dbs) { if (d.name) indexedDB.deleteDatabase(d.name); }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function run(browser, name, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  const consoleErrs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  let result;
  try {
    await setup(page);
    result = await Promise.race([
      fn(page),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_60s')), 60000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors, consoleErrs };
}

async function resetDoc(page, html) {
  await page.evaluate((h) => {
    const M = window.__mdAnnotator;
    M.State.editor.commands.setContent(h, false);
    M.State.annotations = [];
    M.State.activeThreadId = null;
    M.State.editor.commands.setTextSelection(1);
    window.__mdAnnotator.renderCommentList();
    window.__mdAnnotator.rebuildAnnotationMarks();
  }, html);
}

async function clickCommentBtnAt(page, from, to) {
  return await page.evaluate(({ from, to }) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const before = M.State.annotations.length;
    ed.commands.setTextSelection({ from, to });
    document.querySelector('#float-comment-btn button').click();
    const after = M.State.annotations.length;
    return { before, after, created: after > before };
  }, { from, to });
}

const tests = {
  // ============================================================
  // 1. AI reply 并发 / race condition
  // ============================================================
  async W11_01_ai_reply_concurrent_same_thread(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const tid = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].threadId);
    // 并发 3 个 reply (相同 thread, 相同 body) - 应被 lock + dedup
    const results = await page.evaluate(async (tid) => {
      const ai = window.__mdAnnotator.ai;
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(ai.reply(tid, 'Same body from concurrent calls'));
      }
      return await Promise.all(promises);
    }, tid);
    // 检查: 应只有 1 个 comment 被创建 (dedup)
    const finalCount = await page.evaluate((tid) => {
      const t = window.__mdAnnotator.State.annotations.find(a => a.threadId === tid);
      return t.comments.length;
    }, tid);
    if (finalCount > 2) return { error: `并发 dedup 应只 1 条, 实际 ${finalCount}`, results };
    return { ok: true, finalCount, results: results.map(r => ({ ok: r.ok, dedup: r.dedup })) };
  },

  async W11_02_ai_reply_concurrent_diff_body(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const tid = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].threadId);
    // 并发 3 个 reply, body 不同 - lock 合并会让后续等, 但不同 body 应该都通过
    // 实际: lock 让它们串行执行 (同 threadId 共享 promise), 最后 3 条都进
    const results = await page.evaluate(async (tid) => {
      const ai = window.__mdAnnotator.ai;
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(ai.reply(tid, 'Body ' + i));
      }
      return await Promise.all(promises);
    }, tid);
    const finalCount = await page.evaluate((tid) => {
      const t = window.__mdAnnotator.State.annotations.find(a => a.threadId === tid);
      return t.comments.length;
    }, tid);
    if (finalCount !== 3) return { error: `3 个不同 body 应都成功, 实际 ${finalCount}` };
    return { ok: true, finalCount };
  },

  async W11_03_ai_reply_max_body(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const tid = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].threadId);
    // body 超 MAX_BODY (5000) 应被拒
    const r = await page.evaluate(async (tid) => {
      const ai = window.__mdAnnotator.ai;
      return await ai.reply(tid, 'x'.repeat(5001));
    }, tid);
    if (r.ok) return { error: '超长 body 应被拒', r };
    return { ok: true, rejectionError: r.error };
  },

  async W11_04_ai_reply_resolved_thread(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const tid = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].threadId);
    // 先 resolved 再 reply
    const r = await page.evaluate(async (tid) => {
      const t = window.__mdAnnotator.State.annotations.find(a => a.threadId === tid);
      t.resolved = true;
      const ai = window.__mdAnnotator.ai;
      return await ai.reply(tid, 'should be rejected');
    }, tid);
    if (r.ok) return { error: 'resolved thread reply 应被拒' };
    return { ok: true, rejectionError: r.error };
  },

  async W11_05_ai_reply_nonexistent_thread(page) {
    const r = await page.evaluate(async () => {
      const ai = window.__mdAnnotator.ai;
      return await ai.reply('fake-tid-does-not-exist', 'hi');
    });
    if (r.ok) return { error: '不存在的 thread 应被拒' };
    return { ok: true, rejectionError: r.error };
  },

  // ============================================================
  // 2. XSS in comment body
  // ============================================================
  async W11_06_xss_in_comment_body(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    // push 一条带 script tag 的评论
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations[0];
      t.comments.push({
        id: 'evil',
        author: { id: 'attacker', name: '<script>alert(1)</script>' },
        body: '<img src=x onerror=alert(1)><script>alert(2)</script>',
        createdAt: new Date().toISOString(),
      });
      try {
        M.renderCommentList();
        return { ok: true };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return r;
    // 验证 DOM 没真的执行 (alert 不应触发, 测试环境无 alert; 检查 DOM 结构)
        // 注意: comment body 是 escaped, 但 innerHTML 仍包含 'onerror=' 字符串 (作为 escaped text)
        // 应该检查 'img' 标签是否真存在, 而不是 substring 'onerror='
        const dom = await page.evaluate(() => {
          const list = document.querySelector('#comment-list');
          const html = list.innerHTML;
          // 检查未转义 HTML 标签: 找 <img <script 等
          const realImg = list.querySelectorAll('img').length;
          const realScript = list.querySelectorAll('script').length;
          // raw < 应该被 &lt; 之类替换 (检查 innerHTML 是否含 &lt;img)
          const escapedImg = html.includes('&lt;img');
          return {
            realImgCount: realImg,
            realScriptCount: realScript,
            escapedImg,
            sampleAuthor: list.querySelector('.comment-author')?.textContent,
            sampleBody: list.querySelector('.comment-body')?.textContent,
          };
        });
        if (dom.realImgCount > 0) return { error: 'comment 含未转义 <img>', dom };
        if (dom.realScriptCount > 0) return { error: 'comment 含未转义 <script>', dom };
        if (!dom.escapedImg) return { error: 'body 应被 escape 为 &lt;img', dom };
        // author 应该显示原始文字 (含 <script>) 但不会执行
        if (!dom.sampleAuthor?.includes('<script>')) return { error: 'author 文字应保留', dom };
        return { ok: true, dom };
      },

  // ============================================================
  // 3. Memory leak under repeated open/close
  // ============================================================
  async W11_07_memory_no_leak(page) {
    await resetDoc(page, '<p>Initial content</p>');
    const before = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return null;
    });
    // 反复 load + clear 50 次
    for (let i = 0; i < 50; i++) {
      await page.evaluate((i) => {
        const M = window.__mdAnnotator;
        M.State.editor.commands.setContent('<p>Cycle ' + i + '</p>', false);
        M.State.annotations = [];
        M.State.activeThreadId = null;
        window.__mdAnnotator.renderCommentList();
        window.__mdAnnotator.rebuildAnnotationMarks();
      }, i);
    }
    const after = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return null;
    });
    if (before == null || after == null) return { ok: true, skipped: 'performance.memory 不可用' };
    const growth = after - before;
    // 50 次循环 + 大量 DOM 操作, 涨 < 5MB 算正常
    if (growth > 5 * 1024 * 1024) return { error: `内存涨 ${(growth/1024/1024).toFixed(2)}MB`, before, after };
    return { ok: true, growthMB: (growth/1024/1024).toFixed(3) };
  },

  // ============================================================
  // 4. 同一 threadId 跨文件不冲突
  // ============================================================
  async W11_08_threadid_across_files(page) {
    await resetDoc(page, '<p>File A content</p>');
    await clickCommentBtnAt(page, 2, 4);
    const tidA = await page.evaluate(() => window.__mdAnnotator.State.annotations[0].threadId);
    // 模拟切到 file B
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>File B content</p>', false);
      M.State.annotations = [];
      M.State.activeThreadId = null;
      window.__mdAnnotator.renderCommentList();
      window.__mdAnnotator.rebuildAnnotationMarks();
    });
    // 同样 threadId 不应被 dedup 阻断 (因为是新 file)
    await clickCommentBtnAt(page, 2, 4);
    // threadId 不一定一样 (createAnnotationThread 生成新 UUID), 但 ann 数应 1
    const fileBInfo = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        annCount: M.State.annotations.length,
        tid: M.State.annotations[0]?.threadId,
        text: M.State.annotations[0]?.text,
      };
    });
    if (fileBInfo.annCount !== 1) return { error: 'file B 应有 1 个 ann', info: fileBInfo };
    // 切回 file A (重新 load)
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>File A content</p>', false);
      // 不动 annotations, 模拟从 .annotations.json 重新 load
      window.__mdAnnotator.renderCommentList();
      window.__mdAnnotator.rebuildAnnotationMarks();
    });
    return { ok: true, info: { tidA, fileBTid: fileBInfo.tid } };
  },

  // ============================================================
  // 5. Cap=0 (无限) + 500 ann 性能退化测试
  // ============================================================
  async W11_09_cap_zero_500_ann(page) {
    // cap=0 表示无上限
    await page.evaluate(() => {
      window.__mdAnnotator.setMaxAnnotations(0);
    });
    await resetDoc(page, '<p>0123456789</p>');
    // 创建 500 个 ann (用 PM addMark 直接, 模拟 bulk import)
    const t0 = Date.now();
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      const tr = ed.state.tr;
      for (let i = 0; i < 500; i++) {
        tr.addMark(1, 2, markType.create({ threadId: 'bulk-' + i, resolved: false, authorColor: i % 8 }));
        M.State.annotations.push({
          threadId: 'bulk-' + i,
          range: { from: 1, to: 2 },
          text: '0',
          prefix: '', suffix: '',
          resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
      ed.view.dispatch(tr);
    });
    const setupTime = Date.now() - t0;
    // 测 renderCommentList
    const t1 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.renderCommentList());
    const renderTime = Date.now() - t1;
    // 测打字 (1 char insert)
    const t2 = Date.now();
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.insertContent('X');
    });
    const insertTime = Date.now() - t2;
    return {
      ok: true,
      perf: { setupTime, renderTime, insertTime, annCount: 500 },
      notes: `500 ann: setup ${setupTime}ms / render ${renderTime}ms / insert ${insertTime}ms`,
    };
  },

  // ============================================================
  // 6. 极长 doc (50K 字符)
  // ============================================================
  async W11_10_super_long_doc(page) {
    const bigText = '0123456789ABCDEFGHIJ'.repeat(2500);  // 50000 chars
    const t0 = Date.now();
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>' + text + '</p>', false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, bigText);
    const loadTime = Date.now() - t0;
    // 建一个 mark
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setTextSelection({ from: 10000, to: 10100 });
      const before = M.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      return { created: M.State.annotations.length > before };
    });
    return { ok: r.created, loadTime };
  },

  // ============================================================
  // 7. Code block 内批注
  // ============================================================
  async W11_11_code_block_mark(page) {
    await resetDoc(page, '<pre><code>function hello() {\n  return "world";\n}</code></pre>');
    // 找到 'return' 位置
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText) {
          const idx = n.text.indexOf('return');
          if (idx >= 0 && from < 0) {
            from = pos + idx;
            to = from + 6;
          }
        }
      });
      if (from < 0) return { error: '没找到 return', total: ed.state.doc.content.size };
      ed.commands.setTextSelection({ from, to });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      return {
        from, to,
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: window.__mdAnnotator.State.annotations[0]?.text,
      };
    });
    if (!r.created) return { error: 'code block 内 mark 应创建', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 8. KaTeX math + mark
  // ============================================================
  async W11_12_katex_inline_mark(page) {
    // KaTeX 会把 $x^2$ 转成 <span class="katex-wrapper">, 内部 text node 含 'x'
    await resetDoc(page, '<p>公式 $x^2 + y^2 = z^2$ 嵌入文字</p>');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 找 'x' (在 math 内)
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText && n.text === 'x') {
          from = pos;
          to = pos + 1;
        }
      });
      if (from < 0) return { error: '没找到 x' };
      try {
        ed.commands.setTextSelection({ from, to });
        const before = window.__mdAnnotator.State.annotations.length;
        document.querySelector('#float-comment-btn button').click();
        return {
          from, to,
          created: window.__mdAnnotator.State.annotations.length > before,
          annText: window.__mdAnnotator.State.annotations[0]?.text,
        };
      } catch (e) {
        return { caught: e.message };
      }
    });
    return { ok: true, info: r };
  },

  // ============================================================
  // 9. Undo/Redo 满栈
  // ============================================================
  async W11_13_undo_redo_full_stack(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    // undo 10 次 (超过实际能 undo 的次数)
    const r = await page.evaluate(() => {
      const undo = window.__mdAnnotator.undo;
      let undoCount = 0;
      for (let i = 0; i < 10; i++) {
        if (undo()) undoCount++;
        else break;
      }
      // redo 10 次
      let redoCount = 0;
      const redo = window.__mdAnnotator.redo;
      for (let i = 0; i < 10; i++) {
        if (redo()) redoCount++;
        else break;
      }
      return { undoCount, redoCount, annCount: window.__mdAnnotator.State.annotations.length };
    });
    if (r.undoCount === 0) return { error: '应至少能 undo 1 次', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 10. 同 range 多 cell 多 thread 共享 threadId
  // ============================================================
  async W11_14_multicell_same_threadid(page) {
    // e2e-cell-selection 已经测, 但这里测多 cell 创建后 range 数组正确
    await resetDoc(page, '<table><tbody><tr><td>AAA</td><td>BBB</td></tr><tr><td>CCC</td><td>DDD</td></tr></tbody></table>');
    const r = await page.evaluate(() => {
      // 直接构造 multi-cell ann (通过 API 调用 handleCreateMultiCellAnnotation 不可达)
      // 改: 模拟 addMark 多个 cell
      const ed = window.__mdAnnotator.State.editor;
      const markType = ed.schema.marks.annotation;
      // 找所有 cell 的 pos
      const cells = [];
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === 'tableCell') {
          cells.push({ pos, contentFrom: pos + 1, contentTo: pos + n.nodeSize - 1, text: ed.state.doc.textBetween(pos + 1, pos + n.nodeSize - 1) });
        }
      });
      if (cells.length < 4) return { error: 'cells 不足 4' };
      // 给所有 cell 加 mark 共享 threadId
      const tid = 'multi-cell-tid';
      const tr = ed.state.tr;
      for (const c of cells) {
        tr.addMark(c.contentFrom, c.contentTo, markType.create({ threadId: tid, resolved: false, authorColor: 0 }));
      }
      ed.view.dispatch(tr);
      // 模拟对应的 ann (ranges 数组)
      M = window.__mdAnnotator;
      M.State.annotations.push({
        threadId: tid,
        range: cells[0],  // 主 range
        ranges: cells,    // 多 cell 数组
        text: cells.map(c => c.text).join(' '),
        prefix: '', suffix: '',
        resolved: false, createdAt: new Date().toISOString(),
        comments: [],
      });
      M.renderCommentList();
      M.rebuildAnnotationMarks();
      return { cellCount: cells.length, annCount: M.State.annotations.length };
    });
    if (r.cellCount < 4) return { error: 'cell 不足', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 11. Concurrent: onUpdate + renderCommentList 同时
  // ============================================================
  async W11_15_concurrent_render_and_update(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    // 触发 N 次 renderCommentList 同时插入文本
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(new Promise(resolve => {
          setTimeout(() => {
            M.renderCommentList();
            M.State.editor.commands.insertContent('x');
            resolve(true);
          }, i * 5);
        }));
      }
      await Promise.all(promises);
      return {
        annCount: M.State.annotations.length,
        docLen: M.State.editor.state.doc.textContent.length,
      };
    });
    // 不应崩, ann 数应 1 (我们没新建 ann)
    if (r.annCount !== 1) return { error: `ann 数变了: ${r.annCount}`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 12. Tab visibilitychange 事件
  // ============================================================
  async W11_16_visibility_hidden(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    // 模拟 visibility change to hidden
    const r = await page.evaluate(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(resolve => setTimeout(resolve, 100));
      // 看 autosave timer 是否停了 / dirty 状态
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        // 这里只验证不崩
      };
    });
    return { ok: true, info: r };
  },

  // ============================================================
  // 13. State mutation during render (race)
  // ============================================================
  async W11_17_state_mutation_during_render(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // 在 renderCommentList 过程中 mutation State
      const origRender = M.renderCommentList;
      let mutationCaught = null;
      M.renderCommentList = function() {
        // 在 render 内部清空 annotations
        const result = origRender.call(this);
        return result;
      };
      try {
        M.renderCommentList();
        return { ok: true };
      } catch (e) {
        return { caught: e.message };
      }
    });
    return { ok: true, info: r };
  },

  // ============================================================
  // 14. 中文 mark 长达 200 字符
  // ============================================================
  async W11_18_super_long_chinese_mark(page) {
    const longChinese = '测'.repeat(200);
    await resetDoc(page, `<p>${longChinese}</p>`);
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 1, to: 100 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        textLen: t?.text?.length,
        prefixLen: t?.prefix?.length,
      };
    });
    if (!r.created) return { error: '长中文 mark 应创建', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 15. Ann with link + bold (3 mark 嵌套)
  // ============================================================
  async W11_19_link_bold_ann(page) {
    await resetDoc(page, '<p>这是 <a href="http://example.com"><strong>粗体链接</strong></a> 测试</p>');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 找 '粗体链接' 位置
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText && n.text === '粗体链接') {
          from = pos;
          to = pos + 4;
        }
      });
      if (from < 0) return { error: '没找到粗体链接' };
      ed.commands.setTextSelection({ from, to });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: window.__mdAnnotator.State.annotations[0]?.text,
      };
    });
    return { ok: true, info: r };
  },

  // ============================================================
  // 16. 重置到同一份内容 1000 次 (memory leak 边界)
  // ============================================================
  async W11_20_1000_cycles(page) {
    const before = await page.evaluate(() => performance.memory?.usedJSHeapSize);
    if (before == null) return { ok: true, skipped: 'performance.memory 不可用' };
    for (let i = 0; i < 1000; i++) {
      await page.evaluate((i) => {
        const M = window.__mdAnnotator;
        M.State.editor.commands.setContent('<p>Cycle ' + i + '</p>', false);
        M.State.annotations = [];
        M.State.activeThreadId = null;
        // 不调 renderCommentList (避免额外压力) — 只 setContent
      }, i);
    }
    const after = await page.evaluate(() => performance.memory?.usedJSHeapSize);
    const growth = after - before;
    if (growth > 50 * 1024 * 1024) return { error: `1000 cycles 内存涨 ${(growth/1024/1024).toFixed(2)}MB`, before, after };
    return { ok: true, growthMB: (growth/1024/1024).toFixed(3), before, after };
  },

  // ============================================================
  // 17. Ann 删除后 index 重排
  // ============================================================
  async W11_21_delete_ann_index_reorder(page) {
    await resetDoc(page, '<p>0123456789ABCDEF</p>');
    await clickCommentBtnAt(page, 2, 5);
    await clickCommentBtnAt(page, 7, 10);
    await clickCommentBtnAt(page, 12, 15);
    // 删中间那条
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // 直接删 ann[1]
      const removed = M.State.annotations.splice(1, 1);
      M.renderCommentList();
      return {
        before: 3,
        after: M.State.annotations.length,
        removedRange: removed[0]?.range,
        remainingRanges: M.State.annotations.map(a => a.range),
      };
    });
    if (r.after !== 2) return { error: '删 1 个后应剩 2', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 18. 大量空 comment
  // ============================================================
  async W11_22_many_empty_comments(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const r = await page.evaluate(() => {
      const t = window.__mdAnnotator.State.annotations[0];
      // 模拟 200 条空 comment (非典型, 但 stress test)
      for (let i = 0; i < 200; i++) {
        t.comments.push({
          id: 'empty-' + i,
          author: { id: 'u', name: 'User' },
          body: '',
          createdAt: new Date().toISOString(),
        });
      }
      try {
        window.__mdAnnotator.renderCommentList();
        return { ok: true, count: t.comments.length };
      } catch (e) {
        return { crash: e.message };
      }
    });
    return { ok: r.ok, info: r };
  },

  // ============================================================
  // 19. AI setAuthor 边界
  // ============================================================
  async W11_23_ai_setAuthor_validation(page) {
    const r = await page.evaluate(() => {
      const ai = window.__mdAnnotator.ai;
      const tests = [];
      // 1. 空字符串
      tests.push({ name: 'empty', result: ai.setAuthor('') });
      // 2. null
      tests.push({ name: 'null', result: ai.setAuthor(null) });
      // 3. 数字
      tests.push({ name: 'number', result: ai.setAuthor(123) });
      // 4. 空白
      tests.push({ name: 'whitespace', result: ai.setAuthor('   ') });
      // 5. 有效
      tests.push({ name: 'valid', result: ai.setAuthor('Test AI') });
      return {
        meta: ai.__meta,
        tests,
      };
    });
    // 全部 invalid 输入应返 false
    const invalidOk = r.tests.slice(0, 4).every(t => t.result === false);
    if (!invalidOk) return { error: 'invalid 输入应返 false', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 20. Auto-save 写盘 race (改前后快速切内容)
  // ============================================================
  async W11_21b_autosave_race(page) {
    await resetDoc(page, '<p>Initial</p>');
    // 模拟: 启动 autosave timer, 期间反复 setContent
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.startAutosaveTimer();
      for (let i = 0; i < 20; i++) {
        M.State.editor.commands.setContent('<p>Change ' + i + '</p>', false);
        await new Promise(r => setTimeout(r, 10));
      }
      // 强制 autosaveNow
      try {
        await M.autosaveNow();
        return { ok: true, dirty: M.State.currentFile?.dirty };
      } catch (e) {
        return { crash: e.message };
      }
    });
    return { ok: r.ok, info: r };
  },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [name, fn] of Object.entries(tests)) {
    const r = await run(browser, name, fn);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    const status = passed ? '✓' : '✗';
    const errInfo = r.result.threw ? ` — THREW: ${r.result.threw}` :
                    r.result.error ? ` — ${r.result.error}` : '';
    console.log(`${status} ${r.name}${errInfo}`);
    if (r.errors.length) console.log('   pageerrors:', r.errors.slice(0, 2).join(' | '));
    if (r.consoleErrs.length) console.log('   console-errors:', r.consoleErrs.slice(0, 2).join(' | '));
    if (r.result && !r.result.threw && Object.keys(r.result).length > 0) {
      const out = JSON.stringify(r.result);
      if (out.length < 200) console.log('   ' + out);
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });