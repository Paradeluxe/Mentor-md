// Body mark click must jump to resolved cards even when filter is "未解决".
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE + '?resolved-jump=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  const setup = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    M.State._suspendAnnValidate = true;
    try {
      ed.commands.setContent('<p>OPEN_MARK here and RESOLVED_MARK there.</p>', false);
    } finally {
      M.State._suspendAnnValidate = false;
    }
    // clear residual
    try {
      const mt = ed.schema.marks.annotation;
      let tr = ed.state.tr;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        n.marks.forEach((m) => {
          if (m.type === mt) tr = tr.removeMark(pos, pos + n.nodeSize, mt);
        });
      });
      if (tr.steps.length) ed.view.dispatch(tr);
    } catch (_) {}

    function addMark(text, threadId, resolved) {
      let from = null, to = null;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText || from != null) return;
        const i = n.text.indexOf(text);
        if (i >= 0) { from = pos + i; to = from + text.length; }
      });
      if (from == null) throw new Error('missing ' + text);
      const thread = {
        threadId,
        type: 'comment',
        author: 'tester',
        created: new Date().toISOString(),
        quote: text,
        text,
        resolved: !!resolved,
        resolvedAt: resolved ? new Date().toISOString() : undefined,
        comments: [{ id: threadId + '-c1', author: 'tester', text: resolved ? 'done' : 'todo', created: new Date().toISOString() }],
        range: { from, to }
      };
      M.State.annotations.push(thread);
      const mark = ed.schema.marks.annotation.create({
        threadId,
        resolved: !!resolved,
        authorColor: 0
      });
      const tr = ed.state.tr.addMark(from, to, mark);
      tr.setMeta('addToHistory', false);
      ed.view.dispatch(tr);
      return threadId;
    }

    M.State.annotations = [];
    const openId = addMark('OPEN_MARK', 'thread-open-jump', false);
    const resolvedId = addMark('RESOLVED_MARK', 'thread-resolved-jump', true);
    // default filter: open only
    M.State.filterOpen = true;
    M.State.filterResolved = false;
    M.State.activeThreadId = null;
    if (typeof M.syncFilterTabsFromCheckboxes === 'function') M.syncFilterTabsFromCheckboxes();
    if (typeof M.renderCommentList === 'function') M.renderCommentList();
    else if (typeof M.updateDocMeta === 'function') M.updateDocMeta({ immediate: true });
    return { openId, resolvedId };
  });

  // Ensure comment pane open + filter open
  await page.evaluate(() => {
    document.body.classList.remove('comment-pane-collapsed');
    const M = window.__mdAnnotator;
    M.State.filterOpen = true;
    M.State.filterResolved = false;
    M.syncFilterTabsFromCheckboxes?.();
    M.renderCommentList?.();
  });
  await page.waitForTimeout(80);

  // Resolved card must not be visible under open filter
  let visible = await page.evaluate((id) => !!document.querySelector(`#comment-list .comment-thread[data-thread="${id}"]`), setup.resolvedId);
  assert(!visible, 'resolved card should be hidden under open filter before click');

  // Click body resolved mark
  const mark = page.locator('.annotation-mark[data-thread-id="thread-resolved-jump"]').first();
  await mark.click({ force: true });
  await page.waitForTimeout(120);

  const afterClick = await page.evaluate((id) => {
    const M = window.__mdAnnotator;
    const card = document.querySelector(`#comment-list .comment-thread[data-thread="${id}"]`);
    return {
      activeThreadId: M.State.activeThreadId,
      filterOpen: M.State.filterOpen,
      filterResolved: M.State.filterResolved,
      cardPresent: !!card,
      cardActive: !!(card && card.classList.contains('is-active')),
      filterTab: document.querySelector('.filter-tab.is-active')?.dataset.filterTab || '',
      paneCollapsed: document.body.classList.contains('comment-pane-collapsed')
    };
  }, setup.resolvedId);

  assert.equal(afterClick.activeThreadId, setup.resolvedId, 'active thread: ' + JSON.stringify(afterClick));
  assert(afterClick.cardPresent, 'resolved card should appear: ' + JSON.stringify(afterClick));
  assert(afterClick.cardActive, 'resolved card should be active: ' + JSON.stringify(afterClick));
  assert(
    afterClick.filterResolved === true || afterClick.filterTab === 'resolved' || afterClick.filterTab === 'all',
    'filter should include resolved: ' + JSON.stringify(afterClick)
  );
  assert(!afterClick.paneCollapsed, 'comment pane should open');

  // Also via API path (fallback if pointer path differs)
  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    M.State.filterOpen = true;
    M.State.filterResolved = false;
    M.State.activeThreadId = null;
    M.syncFilterTabsFromCheckboxes?.();
    M.renderCommentList?.();
  });
  await page.waitForTimeout(60);
  const api = await page.evaluate((id) => {
    const M = window.__mdAnnotator;
    const ok = M.activateAndRevealThread(id);
    const card = document.querySelector(`#comment-list .comment-thread[data-thread="${id}"]`);
    return {
      ok,
      activeThreadId: M.State.activeThreadId,
      cardPresent: !!card,
      cardActive: !!(card && card.classList.contains('is-active')),
      filterOpen: M.State.filterOpen,
      filterResolved: M.State.filterResolved
    };
  }, setup.resolvedId);
  assert(api.ok && api.cardPresent && api.cardActive, 'API reveal: ' + JSON.stringify(api));

  console.log('PASS body-resolved-jump', { afterClick, api });
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
