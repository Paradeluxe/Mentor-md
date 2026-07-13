// Mentor v1.43.12 chaos wave 19 — JSZip prewarm
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8787/index.html?v=126';
const DFC_PAPER = 'C:/Users/User/Desktop/dFC/literature/papers/markdown/scholar.Abnormal.dynamic.properties.of.FC.in.dis.md';

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
  // ============================================================
  // 1. 验证 jszipPrewarmed 标志
  // ============================================================
  async W19_01_jszip_prewarmed_flag(page) {
    const r = await page.evaluate(() => ({
      prewarmed: window.__mdAnnotator?.State?.jszipPrewarmed,
      hasBuildFn: typeof window.__mdAnnotator?.buildMentorZipBlob === 'function',
      hasReadFn: typeof window.__mdAnnotator?.readMentorZip === 'function',
    }));
    if (!r.prewarmed) return { error: 'jszipPrewarmed 应 true', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 2. 真实 perf: 预热后首次 build
  // ============================================================
  async W19_02_prewarmed_first_build(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const r = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
      // 测 1st build
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'prewarm-test.md', annotations: [] };
      const t0 = performance.now();
      const blob1 = await M.buildMentorZipBlob(md, sidecar, {});
      const ms1 = performance.now() - t0;
      // 测 2nd build
      const t1 = performance.now();
      const blob2 = await M.buildMentorZipBlob(md, sidecar, {});
      const ms2 = performance.now() - t1;
      return { ms1, ms2, size: blob1.size, prewarmed: M.State.jszipPrewarmed };
    }, mdText);
    // 1st build 应该在 200ms 内 (无 cold start)
    if (r.ms1 > 500) return { error: `1st build ${r.ms1}ms 太慢 (预热失败?)`, r };
    return { ok: true, perf: r };
  },

  // ============================================================
  // 3. 预热后首次 loadMentorZip
  // ============================================================
  async W19_03_prewarmed_first_load(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    // 先 build 一个 .mentor blob
    const setup = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const blob = await M.buildMentorZipBlob(md, { version: '1', document: 'test.md', annotations: [] }, {});
      const buf = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return { b64, size: blob.size };
    }, mdText);
    // 然后 loadMentorZip
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'test.mentor', { type: 'application/zip' });
      const M = window.__mdAnnotator;
      const t0 = performance.now();
      const result = await M.readMentorZip(file);
      const ms1 = performance.now() - t0;
      // 2nd
      const file2 = new File([arr], 'test.mentor', { type: 'application/zip' });
      const t1 = performance.now();
      const result2 = await M.readMentorZip(file2);
      const ms2 = performance.now() - t1;
      return { ms1, ms2, mdLen: result.mdText.length };
    }, setup.b64);
    if (r.ms1 > 200) return { error: `1st load ${r.ms1}ms 太慢 (预热失败?)`, r };
    return { ok: true, perf: r };
  },

  // ============================================================
  // 4. 验证 boot 时 jszipPrewarmed 立即为 true
  // ============================================================
  async W19_04_early_pageload(page) {
    // 测新建 tab 早期 (boot 完成前/后) jszipPrewarmed
    const r = await page.evaluate(() => window.__mdAnnotator?.State?.jszipPrewarmed);
    if (!r) return { error: 'jszipPrewarmed 应在 boot 后立即 true' };
    return { ok: true, info: { prewarmed: r } };
  },

  // ============================================================
  // 5. 多次 build + load 混合 (模拟真实用户混合操作)
  // ============================================================
  async W19_05_mixed_build_load(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const r = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'mixed-test.md', annotations: [] };
      const build = async () => {
        const blob = await M.buildMentorZipBlob(md, sidecar, {});
        return blob;
      };
      const load = async (blob) => {
        const file = new File([blob], 't.mentor', { type: 'application/zip' });
        return M.readMentorZip(file);
      };
      // 交替 build + load 5 次
      const timings = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const blob = await build();
        const t1 = performance.now();
        await load(blob);
        const t2 = performance.now();
        timings.push({ build: t1 - t0, load: t2 - t1 });
      }
      return timings;
    }, mdText);
    const avgBuild = r.reduce((s, t) => s + t.build, 0) / r.length;
    const avgLoad = r.reduce((s, t) => s + t.load, 0) / r.length;
    if (avgBuild > 100 || avgLoad > 200) return { error: `build/load avg 太慢`, r };
    return { ok: true, perf: { avgBuild, avgLoad, ...r } };
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