/**
 * Statusbar three-zone layout: single row, no overlap, status-left visible.
 * Run: node tests/e2e-statusbar-layout.spec.js
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
} = require('./chaos-ux/harness');

(async () => {
  const { browser, context, page } = await launch();
  console.log('=== e2e-statusbar-layout ===');
  await boot(page);
  const { t, done } = createRunner(page, 'statusbar-layout');

  async function metrics(width) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => {
      const live = document.getElementById('live-sync-banner');
      const lt = document.getElementById('live-sync-text');
      if (live) {
        live.classList.remove('hidden');
        if (lt) lt.textContent = '实时同步中 · 只读';
      }
      document.getElementById('ai-conn-status')?.classList.remove('hidden');
      const fm = document.getElementById('fix-mentor-status');
      if (fm) {
        fm.classList.remove('hidden');
        fm.dataset.status = 'running';
      }
      const ft = document.getElementById('fix-mentor-status-text');
      if (ft) ft.textContent = 'AI 处理中 · apply';
      const fe = document.getElementById('fix-mentor-status-elapsed');
      if (fe) fe.textContent = '12s';
      if (window.__mdAnnotator && window.__mdAnnotator.applySupervisionPayload) {
        window.__mdAnnotator.applySupervisionPayload({
          v: 1,
          active: true,
          phase: 'working',
          health: 'ok',
          pendingThreadIds: ['t1'],
          currentThreadId: 't1',
          message: '监管工作中 · 1',
        }, { force: true });
      }
      const left = document.getElementById('status-left');
      if (left) {
        left.textContent = '已自动保存';
        left.classList.remove('is-empty');
      }
    });
    await page.waitForTimeout(50);
    return page.evaluate(() => {
      const sb = document.getElementById('statusbar').getBoundingClientRect();
      const right = document.getElementById('status-right').getBoundingClientRect();
      const sup = document.getElementById('supervision-banner').getBoundingClientRect();
      const zones = [...document.querySelectorAll('#statusbar .status-zone')].map((z) => z.id);
      const overlap =
        sup.width > 0 &&
        right.width > 0 &&
        !(sup.right <= right.left + 1 || sup.left >= right.right - 1);
      const leftEl = document.getElementById('status-left');
      const leftCs = leftEl ? getComputedStyle(leftEl) : null;
      const leftHidden = !leftEl || leftCs.display === 'none' || leftCs.visibility === 'hidden';
      return {
        h: sb.height,
        overlap,
        zones,
        leftHidden,
        leftText: leftEl ? leftEl.textContent : '',
      };
    });
  }

  await t('zones exist and status-left visible @1280', async () => {
    await loadDoc(page, 'sb-layout.md', '# H\\n\\nbody phrase\\n');
    const m = await metrics(1280);
    if (m.zones.join() !== 'status-left-zone,status-center-zone,status-right-zone') {
      throw new Error('zones: ' + JSON.stringify(m.zones));
    }
    if (m.leftHidden) throw new Error('status-left still hidden');
    if (m.h > 34) throw new Error('too tall@1280 ' + m.h);
    if (m.overlap) throw new Error('overlap@1280');
  });

  await t('compact at 1024 and 900', async () => {
    for (const w of [1024, 900]) {
      const m = await metrics(w);
      if (m.h > 36) throw new Error('too tall@' + w + ' ' + m.h);
      if (m.overlap) throw new Error('overlap@' + w);
    }
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
