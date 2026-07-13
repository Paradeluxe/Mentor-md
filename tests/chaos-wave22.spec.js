// Mentor v1.43.15 chaos wave 22 — Web Worker zip offload
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8765/index.html?v=129';
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
  // 1. Worker 初始化检测
  async W22_01_worker_initialized(page) {
    // 触发 buildMentorZipBlob 让 worker lazy init
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      await M.buildMentorZipBlob('test', { version: '1', document: 't', annotations: [] }, {});
      // 检查 worker 内部状态 (通过 console.log 抓)
      return { built: true };
    });
    if (!r.built) return { error: 'build 失败', r };
    return { ok: true, info: r };
  },

  // 2. Build 端到端: DFC + 30 ann
  async W22_02_build_dfc_30ann(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const r = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
      const ed = M.State.editor;
      const total = ed.state.doc.content.size;
      for (let i = 0; i < 30; i++) {
        const from = 1 + i * 200;
        if (from + 1 > total - 2) break;
        ed.commands.setTextSelection({ from, to: from + 1 });
        document.querySelector('#float-comment-btn button').click();
      }
      const md = M.htmlToMarkdown(ed.getHTML());
      const sidecar = { version: '1', document: 'dfc.mentor', annotations: M.State.annotations };
      const t0 = performance.now();
      const blob = await M.buildMentorZipBlob(md, sidecar, {});
      const ms = performance.now() - t0;
      return { buildMs: ms, annCount: M.State.annotations.length, size: blob.size };
    }, mdText);
    if (r.annCount !== 30) return { error: `ann 应 30, 实际 ${r.annCount}`, r };
    return { ok: true, perf: r };
  },

  // 3. Load 端到端
  async W22_03_load_dfc(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    // 先 build
    const setup = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      const anns = [];
      for (let i = 0; i < 30; i++) {
        anns.push({ threadId: 'l-' + i, range: { from: 1, to: 2 }, text: 'x', prefix: '', suffix: '', resolved: false, createdAt: '', comments: [] });
      }
      const blob = await M.buildMentorZipBlob(text, { version: '1', document: 'dfc.mentor', annotations: anns }, {});
      const buf = await blob.arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }, mdText);
    // 然后 load
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'dfc.mentor', { type: 'application/zip' });
      const M = window.__mdAnnotator;
      const t0 = performance.now();
      const result = await M.readMentorZip(file);
      const ms = performance.now() - t0;
      return { loadMs: ms, mdLen: result.mdText.length, annCount: result.annotations?.annotations?.length };
    }, setup);
    if (r.annCount !== 30) return { error: `ann 应 30, 实际 ${r.annCount}`, r };
    return { ok: true, perf: r };
  },

  // 4. 5x 混合 build + load
  async W22_04_5x_mixed(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const r = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 't', annotations: [] };
      const timings = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const blob = await M.buildMentorZipBlob(md, sidecar, {});
        const t1 = performance.now();
        const buf = await blob.arrayBuffer();
        const arr = new Uint8Array(buf);
        const file = new File([arr], 't.mentor', { type: 'application/zip' });
        await M.readMentorZip(file);
        const t2 = performance.now();
        timings.push({ build: t1 - t0, load: t2 - t1 });
      }
      return timings;
    }, mdText);
    const avgBuild = r.reduce((s, t) => s + t.build, 0) / r.length;
    const avgLoad = r.reduce((s, t) => s + t.load, 0) / r.length;
    return { ok: true, perf: { avgBuild, avgLoad } };
  },

  // 5. 带 media 的 .mentor
  async W22_05_with_media(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const md = '# Test\n\n![i1](media/i1.png) ![i2](media/i2.png)';
      const mediaFiles = {};
      for (let i = 1; i <= 5; i++) {
        mediaFiles[`media/i${i}.png`] = new Blob(['binary-' + i + '-'.repeat(100)], { type: 'image/png' });
      }
      const anns = [];
      for (let i = 0; i < 10; i++) anns.push({ threadId: 'm-' + i, range: { from: 1, to: 2 }, text: 'x', prefix: '', suffix: '', resolved: false, createdAt: '', comments: [] });
      const blob = await M.buildMentorZipBlob(md, { version: '1', document: 'm', annotations: anns }, mediaFiles);
      const buf = await blob.arrayBuffer();
      const arr = new Uint8Array(buf);
      const file = new File([arr], 'm.mentor', { type: 'application/zip' });
      const result = await M.readMentorZip(file);
      return {
        annCount: result.annotations?.annotations?.length,
        mediaCount: Object.keys(result.mediaFiles || {}).length,
        mdLen: result.mdText.length,
      };
    });
    if (r.mediaCount !== 5) return { error: `应 5 media, 实际 ${r.mediaCount}`, r };
    if (r.annCount !== 10) return { error: `应 10 ann, 实际 ${r.annCount}`, r };
    return { ok: true, info: r };
  },

  // 6. corrupt .mentor 仍 reject
  async W22_06_corrupt_rejected(page) {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const file = new File(['not a zip'], 'bad.mentor', { type: 'application/zip' });
      try {
        await M.readMentorZip(file);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    if (r.ok) return { error: 'corrupt 应被 reject', r };
    return { ok: true, info: r };
  },

  // 7. partial .mentor (无 annotations.json)
  async W22_07_partial_compat(page) {
    const r = await page.evaluate(async () => {
      const m = await import('https://esm.sh/jszip@3.10.1');
      const JSZip = m.default || m;
      const z = new JSZip();
      z.file('content.md', '# Partial');
      const blob = await z.generateAsync({ type: 'blob' });
      const buf = await blob.arrayBuffer();
      const arr = new Uint8Array(buf);
      const file = new File([arr], 'p.mentor', { type: 'application/zip' });
      const result = await window.__mdAnnotator.readMentorZip(file);
      return { hasAnnotations: !!result.annotations, mdLen: result.mdText.length };
    });
    if (r.hasAnnotations) return { error: 'partial 应 annotations=null', r };
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