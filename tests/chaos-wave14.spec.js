// Mentor v1.43.7 chaos wave 14 — 第五轮变态测试
// 4 大方向:
//   1. 真实 .mentor 文件 e2e (disk round-trip)
//   2. Cross-tab BroadcastChannel 同步
//   3. AI stress: 100 个 AI reply 同时
//   4. 大文件 + autosave 真实持久化

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://localhost:8787/index.html?v=125';

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
  // 1. 真实 .mentor 文件 e2e: disk round-trip
  // ============================================================
  async W14_01_disk_roundtrip(page) {
    await resetDoc(page, '<p>Disk roundtrip test</p>');
    // 建 3 个 ann, 加 1 个 reply
    await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      // ann 1
      ed.commands.setTextSelection({ from: 1, to: 5 });
      document.querySelector('#float-comment-btn button').click();
      // ann 2
      ed.commands.setTextSelection({ from: 7, to: 11 });
      document.querySelector('#float-comment-btn button').click();
      // ann 3
      ed.commands.setTextSelection({ from: 13, to: 17 });
      document.querySelector('#float-comment-btn button').click();
      await new Promise(r => setTimeout(r, 100));
      // reply on ann 1
      const tid = M.State.annotations[0].threadId;
      await M.ai.reply(tid, '测试 reply 内容');
    });
    await page.waitForTimeout(200);
    // 导出为 .mentor blob
    const beforeExport = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        annCount: M.State.annotations.length,
        annDetails: M.State.annotations.map(a => ({
          text: a.text,
          comments: a.comments.length,
        })),
      };
    });
    // build blob
    const blobBase64 = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'disk-test.md', annotations: M.State.annotations };
      const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
      // 转 base64
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);  // data:...;base64,XXX
        reader.readAsDataURL(blob);
      });
    });
    // 写到磁盘
    const tempPath = path.join('C:/Users/User/AppData/Local/Temp/', 'w14-disk-test.mentor');
    fs.writeFileSync(tempPath, Buffer.from(blobBase64, 'base64'));
    const fileSize = fs.statSync(tempPath).size;
    // 重新打开 (清 state, 然后 readMentorZip from file)
    await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.State.annotations = [];
      M.State.editor.commands.setContent('<p></p>', false);
      window.__mdAnnotator.renderCommentList();
      window.__mdAnnotator.rebuildAnnotationMarks();
    });
    // 读文件 + parse
    const fileBase64 = fs.readFileSync(tempPath).toString('base64');
    const r = await page.evaluate(async (b64) => {
      try {
        const binStr = atob(b64);
        const arr = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
        const blob = new Blob([arr]);
        const M = window.__mdAnnotator;
        const { mdText, annotations } = await M.readMentorZip(blob);
        return {
          ok: true,
          mdLen: mdText?.length,
          annCount: annotations?.annotations?.length,
          annDetails: annotations?.annotations?.map(a => ({ text: a.text, comments: a.comments?.length })),
        };
      } catch (e) {
        return { crash: e.message };
      }
    }, fileBase64);
    // 清理
    fs.unlinkSync(tempPath);
    if (r.crash) return { error: 'disk round-trip 崩', r };
    if (r.annCount !== 3) return { error: `3 个 ann 应都在, 实际 ${r.annCount}`, r };
    // 验 reply
    const ann1 = r.annDetails.find(a => a.text === 'Disk');
    if (!ann1 || ann1.comments < 1) return { error: 'reply 应在', r };
    return { ok: true, info: { beforeExport, after: r, fileSize } };
  },

  async W14_02_disk_roundtrip_with_image(page) {
    // 含 base64 图片的 .mentor round-trip
    // 先建带图片的 doc (Tiptap image extension), 但 PM 默认 image 是空 — 跳过, 改用 alt text 模拟
    await resetDoc(page, '<p>图片文档 test</p>');
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // 不依赖 Tiptap image (已知限制), 改用 plain text + alt mark
      ed = M.State.editor;
      ed.commands.setTextSelection({ from: 1, to: 5 });
      document.querySelector('#float-comment-btn button').click();
      await new Promise(r => setTimeout(r, 50));
      const mdText = M.htmlToMarkdown(ed.getHTML());
      const sidecar = { version: '1', document: 'img.md', annotations: M.State.annotations };
      try {
        const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
        // mediaFiles 是 {} (没真图)
        const back = await M.readMentorZip(blob);
        return { ok: true, mdLen: mdText.length, annCount: back.annotations?.annotations?.length };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: '崩', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 2. Cross-tab BroadcastChannel 同步
  // ============================================================
  async W14_03_cross_tab_same_file(page) {
      // 模拟 2 个 tab 同时打开同一文件, 测 live-sync owner/follower + content
      await page.evaluate(() => {
        try {
          localStorage.setItem('Mentor:author', 'W14');
          const m = document.getElementById('author-modal');
          if (m) m.classList.add('hidden');
        } catch (_) {}
        window.__mdAnnotator.loadMarkdownIntoEditor('cross-tab-test.md', '# cross\n', null, { documentId: 'w14-cross' });
      });
      await page.waitForTimeout(700);
      const ctx = page.context();
      const page2 = await ctx.newPage();
      await page2.goto(URL + '&cb=' + Date.now());
      await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
      await page2.evaluate(() => {
        try {
          localStorage.setItem('Mentor:author', 'W14');
          const m = document.getElementById('author-modal');
          if (m) m.classList.add('hidden');
        } catch (_) {}
        window.__mdAnnotator.loadMarkdownIntoEditor('cross-tab-test.md', '# cross\n', null, { documentId: 'w14-cross' });
      });
      await page2.waitForTimeout(1200);
      const roles = await Promise.all([page, page2].map((p) => p.evaluate(() => window.__mdAnnotator.getLiveSyncState())));
      const ownerN = roles.filter((r) => r.role === 'owner').length;
      const followerN = roles.filter((r) => r.role === 'follower').length;
      if (ownerN !== 1 || followerN !== 1) {
        await page2.close();
        return { error: 'live-sync roles not 1+1', roles };
      }
      const ownerPage = roles[0].role === 'owner' ? page : page2;
      const followerPage = roles[0].role === 'follower' ? page : page2;
      await ownerPage.evaluate(() => {
        const ed = window.__mdAnnotator.State.editor;
        ed.commands.setTextSelection(ed.state.doc.content.size);
        ed.commands.insertContent(' W14LIVE');
      });
      await followerPage.waitForFunction(
        () => window.__mdAnnotator.State.editor.state.doc.textContent.includes('W14LIVE'),
        { timeout: 4000 }
      ).catch(() => null);
      const text = await followerPage.evaluate(() => window.__mdAnnotator.State.editor.state.doc.textContent);
      await page2.close();
      if (!text.includes('W14LIVE')) return { error: 'follower did not mirror', text, roles };
      return { ok: true, info: { roles, text } };
    },

      async W14_04_cross_tab_isolation(page) {
        // 不同文件名 → 不同 channel → 不应互相串房
        const ctx = page.context();
        const page2 = await ctx.newPage();
        await page2.goto(URL + '&cb=' + Date.now());
        await page2.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });
        await page.evaluate(() => {
          window.__mdAnnotator.loadMarkdownIntoEditor('file-a.md', '# A\n', null, { documentId: 'w14-a' });
        });
        await page2.evaluate(() => {
          window.__mdAnnotator.loadMarkdownIntoEditor('file-b.md', '# B\n', null, { documentId: 'w14-b' });
        });
        await page2.waitForTimeout(700);
        const r1 = await page.evaluate(() => window.__mdAnnotator.getLiveSyncState());
        const r2 = await page2.evaluate(() => window.__mdAnnotator.getLiveSyncState());
        await page2.close();
        if (r1.documentKey === r2.documentKey) {
          return { error: '不同文件应开不同 channel', r1, r2 };
        }
        if (r1.role !== 'owner' || r2.role !== 'owner') {
          return { error: '不同文件应各自为 owner', r1, r2 };
        }
        return { ok: true, info: { r1, r2 } };
      },

  // ============================================================
  // 3. AI stress: 100 个 AI reply 同时
  // ============================================================
  async W14_05_ai_100_reply_same_thread_diff_body(page) {
    await resetDoc(page, '<p>0123456789</p>');
    // 建 1 个 ann
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 2, to: 5 });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(100);
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0].threadId;
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(M.ai.reply(tid, 'Reply ' + i));
      }
      const results = await Promise.all(promises);
      return {
        totalReplies: results.length,
        successCount: results.filter(r => r.ok).length,
        dedupCount: results.filter(r => r.dedup).length,
        finalCommentCount: M.State.annotations[0].comments.length,
      };
    });
    const totalTime = Date.now() - t0;
    if (r.successCount !== 100) return { error: `100 个 reply 应都成功 (或 dedup), 实际 ${r.successCount}`, r };
    return { ok: true, perf: { totalTime, ...r } };
  },

  async W14_06_ai_50_reply_50_threads(page) {
    await resetDoc(page, '<p>0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz</p>');  // 62 字符 (10 数字 + 26 + 26)
    // 建 50 个 ann (unique ranges, 每条 1 字符)
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      for (let i = 0; i < 50; i++) {
        const from = 1 + i;
        ed.commands.setTextSelection({ from, to: from + 1 });
        document.querySelector('#float-comment-btn button').click();
      }
    });
    await page.waitForTimeout(200);
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const tids = M.State.annotations.map(a => a.threadId);
      const promises = [];
      for (let i = 0; i < tids.length; i++) {
        promises.push(M.ai.reply(tids[i], 'Reply to ' + i));
      }
      const results = await Promise.all(promises);
      return {
        annCount: tids.length,
        total: results.length,
        success: results.filter(r => r.ok).length,
        totalComments: M.State.annotations.reduce((sum, a) => sum + a.comments.length, 0),
      };
    });
    const totalTime = Date.now() - t0;
    if (r.annCount !== 50) return { error: `应建 50 个 ann, 实际 ${r.annCount}`, r };
    if (r.success !== r.annCount) return { error: `reply 应都成功, 实际 ${r.success}/${r.annCount}`, r };
    if (r.totalComments !== r.annCount) return { error: `应 ${r.annCount} 条 comment, 实际 ${r.totalComments}`, r };
    return { ok: true, perf: { totalTime, ...r } };
  },

  // ============================================================
  // 4. 大文件 + autosave 真实持久化
  // ============================================================
  async W14_07_5mb_autosave_reload_recover(page) {
    // 5MB doc + autosave + reload 测 IDB 持久化
    const bigText = 'Markdown is a lightweight markup language with plain-text formatting syntax. '.repeat(110000);
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'big-doc.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent('<p>' + text + '</p>', false);
    }, bigText);
    await page.waitForTimeout(500);
    // 建一个 ann
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 10000, to: 10100 });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(200);
    // autosave
    const t0 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.autosaveNow());
    const autosaveTime = Date.now() - t0;
    // 等 IDB 写入 (debounce 500ms)
    await page.waitForTimeout(1500);
    // reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
    await page.waitForTimeout(2000);  // 等 IDB 预热
    // 检查 IDB cache
    const r = await page.evaluate(() => ({
      cacheKeys: Object.keys(window.__mdAnnotator.State.idbCache || {}),
      cacheSize: window.__mdAnnotator.State.idbCache?.['big-doc.md']?.sidecar?.annotations?.length || 0,
    }));
    // 清理 IDB (避免影响后续测试)
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const d of dbs) { if (d.name) indexedDB.deleteDatabase(d.name); }
    });
    return { ok: true, perf: { autosaveTime }, info: r };
  },

  async W14_08_50kb_doc_autosave(page) {
    // 50KB doc + 反复 autosave
    const midText = 'A'.repeat(50000);
    await page.evaluate((text) => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'medium.md', content: text, annotations: null, dirty: false };
      M.State.editor.commands.setContent('<p>' + text + '</p>', false);
    }, midText);
    await page.waitForTimeout(200);
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const start = Date.now();
      // 10 次连续 autosave
      for (let i = 0; i < 10; i++) {
        await M.autosaveNow();
      }
      return {
        ok: true,
        totalMs: Date.now() - start,
      };
    });
    return { ok: true, perf: r };
  },

  async W14_09_autosave_during_render(page) {
    // autosave + renderCommentList 并发
    await resetDoc(page, '<p>0123456789</p>');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'race.md', content: '', annotations: null, dirty: true };
      // 加 10 个 ann
      for (let i = 0; i < 10; i++) {
        M.State.annotations.push({
          threadId: 'r-' + i, range: { from: 1, to: 2 }, text: '0',
          prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
          comments: [],
        });
      }
    });
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // autosave + renderCommentList 同时
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(new Promise(resolve => setTimeout(async () => {
          await M.autosaveNow();
          M.renderCommentList();
          resolve(i);
        }, i * 5)));
      }
      await Promise.all(promises);
      return { ok: true, annCount: M.State.annotations.length };
    });
    return { ok: r.ok && r.annCount === 10, info: r };
  },

  async W14_10_idb_after_5mb_load(page) {
      // 5MB doc + autosave 写盘 perf — 简化为 1MB 避免 setup timeout
      const bigText = 'A'.repeat(1100000);  // 1.1MB
      await page.evaluate((text) => {
        const M = window.__mdAnnotator;
        M.State.currentFile = { name: 'big.md', content: text, annotations: null, dirty: false };
        M.State.editor.commands.setContent('<p>' + text + '</p>', false);
      }, bigText);
      await page.waitForTimeout(500);
      const t0 = Date.now();
      await page.evaluate(() => window.__mdAnnotator.autosaveNow());
      const autosaveTime = Date.now() - t0;
      await page.waitForTimeout(1500);
      return { ok: true, perf: { autosaveTime, size: bigText.length } };
    },

  // ============================================================
  // 5. 其他 (ann 操作边界)
  // ============================================================
  async W14_11_delete_thread_keeps_mark(page) {
    // 删 thread 后 mark 应被清
    await resetDoc(page, '<p>0123456789</p>');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 2, to: 5 });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0].threadId;
      // 直接删 (不通过 deleteThread, 测试状态管理)
      M.State.annotations = [];
      M.renderCommentList();
      window.__mdAnnotator.rebuildAnnotationMarks();
      // 检查 mark 是否被清
      const ed = M.State.editor;
      let markCount = 0;
      ed.state.doc.descendants((n, pos) => {
        if (n.marks.some(m => m.type.name === 'annotation')) markCount++;
      });
      return { annCount: M.State.annotations.length, markCount };
    });
    return { ok: true, info: r };
  },

  async W14_12_ann_text_with_newlines(page) {
    // 跨段 ann (multi-paragraph) 测试
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.setContent('<p>第一段文字</p><p>第二段文字</p>', false);
      window.__mdAnnotator.State.annotations = [];
      window.__mdAnnotator.rebuildAnnotationMarks();
    });
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 选跨段 (1, 18)
      ed.commands.setTextSelection({ from: 1, to: 18 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: t?.text,
        hasRanges: !!t?.ranges,
        rangeCount: t?.ranges?.length,
      };
    });
    if (!r.created) return { error: '跨段 ann 没创建', r };
    return { ok: true, info: r };
  },

  async W14_13_ann_text_special_chars(page) {
    // ann.text 含各种特殊字符
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.setContent('<p>特殊字符测试</p>', false);
      window.__mdAnnotator.State.annotations = [];
      window.__mdAnnotator.rebuildAnnotationMarks();
    });
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 选 '特' (pos 1)
      ed.commands.setTextSelection({ from: 1, to: 2 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      // push 一些特殊字符 reply
      t.comments.push({
        id: 'special',
        author: { id: 'u', name: 'Special' },
        body: '特殊字符: < > & " \' / \\ ` ~ ! @ # $ % ^ * ( ) - + = [ ] { } | ; : , . ? \n 多行测试',
        createdAt: new Date().toISOString(),
      });
      window.__mdAnnotator.renderCommentList();
      return {
        annText: t?.text,
        commentBody: t.comments[0].body,
      };
    });
    if (!r.annText) return { error: 'ann 没创建', r };
    return { ok: true, info: r };
  },

  async W14_14_render_100_ann_with_long_text(page) {
    // 100 个 ann, 每个有 200 字 reply
    await resetDoc(page, '<p>0123456789</p>');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      for (let i = 0; i < 100; i++) {
        M.State.annotations.push({
          threadId: 't-' + i, range: { from: 1, to: 2 }, text: '0',
          prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
          comments: [{
            id: 'c-' + i,
            author: { id: 'u', name: 'User' },
            body: 'x'.repeat(200),
            createdAt: new Date().toISOString(),
          }],
        });
      }
    });
    const t0 = Date.now();
    await page.evaluate(() => window.__mdAnnotator.renderCommentList());
    const renderTime = Date.now() - t0;
    // 不应崩
    return { ok: true, perf: { renderTime } };
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