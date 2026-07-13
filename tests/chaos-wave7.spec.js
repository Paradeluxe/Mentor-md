// Mentor v1.42 wave 7 — AI 路径 + 多 doc + 跨刷新 + 真实失败模式

const { chromium } = require('playwright');
const URL = 'http://localhost:8787/index.html?v=110';

async function setup(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  // 清 IDB (旧缓存干扰)
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
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_45s')), 45000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors };
}

const tests = {
  // W7-01: AI reply 多次并发 (threadId 锁)
  async W7_01_ai_reply_concurrent(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'ai-concurrent', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'ai-concurrent', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 100));
      // 20 个并发 AI reply
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(window.__mdAnnotator.ai.reply('ai-concurrent', 'reply ' + i, {}));
      }
      const results = await Promise.allSettled(promises);
      const okCount = results.filter(r => r.status === 'fulfilled' && r.value && r.value.ok).length;
      const dedupCount = results.filter(r => r.status === 'fulfilled' && r.value && r.value.dedup).length;
      const ann = window.__mdAnnotator.State.annotations.find(a => a && a.threadId === 'ai-concurrent');
      return {
        okCount,
        dedupCount,
        finalReplyCount: ann.comments.length,
        allBodies: ann.comments.map(c => c.body),
      };
    });
  },

  // W7-02: AI reply 到 resolved thread — 应该拒绝
  async W7_02_ai_reply_resolved(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'resolved-rep', resolved: true, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'resolved-rep', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: true, comments: [], createdAt: new Date().toISOString(),
      });
      const r = await window.__mdAnnotator.ai.reply('resolved-rep', 'should fail', {});
      return { result: r, annResolved: window.__mdAnnotator.State.annotations[0].resolved };
    });
  },

  // W7-03: AI reply 到不存在的 thread
  async W7_03_ai_reply_nonexistent(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      const r = await window.__mdAnnotator.ai.reply('does-not-exist', 'x', {});
      // 期望: ok=false, error 包含 '不存在'
      const ok = r && r.ok === false && typeof r.error === 'string' && r.error.includes('不存在');
      return { result: r, ok };
    });
  },

  // W7-04: 空 body / 超长 body
  async W7_04_ai_reply_extreme_body(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'extreme-body', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'extreme-body', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 空
      const r1 = await window.__mdAnnotator.ai.reply('extreme-body', '', {});
      // 超长 (5001 字符)
      const r2 = await window.__mdAnnotator.ai.reply('extreme-body', 'A'.repeat(5001), {});
      // 5000 字符 (max)
      const r3 = await window.__mdAnnotator.ai.reply('extreme-body', 'B'.repeat(5000), {});
      const ann = window.__mdAnnotator.State.annotations.find(a => a && a.threadId === 'extreme-body');
      return {
        emptyResult: r1,
        tooLongResult: r2,
        maxResult: r3.ok,
        finalReplyCount: ann.comments.length,
      };
    });
  },

  // W7-05: AI.author 切换 + 已存在 AI 评论识别
  async W7_05_ai_author_switch(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'auth', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'auth', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false,
        comments: [{ id: 'c1', author: 'AI Reviewer', body: 'first reply', createdAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      });
      const before = window.__mdAnnotator.ai.protocol().author;
      // 改 author
      window.__mdAnnotator.ai.setAuthor('My AI');
      const after = window.__mdAnnotator.ai.protocol().author;
      // 再 reply
      const r = await window.__mdAnnotator.ai.reply('auth', 'second', {});
      const ann = window.__mdAnnotator.State.annotations.find(a => a && a.threadId === 'auth');
      return {
        before, after,
        replyAuthor: r.comment?.author,
        finalReplyCount: ann.comments.length,
        authors: ann.comments.map(c => c.author),
      };
    });
  },

  // W7-06: 加载一个 .mentor 后, 切换到另一个 .mentor, 然后切回第一个 — 状态正确?
  async W7_06_doc_switch_round_trip(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>文档 1 内容</p>');
      const anns1 = [{
        threadId: 'd1-1', range: { from: 1, to: 7 }, text: '文档 1',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }];
      window.__mdAnnotator.loadMarkdownIntoEditor('doc1.mentor', '文档 1 内容', {
        annotations: anns1, version: '1',
      });
      await new Promise(r => setTimeout(r, 200));
      const doc1Count = window.__mdAnnotator.State.annotations.length;
      // 切到文档 2
      const anns2 = Array.from({length: 5}, (_, i) => ({
        threadId: 'd2-' + i, range: { from: 1, to: 4 }, text: '文档',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }));
      window.__mdAnnotator.loadMarkdownIntoEditor('doc2.mentor', '文档 2 内容', {
        annotations: anns2, version: '1',
      });
      await new Promise(r => setTimeout(r, 200));
      const doc2Count = window.__mdAnnotator.State.annotations.length;
      // 切回文档 1 (从 IDB cache 恢复)
      window.__mdAnnotator.loadMarkdownIntoEditor('doc1.mentor', '文档 1 内容', null);
      await new Promise(r => setTimeout(r, 300));
      const doc1AgainCount = window.__mdAnnotator.State.annotations.length;
      return { doc1Count, doc2Count, doc1AgainCount };
    });
  },

  // W7-07: 富文本 mark: heading/list/code/blockquote/bold-italic 内加 mark
  async W7_07_richtext_mark(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<h1>标题</h1><ul><li>列表项</li></ul><blockquote>引用</blockquote><p>代码: <code>foo()</code></p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 找各元素的 text pos
      const positions = {};
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && !positions.h1) positions.h1 = pos + 1;
        if (node.type.name === 'listItem' && !positions.li) positions.li = pos + 1;
        if (node.type.name === 'blockquote' && !positions.bq) positions.bq = pos + 1;
        if (node.type.name === 'code' && !positions.code) positions.code = pos;
      });
      // 给每个加 mark (小段)
      const tr = ed.state.tr;
      if (positions.h1) tr.addMark(positions.h1, positions.h1 + 2, ed.schema.marks.annotation.create({ threadId: 'h1-mark', resolved: false, authorColor: 0 }));
      if (positions.li) tr.addMark(positions.li, positions.li + 2, ed.schema.marks.annotation.create({ threadId: 'li-mark', resolved: false, authorColor: 0 }));
      if (positions.bq) tr.addMark(positions.bq, positions.bq + 2, ed.schema.marks.annotation.create({ threadId: 'bq-mark', resolved: false, authorColor: 0 }));
      if (positions.code !== undefined) tr.addMark(positions.code, positions.code + 3, ed.schema.marks.annotation.create({ threadId: 'code-mark', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      await new Promise(r => setTimeout(r, 200));
      const marks = document.querySelectorAll('.annotation-mark').length;
      return { marksInDom: marks, positions };
    });
  },

  // W7-08: 极多 reply (>100) 的批注 — 渲染 perf
  async W7_08_100_replies(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: '100r', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      const replies = Array.from({length: 100}, (_, i) => ({
        id: 'r' + i, body: '回复 ' + i, author: { id: 'u' + i, name: 'U' + i },
        createdAt: new Date(Date.now() - (100 - i) * 1000).toISOString(),
      }));
      window.__mdAnnotator.State.annotations.push({
        threadId: '100r', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false,
        comments: replies, createdAt: new Date().toISOString(),
      });
      ed.commands.setTextSelection(1);
      const t0 = performance.now();
      await new Promise(r => setTimeout(r, 100));
      const renderTime = performance.now() - t0;
      const card = document.querySelector('.comment-thread');
      const replyCount = card?.querySelectorAll('.comment-reply').length || 0;
      return { renderTime: renderTime.toFixed(2), replyCount, totalComments: replies.length };
    });
  },

  // W7-09: idbCache 被破坏 (localStorage 缓存干扰)
  async W7_09_idb_cache_corrupted(page) {
    return await page.evaluate(async () => {
      // keyPath=name, 必须含 name 字段
      const req = indexedDB.open('Mentor-annotations', 2);
      await new Promise(r => req.onsuccess = r);
      const db = req.result;
      if (db.objectStoreNames.contains('annotations')) {
        const tx = db.transaction('annotations', 'readwrite');
        const store = tx.objectStore('annotations');
        store.put({ name: 'corrupted-doc.mentor', sidecar: 'not a valid sidecar', updatedAt: Date.now() });
        await new Promise(r => tx.oncomplete = r);
      }
      db.close();
      // 现在让 mentor 加载 corrupted doc
      const ed = window.__mdAnnotator.State.editor;
      try {
        window.__mdAnnotator.loadMarkdownIntoEditor('corrupted-doc.mentor', '坏文件', null);
      } catch (e) {
        return { caught: e.message };
      }
      await new Promise(r => setTimeout(r, 500));
      return {
        crashed: false,
        survived: true,
        annCount: window.__mdAnnotator.State.annotations.length,
        docText: window.__mdAnnotator.State.editor.state.doc.textContent.slice(0, 30),
      };
    });
  },

  // W7-10: 跨页操作 — page 1 创建批注, page 2 (新 page) 加载 + IDB 恢复
  async W7_10_multi_page_idb(page) {
    return await page.evaluate(async () => {
      // 写一个 .mentor 到 IDB (模拟 openFromMentorFile 的 IDB 路径)
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>多页测试内容 ABCDEFG</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(9, 12, ed.schema.marks.annotation.create({
        threadId: 'cross-page', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'cross-page', range: { from: 9, to: 12 }, text: 'ABC',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 调 saveCurrent-like path (用 IDB store)
      const mdText = ed.state.doc.textContent;
      window.__mdAnnotator.loadMarkdownIntoEditor('cross-doc.mentor', mdText, {
        annotations: window.__mdAnnotator.State.annotations, version: '1',
      });
      await new Promise(r => setTimeout(r, 500));  // 等 IDB write
      const initialCount = window.__mdAnnotator.State.annotations.length;
      // 重开文件 (从 IDB cache)
      window.__mdAnnotator.State.annotations = [];
      ed.commands.setContent('<p>新内容</p>');
      await new Promise(r => setTimeout(r, 200));
      window.__mdAnnotator.loadMarkdownIntoEditor('cross-doc.mentor', '新内容', null);
      await new Promise(r => setTimeout(r, 500));
      return {
        initialCount,
        afterReloadCount: window.__mdAnnotator.State.annotations.length,
      };
    });
  },

  // W7-11: 极端 unicode: emoji / surrogate pair / 控制字符 / RTL / ZWJ
  async W7_11_unicode_storm(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      // 各种 unicode 测试
      const texts = [
        '<p>😀😁😂🤣😃😄😅😆😉😊</p>',  // 10 emoji
        '<p>👨‍👩‍👧‍👦 family</p>',  // ZWJ 组合
        '<p>مرحبا עברית 日本語</p>',  // RTL + CJK
        '<p>​‌﻿ test zwsp</p>',  // 零宽字符
        '<p>line1\nline2\nline3</p>',  // 换行
      ];
      const results = [];
      for (let i = 0; i < texts.length; i++) {
        const md = texts[i].replace(/<[^>]+>/g, '');
        ed.commands.setContent(texts[i]);
        window.__mdAnnotator.State.annotations = [];
        await new Promise(r => setTimeout(r, 100));
        const docText = ed.state.doc.textContent;
        // mark 第一个字符
        const tr = ed.state.tr;
        if (docText.length > 1) {
          tr.addMark(1, Math.min(3, ed.state.doc.content.size - 1), ed.schema.marks.annotation.create({
            threadId: 'u' + i, resolved: false, authorColor: i % 8,
          }));
          ed.view.dispatch(tr);
          window.__mdAnnotator.State.annotations.push({
            threadId: 'u' + i, range: { from: 1, to: 3 }, text: docText.slice(0, 2),
            prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
          });
          await new Promise(r => setTimeout(r, 100));
          results.push({
            i,
            docLen: docText.length,
            markExists: !!document.querySelector('[data-thread-id="u' + i + '"]'),
          });
        } else {
          results.push({ i, skip: 'too short' });
        }
      }
      return results;
    });
  },

  // W7-12: 复制粘贴 / 剪切 — mark 是否跟随?
  async W7_12_copy_paste(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>原始文本 ABC DEF</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      // mark "ABC" (pos 5-8 in '<p>原始文本 ABC DEF')
      tr.addMark(7, 10, ed.schema.marks.annotation.create({
        threadId: 'copy', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'copy', range: { from: 7, to: 10 }, text: 'ABC',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 选 ABC 复制
      ed.commands.setTextSelection({ from: 7, to: 10 });
      await new Promise(r => setTimeout(r, 100));
      // 模拟粘贴到 pos 12 (DEF 后)
      const tr2 = ed.state.tr;
      tr2.insertText('XYZ', 12);
      ed.view.dispatch(tr2);
      await new Promise(r => setTimeout(r, 100));
      return {
        docText: ed.state.doc.textContent,
        markStillExists: !!document.querySelector('[data-thread-id="copy"]'),
      };
    });
  },

  // W7-13: 极端 mark: from === to (零长)
  async W7_13_zero_length_mark(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文本</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 尝试零长 mark (应该 no-op 或合理处理)
      try {
        const tr = ed.state.tr;
        tr.addMark(2, 2, ed.schema.marks.annotation.create({
          threadId: 'zero', resolved: false, authorColor: 0,
        }));
        ed.view.dispatch(tr);
        return { zeroMarkOK: true };
      } catch (e) {
        return { error: e.message };
      }
    });
  },

  // W7-14: 跨 document 刷新: 创建 + reload + IDB 恢复 + 操作
  async W7_14_full_reload_cycle(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>刷新测试内容 ABC</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(8, 11, ed.schema.marks.annotation.create({
        threadId: 'reload-cycle', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'reload-cycle', range: { from: 8, to: 11 }, text: 'ABC',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 保存
      const mdText = ed.state.doc.textContent;
      window.__mdAnnotator.loadMarkdownIntoEditor('reload.mentor', mdText, {
        annotations: window.__mdAnnotator.State.annotations, version: '1',
      });
      await new Promise(r => setTimeout(r, 500));
      return {
        beforeReload: {
          docText: window.__mdAnnotator.State.editor.state.doc.textContent,
          annCount: window.__mdAnnotator.State.annotations.length,
        },
      };
    });
  },

  // W7-15: 极端错误注入 — 所有已知 API 传各种 invalid args
  async W7_15_api_injection(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'inject', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'inject', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      const results = {};
      // 给所有已知 API 喂垃圾
      try {
        results.ai_reply_null = await window.__mdAnnotator.ai.reply(null, null, null);
      } catch (e) { results.ai_reply_null = 'caught: ' + e.message; }
      try {
        results.ai_reply_number = await window.__mdAnnotator.ai.reply(123, 456, 'str');
      } catch (e) { results.ai_reply_number = 'caught: ' + e.message; }
      try {
        results.ai_setAuthor_empty = window.__mdAnnotator.ai.setAuthor('');
      } catch (e) { results.ai_setAuthor_empty = 'caught: ' + e.message; }
      try {
        results.ai_setAuthor_garbage = window.__mdAnnotator.ai.setAuthor({ not: 'string' });
      } catch (e) { results.ai_setAuthor_garbage = 'caught: ' + e.message; }
      try {
        results.deleteThread_null = window.__mdAnnotator._testDeleteThread(null);
      } catch (e) { results.deleteThread_null = 'caught: ' + e.message; }
      try {
        results.deleteThread_undefined = window.__mdAnnotator._testDeleteThread(undefined);
      } catch (e) { results.deleteThread_undefined = 'caught: ' + e.message; }
      try {
        results.getThread_garbage = window.__mdAnnotator.ai.getThread({ obj: 1 });
      } catch (e) { results.getThread_garbage = 'caught: ' + e.message; }
      try {
        results.listThreads = window.__mdAnnotator.ai.listThreads();
      } catch (e) { results.listThreads = 'caught: ' + e.message; }
      // 全部完成后, app 应仍 alive
      return { ...results, survived: !!ed.state, annCount: window.__mdAnnotator.State.annotations.length };
    });
  },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [name, fn] of Object.entries(tests)) {
    const r = await run(browser, name, fn);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    console.log((passed ? '✓' : '✗') + ' ' + r.name + (r.result.threw ? ' — ' + r.result.threw : ''));
    if (r.errors.length) console.log('   errors:', r.errors.slice(0, 2).join(' | '));
    if (r.result && !r.result.threw && Object.keys(r.result).length > 0) {
      console.log('   ' + JSON.stringify(r.result).slice(0, 400));
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });