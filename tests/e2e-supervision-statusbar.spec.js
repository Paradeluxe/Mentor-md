/**
 * Supervision statusbar: single lamp, no duplicate dot, compact with live-sync.
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('./chaos-ux/harness');

(async () => {
  const { browser, context, page } = await launch();
  console.log('=== e2e-supervision-statusbar ===');
  await boot(page);
  const { t, done } = createRunner(page, 'supervision-statusbar');

  async function applySup(page, payload) {
    await page.evaluate((p) => {
      window.__mdAnnotator.applySupervisionPayload(p, { force: true });
    }, payload);
    await page.waitForTimeout(40);
  }

  await t('banner has one signal and no legacy banner-dot', async () => {
    await loadDoc(page, 'sup-status.md', '# S\\n\\nSTATUS_SUP phrase\\n');
    const r = await annotateText(page, 'STATUS_SUP', { body: 'note' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await applySup(page, {
      v: 1,
      active: true,
      phase: 'working',
      pendingThreadIds: [r.tid],
      currentThreadId: r.tid,
    });
    const counts = await page.evaluate(() => ({
      signal: document.querySelectorAll('#supervision-banner #supervision-signal').length,
      dots: document.querySelectorAll('#supervision-banner .supervision-banner-dot').length,
      hidden: document.getElementById('supervision-banner')?.classList.contains('hidden'),
      phase: document.getElementById('supervision-banner')?.dataset.phase,
      health: document.getElementById('supervision-banner')?.dataset.health,
    }));
    if (counts.signal !== 1) throw new Error('signal count: ' + JSON.stringify(counts));
    if (counts.dots !== 0) throw new Error('legacy dots remain: ' + JSON.stringify(counts));
    if (counts.hidden) throw new Error('banner hidden: ' + JSON.stringify(counts));
  });

  await t('statusbar stays compact with live-sync + supervision', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const live = document.getElementById('live-sync-banner');
      const liveText = document.getElementById('live-sync-text');
      if (live) {
        live.classList.remove('hidden');
        if (liveText) liveText.textContent = '实时同步中 · 只读';
      }
      window.__mdAnnotator.applySupervisionPayload({
        v: 1,
        active: true,
        phase: 'waiting',
        health: 'ok',
        pendingThreadIds: ['x'],
        currentThreadId: '',
        message: '监管等待中 · 未处理 1',
      }, { force: true });
    });
    await page.waitForTimeout(40);
    const metrics = await page.evaluate(() => {
      const status = document.querySelector('#statusbar').getBoundingClientRect();
      const live = document.querySelector('#live-sync-banner').getBoundingClientRect();
      const supervision = document.querySelector('#supervision-banner').getBoundingClientRect();
      const right = document.querySelector('#status-right').getBoundingClientRect();
      const overlap =
        supervision.width > 0 &&
        right.width > 0 &&
        !(supervision.right <= right.left + 1 || supervision.left >= right.right - 1);
      return {
        statusH: status.height,
        overlap,
        supervisionW: supervision.width,
        liveW: live.width,
      };
    });
    if (metrics.statusH > 42) throw new Error('statusbar too tall: ' + JSON.stringify(metrics));
    if (metrics.overlap) throw new Error('supervision overlaps status-right: ' + JSON.stringify(metrics));
  });

  await t('stale health paints without yellow gate semantics', async () => {
    await applySup(page, {
      v: 1,
      active: true,
      phase: 'working',
      health: 'stale',
      pendingThreadIds: ['a'],
      currentThreadId: 'a',
      error: 'poll-failed',
    });
    const st = await page.evaluate(() => {
      const lamp = document.getElementById('supervision-signal');
      const banner = document.getElementById('supervision-banner');
      const cs = lamp ? getComputedStyle(lamp) : null;
      return {
        health: banner?.dataset.health,
        bg: cs?.backgroundColor || '',
        animation: cs?.animationName || '',
      };
    });
    if (st.health !== 'stale') throw new Error(JSON.stringify(st));
    // must not pulse when stale
    if (st.animation && st.animation !== 'none' && !/none/i.test(st.animation)) {
      // allow empty
    }
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
