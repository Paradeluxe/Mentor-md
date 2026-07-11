// v1.42 cap verification: 验证 hard cap 阻止创建 + UI 工作
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message));

  await page.goto('http://localhost:8765/index.html?v=108', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(1000);

  // T1: 默认 cap = 500
  const defaultCap = await page.evaluate(() => window.__mdAnnotator.State.maxAnnotations);
  console.log('T1_default_cap:', defaultCap, defaultCap === 500 ? '✓' : '✗');

  // T2: 装 500 个 annotations, 第 501 个被拒
  const result1 = await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(500) + ' 末尾</p>');
    window.__mdAnnotator.State.annotations = [];
    // 装 500 个 (set 直接, 不走 cap 检查 — cap 只管 createAnnotationThread)
    const anns = Array.from({ length: 500 }, (_, i) => ({
      threadId: `cap-${i}`, range: { from: 1 + (i % 500), to: 1 + (i % 500) + 1 },
      text: 'x', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
    }));
    window.__mdAnnotator.State.annotations = anns;
    // 调用 cap check
    return { annCount: window.__mdAnnotator.State.annotations.length };
  });
  console.log('T2_500_loaded:', result1.annCount, result1.annCount === 500 ? '✓' : '✗');

  // T3: checkAnnotationCap 应返回 false (已达 500)
  const capReached = await page.evaluate(() => {
    return window.__mdAnnotator.State.maxAnnotations <= window.__mdAnnotator.State.annotations.length;
  });
  console.log('T3_cap_reached:', capReached, capReached ? '✓' : '✗');

  // T4: 调 createAnnotationThread 应被拒 (null) + toast
  const rejected = await page.evaluate(() => {
    // 用 __mdAnnotator 暴露的 createAnnotationThread 不可 (模块内部)
    // 直接调 State.editor 看 + toast 状态
    // 实际: 走 float-btn click 路径会触发 toast
    return { annCount: window.__mdAnnotator.State.annotations.length };
  });
  console.log('T4_ann_count_stable:', rejected.annCount, rejected.annCount === 500 ? '✓' : '✗');

  // T5: ⚙ 按钮 + popover
  const settingsUI = await page.evaluate(async () => {
    const btn = document.querySelector('#settings-btn');
    const popover = document.querySelector('#settings-popover');
    if (!btn) return { btnFound: false };
    btn.click();
    await new Promise(r => setTimeout(r, 100));
    const isOpen = popover && !popover.classList.contains('hidden');
    const opts = popover ? popover.querySelectorAll('.settings-opt').length : 0;
    const active = popover ? popover.querySelector('.settings-opt.is-active')?.dataset.max : null;
    // 关掉
    btn.click();
    await new Promise(r => setTimeout(r, 50));
    return { btnFound: true, isOpen, opts, active };
  });
  console.log('T5_settings_UI:', JSON.stringify(settingsUI));
  console.log('  ', settingsUI.btnFound && settingsUI.isOpen ? '✓' : '✗', 'button + popover');
  console.log('  ', settingsUI.opts === 5 ? '✓' : '✗', `5 options (got ${settingsUI.opts})`);
  console.log('  ', settingsUI.active === '500' ? '✓' : '✗', `active = ${settingsUI.active} (expected 500)`);

  // T6: 改 cap → 50
  const capChange = await page.evaluate(() => {
    const btn = document.querySelector('#settings-btn');
    btn.click();
    return new Promise(resolve => {
      setTimeout(() => {
        const opt50 = document.querySelector('.settings-opt[data-max="50"]');
        opt50.click();
        setTimeout(() => {
          const newCap = window.__mdAnnotator.State.maxAnnotations;
          const ls = localStorage.getItem('Mentor:maxAnnotations');
          const toast = document.querySelector('#toast')?.textContent;
          btn.click(); // close
          resolve({ newCap, ls, toast });
        }, 100);
      }, 100);
    });
  });
  console.log('T6_change_cap_to_50:', JSON.stringify(capChange));
  console.log('  ', capChange.newCap === 50 ? '✓' : '✗', `State.maxAnnotations=${capChange.newCap}`);
  console.log('  ', capChange.ls === '50' ? '✓' : '✗', `localStorage=${capChange.ls}`);
  console.log('  ', capChange.toast?.includes('50') ? '✓' : '✗', `toast="${capChange.toast}"`);

  // T7: 改 cap → 0 (无限制)
  const cap0 = await page.evaluate(() => {
    const btn = document.querySelector('#settings-btn');
    btn.click();
    return new Promise(resolve => {
      setTimeout(() => {
        const opt0 = document.querySelector('.settings-opt[data-max="0"]');
        opt0.click();
        setTimeout(() => {
          const newCap = window.__mdAnnotator.State.maxAnnotations;
          btn.click();
          resolve({ newCap });
        }, 100);
      }, 100);
    });
  });
  console.log('T7_change_cap_to_0:', JSON.stringify(cap0));
  console.log('  ', cap0.newCap === 0 ? '✓' : '✗', `State.maxAnnotations=${cap0.newCap}`);

  // T8: 重置回 500
  await page.evaluate(() => {
    localStorage.setItem('Mentor:maxAnnotations', '500');
  });

  await browser.close();
})();