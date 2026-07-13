// Mentor v1.43.8 chaos wave 15 — 多语言测试
// 目标: 中文 + 英文混排场景, 验证 mark / range / ann / 导出 都正常
// 范围: 不做 RTL / 印地语 / 阿拉伯文 — 用户确认只要 zh + en

const { chromium } = require('playwright');
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
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_60s')), 60000)),
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

async function clickCommentBtnAt(page, from, to) {
  return await page.evaluate(({ from, to }) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const before = M.State.annotations.length;
    ed.commands.setTextSelection({ from, to });
    document.querySelector('#float-comment-btn button').click();
    const after = M.State.annotations.length;
    return { before, after, created: after > before };
  }, { from, to });
}

const tests = {
  // ============================================================
  // 1. 纯中文 mark
  // ============================================================
  async W15_01_chinese_only_mark(page) {
    await resetDoc(page, '<p>这是一段纯中文测试文档</p>');
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // '纯中文' is at pos 5-8 (3 chars: 纯 中 文)
      ed.commands.setTextSelection({ from: 5, to: 8 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: t?.text,
      };
    });
    if (!r.created) return { error: '中文 mark 应创建', r };
    if (r.annText !== '纯中文') return { error: `text 应 '纯中文', 实际 '${r.annText}'`, r };
    return { ok: true, info: r };
  },

  async W15_02_chinese_long_mark(page) {
    // 100 字中文 mark
    const longText = '中'.repeat(100);
    await resetDoc(page, `<p>${longText}</p>`);
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 1, to: 50 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annTextLen: t?.text?.length,
      };
    });
    if (!r.created) return { error: '100 字中文 mark 应创建', r };
    if (r.annTextLen !== 49) return { error: `text 应 49 字, 实际 ${r.annTextLen}`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 2. 纯英文 mark
  // ============================================================
  async W15_03_english_only_mark(page) {
    await resetDoc(page, '<p>This is a pure English test document.</p>');
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 'pure English' is at pos 11-22 (without trailing space)
      ed.commands.setTextSelection({ from: 11, to: 23 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: t?.text,
      };
    });
    if (!r.created) return { error: '英文 mark 应创建', r };
    if (r.annText !== 'pure English') return { error: `text 应 'pure English', 实际 '${r.annText}'`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 3. 中英混合
  // ============================================================
  async W15_04_mixed_zh_en_mark(page) {
    await resetDoc(page, '<p>English 中文 mixed 混合 content 内容</p>');
    // '中文 mixed' = pos 9-17 (中=9, 文=10, sp=11, m=12-16, i=13, x=14, e=15, d=16) — 9-17 is 8 chars
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 9, to: 17 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: t?.text,
      };
    });
    if (!r.created) return { error: '中英混合 mark 应创建', r };
    if (r.annText !== '中文 mixed') return { error: `text 应 '中文 mixed', 实际 '${r.annText}'`, r };
    return { ok: true, info: r };
  },

  async W15_05_pure_zh_in_middle(page) {
    // 英文 + 中文 + 英文
    await resetDoc(page, '<p>start 中间 end</p>');
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 选 '中间' (pos 7-9)
      ed.commands.setTextSelection({ from: 7, to: 9 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: t?.text,
      };
    });
    if (!r.created) return { error: 'mark 应创建', r };
    if (r.annText !== '中间') return { error: `text 应 '中间', 实际 '${r.annText}'`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 4. 多 mark 重叠 + 中英
  // ============================================================
  async W15_06_overlapping_zh_en(page) {
    await resetDoc(page, '<p>English 中文 mixed 内容 测试</p>');
    // 2 个 mark: 'English 中文' + '中文 mixed'
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection({ from: 1, to: 10 });  // 'English 中文'
      document.querySelector('#float-comment-btn button').click();
      ed.commands.setTextSelection({ from: 9, to: 16 });  // '中文 mixed'
      document.querySelector('#float-comment-btn button').click();
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        anns: window.__mdAnnotator.State.annotations.map(a => ({ text: a.text, range: a.range })),
      };
    });
    if (r.annCount !== 2) return { error: '2 mark 应创建', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 5. emoji + 中文 + 英文
  // ============================================================
  async W15_07_emoji_zh_en_mix(page) {
    await resetDoc(page, '<p>Hi 👋 你好 world 🌍</p>');
    // 找 👋 pos
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let emojiStart = -1, emojiEnd = -1, youStart = -1, youEnd = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText) {
          const idx1 = n.text.indexOf('👋');
          if (idx1 >= 0 && emojiStart < 0) {
            emojiStart = pos + idx1;
            emojiEnd = pos + idx1 + 2;
          }
          const idx2 = n.text.indexOf('你好');
          if (idx2 >= 0 && youStart < 0) {
            youStart = pos + idx2;
            youEnd = pos + idx2 + 2;
          }
        }
      });
      if (emojiStart < 0) return { error: '没找到 👋' };
      if (youStart < 0) return { error: '没找到 你好' };
      // mark 1: 👋
      ed.commands.setTextSelection({ from: emojiStart, to: emojiEnd });
      document.querySelector('#float-comment-btn button').click();
      // mark 2: 你好
      ed.commands.setTextSelection({ from: youStart, to: youEnd });
      document.querySelector('#float-comment-btn button').click();
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        anns: window.__mdAnnotator.State.annotations.map(a => a.text),
      };
    });
    if (r.annCount !== 2) return { error: '2 mark 应创建', r };
    if (!r.anns.includes('👋')) return { error: 'emoji mark 应在', r };
    if (!r.anns.includes('你好')) return { error: '中文 mark 应在', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 6. 中文 mark 删除 / fuzzy (复用 v1.43.3 fix)
  // ============================================================
  async W15_08_zh_mark_partial_delete(page) {
    await resetDoc(page, '<p>中文测试文档</p>');
    // mark '中文' (pos 1-3)
    await clickCommentBtnAt(page, 1, 3);
    await page.waitForTimeout(100);
    // 删 mark 内 1 字符 (pos 2 = '文')
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.view.dispatch(ed.state.tr.delete(2, 3));
    });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        annText: t?.text,
        fuzzy: t?.fuzzy,
        invalidReason: t?.invalidReason,
      };
    });
    // 期望: ann.text 自动更新为 '中', fuzzy=true
    if (r.annText !== '中') return { error: `text 应 '中', 实际 '${r.annText}'`, r };
    if (!r.fuzzy) return { error: 'partial delete 应 fuzzy=true', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 7. 纯英文 mark 同样 partial delete
  // ============================================================
  async W15_09_en_mark_partial_delete(page) {
    await resetDoc(page, '<p>English test document</p>');
    await clickCommentBtnAt(page, 1, 8);  // 'English'
    await page.waitForTimeout(100);
    // 删 'g' (pos 3) - 'English' = E(1) n(2) g(3) l(4) i(5) s(6) h(7)
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.view.dispatch(ed.state.tr.delete(3, 4));
    });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const t = window.__mdAnnotator.State.annotations[0];
      return {
        annText: t?.text,
        fuzzy: t?.fuzzy,
      };
    });
    // 删 g 后: 'Enlish' (6 chars), 应 fuzzy=true
    if (r.annText !== 'Enlish') return { error: `text 应 'Enlish', 实际 '${r.annText}'`, r };
    if (!r.fuzzy) return { error: 'partial delete 应 fuzzy=true', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 8. 中文 ann content (comment body)
  // ============================================================
  async W15_10_zh_comment_body(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations[0];
      const result = await M.ai.reply(t.threadId, '中文 AI 回复内容');
      return {
        replyOk: result.ok,
        commentBody: t.comments[0]?.body,
        commentAuthor: t.comments[0]?.author,
      };
    });
    if (!r.replyOk) return { error: 'reply 应成功', r };
    if (r.commentBody !== '中文 AI 回复内容') return { error: `body 应 '中文 AI 回复内容', 实际 '${r.commentBody}'`, r };
    return { ok: true, info: r };
  },

  async W15_11_mixed_zh_en_comment_body(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations[0];
      const result = await M.ai.reply(t.threadId, 'Mixed 中英文 comment 混合内容 with English');
      return {
        replyOk: result.ok,
        body: t.comments[0]?.body,
      };
    });
    if (!r.replyOk) return { error: 'reply 应成功', r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 9. 中文 author 名称
  // ============================================================
  async W15_12_zh_author_name(page) {
    await resetDoc(page, '<p>0123456789</p>');
    await clickCommentBtnAt(page, 2, 5);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations[0];
      t.comments.push({
        id: 'zh-author',
        author: { id: 'u1', name: '张三' },
        body: '中文作者测试',
        createdAt: new Date().toISOString(),
      });
      try {
        M.renderCommentList();
        return { ok: true };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: 'crash', r };
    // 验证 DOM
    const dom = await page.evaluate(() => {
      const list = document.querySelector('#comment-list');
      return {
        authorText: list.querySelector('.comment-author')?.textContent,
        bodyText: list.querySelector('.comment-body')?.textContent,
      };
    });
    if (dom.authorText !== '张三') return { error: `author 应 '张三', 实际 '${dom.authorText}'`, dom };
    if (dom.bodyText !== '中文作者测试') return { error: `body 应 '中文作者测试', 实际 '${dom.bodyText}'`, dom };
    return { ok: true, info: dom };
  },

  // ============================================================
  // 10. Markdown export 中英混合
  // ============================================================
  async W15_13_zh_md_export(page) {
    await resetDoc(page, '<h1>中文标题</h1><p>中文段落 <strong>粗体</strong> 内容</p>');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      try {
        const md = M.htmlToMarkdown(M.State.editor.getHTML());
        return { ok: true, md };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: 'export crash', r };
    if (!r.md.includes('# 中文标题')) return { error: `md 应含 '# 中文标题', 实际: ${r.md}`, r };
    if (!r.md.includes('中文段落')) return { error: 'md 应含中文段落', r };
    if (!r.md.includes('**粗体**')) return { error: 'md 应含 **粗体**', r };
    return { ok: true, info: { mdLen: r.md.length, sample: r.md.slice(0, 100) } };
  },

  // ============================================================
  // 11. Mentor export/import 中英
  // ============================================================
  async W15_14_zh_mentor_roundtrip(page) {
    await resetDoc(page, '<p>中文文档 English 混合</p>');
    await clickCommentBtnAt(page, 1, 5);
    await page.waitForTimeout(100);
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.State.annotations[0].comments.push({
        id: 'zh',
        author: { id: 'u', name: '用户' },
        body: '中文评论 English mixed',
        createdAt: new Date().toISOString(),
      });
      const mdText = M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'zh.md', annotations: M.State.annotations };
      try {
        const blob = await M.buildMentorZipBlob(mdText, sidecar, {});
        const back = await M.readMentorZip(blob);
        return {
          ok: true,
          mdBack: back.mdText,
          annCount: back.annotations?.annotations?.length,
          commentBody: back.annotations?.annotations?.[0]?.comments?.[0]?.body,
          commentAuthor: back.annotations?.annotations?.[0]?.comments?.[0]?.author?.name,
        };
      } catch (e) {
        return { crash: e.message };
      }
    });
    if (r.crash) return { error: 'roundtrip crash', r };
    if (!r.mdBack.includes('中文文档')) return { error: 'mdBack 应含中文', r };
    if (r.commentBody !== '中文评论 English mixed') return { error: `body 应 '中文评论 English mixed', 实际 '${r.commentBody}'`, r };
    if (r.commentAuthor !== '用户') return { error: `author 应 '用户', 实际 '${r.commentAuthor}'`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 12. 大量中英 ann
  // ============================================================
  async W15_15_50_zh_ann(page) {
    const text = '0123456789abcdefghijklmnopqrstuvwxyz中文测'.repeat(2);
    // 50+ chars
    await resetDoc(page, `<p>${text}</p>`);
    const t0 = Date.now();
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      // 在每个位置建 1 字符 ann (skip duplicates by using fuzzy start chars)
      let created = 0;
      for (let i = 0; i < 30; i++) {
        const from = 1 + (i * 2);
        if (from + 1 > ed.state.doc.content.size - 2) break;
        ed.commands.setTextSelection({ from, to: from + 1 });
        const before = M.State.annotations.length;
        document.querySelector('#float-comment-btn button').click();
        if (M.State.annotations.length > before) created++;
      }
      M.renderCommentList();
      return {
        created,
        annCount: M.State.annotations.length,
      };
    });
    const totalTime = Date.now() - t0;
    if (r.created < 20) return { error: `应创建 20+ ann, 实际 ${r.created}`, r };
    return { ok: true, perf: { totalTime, ...r } };
  },

  // ============================================================
  // 13. 中文 + 数学符号
  // ============================================================
  async W15_16_zh_math_symbols(page) {
    await resetDoc(page, '<p>数学: x² + y² = z² (勾股定理)</p>');
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // 选 'x²'
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText) {
          const idx = n.text.indexOf('x²');
          if (idx >= 0 && from < 0) {
            from = pos + idx;
            to = from + 2;  // x + ² (superscript 2 is single char)
          }
        }
      });
      if (from < 0) return { error: '没找到 x²' };
      ed.commands.setTextSelection({ from, to });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      return {
        created: window.__mdAnnotator.State.annotations.length > before,
        annText: window.__mdAnnotator.State.annotations[0]?.text,
      };
    });
    if (!r.created) return { error: '应创建', r };
    if (r.annText !== 'x²') return { error: `text 应 'x²', 实际 '${r.annText}'`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 14. 数字 + 英文 + 中文 混排
  // ============================================================
  async W15_17_numbers_en_zh_mix(page) {
    await resetDoc(page, '<p>2024年 iPhone 15 Pro Max 256GB 发布, 价格 ¥8999</p>');
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // mark 'iPhone 15' (English + 数字)
      ed.commands.setTextSelection({ from: 6, to: 16 });
      const before = window.__mdAnnotator.State.annotations.length;
      document.querySelector('#float-comment-btn button').click();
      // mark '¥8999' (中文标点 + 数字)
      ed.commands.setTextSelection({ from: 32, to: 37 });
      document.querySelector('#float-comment-btn button').click();
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        anns: window.__mdAnnotator.State.annotations.map(a => a.text),
      };
    });
    if (r.annCount !== 2) return { error: `应 2 mark, 实际 ${r.annCount}`, r };
    return { ok: true, info: r };
  },

  // ============================================================
  // 15. 大量中文回复 thread (perf)
  // ============================================================
  async W15_18_zh_long_thread_render(page) {
    await resetDoc(page, '<p>0123456789</p>');
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations[0] || (M.State.annotations.push({
        threadId: 'zh-thread', range: { from: 1, to: 2 }, text: '0',
        prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
        comments: [],
      }), M.State.annotations[0]);
      // 20 条中文 reply
      for (let i = 0; i < 20; i++) {
        t.comments.push({
          id: 'zh-c-' + i,
          author: { id: 'u' + i, name: '用户' + i },
          body: '这是第 ' + (i + 1) + ' 条中文评论, 内容用于测试 thread 渲染性能. '.repeat(5),
          createdAt: new Date().toISOString(),
        });
      }
      const t0 = Date.now();
      M.renderCommentList();
      return {
        ok: true,
        renderMs: Date.now() - t0,
        commentCount: t.comments.length,
      };
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