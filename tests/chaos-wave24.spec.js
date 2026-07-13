// Mentor v1.43.17 chaos wave 24 — desktop shortcut + URL ?open= auto-load
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8787/index.html?v=131';
const DFC_PAPER = 'C:/Users/User/Desktop/dFC/literature/papers/markdown/scholar.Abnormal.dynamic.properties.of.FC.in.dis.md';

async function run(browser, name, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let result;
  try {
    result = await Promise.race([
      fn(page, ctx, browser),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_60s')), 60000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors };
}

const tests = {
  // 1. 验证 mentor.cmd 存在
  async W24_01_cmd_exists(page) {
    if (!fs.existsSync('E:/hermes_playground/Mentor/mentor.cmd')) return { error: 'mentor.cmd 不存在' };
    return { ok: true, info: { size: fs.statSync('E:/hermes_playground/Mentor/mentor.cmd').size } };
  },

  // 2. 验证 mentor-server.py 存在
  async W24_02_server_py_exists(page) {
    if (!fs.existsSync('E:/hermes_playground/Mentor/mentor-server.py')) return { error: 'mentor-server.py 不存在' };
    return { ok: true, info: { size: fs.statSync('E:/hermes_playground/Mentor/mentor-server.py').size } };
  },

  // 3. 验证 desktop shortcut 存在
  async W24_03_desktop_shortcut(page) {
    const lnkPath = 'C:/Users/User/Desktop/Mentor.lnk';
    if (!fs.existsSync(lnkPath)) return { error: `Desktop shortcut 不存在: ${lnkPath}` };
    return { ok: true, info: { path: lnkPath, size: fs.statSync(lnkPath).size } };
  },

  // 4. server /open endpoint 工作
  async W24_04_open_endpoint(page, _ctx, browser) {
    if (!fs.existsSync(DFC_PAPER + '.mentor')) {
      // 先 build 一个 — 用新 page 因为当前 page 可能没 __mdAnnotator
      const buildCtx = await browser.newContext();
      const buildPage = await buildCtx.newPage();
      await buildPage.goto(URL);
      await buildPage.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
      const r = await buildPage.evaluate(async (text) => {
        const M = window.__mdAnnotator;
        const blob = await M.buildMentorZipBlob(text, { version: '1', document: 't', annotations: [] }, {});
        const buf = await blob.arrayBuffer();
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
      }, fs.readFileSync(DFC_PAPER, 'utf8'));
      fs.writeFileSync(DFC_PAPER + '.mentor', Buffer.from(r, 'base64'));
      await buildCtx.close();
    }
    // 用 fetch 测 endpoint
    await page.goto(URL);
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
    const r = await page.evaluate(async () => {
      try {
        const r = await fetch('/open?path=C:/Users/User/Desktop/dFC/literature/papers/markdown/scholar.Abnormal.dynamic.properties.of.FC.in.dis.md.mentor');
        return { ok: r.ok, status: r.status, size: (await r.blob()).size };
      } catch (e) {
        return { error: e.message };
      }
    });
    if (!r.ok) return { error: `endpoint 失败: ${r.status}`, r };
    return { ok: true, info: r };
  },

  // 5. ?open= URL 触发自动加载
  async W24_05_url_open_autoload(page) {
    if (!fs.existsSync(DFC_PAPER + '.mentor')) return { skipped: 'mentor 文件不存在' };
    await page.goto(URL + '&open=' + encodeURIComponent(DFC_PAPER + '.mentor'));
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => ({
      docText: window.__mdAnnotator?.State?.editor?.state?.doc?.textContent,
      annCount: window.__mdAnnotator?.State?.annotations?.length,
    }));
    if (!state.docText || !state.docText.includes('Abnormal dynamic properties')) {
      return { error: '未自动加载 DFC paper', state };
    }
    return { ok: true, info: { docLen: state.docText.length, annCount: state.annCount } };
  },

  // 6. 不带 ?open= 时不自动加载 (不会调用 _handleUrlOpen)
  async W24_06_no_open_no_autoload(page) {
    await page.goto(URL);
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => ({
      docText: window.__mdAnnotator?.State?.editor?.state?.doc?.textContent,
    }));
    // 不带 ?open= 时, docText 应该是空或初始内容 (但不是 DFC 内容)
    if (state.docText && state.docText.includes('Abnormal dynamic properties')) {
      return { error: '不应该自动加载 DFC', state };
    }
    return { ok: true, info: { docLen: (state.docText || '').length } };
  },

  // 7. 错误路径: ?open= 不存在文件
  async W24_07_open_missing_file(page) {
    await page.goto(URL);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      const r = await fetch('/open?path=C:/nonexistent.mentor');
      return { status: r.status, ok: r.ok };
    });
    if (r.status !== 404) return { error: `应 404, 实际 ${r.status}`, r };
    return { ok: true, info: r };
  },

  // 8. 错误路径: ?open= 非 .mentor 文件
  async W24_08_open_non_mentor(page) {
    await page.goto(URL);
    await page.waitForTimeout(1500);
    // 用一个真实存在但不是 .mentor 的文件
    const r = await page.evaluate(async () => {
      const r = await fetch('/open?path=C:/Users/User/Desktop/dFC/literature/papers/markdown/scholar.Abnormal.dynamic.properties.of.FC.in.dis.md');
      return { status: r.status, ok: r.ok };
    });
    if (r.status !== 400) return { error: `应 400, 实际 ${r.status}`, r };
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
                    r.result.error ? ` — ${r.result.error}` :
                    r.result.skipped ? ` — ${r.result.skipped}` : '';
    console.log(`${status} ${r.name}${errInfo}`);
    if (r.errors.length) console.log('   pageerrors:', r.errors.slice(0, 2).join(' | '));
    if (r.result && !r.result.threw && Object.keys(r.result).length > 0) {
      const out = JSON.stringify(r.result);
      if (out.length < 300) console.log('   ' + out);
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });