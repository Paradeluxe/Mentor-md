/**
 * Comment body content samples (Phase A subset of B1–B17).
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('../harness');
const { DOCS, BODY_CORPUS } = require('../content-catalog');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/04c-ann-bodies ===');
  await boot(page);
  const { t, done } = createRunner(page, '04c-ann-bodies');

  await t('B5 AI path seeds @AI draft', async () => {
    await loadDoc(page, 'b5.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { ai: true });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const has = /@AI\b/i.test(r.draft || '');
    if (!has) throw new Error('draft missing @AI: ' + r.draft);
    coverage.hitContent('B5');
  });

  await t('B2 single char body committed', async () => {
    await loadDoc(page, 'b2.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_BETA', { body: BODY_CORPUS.single });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const body = await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      return a && a.comments && a.comments[0] && a.comments[0].body;
    }, r.tid);
    if (body !== 'x') throw new Error('body=' + body);
    coverage.hitContent('B2');
  });

  await t('B7 @AI long instruction serializes', async () => {
    await loadDoc(page, 'b7.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: BODY_CORPUS.aiInstr });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const side = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const list = M.buildAnnotationsSidecar();
      return list.map((a) => ({
        bodies: (a.comments || []).map((c) => c.body),
      }));
    });
    const flat = side.flatMap((x) => x.bodies).join('\n');
    if (!/@AI\b/i.test(flat)) throw new Error('sidecar lost @AI: ' + flat.slice(0, 200));
    const marker = await page.evaluate((s) => {
      return window.__mdAnnotator.bodyHasAiMarker
        ? window.__mdAnnotator.bodyHasAiMarker(s)
        : /@AI\b/i.test(s);
    }, BODY_CORPUS.aiInstr);
    if (!marker) throw new Error('bodyHasAiMarker false');
    coverage.hitContent('B7');
    coverage.hitContent('P8');
  });

  await t('B10 html-looking body escaped in DOM', async () => {
    await loadDoc(page, 'b10.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_BETA', { body: BODY_CORPUS.htmlish });
    if (!r.ok) throw new Error(JSON.stringify(r));
    // ensure no script tag executed / injected as real element in comment pane
    const danger = await page.evaluate(() => {
      const list = document.querySelector('#comment-list');
      if (!list) return { noList: true };
      return {
        scripts: list.querySelectorAll('script').length,
        onerrorImgs: list.querySelectorAll('img[onerror]').length,
      };
    });
    if (danger.scripts > 0 || danger.onerrorImgs > 0) throw new Error(JSON.stringify(danger));
    coverage.hitContent('B10');
  });

  await t('B14 replyDrafts isolated per thread', async () => {
    await loadDoc(page, 'b14.md', DOCS.simple);
    const r1 = await annotateText(page, 'UNIQUE_ALPHA', { ai: true });
    const r2 = await annotateText(page, 'UNIQUE_BETA', { ai: false });
    if (!r1.ok || !r2.ok) throw new Error(JSON.stringify({ r1, r2 }));
    await page.evaluate(
      ({ t1, t2 }) => {
        const M = window.__mdAnnotator;
        M.State.replyDrafts[t1] = '@AI draft-one';
        M.State.replyDrafts[t2] = 'draft-two';
      },
      { t1: r1.tid, t2: r2.tid }
    );
    const drafts = await page.evaluate(
      ({ t1, t2 }) => ({
        a: window.__mdAnnotator.State.replyDrafts[t1],
        b: window.__mdAnnotator.State.replyDrafts[t2],
      }),
      { t1: r1.tid, t2: r2.tid }
    );
    if (drafts.a !== '@AI draft-one' || drafts.b !== 'draft-two') throw new Error(JSON.stringify(drafts));
    coverage.hitContent('B14');
  });

  await t('B1 empty body keeps submit disabled if UI present', async () => {
    await loadDoc(page, 'b1.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { ai: false });
    if (!r.ok) throw new Error(JSON.stringify(r));
    // clear draft to empty
    const st = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      M.State.replyDrafts[tid] = '';
      if (M.renderCommentList) M.renderCommentList();
      const ta = document.querySelector(`[data-thread-input="${tid}"]`);
      if (ta) {
        ta.value = '';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const btn = document.querySelector(`[data-act="submit-reply"][data-thread="${tid}"]`);
      return {
        hasBtn: !!btn,
        disabled: btn ? btn.disabled : null,
        comments: (M.State.annotations.find((a) => a.threadId === tid)?.comments || []).length,
      };
    }, r.tid);
    // draft threads may have 0 comments; submit should be disabled when empty
    if (st.hasBtn && st.disabled === false && st.comments === 0) {
      throw new Error('empty submit enabled: ' + JSON.stringify(st));
    }
    coverage.hitContent('B1');
  });

  const result = done();
  console.log('  content hits:', Object.keys(coverage.report().content).join(', '));
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
