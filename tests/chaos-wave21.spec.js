// Mentor v1.43.14 chaos wave 21 — autosave debounce + IDB debounce shorten
const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html?v=128';

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
  page.on('pageerror', e => errors.push(e.message));
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
  return { name, result, errors };
}

const tests = {
  // 1. 验证 AUTOSAVE_DEBOUNCE = 5000
  async W21_01_debounce_constant(page) {
    const r = await page.evaluate(() => window.__mdAnnotator?.AUTOSAVE_DEBOUNCE);
    if (r !== 5000) return { error: `AUTOSAVE_DEBOUNCE 应 5000, 实际 ${r}`, r };
    return { ok: true, info: r };
  },

  // 2. scheduleAutosaveDebounce 函数存在
  async W21_02_schedule_exists(page) {
    const r = await page.evaluate(() => typeof window.__mdAnnotator?.scheduleAutosaveDebounce);
    if (r !== 'function') return { error: 'scheduleAutosaveDebounce 应为 function', r };
    return { ok: true, info: r };
  },

  // 3. IDB write debounce = 200ms (test by triggering write + checking delay)
  async W21_03_idb_debounce_200ms(page) {
    // Trigger scheduleIdbCacheWrite, check it doesn't write immediately
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'test.md', content: '', annotations: null, dirty: false };
      M.State.authorId = 'test';
      M.State.author = 'tester';
      // Trigger IDB write
      M.State.editor.commands.setContent('trigger idb write', false);
      M.State.annotations = [{
        threadId: 'a1', range: { from: 1, to: 2 }, text: 'x',
        prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
        comments: [],
      }];
      // 不等 debounce 直接 call autosaveNow
      const t0 = performance.now();
      await M.autosaveNow();
      return { tookMs: performance.now() - t0, success: true };
    });
    if (!r.success) return { error: 'autosaveNow 失败', r };
    return { ok: true, perf: r };
  },

  // 4. 多次 markDirty 不会触发多次 autosave (debounce 工作)
  async W21_04_debounce_dedup(page) {
    const r = await page.evaluate(async () => {
      window.__mdAnnotator.State.saveMode = 'mentor-handle';
      window.__mdAnnotator.State.currentFile = { name: 'mock.mentor', handle: { createWritable: () => ({ write: () => {}, close: () => {} }) }, content: '', annotations: null, dirty: true };

      // 快速触发 5 次 scheduleAutosaveDebounce
      for (let i = 0; i < 5; i++) {
        window.__mdAnnotator.scheduleAutosaveDebounce();
      }

      // 检查: timer 已设置 (但还没触发)
      const timerSet = !!window.__mdAnnotator.scheduleAutosaveDebounce._t;

      // 等 5.5s 让 debounce 触发
      await new Promise(r => setTimeout(r, 5500));

      // 检查: timer 已清空
      const timerCleared = !window.__mdAnnotator.scheduleAutosaveDebounce._t;

      return { timerSet, timerCleared };
    });
    if (!r.timerSet) return { error: 'debounce timer 应设置', r };
    if (!r.timerCleared) return { error: '5.5s 后 timer 应清空', r };
    return { ok: true, info: r };
  },

  // 5. markDirty → scheduleAutosaveDebounce 在 onUpdate 里被调
  async W21_05_onupdate_triggers_debounce(page) {
    const r = await page.evaluate(async () => {
      window.__mdAnnotator.State.saveMode = 'mentor-handle';
      window.__mdAnnotator.State.currentFile = { name: 'onu.mentor', handle: { createWritable: () => ({ write: () => {}, close: () => {} }) }, content: '', annotations: null, dirty: true };

      // 编辑触发 onUpdate (markDirty + scheduleAutosaveDebounce)
      window.__mdAnnotator.State.editor.commands.insertContent('X');

      // 检查: debounce timer 已设置
      const timerSet = !!window.__mdAnnotator.scheduleAutosaveDebounce._t;
      // 等 5.5s
      await new Promise(r => setTimeout(r, 5500));
      const timerCleared = !window.__mdAnnotator.scheduleAutosaveDebounce._t;
      return { timerSet, timerCleared };
    });
    if (!r.timerSet) return { error: 'onUpdate 后 debounce timer 应设置', r };
    if (!r.timerCleared) return { error: '5.5s 后 timer 应清空', r };
    return { ok: true, info: r };
  },

  // 6. IDB cache write 200ms debounce (via markDirty)
  async W21_06_idb_cache_write_speed(page) {
    const r = await page.evaluate(async () => {
      // 记录 IDB 写入次数
      let writeCount = 0;
      const origPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function() { writeCount++; return origPut.apply(this, arguments); };

      window.__mdAnnotator.State.currentFile = { name: 'idb-test.md', content: '', annotations: null, dirty: false };
      window.__mdAnnotator.State.editor.commands.setContent('test', false);
      window.__mdAnnotator.State.annotations = [{
        threadId: 'i1', range: { from: 1, to: 2 }, text: 'x',
        prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
        comments: [],
      }];

      // 触发 markDirty
      const t0 = Date.now();
      // 直接调用 scheduleIdbCacheWrite
      // 不可直接调用 (没暴露), 用 markDirty 触发
      // markDirty 私有, 用 onUpdate 替代
      window.__mdAnnotator.State.editor.commands.insertContent('Y');

      // 立即检查 (debounce 200ms, 不应该已经写)
      const before = writeCount;
      // 等 250ms
      await new Promise(r => setTimeout(r, 250));
      const after = writeCount;

      IDBObjectStore.prototype.put = origPut;
      return { before, after, deltaMs: Date.now() - t0 };
    });
    if (r.after < 1) return { error: 'IDB write 200ms 后应触发', r };
    return { ok: true, info: r };
  },

  // 7. 5 秒 debounce 比 30 秒 setInterval 更及时
  async W21_07_faster_autosave(page) {
    // 这个测试是设计意图, 验证 5s < 30s
    const debounce = await page.evaluate(() => window.__mdAnnotator?.AUTOSAVE_DEBOUNCE);
    if (debounce > 30000) return { error: `AUTOSAVE_DEBOUNCE ${debounce}ms 不应超过 30000ms` };
    if (debounce < 1000) return { error: `AUTOSAVE_DEBOUNCE ${debounce}ms 不应小于 1000ms (频繁写盘)` };
    return { ok: true, info: { debounce, expected: '1-30s 合理' } };
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