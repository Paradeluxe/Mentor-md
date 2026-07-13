// 测创建 N 个 annotation 后的真实性能
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message));

  await page.goto('http://localhost:8787/index.html?v=108', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(1000);

  console.log('=== TEST 1: 纯 onUpdate 链路 (无 setTextSelection 干扰) ===');
  for (const N of [10, 50, 100, 200, 300, 500, 1000, 2000]) {
    const result = await page.evaluate((N) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      const tr = ed.state.tr;
      for (let i = 0; i < N; i++) {
        const from = 1 + (i % 500);
        const to = from + 1;
        if (to >= ed.state.doc.content.size) break;
        tr.addMark(from, to, ed.schema.marks.annotation.create({
          threadId: `p-${i}`, resolved: false, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = Array.from({ length: N }, (_, i) => ({
        threadId: `p-${i}`, range: { from: 1 + (i % 500), to: 1 + (i % 500) + 1 },
        text: 'x', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }));
      // 用真正触发 onUpdate 的方式: 调 trigger via markDirty
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        // 模拟输入字符 → onUpdate → renderCommentList
        ed.commands.insertContent('x');
        ed.commands.undo();
        samples.push(performance.now() - t);
      }
      const cards = document.querySelectorAll('.comment-thread').length;
      const overflow = !!document.querySelector('.comment-overflow-warn');
      const sorted = samples.sort((a, b) => a - b);
      return {
        avg: sorted.reduce((a, b) => a + b) / sorted.length,
        p50: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        max: sorted[sorted.length - 1],
        cards, overflow,
      };
    }, N);
    const mode = result.overflow ? 'OVERFLOW' : `${result.cards} cards`;
    console.log(`N=${String(N).padStart(5)} | ${mode.padEnd(15)} | type→render avg=${result.avg.toFixed(1).padStart(5)}ms p50=${result.p50.toFixed(1).padStart(5)}ms p95=${result.p95.toFixed(1).padStart(5)}ms max=${result.max.toFixed(1).padStart(5)}ms`);
  }

  console.log('\n=== TEST 2: 装 N 个 annotation 后, 纯 renderCommentList 调用 ===');
  // 临时暴露 renderCommentList via onUpdate
  for (const N of [10, 50, 100, 200, 300, 500]) {
    // 先装 N 个
    await page.evaluate((N) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      const tr = ed.state.tr;
      for (let i = 0; i < N; i++) {
        const from = 1 + (i % 500);
        const to = from + 1;
        if (to >= ed.state.doc.content.size) break;
        tr.addMark(from, to, ed.schema.marks.annotation.create({
          threadId: `p-${i}`, resolved: false, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = Array.from({ length: N }, (_, i) => ({
        threadId: `p-${i}`, range: { from: 1 + (i % 500), to: 1 + (i % 500) + 1 },
        text: 'x', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }));
    }, N);
    // 等渲染稳定
    await page.waitForTimeout(200);
    const result = await page.evaluate((N) => {
      const ed = window.__mdAnnotator.State.editor;
      // 测连续 5 次插入+undo (这是真实使用)
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        ed.commands.insertContent('y');
        ed.commands.undo();
        samples.push(performance.now() - t);
      }
      const sorted = samples.sort((a, b) => a - b);
      const overflow = !!document.querySelector('.comment-overflow-warn');
      const cards = document.querySelectorAll('.comment-thread').length;
      return {
        avg: sorted.reduce((a, b) => a + b) / sorted.length,
        p95: sorted[Math.floor(sorted.length * 0.95)],
        max: sorted[sorted.length - 1],
        cards, overflow,
      };
    }, N);
    const mode = result.overflow ? 'OVERFLOW' : `${result.cards} cards`;
    console.log(`N=${String(N).padStart(5)} | ${mode.padEnd(15)} | insert→undo avg=${result.avg.toFixed(1).padStart(5)}ms p95=${result.p95.toFixed(1).padStart(5)}ms max=${result.max.toFixed(1).padStart(5)}ms`);
  }

  await browser.close();
})();