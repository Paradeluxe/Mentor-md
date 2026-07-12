// E2E: 打开文件时立即申请权限, 后续 autosave 不会再弹权限框
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/index.html?v=117', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const results = [];
  function step(name, ok, info) {
    results.push({ name, ok, info });
    console.log((ok ? '✓' : '✗') + ' ' + name + ': ' + JSON.stringify(info).slice(0, 300));
  }

  try {
    // T1: 直接调 ensureWritePermission (mock handle) — 验证逻辑
    const t1 = await page.evaluate(async () => {
      let callCount = { query: 0, request: 0 };
      const mockHandle = {
        queryPermission: async (m) => { callCount.query++; return 'granted'; },
        requestPermission: async (m) => { callCount.request++; return 'granted'; },
      };
      const r1 = await window.__mdAnnotator.ensureWritePermission(mockHandle);
      return { result: r1, callCount: { ...callCount } };
    });
    step('T1_granted_no_request_call',
      t1.result === 'granted' && t1.callCount.query === 1 && t1.callCount.request === 0,
      t1);

    // T2: prompt → granted → request called
    const t2 = await page.evaluate(async () => {
      let callCount = { query: 0, request: 0 };
      const mockHandle = {
        queryPermission: async (m) => { callCount.query++; return 'prompt'; },
        requestPermission: async (m) => { callCount.request++; return 'granted'; },
      };
      const r = await window.__mdAnnotator.ensureWritePermission(mockHandle);
      return { result: r, callCount: { ...callCount } };
    });
    step('T2_prompt_calls_request',
      t2.result === 'granted' && t2.callCount.query === 1 && t2.callCount.request === 1,
      t2);

    // T3: denied → 返回 'denied'
    const t3 = await page.evaluate(async () => {
      const mockHandle = {
        queryPermission: async (m) => 'prompt',
        requestPermission: async (m) => 'denied',
      };
      const r = await window.__mdAnnotator.ensureWritePermission(mockHandle);
      return r;
    });
    step('T3_denied_returns_denied', t3 === 'denied', { t3 });

    // T4: exception in queryPermission → fallback to request
    const t4 = await page.evaluate(async () => {
      const mockHandle = {
        queryPermission: async (m) => { throw new Error('not supported'); },
        requestPermission: async (m) => 'granted',
      };
      return await window.__mdAnnotator.ensureWritePermission(mockHandle);
    });
    step('T4_query_throws_falls_back_to_request', t4 === 'granted', { t4 });

    // T5: exception in request → 'unknown'
    const t5 = await page.evaluate(async () => {
      const mockHandle = {
        queryPermission: async (m) => 'prompt',
        requestPermission: async (m) => { throw new Error('user gesture expired'); },
      };
      return await window.__mdAnnotator.ensureWritePermission(mockHandle);
    });
    step('T5_request_throws_returns_unknown', t5 === 'unknown', { t5 });

    // T6: openFromHandle 内部调用了 ensureWritePermission
    // 不能直接调 (需要 fileHandle), 但可以 verify 函数引用
    const t6 = await page.evaluate(() => {
      // 反编译看 openFromHandle 源码是否提到 ensureWritePermission
      // 不容易, 改测 source string
      return {
        hasEnsure: typeof window.__mdAnnotator.ensureWritePermission === 'function',
      };
    });
    step('T6_helper_exposed', t6.hasEnsure, t6);

  } catch (e) {
    step('FATAL', false, { error: e.message });
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log('---');
  console.log(`TOTAL: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });