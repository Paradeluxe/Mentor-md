// 测 _validateMarksAfterEdit 单独耗时
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8787/index.html?v=115', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);

  console.log('=== _validateMarksAfterEdit perf (N anns, mark 都在) ===');
  for (const N of [10, 50, 100, 200, 500, 1000, 2000]) {
    const r = await page.evaluate(async (N) => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      const tr = ed.state.tr;
      for (let i = 0; i < N; i++) {
        const from = 1 + (i % 500);
        const to = from + 1;
        tr.addMark(from, to, ed.schema.marks.annotation.create({
          threadId: 'v' + i, resolved: false, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = Array.from({length: N}, (_, i) => ({
        threadId: 'v' + i, range: { from: 1 + (i % 500), to: 1 + (i % 500) + 1 },
        text: '字', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }));
      await new Promise(r => setTimeout(r, 100));
      // 测 5 次 validate
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        window.__mdAnnotator._validateMarksAfterEdit(ed);
        samples.push(performance.now() - t);
      }
      samples.sort((a, b) => a - b);
      return { avg: samples[2].toFixed(2), p95: samples[4].toFixed(2) };
    }, N);
    console.log(`N=${String(N).padStart(5)} | validate avg=${r.avg}ms p95=${r.p95}ms`);
  }

  await browser.close();
})();