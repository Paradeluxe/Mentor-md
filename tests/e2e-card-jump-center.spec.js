// Card → body jump should place the mark near the vertical center of #editor-pane.
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE + '?card-center=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    document.body.classList.remove('comment-pane-collapsed');
  });

  const tid = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const paras = [];
    for (let i = 0; i < 40; i++) paras.push(`<p>PAD_LINE_${i} filler text to force scroll height.</p>`);
    paras.push('<p>TARGET_MARK_ANCHOR is the jump destination.</p>');
    for (let i = 0; i < 40; i++) paras.push(`<p>TAIL_LINE_${i} more filler below target.</p>`);
    M.State._suspendAnnValidate = true;
    try {
      ed.commands.setContent(paras.join(''), false);
    } finally {
      M.State._suspendAnnValidate = false;
    }
    let from = null, to = null;
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText || from != null) return;
      const i = n.text.indexOf('TARGET_MARK_ANCHOR');
      if (i >= 0) { from = pos + i; to = from + 'TARGET_MARK_ANCHOR'.length; }
    });
    if (from == null) throw new Error('missing target');
    const threadId = 'thread-center-jump';
    M.State.annotations = [{
      threadId,
      type: 'comment',
      author: 'tester',
      created: new Date().toISOString(),
      quote: 'TARGET_MARK_ANCHOR',
      text: 'TARGET_MARK_ANCHOR',
      resolved: false,
      comments: [{ id: 'c1', author: 'tester', text: 'go here', created: new Date().toISOString() }],
      range: { from, to }
    }];
    const mark = ed.schema.marks.annotation.create({ threadId, resolved: false, authorColor: 0 });
    const tr = ed.state.tr.addMark(from, to, mark);
    tr.setMeta('addToHistory', false);
    ed.view.dispatch(tr);
    M.State.filterOpen = true;
    M.State.filterResolved = false;
    M.renderCommentList?.();
    const pane = document.querySelector('#editor-pane');
    if (pane) pane.scrollTop = 0;
    return threadId;
  });

  await page.waitForSelector(`#comment-list .comment-thread[data-thread="${tid}"]`, { timeout: 5000 });

  async function measure(id) {
    return page.evaluate((threadId) => {
      const pane = document.querySelector('#editor-pane');
      const mark = document.querySelector(`.annotation-mark[data-thread-id="${threadId}"]`);
      if (!pane || !mark) return { ok: false, reason: 'missing dom' };
      const pr = pane.getBoundingClientRect();
      const mr = mark.getBoundingClientRect();
      const markMid = (mr.top + mr.bottom) / 2;
      const paneMid = (pr.top + pr.bottom) / 2;
      const offset = markMid - paneMid;
      return {
        ok: true,
        scrollTop: pane.scrollTop,
        paneH: pr.height,
        offset,
        centered: Math.abs(offset) <= pr.height * 0.18
      };
    }, id);
  }

  async function waitCentered(id, label) {
    let last = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(50);
      last = await measure(id);
      if (last.ok && last.centered && last.scrollTop > 50) return last;
    }
    throw new Error(label + ' not centered: ' + JSON.stringify(last));
  }

  // 1) goto menu path (explicit locate control)
  await page.evaluate(() => { document.querySelector('#editor-pane').scrollTop = 0; });
  await page.locator(`#comment-list .comment-thread[data-thread="${tid}"] [data-act="toggle-menu"]`).click();
  await page.locator(`#comment-list .comment-thread[data-thread="${tid}"] [data-act="goto"]`).click();
  const geoGoto = await waitCentered(tid, 'goto');

  // 2) card body-wrap click (bubbled handler)
  await page.evaluate(() => { document.querySelector('#editor-pane').scrollTop = 0; });
  await page.waitForTimeout(40);
  await page.evaluate((id) => {
    const wrap = document.querySelector(`#comment-list .comment-thread[data-thread="${id}"] .comment-body-wrap`);
    if (!wrap) throw new Error('no body-wrap');
    wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, tid);
  const geoCard = await waitCentered(tid, 'card-body');

  // 3) API
  await page.evaluate(() => { document.querySelector('#editor-pane').scrollTop = 0; });
  await page.waitForTimeout(40);
  await page.evaluate((id) => window.__mdAnnotator.scrollToThread(id), tid);
  const geoApi = await waitCentered(tid, 'api');

  console.log('PASS card-jump-center', { geoGoto, geoCard, geoApi });
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
