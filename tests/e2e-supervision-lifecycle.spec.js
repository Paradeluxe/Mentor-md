/**
 * Supervision lifecycle: load, switch doc generation, end, stale keep-lock.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
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
  console.log('=== e2e-supervision-lifecycle ===');
  await boot(page);
  const { t, done } = createRunner(page, 'supervision-lifecycle');

  await t('inactive clears banner and pet', async () => {
    await loadDoc(page, 'sup-life.md', '# L\\n\\nLIFE_SUP phrase\\n');
    const r = await annotateText(page, 'LIFE_SUP', { body: 'n' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await page.evaluate((tid) => {
      window.__mdAnnotator.applySupervisionPayload({
        v: 1, active: true, phase: 'working',
        pendingThreadIds: [tid], currentThreadId: tid,
      }, { force: true });
    }, r.tid);
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      window.__mdAnnotator.applySupervisionPayload({ active: false }, { force: true });
    });
    await page.waitForTimeout(40);
    const out = await page.evaluate(() => ({
      bannerHidden: document.getElementById('supervision-banner')?.classList.contains('hidden'),
      pet: !!document.querySelector('.supervision-pet'),
      bodyActive: document.body.classList.contains('supervision-active'),
      active: window.__mdAnnotator.getSupervisionState?.().active,
    }));
    if (!out.bannerHidden || out.pet || out.bodyActive || out.active) {
      throw new Error('cleanup failed: ' + JSON.stringify(out));
    }
  });

  await t('stale keeps active snapshot fields', async () => {
    await page.evaluate(() => {
      window.__mdAnnotator.applySupervisionPayload({
        v: 1,
        active: true,
        phase: 'working',
        health: 'ok',
        pendingThreadIds: ['keep'],
        currentThreadId: 'keep',
      }, { force: true });
      window.__mdAnnotator.applySupervisionPayload({
        v: 1,
        active: true,
        phase: 'working',
        health: 'stale',
        error: 'poll-failed',
        pendingThreadIds: ['keep'],
        currentThreadId: 'keep',
      }, { force: true });
    });
    const s = await page.evaluate(() => window.__mdAnnotator.getSupervisionState());
    if (!s.active || s.health !== 'stale' || s.currentThreadId !== 'keep') {
      throw new Error(JSON.stringify(s));
    }
  });

  await t('document switch applies inactive for new empty source', async () => {
    await loadDoc(page, 'sup-life-a.md', '# A\\n\\nA_ANCHOR text\\n');
    const a = await annotateText(page, 'A_ANCHOR', { body: 'a' });
    await page.evaluate((tid) => {
      window.__mdAnnotator.applySupervisionPayload({
        v: 1, active: true, phase: 'working',
        pendingThreadIds: [tid], currentThreadId: tid,
      }, { force: true });
    }, a.tid);
    await loadDoc(page, 'sup-life-b.md', '# B\\n\\nno anchors here\\n');
    await page.evaluate(() => {
      window.__mdAnnotator.applySupervisionPayload({ active: false }, { force: true });
    });
    await page.waitForTimeout(40);
    const out = await page.evaluate(() => ({
      pet: !!document.querySelector('.supervision-pet'),
      active: window.__mdAnnotator.getSupervisionState?.().active,
      body: (document.querySelector('#editor')?.innerText || '').slice(0, 40),
    }));
    if (out.pet || out.active) throw new Error(JSON.stringify(out));
    if (!/no anchors here|B/.test(out.body)) throw new Error('body empty: ' + JSON.stringify(out));
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
