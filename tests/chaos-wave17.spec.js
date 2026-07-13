// Mentor v1.43.10 chaos wave 17 — D2D perf baseline
// 用真实 DFC 论文 (57KB) 测: 加载 / 保存 / autosave / 渲染 端到端 perf
// 文档路径: C:/Users/User/Desktop/dFC/literature/papers/markdown/

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://localhost:8765/index.html?v=125';

// DFC 真实论文路径
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
  await ctx.close().catch(() => {});
  return { name, result, errors, consoleErrs };
}

const tests = {
  // ============================================================
  // 1. 加载真实 DFC 论文 → editor
  // ============================================================
  async W17_01_load_real_dfc_paper(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const t0 = Date.now();
    const r = await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      // 模拟 loadMarkdownIntoEditor 的核心: setContent + render
      const html = M.markdownToHtml ? M.markdownToHtml(text) : text;
      // 用 setContent 直接 (Tiptap 默认会 parse markdown if marked plugin, 但没装)
      // 所以: 用 text 直接 setContent (会作为 plain text)
      // 实际 prod flow: markdownToHtml → setContent(html)
      // 我们的 Mentor 暴露的接口: loadMarkdownIntoEditor(name, content, annotations)
      // 这里我们走简化路径: 把 md 作为纯文本 set
      M.State.editor.commands.setContent(text, false);
      M.renderCommentList();
      M.rebuildAnnotationMarks();
      return {
        docLen: M.State.editor.state.doc.content.size,
        textLen: text.length,
      };
    }, mdText);
    const loadTime = Date.now() - t0;
    return { ok: true, perf: { loadTime, ...r, sourceSize: mdText.length } };
  },

  // ============================================================
  // 2. 加 50 个 ann + render 性能
  // ============================================================
  async W17_02_dfc_50_ann(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    // 加 50 个 ann (直接 push, 因为真实 DFC 不可能有真 mark)
    const t0 = Date.now();
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      // 在 doc 随机位置加 50 个 ann (每段 5-10 字)
      for (let i = 0; i < 50; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 10, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'dfc-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: i % 3 === 0,  // 1/3 已解决
          createdAt: new Date().toISOString(),
          comments: [],
        });
      }
      M.renderCommentList();
      M.rebuildAnnotationMarks();
      return { annCount: M.State.annotations.length };
    });
    const setupTime = Date.now() - t0;
    // 测 render 时间
    const t1 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.renderCommentList());
    const renderTime = Date.now() - t1;
    return { ok: true, perf: { setupTime, renderTime, ...r } };
  },

  // ============================================================
  // 3. 加 200 个 ann + render (heavy)
  // ============================================================
  async W17_03_dfc_200_ann(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    const t0 = Date.now();
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 200; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'dfc-200-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: i % 4 === 0,
          createdAt: new Date().toISOString(),
          comments: [],
        });
      }
      M.renderCommentList();
      M.rebuildAnnotationMarks();
      return { annCount: M.State.annotations.length };
    });
    const setupTime = Date.now() - t0;
    const t1 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.renderCommentList());
    const renderTime = Date.now() - t1;
    return { ok: true, perf: { setupTime, renderTime, ...r } };
  },

  // ============================================================
  // 4. mentor export perf (含 100 ann)
  // ============================================================
  async W17_04_dfc_mentor_export(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    // 加 100 ann + 部分带 reply
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 100; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        const ann = {
          threadId: 'dfc-export-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [],
        };
        if (i % 3 === 0) {
          ann.comments.push({
            id: 'c-' + i,
            author: { id: 'a', name: 'Reviewer' },
            body: 'Please clarify this point in the discussion. '.repeat(5),
            createdAt: new Date().toISOString(),
          });
        }
        M.State.annotations.push(ann);
      }
      M.renderCommentList();
    });
    // 测 export 耗时
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = {
        version: '1',
        document: 'real-dfc.md',
        annotations: M.State.annotations,
      };
      try {
        const blob = await M.buildMentorZipBlob(md, sidecar, {});
        // 测大小
        return { ok: true, blobSize: blob.size, mdLen: md.length };
      } catch (e) {
        return { crash: e.message };
      }
    });
    const exportTime = Date.now() - t0;
    if (r.crash) return { error: 'export 崩', r };
    return { ok: true, perf: { exportTime, ...r } };
  },

  // ============================================================
  // 5. autosave 性能 (DFC + 50 ann)
  // ============================================================
  async W17_05_dfc_autosave_50ann(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'real-dfc-autosave.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    // 加 50 ann
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 50; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'auto-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    // 测 autosave
    const t0 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    const autosaveTime = Date.now() - t0;
    await page.waitForTimeout(800);  // 等 IDB 写完
    return { ok: true, perf: { autosaveTime, mdSize: mdText.length, annCount: 50 } };
  },

  // ============================================================
  // 6. autosave 性能 (DFC + 200 ann)
  // ============================================================
  async W17_06_dfc_autosave_200ann(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'real-dfc-200.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 200; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'a200-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: i % 5 === 0,
          createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    const t0 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    const autosaveTime = Date.now() - t0;
    await page.waitForTimeout(1500);
    return { ok: true, perf: { autosaveTime, mdSize: mdText.length, annCount: 200 } };
  },

  // ============================================================
  // 7. reload 后 IDB cache 恢复 (DFC + 100 ann)
  // ============================================================
  async W17_07_dfc_reload_recover_100ann(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'real-dfc-recover.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 100; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'r-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    // autosave
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    await page.waitForTimeout(1000);
    // reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
    await page.waitForTimeout(2000);  // 等 IDB 预热 + loadMarkdownIntoEditor 命中
    // 重新打开 (loadMarkdownIntoEditor)
    const t0 = Date.now();
    const r = await page.evaluate(async (text) => {
      const M = window.__mdAnnotator;
      // 模拟 tryReconnect 路径: 调用 loadMarkdownIntoEditor
      try {
        await M.loadMarkdownIntoEditor('real-dfc-recover.md', text, null);
        return {
          docLen: M.State.editor.state.doc.content.size,
          annCount: M.State.annotations.length,
          cacheKeys: Object.keys(M.State.idbCache || {}),
        };
      } catch (e) {
        return { crash: e.message };
      }
    }, mdText);
    const reloadTime = Date.now() - t0;
    if (r.crash) return { error: 'reload crash', r };
    return { ok: true, perf: { reloadTime, ...r } };
  },

  // ============================================================
  // 8. 端到端: 加载 DFC → 加 ann → autosave → reload → 验证
  // ============================================================
  async W17_08_dfc_e2e_pipeline(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    const timings = {};

    // Step 1: 加载
    let t = Date.now();
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'e2e-dfc.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    timings.load = Date.now() - t;

    // Step 2: 加 50 ann + 10 reply
    t = Date.now();
    await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      // 50 ann
      for (let i = 0; i < 50; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'e2e-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: i % 4 === 0,
          createdAt: new Date().toISOString(),
          comments: [],
        });
      }
      // 10 AI reply on first 10 ann
      for (let i = 0; i < 10; i++) {
        const t = M.State.annotations[i];
        if (t) {
          await M.ai.reply(t.threadId, 'AI 评审意见: ' + i);
        }
      }
    });
    timings.addAnn = Date.now() - t;

    // Step 3: autosave
    t = Date.now();
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    timings.autosave = Date.now() - t;
    await page.waitForTimeout(800);

    // Step 4: export
    t = Date.now();
    const exportSize = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'e2e-dfc.md', annotations: M.State.annotations };
      const blob = await M.buildMentorZipBlob(md, sidecar, {});
      return blob.size;
    });
    timings.export = Date.now() - t;

    // Step 5: reload + 重新加载
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
    await page.waitForTimeout(2000);
    t = Date.now();
    await page.evaluate(async (text) => {
      await window.__mdAnnotator.loadMarkdownIntoEditor('e2e-dfc.md', text, null);
    }, mdText);
    timings.reload = Date.now() - t;

    return { ok: true, perf: timings, exportSize };
  },

  // ============================================================
  // 9. DFC + 100 ann 多次 render (debounce / onUpdate)
  // ============================================================
  async W17_09_dfc_100ann_typing_perf(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    // 100 ann
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 100; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 't-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    // 模拟打字 5 字符
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.__mdAnnotator.State.editor.commands.insertContent('X');
      });
    }
    const typingTime = Date.now() - t0;
    return { ok: true, perf: { typingTime, avgPerChar: typingTime / 5 } };
  },

  // ============================================================
  // 10. DFC + 100 ann 切换 filter tab 性能
  // ============================================================
  async W17_10_dfc_filter_tab_perf(page) {
    if (!fs.existsSync(DFC_PAPER)) return { skipped: 'DFC 论文不存在' };
    const mdText = fs.readFileSync(DFC_PAPER, 'utf8');
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent(text, false);
      M.State.annotations = [];
      M.renderCommentList();
      M.rebuildAnnotationMarks();
    }, mdText);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const totalSize = ed.state.doc.content.size;
      for (let i = 0; i < 100; i++) {
        const from = 1 + Math.floor(Math.random() * (totalSize - 20));
        const to = Math.min(from + 8, totalSize - 1);
        if (to <= from) continue;
        M.State.annotations.push({
          threadId: 'f-' + i,
          range: { from, to },
          text: ed.state.doc.textBetween(from, to, ' '),
          prefix: '', suffix: '',
          resolved: i % 3 === 0,  // 33 resolved, 67 open
          createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    // 测 filter 切换
    const t0 = Date.now();
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = [];
      // all
      M.State.filterOpen = true;
      M.State.filterResolved = true;
      M.renderCommentList();
      t.push({ filter: 'all', count: document.querySelectorAll('#comment-list > *').length });
      // open
      M.State.filterOpen = true;
      M.State.filterResolved = false;
      M.renderCommentList();
      t.push({ filter: 'open', count: document.querySelectorAll('#comment-list > *').length });
      // resolved
      M.State.filterOpen = false;
      M.State.filterResolved = true;
      M.renderCommentList();
      t.push({ filter: 'resolved', count: document.querySelectorAll('#comment-list > *').length });
      return t;
    });
    const totalTime = Date.now() - t0;
    return { ok: true, perf: { totalTime, ...r } };
  },
};

(async () => {
  // 检查 DFC 论文是否存在
  if (!fs.existsSync(DFC_PAPER)) {
    console.log(`[SKIP] DFC 论文不存在: ${DFC_PAPER}`);
    process.exit(0);
  }
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
    if (r.consoleErrs.length) console.log('   console-errors:', r.consoleErrs.slice(0, 2).join(' | '));
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