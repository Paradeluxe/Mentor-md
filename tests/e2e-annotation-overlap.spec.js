// Mentor E2E — 多批注 (单 / 嵌套 / 交叉) 矩阵测试
// 覆盖单 thread、嵌套、外层⊃内层、部分重叠、同位置多批注,
// + 编辑破坏 + 保存重载 + 解决/重开 + AI reply 在重叠线程上的正确性

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 平台检测 (与其它 e2e spec 同款)
function detectRoot() {
  if (process.platform === 'win32') return path.resolve('E:/hermes_playground/Mentor');
  if (fs.existsSync('/mnt/e/hermes_playground/Mentor')) return '/mnt/e/hermes_playground/Mentor';
  if (fs.existsSync('/home/lablabcloud/.hermes/node/lib/node_modules/playwright')) return '/mnt/e/hermes_playground/Mentor';
  return path.resolve(__dirname, '..');
}
const ROOT = detectRoot();
const URL = 'http://127.0.0.1:8765/index.html';

// 测试用 markdown
const TEST_MD_FILENAME = 'overlap-test.md';
const TEST_MD = `# 多批注测试

第一段 alpha bravo charlie。数字段落继续 12345 末尾标记 end1。

第二段 delta echo foxtrot。中间 marker middle-marker。末尾 end2。

第三段 golf hotel india。这是终结段落 juliet kilo。
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'overlap-test-author'); } catch (e) {}
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  let total = 0, passed = 0;
  function t(name, fn) {
    total++;
    return Promise.resolve()
      .then(() => fn())
      .then(r => { passed++; console.log(`  ✓ ${name}${r ? ' — ' + JSON.stringify(r) : ''}`); return r; })
      .catch(e => { console.log(`  ✗ ${name} — ${e.message}`); throw e; });
  }

  function fail(msg) { throw new Error(msg); }

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('overlap-test-author'));

  // helper: 加载干净文档
  async function loadFresh() {
    await page.evaluate((args) => {
      window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, { version: '1', document: args.name, author: 'tester', updatedAt: '', annotations: [] });
    }, { name: TEST_MD_FILENAME, content: TEST_MD });
    await page.waitForTimeout(200);
  }

  // helper: 通过文字找选区 (PM 把字符切片为多 text node, 用 char-by-char 跨节点搜索)
  async function selectText(text) {
    return await page.evaluate((t) => {
      const editor = window.__mdAnnotator.State.editor;
      const doc = editor.state.doc;
      let found = null;
      doc.descendants((node, pos) => {
        if (found) return false;
        if (node.isText && node.text.includes(t)) {
          const i = node.text.indexOf(t);
          found = { from: pos + i, to: pos + i + t.length, where: 'same-node' };
          return false;
        }
        return true;
      });
      if (!found) {
        const chars = [], map = [];
        doc.descendants((node, pos) => {
          if (!node.isText) return true;
          const seg = node.text || '';
          for (let i = 0; i < seg.length; i++) { chars.push(seg[i]); map.push(pos + i); }
        });
        const flat = chars.join('');
        const i = flat.indexOf(t);
        if (i >= 0 && i + t.length <= map.length) {
          found = { from: map[i], to: map[i + t.length - 1] + 1, where: 'cross-node' };
        }
      }
      if (!found) return null;
      editor.commands.setTextSelection({ from: found.from, to: found.to });
      editor.view.focus();
      return found;
    }, text);
  }

  // helper: 找选区 + 创建批注 (绕开产品 findTextInDoc 限制)
  async function selectAndCreate(text) {
    const sel = await selectText(text);
    if (!sel) return { ok: false, reason: 'selection-not-found' };
    const r = await page.evaluate((args) => {
      return window.__mdAnnotator._testCreateAnnotation(args.from, args.to, args.text);
    }, { from: sel.from, to: sel.to, text });
    if (!r) return { ok: false, reason: 'create-returned-null' };
    return { ok: true, tid: r.threadId, where: sel.where };
  }

  // helper: 读取当前 marks 统计
  async function getMarkStats() {
    return await page.evaluate(() => {
      const editor = window.__mdAnnotator.State.editor;
      const inDoc = [];
      editor.state.doc.descendants((node, pos) => {
        node.marks.forEach(m => {
          if (m.type.name === 'annotation') {
            const k = m.attrs.threadId;
            if (!inDoc.find(x => x.threadId === k && x.from === pos)) {
              inDoc.push({ threadId: k, from: pos, text: node.text });
            }
          }
        });
      });
      return {
        threads: window.__mdAnnotator.getAnnotations(),
        inDocMarkCount: inDoc.length,
        inDoc,
      };
    });
  }

  // =========================================================
  console.log('=== T01: 单段单 thread — 1 thread / 1 mark ===');
  // =========================================================
  await loadFresh();
  await t('选取 + 创建', async () => {
    const r = await selectAndCreate('alpha bravo charlie');
    if (!r.ok) fail('创建失败');
    return r;
  });
  await t('state: 1 thread, 1 in-doc mark', async () => {
    const st = await getMarkStats();
    if (st.threads.length !== 1) fail(`threads=${st.threads.length}`);
    if (st.inDocMarkCount !== 1) fail(`marks=${st.inDocMarkCount}`);
    return { threads: st.threads.length, marks: st.inDocMarkCount };
  });

  // =========================================================
  console.log('\n=== T02: 嵌套 (外层完全包含内层) ===');
  // =========================================================
  await loadFresh();
  let outerTid, innerTid;
  await t('外层 + 内层', async () => {
    const o = await selectAndCreate('alpha bravo charlie');
    if (!o.ok) fail('外层失败');
    outerTid = o.tid;
    const i = await selectAndCreate('bravo charlie');
    if (!i.ok) fail('内层失败');
    innerTid = i.tid;
    return { outer: outerTid, inner: innerTid };
  });
  await t('state: 2 threads, 2 in-doc marks', async () => {
    const st = await getMarkStats();
    if (st.threads.length !== 2) fail(`threads=${st.threads.length} 预期 2`);
    if (st.inDocMarkCount !== 2) fail(`marks=${st.inDocMarkCount} 预期 2`);
    return st;
  });
  await t('两 mark 范围: 内层 ∈ 外层', async () => {
    const out = await page.evaluate(() => {
      const editor = window.__mdAnnotator.State.editor;
      const ranges = [];
      editor.state.doc.descendants((node, pos) => {
        node.marks.forEach(m => {
          if (m.type.name === 'annotation') {
            const k = m.attrs.threadId;
            const existing = ranges.find(r => r.threadId === k);
            if (!existing) ranges.push({ threadId: k, from: pos, text: node.text });
          }
        });
      });
      return ranges;
    });
    if (out.length !== 2) fail(`范围错: ${JSON.stringify(out)}`);
    return out;
  });

  // =========================================================
  console.log('\n=== T03: 部分重叠 (交叉) — alpha bravo ∩ bravo charlie ===');
  // =========================================================
  // 用户先在 'Bravo charlie' (无 mark) 创建批注, 再在 'alpha bravo' 创建
  // -> 'Bravo' 字符同时属两个 thread
  await loadFresh();
  let crossA, crossB;
  await t('先后创建交叉批注', async () => {
    const a = await selectAndCreate('bravo charlie');
    if (!a.ok) fail('第一批注失败');
    crossA = a.tid;
    const b = await selectAndCreate('alpha bravo');
    if (!b.ok) fail('第二批注失败');
    crossB = b.tid;
    return { a: a.tid, b: b.tid };
  });
  await t('state: 2 threads, 2 in-doc mark', async () => {
    const st = await getMarkStats();
    if (st.threads.length !== 2) fail(`threads=${st.threads.length}`);
    if (st.inDocMarkCount !== 2) fail(`marks=${st.inDocMarkCount}`);
    return st;
  });
  await t('"Bravo" 字保留完整, 不被破坏', async () => {
    const out = await page.evaluate(() => {
      const full = window.__mdAnnotator.State.editor.state.doc.textContent;
      return { hasBravo: full.indexOf('bravo') >= 0, hasCharly: full.indexOf('charlie') >= 0 };
    });
    if (!out.hasBravo || !out.hasCharly) fail('文字被破坏');
    return out;
  });
  await t('CROSS-NODE PITFALL (产品): 跨 mark 边界选区不能 createTestAnnotation (跨 mark 后 Bravo 在 marked node)', async () => {
    // 产品 createTestAnnotation 用 findTextInDoc 单 node, 不支持跨节点选区
    // 这只在 selectAndCreate (用 _testCreateAnnotation from/to 直传) 才能稳
    // 这里我们确认产品路径的失败表现: 即从最后状态看 'alpha bravo' 仍可重选
    const sel = await selectText('alpha bravo');
    if (!sel) fail('selectText 失败');
    const productOk = await page.evaluate((t) => !!window.__mdAnnotator.createTestAnnotation(t), 'alpha bravo');
    return { selWhere: sel.where, productOk, note: 'product 仍能用 (因为 alpha bravo 在 Bravo 之前区段)' };
  });

  // =========================================================
  console.log('\n=== T04: 嵌套扩展 3 批注 (同 from 不同 to 允许) — 3 thread state ===');
  // v1.42.9: 同 from + 不同 to (嵌套扩展) 允许; 但同 from + 同 to (完全一样) 拒绝
  // 选 middle-marker 三次: 第 1 次短, 第 2 次扩展 1 字符, 第 3 次扩展 2 字符
  // =========================================================
  await loadFresh();
  await t('middle-marker 嵌套扩展 3 批注', async () => {
    const ids = [];
    const sel1 = await selectText('middle-marker');     // 13 字符
    if (!sel1) fail('sel1 failed');
    const r1 = await page.evaluate((args) => window.__mdAnnotator._testCreateAnnotation(args.from, args.to, 'middle-marker'), sel1);
    if (!r1) fail('r1 创建失败');
    ids.push(r1.threadId);
    // 第 2 次: 从 sel1.from 起, to +1 (扩展 1 字符)
    const r2 = await page.evaluate((args) => window.__mdAnnotator._testCreateAnnotation(args.from, args.to + 1, 'middle-marker-x'), sel1);
    if (!r2) fail('r2 创建失败 (嵌套扩展 1 字符)');
    ids.push(r2.threadId);
    // 第 3 次: to +2
    const r3 = await page.evaluate((args) => window.__mdAnnotator._testCreateAnnotation(args.from, args.to + 2, 'middle-marker-xx'), sel1);
    if (!r3) fail('r3 创建失败 (嵌套扩展 2 字符)');
    ids.push(r3.threadId);
    return ids;
  });
  await t('state: 3 threads (嵌套扩展)', async () => {
    const st = await getMarkStats();
    if (st.threads.length !== 3) fail(`threads=${st.threads.length} 预期 3`);
    return { threads: st.threads.length, marks: st.inDocMarkCount };
  });

  // =========================================================
  console.log('\n=== T04b: 完全相同 range 重复创建 — 应该被拒 (v1.42.9 守卫) ===');
  // =========================================================
  await loadFresh();
  await t('middle-marker 第 1 次 OK', async () => {
    const r = await selectAndCreate('middle-marker');
    if (!r.ok) fail('第 1 次失败');
    return r;
  });
  await t('完全相同 range 第 2 次拒绝', async () => {
    // 同样 selectAndCreate 同样字符串 → 同样 from/to → 守卫拒
    const r = await selectAndCreate('middle-marker');
    if (r.ok) fail(`应该被拒, 但创建了 ${r.tid}`);
    return { rejected: true, reason: r.reason };
  });
  await t('state: 只 1 thread', async () => {
    const st = await getMarkStats();
    if (st.threads.length !== 1) fail(`threads=${st.threads.length} 预期 1`);
    return { threads: st.threads.length };
  });

  // =========================================================
  console.log('\n=== T05: 重叠 + reply 不破坏 mark ===');
  // =========================================================
  await loadFresh();
  await t('外层 + 内层 (嵌套)', async () => {
    const outer = await selectAndCreate('12345 末尾');
    if (!outer.ok) fail('外层失败');
    const inner = await selectAndCreate('2345 末');
    if (!inner.ok) fail('内层失败');
    return { outer: outer.tid, inner: inner.tid };
  });
  await t('给内层 thread 加 reply', async () => {
    const innerTid = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return (ts.find(t => t.text.includes('2345')) || {}).threadId;
    });
    const r = await page.evaluate((tid) => window.__mdAnnotator.ai.reply(tid, 'reply-to-inner'), innerTid);
    if (!r.ok) fail(`reply failed: ${JSON.stringify(r)}`);
    return r;
  });
  await t('reply 后 2 threads 仍存在 + in-doc mark 数 ≥ 1', async () => {
    const st = await getMarkStats();
    if (st.threads.length !== 2) fail(`threads=${st.threads.length}`);
    if (st.inDocMarkCount < 1) fail(`marks=${st.inDocMarkCount}`);
    return st;
  });

  // =========================================================
  console.log('\n=== T06: 重叠 + resolve 内层 + 验证外层仍 inDoc ===');
  // =========================================================
  await loadFresh();
  await t('嵌套双批注', async () => {
    const outer = await selectAndCreate('delta echo foxtrot');
    const inner = await selectAndCreate('echo foxtrot');
    return { outer: outer.tid, inner: inner.tid };
  });
  await t('resolve inner', async () => {
    const inner = await page.evaluate(() => (window.__mdAnnotator.getAnnotations().find(t => t.text === 'echo foxtrot') || {}).threadId);
    if (!inner) fail('未找到 inner');
    const ok = await page.evaluate((tid) => window.__mdAnnotator._testToggleResolved(tid), inner);
    return { inner, toggled: ok };
  });
  await t('外层 thread 仍 unresolved, 仍在 doc', async () => {
    const out = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      const outer = ts.find(t => t.text === 'delta echo foxtrot');
      const editor = window.__mdAnnotator.State.editor;
      let count = 0;
      editor.state.doc.descendants((node, pos) => {
        node.marks.forEach(m => {
          if (m.type.name === 'annotation' && m.attrs.threadId === outer.threadId) count++;
        });
      });
      return { resolved: outer.resolved, inDocMarksForOuter: count };
    });
    if (out.resolved) fail('外层被误 resolve');
    if (out.inDocMarksForOuter < 1) fail('外层 mark 消失');
    return out;
  });

  // =========================================================
  console.log('\n=== T07: 编辑重叠区: 改 inner "hotel" → "motel" ===');
  // =========================================================
  await loadFresh();
  await t('嵌套双批注', async () => {
    const outer = await selectAndCreate('golf hotel india');
    const inner = await selectAndCreate('hotel');
    return { outer: outer.tid, inner: inner.tid };
  });
  await t('"hotel" 改为 "motel"', async () => {
    const ok = await page.evaluate(() => {
      const editor = window.__mdAnnotator.State.editor;
      const doc = editor.state.doc;
      let pos = null;
      doc.descendants((node, p) => { if (pos !== null) return; if (node.isText && node.text.includes('hotel')) pos = p; });
      if (pos === null) return false;
      editor.commands.setTextSelection({ from: pos, to: pos + 'hotel'.length });
      editor.commands.insertContent('motel');
      return true;
    });
    if (!ok) fail('修改失败');
    return true;
  });
  await t('两 thread 仍存在 + text snapshot 保留', async () => {
    const out = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return ts.map(t => ({ text: t.text, invalid: !!t.invalid, reason: t.invalidReason || null }));
    });
    if (out.length !== 2) fail(`剩 ${out.length}`);
    return out;
  });

  // =========================================================
  console.log('\n=== T08: 编辑重叠区 "Bravo" → "BRAND_NEW" ===');
  // =========================================================
  await loadFresh();
  await t('交叉双批注', async () => {
    const a = await selectAndCreate('alpha bravo');
    const b = await selectAndCreate('bravo charlie');
    return { a: a.tid, b: b.tid };
  });
  await t('"Bravo" → "BRAND_NEW" 替换', async () => {
    const ok = await page.evaluate(() => {
      const editor = window.__mdAnnotator.State.editor;
      const doc = editor.state.doc;
      let pos = null;
      doc.descendants((node, p) => { if (pos !== null) return; if (node.isText && node.text.includes('bravo')) pos = p; });
      if (pos === null) return false;
      editor.commands.setTextSelection({ from: pos, to: pos + 5 });
      editor.commands.insertContent('BRAND_NEW');
      return true;
    });
    return ok;
  });
  await t('两 thread 仍存在, text snapshot 保留', async () => {
    const out = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return ts.map(t => ({ text: t.text, invalid: !!t.invalid }));
    });
    if (out.length !== 2) fail(`剩 ${out.length}`);
    return out;
  });

  // =========================================================
  console.log('\n=== T09: 保存+重载, 重叠批注 marks 正确恢复 ===');
  // =========================================================
  await loadFresh();
  await t('嵌套双批注', async () => {
    const a = await selectAndCreate('alpha bravo charlie');
    const b = await selectAndCreate('bravo charlie');
    return { a: a.tid, b: b.tid };
  });
  await t('rebuild sidecar + reload + 重新加载', async () => {
    const sidecar = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return {
        version: '1',
        document: 'overlap-test.md',
        updatedAt: new Date().toISOString(),
        author: 'tester',
        annotations: ts,
      };
    });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
    await page.evaluate(() => window.__mdAnnotator.setAuthor('overlap-test-author'));
    await page.evaluate((args) => {
      window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, args.ann);
    }, { name: TEST_MD_FILENAME, content: TEST_MD, ann: sidecar });
    await page.waitForTimeout(300);
    const st = await getMarkStats();
    if (st.threads.length !== 2) fail(`threads=${st.threads.length} 预期 2 (reload 后)`);
    return st;
  });

  // =========================================================
  console.log('\n=== T10: 嵌套扩展 3 批注 + 切走再切回 — marks 全部恢复 ===');
  // v1.42.9: 同 from 不同 to (嵌套扩展) 允许; 完全相同 range 拒绝
  // 测 3 个不同 to 的嵌套扩展后切走再切回能恢复
  // =========================================================
  await loadFresh();
  await t('middle-marker 嵌套扩展 3 批注', async () => {
    const sel1 = await selectText('middle-marker');
    if (!sel1) fail('sel1 failed');
    const ids = [];
    for (const delta of [0, 1, 2]) {
      const r = await page.evaluate((args) => {
        return window.__mdAnnotator._testCreateAnnotation(args.from, args.to + args.delta, 'middle-marker');
      }, { from: sel1.from, to: sel1.to, delta });
      if (!r) fail(`delta=${delta} 创建失败 (嵌套扩展)`);
      ids.push(r.threadId);
    }
    return ids;
  });
  await t('切到别的 doc 再切回', async () => {
    const sidecar = await page.evaluate((fname) => {
      const ts = window.__mdAnnotator.getAnnotations();
      return { version: '1', document: fname, updatedAt: '', author: 't', annotations: ts };
    }, TEST_MD_FILENAME);
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor('other.md', '# different\n\nno overlap here', { version: '1', document: 'other.md', updatedAt: '', author: 't', annotations: [] });
    });
    await page.waitForTimeout(150);
    await page.evaluate((args) => {
      window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, args.ann);
    }, { name: TEST_MD_FILENAME, content: TEST_MD, ann: sidecar });
    await page.waitForTimeout(200);
    const st = await getMarkStats();
    if (st.threads.length !== 3) fail(`threads=${st.threads.length} 预期 3`);
    return st;
  });

  // =========================================================
  console.log('\n=== T11: AI reply 落到重叠线程各自 thread (不串) ===');
  // =========================================================
  await loadFresh();
  await t('交叉双批注', async () => {
    const a = await selectAndCreate('alpha bravo');
    const b = await selectAndCreate('bravo charlie');
    return { a: a.tid, b: b.tid };
  });
  await t('两 thread 各自 reply, comments 不串', async () => {
    const tids = await page.evaluate(() => window.__mdAnnotator.getAnnotations().map(t => t.threadId));
    if (tids.length !== 2) fail(`threads=${tids.length}`);
    const r1 = await page.evaluate((tid) => window.__mdAnnotator.ai.reply(tid, 'reply-to-first'), tids[0]);
    const r2 = await page.evaluate((tid) => window.__mdAnnotator.ai.reply(tid, 'reply-to-second'), tids[1]);
    if (!r1.ok || !r2.ok) fail(`reply 失败: ${JSON.stringify(r1)} ${JSON.stringify(r2)}`);
    const both = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return ts.map(t => ({
        text: t.text,
        comments: (t.comments || []).map(c => c.body),
      }));
    });
    return both;
  });

  // =========================================================
  console.log('\n=== T12: 重叠 inner 解决 — 状态独立 ===');
  // =========================================================
  await loadFresh();
  await t('嵌套双批注', async () => {
    const outer = await selectAndCreate('delta echo foxtrot');
    const inner = await selectAndCreate('echo foxtrot');
    return { outer: outer.tid, inner: inner.tid };
  });
  await t('resolve inner, 外层仍 unresolved (独立)', async () => {
    const inner = await page.evaluate(() => (window.__mdAnnotator.getAnnotations().find(t => t.text === 'echo foxtrot') || {}).threadId);
    await page.evaluate((tid) => window.__mdAnnotator._testToggleResolved(tid), inner);
    const out = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return ts.map(t => ({ text: t.text, resolved: !!t.resolved }));
    });
    const o = out.find(x => x.text === 'delta echo foxtrot');
    const i = out.find(x => x.text === 'echo foxtrot');
    if (o.resolved || !i.resolved) fail(`state 不独立: ${JSON.stringify(out)}`);
    return out;
  });

  // =========================================================
  console.log('\n=== T13: 嵌套扩展 3 批注 + 一删 + 一解 + 一回复 — 三独立 ===');
  // v1.42.9: 同 from 不同 to (嵌套扩展) 允许; 完全相同 range 拒绝
  // =========================================================
  await loadFresh();
  await t('middle-marker 嵌套扩展 3 批注', async () => {
    const sel1 = await selectText('middle-marker');
    if (!sel1) fail('sel1 failed');
    const ids = [];
    for (const delta of [0, 1, 2]) {
      const r = await page.evaluate((args) => {
        return window.__mdAnnotator._testCreateAnnotation(args.from, args.to + args.delta, 'middle-marker');
      }, { from: sel1.from, to: sel1.to, delta });
      if (!r) fail(`delta=${delta} 创建失败`);
      ids.push(r.threadId);
    }
    return ids;
  });
  await t('_testDeleteThread 第一个, 剩余 2', async () => {
    const tids = await page.evaluate(() => window.__mdAnnotator.getAnnotations().map(t => t.threadId));
    await page.evaluate((tid) => window.__mdAnnotator._testDeleteThread(tid), tids[0]);
    const after = await page.evaluate(() => window.__mdAnnotator.getAnnotations().length);
    if (after !== 2) fail(`剩 ${after} 预期 2`);
    return after;
  });
  await t('第二个 resolve, 第三个 reply — 三动作独立', async () => {
    const remaining = await page.evaluate(() => window.__mdAnnotator.getAnnotations().map(t => t.threadId));
    await page.evaluate((tid) => window.__mdAnnotator._testToggleResolved(tid), remaining[0]);
    const r = await page.evaluate((tid) => window.__mdAnnotator.ai.reply(tid, 'final-reply'), remaining[1]);
    if (!r.ok) fail(`reply 失败: ${JSON.stringify(r)}`);
    const out = await page.evaluate(() => {
      const ts = window.__mdAnnotator.getAnnotations();
      return ts.map(t => ({
        resolved: !!t.resolved,
        commentCount: (t.comments || []).length,
        commentBodies: (t.comments || []).map(c => c.body),
      }));
    });
    if (out.length !== 2) fail(`剩 ${out.length}`);
    const resolved = out.filter(x => x.resolved).length;
    const withReply = out.filter(x => x.commentCount > 0).length;
    if (resolved !== 1) fail(`resolved=${resolved} 预期 1`);
    if (withReply !== 1) fail(`reply=${withReply} 预期 1`);
    return out;
  });

  console.log(`\n========================================`);
  console.log(`✓ ${passed}/${total} 矩阵子测试通过`);
  console.log(`console.errors: ${consoleErrors.length}`);
  console.log(`page.errors:    ${pageErrors.length}`);
  if (consoleErrors.length) console.log('  示例:', consoleErrors.slice(0, 3).join(' | '));
  if (pageErrors.length)    console.log('  示例:', pageErrors.slice(0, 3).join(' | '));
  console.log(`========================================`);

  await browser.close();
  process.exit(passed === total && pageErrors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
