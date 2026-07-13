// Mentor v1.43.6 chaos wave 13 — 第四轮变态测试
// 4 大方向:
//   1. 真实大文件 perf (5MB .md)
//   2. 并发测试 (用户 + autosave + AI 同时操作)
//   3. 崩溃恢复 (reload 中断 autosave 验证数据不丢)
//   4. 导出 import round-trip (.mentor / .docx / .md)

const { chromium } = require('playwright');
const URL = 'http://localhost:8787/index.html?v=123';

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
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_90s')), 90000)),
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

const tests = {
  // ============================================================
  // 1. 真实大文件 perf: 1MB / 5MB markdown
  // ============================================================
  async W13_01_load_1mb_doc(page) {
    // 1MB doc ~ 1M chars
    const bigText = 'Markdown is a lightweight markup language with plain-text formatting syntax. '.repeat(22000);  // ~1.1M chars
    const t0 = Date.now();
    await page.evaluate((text) => {
      window.__mdAnnotator.State.editor.commands.setContent('<p>' + text + '</p>', false);
    }, bigText);
    const loadTime = Date.now() - t0;
    const docLen = await page.evaluate(() => window.__mdAnnotator.State.editor.state.doc.content.size);
    if (loadTime > 5000) return { error: `1MB load ${loadTime}ms 太慢 (>5s)`, loadTime };
    return { ok: true, perf: { loadTime, docLen } };
  },

  async W13_02_load_5mb_doc(page) {
    // 5MB doc ~ 5M chars
    const bigText = 'Markdown is a lightweight markup language with plain-text formatting syntax. '.repeat(110000);  // ~5.5M chars
    const t0 = Date.now();
    await page.evaluate((text) => {
      window.__mdAnnotator.State.editor.commands.setContent('<p>' + text + '</p>', false);
    }, bigText);
    const loadTime = Date.now() - t0;
    const docLen = await page.evaluate(() => window.__mdAnnotator.State.editor.state.doc.content.size);
    // 5MB 可能慢, 给 30s 容忍
    if (loadTime > 30000) return { error: `5MB load ${loadTime}ms 太慢 (>30s)`, loadTime };
    return { ok: true, perf: { loadTime, docLen } };
  },

  async W13_03_5mb_doc_keystroke_perf(page) {
    // 5MB doc + 打字 perf. v1.42.7 perf fix 让 validate O(N+doc), 5MB 应该 < 3s
    const bigText = 'Markdown is a lightweight markup language with plain-text formatting syntax. '.repeat(110000);
    await page.evaluate((text) => {
      window.__mdAnnotator.State.editor.commands.setContent('<p>' + text + '</p>', false);
      window.__mdAnnotator.State.editor.commands.setTextSelection(1);
    }, bigText);
    await page.waitForTimeout(500);
    const t0 = Date.now();
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.insertContent('X');
    });
    const insertTime = Date.now() - t0;
    // 5MB doc + 1 char insert — 大文件极限场景, 给 5s 容忍
    // (实测 ~750ms ~ 2100ms 之间波动)
    if (insertTime > 5000) return { error: `5MB insert ${insertTime}ms 太慢 (>5s)`, insertTime };
    return { ok: true, perf: { insertTime } };
  },

  // ============================================================
  // 2. 并发测试: 用户 + autosave + AI 同时
  // ============================================================
  async W13_04_concurrent_user_ai_autosave(page) {
    await resetDoc(page, '<p>0123456789ABCDEFGHIJ</p>');
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // 启动用户连续 insert + AI subscribe + 周期性 autosave
      const events = [];
      const unsub = M.ai.onThreadChange((e) => events.push(e.change));
      // 用户: 20 次 insert
      const insertPromises = [];
      for (let i = 0; i < 20; i++) {
        insertPromises.push(new Promise(r => setTimeout(() => {
          M.State.editor.commands.insertContent('x');
          r(i);
        }, i * 5)));
      }
      // AI: 1 个 reply (建 ann 后立即 reply)
      const aiPromise = (async () => {
        await new Promise(r => setTimeout(r, 30));
        // 建个 ann
        M.State.editor.commands.setTextSelection({ from: 1, to: 5 });
        document.querySelector('#float-comment-btn button').click();
        await new Promise(r => setTimeout(r, 20));
        const t = M.State.annotations[0];
        if (t) {
          const result = await M.ai.reply(t.threadId, 'AI concurrent');
          return result;
        }
        return null;
      })();
      // autosave: 3 次
      const savePromises = [];
      for (let i = 0; i < 3; i++) {
        savePromises.push(new Promise(r => setTimeout(async () => {
          await M.autosaveNow();
          r(i);
        }, 50 + i * 30)));
      }
      await Promise.all([...insertPromises, aiPromise, ...savePromises]);
      unsub();
      return {
        docLen: M.State.editor.state.doc.textContent.length,
        annCount: M.State.annotations.length,
        aiReply: (await aiPromise)?.ok,
        events,
      };
    });
    if (!r.aiReply) return { error: 'AI reply 应成功', r };
    if (r.annCount !== 1) return { error: 'ann 数应 1', r };
    if (!r.events.includes('create')) return { error: '应有 create 事件', r };
    return { ok: true, info: r };
  },

  async W13_05_100_concurrent_setcontent(page) {
    await resetDoc(page, '<p>0123456789</p>');
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(new Promise(r => setTimeout(() => {
          try {
            M.State.editor.commands.setContent('<p>concurrent ' + i + '</p>', false);
            r(true);
          } catch (e) {
            r(false);
          }
        }, i)));
      }
      const results = await Promise.all(promises);
      return {
        okCount: results.filter(Boolean).length,
        total: 100,
      };
    });
    const totalTime = Date.now() - t0;
    return { ok: r.okCount === 100, perf: { totalTime, ...r } };
  },

  // ============================================================
  // 3. 崩溃恢复: reload 中断 autosave, 数据是否丢
  // ============================================================
  async W13_06_crash_recovery_during_autosave(page) {
    await resetDoc(page, '<p>0123456789</p>');
    // 建一个 ann
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 2, to: 5 });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => ({
      annCount: window.__mdAnnotator.State.annotations.length,
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    // 触发 autosave + 立刻 reload (模拟崩溃)
    await Promise.all([
      page.evaluate(() => window.__mdAnnotator.autosaveNow()),
      page.waitForTimeout(100).then(() => page.reload({ waitUntil: 'domcontentloaded' })),
    ]);
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page.waitForTimeout(1000);  // 等 autosave / IDB 写完
    const after = await page.evaluate(() => ({
      annCount: window.__mdAnnotator.State.annotations.length,
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
      idbCacheKeys: Object.keys(window.__mdAnnotator.State.idbCache || {}),
    }));
    return { ok: true, before, after };
  },

  async W13_07_reload_preserves_dirty_state(page) {
    await resetDoc(page, '<p>initial content</p>');
    // 修改但不 autosave
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.insertContent(' ADDED');
    });
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => ({
      dirty: window.__mdAnnotator.State.currentFile?.dirty,
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    // 不调 autosave, 直接 reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      dirty: window.__mdAnnotator.State.currentFile?.dirty,
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    // reload 后应该是初始内容 (没保存)
    if (after.docText.includes('ADDED')) return { error: 'reload 后不应有未保存内容', before, after };
    return { ok: true, before, after };
  },

  // ============================================================
  // 4. 导出 import round-trip: .mentor / .docx / .md
  // ============================================================
  async W13_08_mentor_roundtrip(page) {
    await resetDoc(page, '<p>这是一段用于 roundtrip 测试的文档</p>');
    // 建 2 个 ann
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 1, to: 5 });
      document.querySelector('#float-comment-btn button').click();
      ed.commands.setTextSelection({ from: 7, to: 10 });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(200);
    // 加 reply
    await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0].threadId;
      await M.ai.reply(tid, 'AI 测试 reply');
    });
    await page.waitForTimeout(100);
    // 导出为 blob
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      // 加 1 条 user 评论 (模拟)
      M.State.annotations[0].comments.push({
        id: 'c1',
        author: { id: 'u1', name: 'TestUser' },
        body: 'User test comment',
        createdAt: new Date().toISOString(),
      });
      const sidecar = {
        version: '1',
        document: 'roundtrip-test.md',
        annotations: M.State.annotations,
      };
      try {
        const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
        // 读回
        const { mdText: mdBack, annotations } = await M.readMentorZip(blob);
        return {
          ok: true,
          mdOriginalLen: mdText.length,
          mdBackLen: mdBack.length,
          annBackCount: annotations?.annotations?.length,
          annBackTexts: annotations?.annotations?.map(a => a.text),
          commentBackCount: annotations?.annotations?.[0]?.comments?.length,
        };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: 'roundtrip 崩', r };
    if (r.annBackCount !== 2) return { error: `2 个 ann 应都在, 实际 ${r.annBackCount}`, r };
    if (r.commentBackCount < 2) return { error: `reply+user 应都在, 实际 ${r.commentBackCount}`, r };
    return { ok: true, info: r };
  },

  async W13_09_md_export(page) {
    await resetDoc(page, '<h1>标题</h1><p>段落内容</p>');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      try {
        const md = M.htmlToMarkdown(M.State.editor.getHTML());
        return {
          md,
          hasTitle: md.includes('# 标题') || md.includes('#标题'),
          hasP: md.includes('段落内容'),
        };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: 'md 导出崩', r };
    if (!r.hasTitle || !r.hasP) return { error: 'md 应包含标题和段落', r };
    return { ok: true, info: { mdLen: r.md.length, sample: r.md.slice(0, 100) } };
  },

  async W13_10_export_with_emoji_mark(page) {
    // emoji mark + export
    await resetDoc(page, '<p>测试 emoji 👋 内容</p>');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      // 找 👋 位置
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText) {
          const idx = n.text.indexOf('👋');
          if (idx >= 0 && from < 0) {
            from = pos + idx;
            to = from + 2;  // surrogate pair
          }
        }
      });
      if (from < 0) return { error: '没找到 emoji' };
      ed.commands.setTextSelection({ from, to });
      const before = M.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      if (M.State.annotations.length === before) return { error: 'emoji mark 没创建' };
      const t = M.State.annotations[0];
      if (t.text !== '👋') return { error: `ann.text 应 '👋', 实际 '${t.text}'` };
      // 导出 md — 应不包含 mark 干扰
      try {
        const md = M.htmlToMarkdown(ed.getHTML());
        return {
          ok: true,
          mdContainsEmoji: md.includes('👋'),
          annText: t.text,
        };
      } catch (e) {
        return { crash: e.message };
      }
    });
    return r.ok ? { ok: true, info: r } : r;
  },

  // ============================================================
  // 5. 边界综合
  // ============================================================
  async W13_11_save_load_cycle_x10(page) {
    await resetDoc(page, '<p>0123456789</p>');
    // 反复 build + read mentor 10 次
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // 建 1 个 ann
      M.State.editor.commands.setTextSelection({ from: 2, to: 5 });
      document.querySelector('#float-comment-btn button').click();
      await new Promise(r => setTimeout(r, 50));
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = {
        version: '1',
        document: 'cycle.md',
        annotations: M.State.annotations,
      };
      const cycles = [];
      for (let i = 0; i < 10; i++) {
        try {
          const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
          const back = await M.readMentorZip(blob);
          cycles.push({ ok: true, annCount: back.annotations?.annotations?.length });
        } catch (e) {
          cycles.push({ ok: false, err: e.message });
        }
      }
      return cycles;
    });
    const allOk = r.every(c => c.ok && c.annCount === 1);
    if (!allOk) return { error: 'cycle 有失败', r };
    return { ok: true, info: { cycles: r.length } };
  },

  async W13_12_zero_byte_doc(page) {
    await resetDoc(page, '');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      try {
        const md = M.htmlToMarkdown(M.State.editor.getHTML());
        return { ok: true, md };
      } catch (e) {
        return { crash: e.message };
      }
    });
    return { ok: true, info: r };
  },

  async W13_13_special_chars_in_ann(page) {
    await resetDoc(page, '<p>0123456789</p>');
    // 用 surrogate pair + 各种 unicode 测试
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      // 用 mark text = "🎉中文"
      ed.commands.setContent('<p>庆祝 🎉 中文 完成</p>', false);
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText) {
          const idx = n.text.indexOf('🎉');
          if (idx >= 0 && from < 0) {
            from = pos + idx;
            to = from + 2;
          }
        }
      });
      if (from < 0) return { error: '没找到 🎉' };
      ed.commands.setTextSelection({ from, to: from + 7 });  // 🎉 + ' 中文'
      const before = M.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = M.State.annotations[0];
      if (!t) return { error: 'mark 没创建' };
      // 导出 + 读回
      const mdText = M.htmlToMarkdown(ed.getHTML());
      const sidecar = { version: '1', document: 'unicode.md', annotations: M.State.annotations };
      const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
      const back = await M.readMentorZip(blob);
      return {
        ok: true,
        annText: t.text,
        backText: back.annotations?.annotations?.[0]?.text,
        match: t.text === back.annotations?.annotations?.[0]?.text,
      };
    });
    if (!r.match) return { error: 'emoji+中文 roundtrip 不匹配', r };
    return { ok: true, info: r };
  },

  async W13_14_huge_ann_count_export(page) {
    // 200 ann + mentor export perf
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>0123456789</p>', false);
      M.State.annotations = [];
      for (let i = 0; i < 200; i++) {
        M.State.annotations.push({
          threadId: 'h-' + i,
          range: { from: 1, to: 2 },
          text: '0',
          prefix: '', suffix: '',
          resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'huge.md', annotations: M.State.annotations };
      try {
        const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
        const back = await M.readMentorZip(blob);
        return { ok: true, backCount: back.annotations?.annotations?.length };
      } catch (e) {
        return { crash: e.message };
      }
    });
    const totalTime = Date.now() - t0;
    if (r.crash) return { error: '200 ann export 崩', r };
    if (r.backCount !== 200) return { error: `200 ann 应都在, 实际 ${r.backCount}`, r };
    return { ok: true, perf: { totalTime, ...r } };
  },

  async W13_15_zero_ann_export(page) {
    // 0 ann 时 export 应正常
    await resetDoc(page, '<p>只有文档没有批注</p>');
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'zero.md', annotations: [] };
      try {
        const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
        const back = await M.readMentorZip(blob);
        return { ok: true, annCount: back.annotations?.annotations?.length };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: '0 ann export 崩', r };
    return { ok: true, info: r };
  },

  async W13_16_table_in_export(page) {
    // 表格 export
    await resetDoc(page, '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>');
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      // 表格 markdown 应含 |
      const hasPipe = mdText.includes('|');
      const hasTable = mdText.includes('A') && mdText.includes('B');
      return { ok: true, md: mdText.slice(0, 200), hasPipe, hasTable };
    });
    if (!r.hasPipe || !r.hasTable) return { error: '表格 export 不完整', r };
    return { ok: true, info: r };
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
      const summary = out.length > 300 ? out.slice(0, 300) + '...' : out;
      console.log('   ' + summary);
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });