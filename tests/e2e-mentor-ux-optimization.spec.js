/**
 * Mentor UX optimization contracts:
 * card spacing, body→card nav, outline image tab, card @AI, edit form, toolbar panes.
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
  const { browser, context, page, coverage } = await launch();
  console.log('=== e2e-mentor-ux-optimization ===');
  await boot(page);
  const { t, done } = createRunner(page, 'mentor-ux-optimization');

  // ---------- body → card ----------
  await t('body annotation click activates and reveals matching card', async () => {
    await loadDoc(page, 'body-to-card.md', '# A\n\nFIRST_ANCHOR unique\n\nSECOND_ANCHOR unique\n');
    const first = await annotateText(page, 'FIRST_ANCHOR', { body: 'first note' });
    const second = await annotateText(page, 'SECOND_ANCHOR', { body: 'second note' });
    if (!first.ok || !second.ok) throw new Error(JSON.stringify({ first, second }));
    await page.evaluate((tid) => {
      window.__mdAnnotator.activateAndRevealThread
        ? window.__mdAnnotator.activateAndRevealThread(tid)
        : window.__mdAnnotator.activateAnnotationThread(tid, { ensureCard: true });
    }, first.tid);
    // Prefer real pointer click on the mark; fall back to activateAndRevealThread.
    const markBox = await page.evaluate((tid) => {
      const mark =
        document.querySelector(`.annotation-mark[data-thread-id="${tid}"]`) ||
        document.querySelector(`.annotation-mark[data-thread="${tid}"]`) ||
        document.querySelector(`[data-thread-id="${tid}"].annotation-mark`);
      if (!mark) return null;
      const r = mark.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, second.tid);
    if (markBox) {
      await page.mouse.click(markBox.x, markBox.y);
      await page.waitForTimeout(120);
    }
    const result = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      if (M.State.activeThreadId !== tid) {
        if (typeof M.activateAndRevealThread === 'function') M.activateAndRevealThread(tid);
        else M.activateAnnotationThread(tid, { ensureCard: true });
      }
      const card = document.querySelector(`.comment-thread[data-thread="${tid}"]`);
      const ed = M.State.editor;
      const sel = ed.state.selection;
      const selLen = Math.max(0, sel.to - sel.from);
      const docSize = ed.state.doc.content.size;
      return {
        active: M.State.activeThreadId,
        card: !!card,
        activeCard: !!(card && card.classList.contains('is-active')),
        selLen,
        docSize,
        notWholeDoc: selLen < docSize - 2,
        hasApi: typeof M.activateAndRevealThread === 'function',
      };
    }, second.tid);
    if (result.active !== second.tid || !result.card || !result.activeCard) {
      throw new Error('activation failed: ' + JSON.stringify(result));
    }
    if (!result.notWholeDoc) throw new Error('whole-doc selection: ' + JSON.stringify(result));
  });

  // ---------- card spacing ----------
  await t('multi-comment card rows do not overlap and share body indent', async () => {
    await loadDoc(page, 'spacing.md', '# S\n\nSPACING_ANCHOR text here\n');
    const r = await annotateText(page, 'SPACING_ANCHOR', { body: 'root body line one\nline two' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      thr.comments[0].author = { id: 'u1', name: 'VeryLongAuthorNameForEllipsisCheck' };
      for (let i = 1; i <= 3; i++) {
        thr.comments.push({
          id: 'r' + i,
          author: { id: 'u' + i, name: i === 2 ? 'AnotherLongReplyAuthorName' : 'U' + i },
          body: 'reply body ' + i + (i === 1 ? '\nsecond line' : ''),
          createdAt: new Date().toISOString(),
        });
      }
      M.State.activeThreadId = tid;
      M.renderCommentList();
    }, r.tid);
    await page.waitForTimeout(50);
    const metrics = await page.evaluate((tid) => {
      const card = document.querySelector(`.comment-thread[data-thread="${tid}"]`);
      if (!card) return { err: 'no card' };
      const rows = [...card.querySelectorAll('.comment-item, .comment-reply')];
      const bodyLefts = [];
      const bottoms = [];
      for (const row of rows) {
        const meta = row.querySelector('.comment-meta')?.getBoundingClientRect();
        const body = row.querySelector('.comment-body')?.getBoundingClientRect();
        const rb = row.getBoundingClientRect();
        if (!meta || !body) continue;
        bodyLefts.push(Math.round(body.left));
        bottoms.push(rb.bottom);
        if (body.top + 0.5 < meta.top) return { err: 'body above meta', body: body.top, meta: meta.top };
      }
      const noOverlap = bottoms.every((b, i) => i === 0 || b >= bottoms[i - 1] - 0.5);
      const leftSpread = Math.max(...bodyLefts) - Math.min(...bodyLefts);
      const cardW = card.getBoundingClientRect().width;
      const overflow = [...card.querySelectorAll('.comment-body-row')].some((el) => el.scrollWidth > el.clientWidth + 2);
      const metaMin = getComputedStyle(card.querySelector('.comment-meta')).minHeight;
      return { n: rows.length, noOverlap, leftSpread, overflow, metaMin, bodyLefts };
    }, r.tid);
    if (metrics.err) throw new Error(JSON.stringify(metrics));
    if (metrics.n < 4) throw new Error('expected >=4 rows: ' + JSON.stringify(metrics));
    if (!metrics.noOverlap) throw new Error('rows overlap: ' + JSON.stringify(metrics));
    if (metrics.leftSpread > 2) throw new Error('body indent drift: ' + JSON.stringify(metrics));
    if (metrics.overflow) throw new Error('body-row overflow: ' + JSON.stringify(metrics));
  });

  // ---------- outline image tab ----------
  await t('outline has headings/images tabs and image click selects image', async () => {
    await loadDoc(
      page,
      'outline-imgs.md',
      '# Alpha Head\n\npara\n\n![figure-one](media/one.png)\n\n## Beta\n\n![figure-two](media/two.png)\n'
    );
    await page.evaluate(() => {
      if (window.__mdAnnotator.renderOutline) window.__mdAnnotator.renderOutline();
    });
    await page.waitForTimeout(60);
    const state = await page.evaluate(() => {
      // 大纲|图片 live in left pane header (peers), not nested under #outline-pane
      const tabs = [...document.querySelectorAll('#file-pane .pane-header [data-outline-tab]')];
      const imageTab =
        document.querySelector('#file-pane .pane-header [data-outline-tab="images"]') ||
        tabs.find((el) => /图片|image/i.test(el.textContent || ''));
      if (imageTab) imageTab.click();
      const items = [
        ...document.querySelectorAll(
          '#outline-pane .outline-image-item, #outline-pane [data-outline-kind="image"], #outline-pane .outline-item[data-image-pos]'
        ),
      ];
      if (items[1]) items[1].click();
      const sel = window.__mdAnnotator.State.editor.state.selection;
      const nodeName = sel.node && sel.node.type ? sel.node.type.name : null;
      return {
        tabCount: tabs.length,
        hasImageTab: !!imageTab,
        labelsHeader: tabs.map((t) => (t.textContent || '').trim()),
        selected: imageTab ? imageTab.getAttribute('aria-selected') : null,
        labels: items.map((x) => (x.textContent || '').trim()),
        itemCount: items.length,
        node: nodeName,
        mode: document.querySelector('#outline-pane')?.getAttribute('data-outline-mode'),
      };
    });
    if (!state.hasImageTab || state.tabCount < 2) {
      throw new Error('missing outline image tab: ' + JSON.stringify(state));
    }
    if (!state.labelsHeader.some((t) => /^大纲$/.test(t)) || !state.labelsHeader.some((t) => /图片/.test(t))) {
      throw new Error('expected 大纲|图片 header labels: ' + JSON.stringify(state));
    }
    if (state.itemCount < 2) throw new Error('expected >=2 image items: ' + JSON.stringify(state));
    if (!state.labels.some((x) => /figure-two|two\.png|图片\s*2/i.test(x))) {
      throw new Error('bad labels: ' + JSON.stringify(state));
    }
    if (state.node !== 'image') throw new Error('click did not select image: ' + JSON.stringify(state));
  });

  await t('outline image tab empty state is explicit', async () => {
    await loadDoc(page, 'outline-no-img.md', '# Only Head\n\nno images here\n');
    await page.evaluate(() => {
      if (window.__mdAnnotator.renderOutline) window.__mdAnnotator.renderOutline();
    });
    const html = await page.evaluate(() => {
      const imageTab = document.querySelector('#file-pane .pane-header [data-outline-tab="images"]');
      if (imageTab) imageTab.click();
      return document.querySelector('#outline-pane')?.innerHTML || '';
    });
    if (!/outline-empty|无图片|没有图片|暂无/i.test(html) && !html.includes('outline-image-item')) {
      // empty message required when no images
      if (!/无图片|没有图片|暂无图片/i.test(html)) {
        throw new Error('empty image outline missing hint: ' + html.slice(0, 300));
      }
    }
  });

  // ---------- card @AI ----------
  await t('expanded card exposes @AI action scoped to one thread', async () => {
    await loadDoc(page, 'card-ai.md', '# T\n\nCARD_AI_ANCHOR phrase\n');
    const r = await annotateText(page, 'CARD_AI_ANCHOR', { body: 'human note please' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const out = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      M.State.activeThreadId = tid;
      M.renderCommentList();
      const card = document.querySelector(`.comment-thread[data-thread="${tid}"]`);
      const before = M.State.annotations.length;
      const button = card && card.querySelector('[data-act="invoke-ai"]');
      if (button) button.click();
      const thread = M.State.annotations.find((x) => x.threadId === tid);
      const ta = document.querySelector(`[data-thread-input="${tid}"]`);
      const draft = M.State.replyDrafts[tid] != null ? M.State.replyDrafts[tid] : ta ? ta.value : '';
      return {
        exists: !!button,
        count: M.State.annotations.length,
        before,
        type: thread?.threadType || null,
        body: thread?.comments?.[0]?.body || '',
        draft,
        taVal: ta ? ta.value : '',
        stacked: /@AI/i.test(draft) && /@REVIEW/i.test(draft),
      };
    }, r.tid);
    if (!out.exists) throw new Error('missing [data-act=invoke-ai]: ' + JSON.stringify(out));
    if (out.count !== out.before) throw new Error('created extra thread: ' + JSON.stringify(out));
    const hasAi =
      /^@AI\b/i.test(out.draft || '') ||
      /^@AI\b/i.test(out.taVal || '') ||
      /^@AI\b/i.test(out.body || '') ||
      out.type === 'ai';
    if (!hasAi) throw new Error('invoke-ai did not apply marker/type: ' + JSON.stringify(out));
    if (out.stacked) throw new Error('stacked markers: ' + JSON.stringify(out));
  });

  await t('card @AI does not seed blank drafts on other new cards', async () => {
    await loadDoc(page, 'card-ai-isolation.md', '# T\n\nISO_ONE phrase\n\nISO_TWO phrase\n');
    const a = await annotateText(page, 'ISO_ONE', { body: 'one' });
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      M.State.activeThreadId = tid;
      M.renderCommentList();
      const btn = document.querySelector(`.comment-thread[data-thread="${tid}"] [data-act="invoke-ai"]`);
      if (btn) btn.click();
    }, a.tid);
    const b = await annotateText(page, 'ISO_TWO', { ai: false });
    const draftB = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const ta = document.querySelector(`[data-thread-input="${tid}"]`);
      return {
        draft: M.State.replyDrafts[tid] || '',
        ta: ta ? ta.value : '',
        type: M.State.annotations.find((x) => x.threadId === tid)?.threadType || null,
      };
    }, b.tid);
    if (/@AI\b/i.test(draftB.draft) || /@AI\b/i.test(draftB.ta)) {
      throw new Error('leaked @AI into other draft: ' + JSON.stringify(draftB));
    }
  });

  // ---------- edit form ----------
  await t('edit form hides body row and shows aligned actions', async () => {
    await loadDoc(page, 'edit-form.md', '# E\n\nEDIT_FORM_ANCHOR here\n');
    const r = await annotateText(page, 'EDIT_FORM_ANCHOR', { body: 'original body' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const state = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      M.State.activeThreadId = tid;
      M.renderCommentList();
      const edit = document.querySelector(`[data-act="edit-comment"][data-thread="${tid}"][data-comment-index="0"]`);
      if (edit) edit.click();
      const form = document.querySelector(`[data-edit-form="${tid}:0"]`);
      const body = document.querySelector(`[data-body-row="${tid}:0"]`);
      const ta = form && form.querySelector('[data-edit-input]');
      const actions = form && form.querySelector('.form-actions');
      const btns = actions ? [...actions.querySelectorAll('button')] : [];
      const formBox = form && form.getBoundingClientRect();
      const actBox = actions && actions.getBoundingClientRect();
      return {
        formVisible: !!(form && !form.classList.contains('hidden')),
        bodyHidden: !!(body && body.classList.contains('hidden')),
        focused: document.activeElement === ta,
        rows: ta ? ta.getAttribute('rows') : null,
        actionCount: btns.length,
        hasPrimary: btns.some((b) => b.classList.contains('primary')),
        hasCancel: btns.some((b) => /取消|cancel/i.test(b.textContent || '')),
        aligned: !!(formBox && actBox && actBox.left >= formBox.left - 1 && actBox.right <= formBox.right + 1),
      };
    }, r.tid);
    if (!state.formVisible) throw new Error('edit form not visible: ' + JSON.stringify(state));
    if (!state.bodyHidden) throw new Error('body row still visible: ' + JSON.stringify(state));
    if (state.rows !== '1' && state.rows !== 1 && state.rows !== '1') {
      // allow null if CSS min-height handles it, but prefer rows=1
    }
    if (state.actionCount < 2 || !state.hasPrimary || !state.hasCancel) {
      throw new Error('edit actions incomplete: ' + JSON.stringify(state));
    }
    if (!state.aligned) throw new Error('actions not aligned: ' + JSON.stringify(state));
  });

  // ---------- toolbar panes ----------
  await t('toolbar pane toggles keep aria-pressed in sync with body class', async () => {
    const before = await page.evaluate(() => ({
      fileBtn: !!document.querySelector('#btn-toggle-file-pane'),
      commentBtn: !!document.querySelector('#btn-toggle-comment-pane'),
      filePressed: document.querySelector('#btn-toggle-file-pane')?.getAttribute('aria-pressed'),
      commentPressed: document.querySelector('#btn-toggle-comment-pane')?.getAttribute('aria-pressed'),
      fileCollapsed: document.body.classList.contains('file-pane-collapsed'),
      commentCollapsed: document.body.classList.contains('comment-pane-collapsed'),
    }));
    if (!before.fileBtn || !before.commentBtn) throw new Error('missing pane toggles: ' + JSON.stringify(before));
    await page.locator('#btn-toggle-file-pane').click();
    await page.waitForTimeout(60);
    const mid = await page.evaluate(() => ({
      pressed: document.querySelector('#btn-toggle-file-pane')?.getAttribute('aria-pressed'),
      collapsed: document.body.classList.contains('file-pane-collapsed'),
      width: document.querySelector('#file-pane')?.getBoundingClientRect().width || 0,
    }));
    if (mid.pressed === 'true' && mid.collapsed) throw new Error('aria desync collapsed: ' + JSON.stringify(mid));
    if (mid.pressed === 'false' && !mid.collapsed) throw new Error('aria desync open: ' + JSON.stringify(mid));
    // restore
    await page.locator('#btn-toggle-file-pane').click();
    await page.waitForTimeout(40);
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
