/**
 * Atomic UI actions for chaos-ux (prefer real clicks).
 */
const { clickSel, annotateText, loadDoc } = require('./harness');
const { DOCS, BODY_CORPUS } = require('./content-catalog');

async function openHelp(page) {
  await clickSel(page, '#help-btn', 'S1.1');
}

async function closeHelp(page) {
  const open = await page.evaluate(() => !document.querySelector('#help-popover')?.classList.contains('hidden'));
  if (open) {
    await page.keyboard.press('Escape');
  }
}

async function openSettings(page) {
  await clickSel(page, '#settings-btn', 'S1.2');
}

async function closeSettings(page) {
  const open = await page.evaluate(() => !document.querySelector('#settings-popover')?.classList.contains('hidden'));
  if (open) await page.keyboard.press('Escape');
}

async function clickNew(page) {
  await clickSel(page, '#btn-new', 'S1.3');
}

async function clickSave(page) {
  await clickSel(page, '#btn-save', 'S1.5');
}

async function setFilter(page, tab) {
  const id = tab === 'open' ? 'S7.filter-open' : tab === 'resolved' ? 'S7.filter-resolved' : 'S7.filter-all';
  await clickSel(page, `[data-filter-tab="${tab}"]`, id);
}

async function toggleSource(page) {
  await clickSel(page, '#btn-toggle-render', 'S1.9');
}

async function ensureSimpleDoc(page) {
  await loadDoc(page, 'chaos-simple.md', DOCS.simple);
}

async function createOpenThread(page, needle = 'UNIQUE_ALPHA', body = 'hello chaos') {
  const r = await annotateText(page, needle, { body });
  if (!r.ok) throw new Error(r.err || 'annotate failed');
  if (page._chaosCoverage) {
    page._chaosCoverage.hitContent('A1');
    page._chaosCoverage.hitContent('B2');
  }
  return r;
}

async function resolveActive(page) {
  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const tid = M.State.activeThreadId || (M.State.annotations[0] && M.State.annotations[0].threadId);
    if (!tid) throw new Error('no thread');
    // toggleResolved via menu button if present
    const btn = document.querySelector(`[data-act="resolve"][data-thread="${tid}"]`);
    if (btn) btn.click();
    else if (typeof M.toggleResolved === 'function') M.toggleResolved(tid);
    else {
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      if (thr) thr.resolved = !thr.resolved;
      if (M.renderCommentList) M.renderCommentList();
    }
  });
}

module.exports = {
  openHelp,
  closeHelp,
  openSettings,
  closeSettings,
  clickNew,
  clickSave,
  setFilter,
  toggleSource,
  ensureSimpleDoc,
  createOpenThread,
  resolveActive,
  annotateText,
  loadDoc,
  BODY_CORPUS,
  DOCS,
};
