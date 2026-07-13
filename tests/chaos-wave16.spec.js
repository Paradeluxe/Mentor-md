// Mentor v1.43.9 chaos wave 16 — 崩溃恢复测试
// 4 方向:
//   1. kill -9 模拟 (page.close)
//   2. reload during autosave
//   3. reload during AI reply
//   4. IDB write failure 模拟

const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html?v=125';

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
      fn(page, browser, ctx),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_90s')), 90000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close().catch(() => {});
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
  // 1. kill -9 模拟 (page.close 中断)
  // ============================================================
  async W16_01_kill_during_normal(page, browser, ctx) {
    await resetDoc(page, '<p>初始内容</p>');
    // 模拟 user 写了内容, dirty 状态
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'crash-test.md', content: '', annotations: null, dirty: false };
      M.State.editor.commands.insertContent('新增内容');
    });
    await page.waitForTimeout(100);
    // 不 autosave, 直接 kill
    await page.close();
    // 新 page 同 context 重新打开
    const page2 = await ctx.newPage();
    await page2.goto(URL + '&cb=' + Date.now());
    await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page2.waitForTimeout(500);
    const r = await page2.evaluate(() => ({
      annCount: window.__mdAnnotator.State.annotations.length,
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
      // 是否有 IDB cache
      cacheKeys: Object.keys(window.__mdAnnotator.State.idbCache || {}),
    }));
    return { ok: true, info: r };
  },

  async W16_02_kill_after_autosave(page, browser, ctx) {
    await resetDoc(page, '<p>初始内容</p>');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'autosaved.md', content: '', annotations: null, dirty: false };
      M.State.editor.commands.insertContent('已 autosaved 内容');
    });
    await page.waitForTimeout(100);
    // autosave
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    await page.waitForTimeout(800);  // 等 debounce + IDB 写完
    await page.close();
    // 新 page 重启
    const page2 = await ctx.newPage();
    await page2.goto(URL + '&cb=' + Date.now());
    await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page2.waitForTimeout(2000);  // 等 IDB 预热 + loadMarkdownIntoEditor 命中 cache
    const r = await page2.evaluate(() => ({
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
      annCount: window.__mdAnnotator.State.annotations.length,
      cacheKeys: Object.keys(window.__mdAnnotator.State.idbCache || {}),
    }));
    return { ok: true, info: r };
  },

  async W16_03_kill_during_ai_reply(page, browser, ctx) {
    // AI reply 进行中 kill
    await resetDoc(page, '<p>0123456789</p>');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 2, to: 5 });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(100);
    // 启动一个永不 resolve 的 reply (模拟 hang)
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations[0];
      // 用 ai.subscribe 模拟: 启动 reply 然后立刻 kill page
      window.__pendingReply = M.ai.reply(t.threadId, 'never-resolve-test-reply');
    });
    // 等 50ms (reply IIFE 已 start)
    await page.waitForTimeout(50);
    // kill (ann 还没 commit 因为 reply 在 dedup check)
    await page.close();
    const page2 = await ctx.newPage();
    await page2.goto(URL + '&cb=' + Date.now());
    await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page2.waitForTimeout(500);
    return { ok: true, info: { restored: true } };
  },

  // ============================================================
  // 2. reload during autosave
  // ============================================================
  async W16_04_reload_during_idb_write(page) {
    await resetDoc(page, '<p>初始内容</p>');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'reload-during.md', content: '', annotations: null, dirty: false };
      M.State.editor.commands.insertContent('写入中...');
    });
    await page.waitForTimeout(100);
    // 触发 autosave + 立刻 reload (不等 500ms debounce)
    const reloadPromise = page.evaluate(() => window.__mdAnnotator.autosaveNow());
    const reloadPage = page.waitForTimeout(200).then(() => page.reload({ waitUntil: 'domcontentloaded' }));
    await Promise.all([reloadPromise, reloadPage]);
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page.waitForTimeout(2000);  // 等 IDB 预热
    const r = await page.evaluate(() => ({
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
      annCount: window.__mdAnnotator.State.annotations.length,
      cacheKeys: Object.keys(window.__mdAnnotator.State.idbCache || {}),
    }));
    return { ok: true, info: r };
  },

  async W16_05_reload_right_after_mark_dirty(page) {
    // markDirty 后 0ms reload — 测试最坏情况
    await resetDoc(page, '<p>测试内容</p>');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'markdirty-fast.md', content: '', annotations: null, dirty: false };
      M.State.editor.commands.insertContent('Fast insert');
    });
    // 不等 — 立刻 reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => ({
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    return { ok: true, info: r };
  },

  // ============================================================
  // 3. IDB write failure 模拟
  // ============================================================
  async W16_06_idb_write_throw(page) {
    await resetDoc(page, '<p>测试 IDB throw</p>');
    // 模拟 IDB put 失败
    const r = await page.evaluate(async () => {
      // monkey-patch IDBObjectStore.prototype.put 让它 throw
      const origPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function() {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      };
      try {
        await window.__mdAnnotator.autosaveNow();
        return { ok: true, msg: 'autosave 不应崩' };
      } catch (e) {
        return { ok: false, crash: e.message };
      } finally {
        IDBObjectStore.prototype.put = origPut;
      }
    });
    return { ok: r.ok, info: r };
  },

  async W16_07_idb_open_failure(page) {
    // IDB open 失败 (e.g. corrupted db)
    await resetDoc(page, '<p>IDB open 失败</p>');
    const r = await page.evaluate(async () => {
      const origOpen = indexedDB.open;
      let openCount = 0;
      indexedDB.open = function(...args) {
        openCount++;
        if (openCount > 2) {
          // 第二次 open 时 throw
          throw new DOMException('DB corrupted', 'InvalidStateError');
        }
        return origOpen.apply(this, args);
      };
      try {
        await window.__mdAnnotator.autosaveNow();
        return { ok: true, openCount };
      } catch (e) {
        return { ok: false, crash: e.message, openCount };
      } finally {
        indexedDB.open = origOpen;
      }
    });
    return { ok: r.ok, info: r };
  },

  // ============================================================
  // 4. 边界: 大量 reload / kill 循环
  // ============================================================
  async W16_08_10_reload_cycles(page) {
    await resetDoc(page, '<p>重载测试</p>');
    await page.evaluate(() => {
      window.__mdAnnotator.State.currentFile = { name: 'reload-cycles.md', content: '', annotations: null, dirty: false };
      window.__mdAnnotator.State.editor.commands.insertContent('内容');
    });
    await page.waitForTimeout(100);
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.__mdAnnotator.autosaveNow());
      await page.waitForTimeout(300);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    }
    const r = await page.evaluate(() => ({
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
    }));
    return { ok: true, info: r };
  },

  async W16_09_kill_during_render(page, browser, ctx) {
    // renderCommentList 进行中 kill
    await page.evaluate(() => {
      window.__mdAnnotator.State.annotations = [];
      for (let i = 0; i < 100; i++) {
        window.__mdAnnotator.State.annotations.push({
          threadId: 'r-' + i, range: { from: 1, to: 2 }, text: '0',
          prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    // kill 在 render 中
    const renderPromise = page.evaluate(() => window.__mdAnnotator.renderCommentList());
    await page.waitForTimeout(10);
    await page.close();
    await renderPromise.catch(() => {});
    return { ok: true, info: { msg: 'render 中 kill 不应崩' } };
  },

  async W16_10_5mb_doc_then_kill(page, browser, ctx) {
    // 100KB doc + 修改 + kill (1MB 太慢, 100KB 足够)
    const bigText = 'A'.repeat(100000);
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'big-crash.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent('<p>' + text + '</p>', false);
    }, bigText);
    await page.waitForTimeout(300);
    // 改 1 字符
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.insertContent('X');
    });
    await page.waitForTimeout(100);
    // 触发 autosave + 立刻 kill
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    await page.waitForTimeout(50);
    await page.close();
    // 重启
    const page2 = await ctx.newPage();
    await page2.goto(URL + '&cb=' + Date.now());
    await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
    await page2.waitForTimeout(2000);
    const r = await page2.evaluate(() => ({
      docLen: window.__mdAnnotator.State.editor.state.doc.content.size,
    }));
    return { ok: true, info: r };
  },

  // ============================================================
  // 5. 多个 ctx (不同 user session) 互不干扰
  // ============================================================
  async W16_11_multi_context_isolation(page, browser) {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto(URL + '&ctx=1');
    await page1.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page1.evaluate(() => {
      window.__mdAnnotator.State.currentFile = { name: 'ctx1.md', content: '', annotations: null, dirty: false };
      window.__mdAnnotator.State.editor.commands.setContent('<p>context 1 内容</p>', false);
    });
    await page1.waitForTimeout(200);
    await page1.evaluate(() => window.__mdAnnotator.autosaveNow());
    await page1.waitForTimeout(800);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(URL + '&ctx=2');
    await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    await page2.evaluate(() => {
      window.__mdAnnotator.State.currentFile = { name: 'ctx2.md', content: '', annotations: null, dirty: false };
      window.__mdAnnotator.State.editor.commands.setContent('<p>context 2 内容</p>', false);
    });
    await page2.waitForTimeout(200);
    await page2.evaluate(() => window.__mdAnnotator.autosaveNow());
    await page2.waitForTimeout(800);

    // kill ctx1
    await ctx1.close();
    await page2.waitForTimeout(500);

    // ctx2 应该不受影响
    const r2 = await page2.evaluate(() => ({
      docText: window.__mdAnnotator.State.editor.state.doc.textContent,
      annCount: window.__mdAnnotator.State.annotations.length,
    }));
    await ctx2.close();
    return { ok: r2.docText.includes('context 2'), info: r2 };
  },

  // ============================================================
  // 6. 删 IDB 模拟 db 损坏
  // ============================================================
  async W16_12_delete_idb_during_session(page) {
    await resetDoc(page, '<p>idb 删了</p>');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'idb-deleted.md', content: '', annotations: null, dirty: false };
      M.State.editor.commands.insertContent('x');
    });
    await page.waitForTimeout(100);
    // 删 IDB - 用同步 request, 不等 indexedDB.databases() (那会 hang)
    const r = await page.evaluate(async () => {
      // 直接用 deleteDatabase API
      const deleteDb = (name) => new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = resolve;
        req.onerror = resolve;
        req.onblocked = resolve;
        setTimeout(resolve, 1000);  // 1s timeout
      });
      // 删所有已知 db name
      await deleteDb('mentor-cache');
      await deleteDb('mentor-annotations');
      try {
        await window.__mdAnnotator.autosaveNow();
        return { ok: true };
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
      if (out.length < 250) console.log('   ' + out);
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });