/**
 * Supervision navigation: body pet + active card stay in sync.
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
  console.log('=== e2e-supervision-navigation ===');
  await boot(page);
  const { t, done } = createRunner(page, 'supervision-navigation');

  await t('currentThreadId syncs body pet and matching open card', async () => {
    await loadDoc(page, 'sup-nav.md', '# N\\n\\nFIRST_SUP phrase here\\n\\nSECOND_SUP phrase here\\n');
    const first = await annotateText(page, 'FIRST_SUP', { body: 'first note' });
    const second = await annotateText(page, 'SECOND_SUP', { body: 'second note' });
    if (!first.ok || !second.ok) throw new Error(JSON.stringify({ first, second }));

    await page.evaluate((ids) => {
      const M = window.__mdAnnotator;
      if (typeof M.applySupervisionPayload !== 'function') throw new Error('no applySupervisionPayload');
      M.applySupervisionPayload({
        v: 1,
        active: true,
        phase: 'working',
        pendingThreadIds: [ids.first, ids.second],
        currentThreadId: ids.second,
        tool: 'fix-mentor',
      }, { force: true });
    }, { first: first.tid, second: second.tid });
    await page.waitForTimeout(120);

    const state = await page.evaluate((second) => {
      const M = window.__mdAnnotator;
      const card = document.querySelector(`.comment-thread[data-thread="${second}"]`);
      const pet = document.querySelector('.supervision-pet');
      return {
        activeThreadId: M.State.activeThreadId,
        activeCard: !!(card && card.classList.contains('is-active')),
        petThread: pet ? pet.getAttribute('data-thread-id') : null,
        paneOpen: !document.body.classList.contains('comment-pane-collapsed'),
        selectedFilter: document.querySelector('.filter-tab.is-active')?.dataset.filterTab || null,
        bannerHidden: document.getElementById('supervision-banner')?.classList.contains('hidden'),
      };
    }, second.tid);

    if (state.activeThreadId !== second.tid) throw new Error('active thread: ' + JSON.stringify(state));
    if (!state.activeCard) throw new Error('card not active: ' + JSON.stringify(state));
    if (state.petThread !== second.tid) throw new Error('pet thread: ' + JSON.stringify(state));
    if (!state.paneOpen) throw new Error('pane closed: ' + JSON.stringify(state));
    if (state.selectedFilter !== 'open') throw new Error('filter changed: ' + JSON.stringify(state));
    if (state.bannerHidden) throw new Error('banner hidden: ' + JSON.stringify(state));
  });

  await t('resolved current outside open filter does not pin filtered card', async () => {
    await loadDoc(page, 'sup-nav-res.md', '# R\\n\\nOPEN_SUP phrase\\n\\nRES_SUP phrase\\n');
    const openA = await annotateText(page, 'OPEN_SUP', { body: 'open' });
    const resA = await annotateText(page, 'RES_SUP', { body: 'resolved one' });
    if (!openA.ok || !resA.ok) throw new Error(JSON.stringify({ openA, resA }));
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      thr.resolved = true;
      M.State.filterOpen = true;
      M.State.filterResolved = false;
      if (typeof M.syncFilterTabsFromCheckboxes === 'function') M.syncFilterTabsFromCheckboxes();
      M.renderCommentList();
    }, resA.tid);
    await page.evaluate((ids) => {
      window.__mdAnnotator.applySupervisionPayload({
        v: 1,
        active: true,
        phase: 'working',
        pendingThreadIds: [ids.open, ids.res],
        currentThreadId: ids.res,
      }, { force: true });
    }, { open: openA.tid, res: resA.tid });
    await page.waitForTimeout(80);
    const out = await page.evaluate((ids) => {
      const card = document.querySelector(`.comment-thread[data-thread="${ids.res}"]`);
      const text = document.getElementById('supervision-banner-text')?.textContent || '';
      return {
        cardPresent: !!card,
        filter: document.querySelector('.filter-tab.is-active')?.dataset.filterTab,
        text,
        pet: document.querySelector('.supervision-pet')?.getAttribute('data-thread-id') || null,
      };
    }, { open: openA.tid, res: resA.tid });
    if (out.filter !== 'open') throw new Error('filter mutated: ' + JSON.stringify(out));
    if (out.cardPresent) throw new Error('resolved card pinned under open filter: ' + JSON.stringify(out));
    if (!/筛选外/.test(out.text) && out.pet !== resA.tid) {
      // either banner note or pet still ok if pet placed
      throw new Error('expected filter-out signal or pet: ' + JSON.stringify(out));
    }
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
