// Mentor v1.43.13 chaos wave 20 — readMentorZip parallel extract
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8787/index.html?v=127';
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
  // 1. 真实 DFC 论文 build → load 端到端 perf
  async W20_01_dfc_build_load_perf(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    // Build with 30 ann
    const setup = await page.evaluate(async (text) => {
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
      const blob = await M.buildMentorZipBlob(md, sidecar, {});
      const buf = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return { b64, annCount: M.State.annotations.length };
    }, mdText);
    // Load perf
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
      const file = new File([arr], 'dfc.mentor', { type: 'application/zip' });
      const M = window.__mdAnnotator;
      const t0 = performance.now();
      const result = await M.readMentorZip(file);
      const ms = performance.now() - t0;
      return { readMs: ms, mdLen: result.mdText.length, annCount: result.annotations?.annotations?.length };
    }, setup.b64);
    if (r.annCount !== setup.annCount) return { error: `ann 不匹配: ${r.annCount} vs ${setup.annCount}`, r };
    return { ok: true, perf: r };
  },

  // 2. 多次 load (avg)
  async W20_02_5x_load_avg(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const setup = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const blob = await M.buildMentorZipBlob(md, { version: '1', document: 't', annotations: [] }, {});
      const buf = await blob.arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }, mdText);
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
      const M = window.__mdAnnotator;
      const timings = [];
      for (let i = 0; i < 10; i++) {
        const file = new File([arr], 't.mentor', { type: 'application/zip' });
        const t0 = performance.now();
        await M.readMentorZip(file);
        timings.push(performance.now() - t0);
      }
      return {
        avg: timings.reduce((a, b) => a + b, 0) / timings.length,
        min: Math.min(...timings),
        max: Math.max(...timings),
      };
    }, setup);
    return { ok: true, perf: r };
  },

  // 3. 带 media 的 .mentor
  async W20_03_mentor_with_media(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    // build with 5 media files
    const setup = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>Test</p>', false);
      const md = '# Test\n\n![img1](media/img1.png) ![img2](media/img2.png)\n\n## Section 2\n\n![img3](media/img3.png)';
      // 模拟 5 个 media files
      const mediaFiles = {};
      for (let i = 1; i <= 5; i++) {
        mediaFiles['media/img' + i + '.png'] = new Blob(['binary-data-' + i], { type: 'image/png' });
      }
      const anns = [];
      for (let i = 0; i < 10; i++) {
        anns.push({ threadId: 'm-' + i, range: { from: 1, to: 2 }, text: 'x', prefix: '', suffix: '', resolved: false, createdAt: '', comments: [] });
      }
      const blob = await M.buildMentorZipBlob(md, { version: '1', document: 'm.md', annotations: anns }, mediaFiles);
      const buf = await blob.arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buf)));
    });
    // load + verify media
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
      const file = new File([arr], 'm.mentor', { type: 'application/zip' });
      const M = window.__mdAnnotator;
      const t0 = performance.now();
      const result = await M.readMentorZip(file);
      const ms = performance.now() - t0;
      return {
        readMs: ms,
        mdLen: result.mdText.length,
        annCount: result.annotations?.annotations?.length,
        mediaCount: Object.keys(result.mediaFiles || {}).length,
        mediaTypes: Object.entries(result.mediaFiles || {}).map(([k, v]) => `${k}=${v.constructor.name}`),
      };
    }, setup);
    if (r.mediaCount !== 5) return { error: `应 5 media, 实际 ${r.mediaCount}`, r };
    if (r.annCount !== 10) return { error: `应 10 ann, 实际 ${r.annCount}`, r };
    return { ok: true, perf: r };
  },

  // 4. corrupt .mentor 仍然 reject
  async W20_04_corrupt_still_rejected(page) {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const file = new File(['not a zip'], 'bad.mentor', { type: 'application/zip' });
      try {
        await M.readMentorZip(file);
        return { ok: true, msg: '不应成功' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    if (r.ok) return { error: 'corrupt 应被 reject', r };
    return { ok: true, info: r };
  },

  // 5. partial (无 annotations.json)
  async W20_05_partial_still_compat(page) {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // 真测: 构造 zip 只有 content.md, 没 annotations.json
      const m = await import('https://esm.sh/jszip@3.10.1');
      const JSZip = m.default || m;
      const z = new JSZip();
      z.file('content.md', '# Partial\n\nno ann here.');
      const blob = await z.generateAsync({ type: 'blob' });
      const buf = await blob.arrayBuffer();
      const arr = new Uint8Array(buf);
      const file = new File([arr], 'p.mentor', { type: 'application/zip' });
      const result = await M.readMentorZip(file);
      return {
        mdLen: result.mdText.length,
        hasAnnotations: !!result.annotations,
        annCount: result.annotations?.annotations?.length,
      };
    });
    if (r.hasAnnotations) return { error: 'partial .mentor (无 ann) 应 annotations=null/undefined', r };
    return { ok: true, info: r };
  },

  // 6. 完整 e2e: 加载 DFC + loadMarkdownIntoEditor
  async W20_06_dfc_full_e2e(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const r = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      // 用现有内容构造一个 .mentor
      const anns = [];
      for (let i = 0; i < 30; i++) anns.push({ threadId: 'a-' + i, range: { from: 1, to: 2 }, text: 'x', prefix: '', suffix: '', resolved: false, createdAt: '', comments: [] });
      const blob = await M.buildMentorZipBlob(text, { version: '1', document: 'dfc.md', annotations: anns }, {});
      const buf = await blob.arrayBuffer();
      const arr = new Uint8Array(buf);
      const file = new File([arr], 'dfc.mentor', { type: 'application/zip' });
      const t0 = performance.now();
      const result = await M.readMentorZip(file);
      const t1 = performance.now();
      M.loadMarkdownIntoEditor('dfc.mentor', result.mdText, result.annotations);
      const t2 = performance.now();
      return {
        readMs: t1 - t0,
        loadMs: t2 - t1,
        totalMs: t2 - t0,
        docLen: M.State.editor.state.doc.content.size,
        annCount: M.State.annotations.length,
      };
    }, mdText);
    if (r.annCount !== 30) return { error: `ann 应 30, 实际 ${r.annCount}`, r };
    return { ok: true, perf: r };
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