// Two-mode float: 批注 | AI (+ legacy REVIEW load/switch)
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      fail++;
    }
  };

  console.log('=== Two-mode float: 批注 / AI ===');
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('float bar has one 批注 button and no AI entry', async () => {
    const r = await page.evaluate(() => {
      const bar = document.querySelector('#float-comment-btn');
      const btns = bar ? Array.from(bar.querySelectorAll('button[data-float-act]')) : [];
      const c = bar && bar.querySelector('[data-float-act="comment"]');
      const a = bar && bar.querySelector('[data-float-act="ai"]');
      const review = bar && bar.querySelector('[data-float-act="review"]');
      return {
        bar: !!bar,
        count: btns.length,
        c: !!c,
        a: !!a,
        review: !!review,
        humanLabel: c ? (c.textContent || '').trim() === '批注' : false,
      };
    });
    if (!r.bar || r.count !== 1 || !r.c || r.a || r.review || !r.humanLabel) {
      throw new Error(JSON.stringify(r));
    }
  });

  await t('@AI marker activates AI mode without default draft', async () => {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        M.loadMarkdownIntoEditor(
          'ai-btn-test.md',
          '# Title\n\nHello world unique phrase for AI button.\n',
          null
        );
        const doc = M.State.editor.state.doc;
        let from = -1, to = -1;
        doc.descendants((node, pos) => {
          if (node.isText && node.text.includes('unique phrase')) {
            const i = node.text.indexOf('unique phrase');
            from = pos + i;
            to = from + 'unique phrase'.length;
          }
        });
        if (from < 0) return { err: 'range not found' };
        M.State.editor.commands.setTextSelection({ from, to });
        M.createAnnotationFromSelection();
        const tid = M.State.activeThreadId;
        const draft = M.State.replyDrafts[tid] || '';
        const ta = document.querySelector(`[data-thread-input="${tid}"]`);
        const thread = M.State.annotations.find((item) => item.threadId === tid);
        const card = document.querySelector(`[data-thread="${tid}"]`);
        return {
          tid: !!tid,
          draft,
          taVal: ta && ta.value,
          threadType: thread && thread.threadType,
          noMarker: !/@AI\b/i.test(draft) && !/@AI\b/i.test((ta && ta.value) || ''),
          isAiCard: !!(card && card.classList.contains('is-ai')),
          ph: ta ? ta.placeholder : '',
        };
      });
      if (r.err) throw new Error(r.err);
      if (!r.noMarker || r.threadType != null || r.isAiCard) throw new Error(JSON.stringify(r));
    });

  await t('create type review is coerced to human (no @REVIEW)', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('review-coerce-test.md', '# Title\n\nReview this unique sentence.\n', null);
      const doc = M.State.editor.state.doc;
      let from = -1, to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text.includes('unique sentence')) {
          const i = node.text.indexOf('unique sentence');
          from = pos + i;
          to = from + 'unique sentence'.length;
        }
      });
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection({ type: 'review' });
      const tid = M.State.activeThreadId;
      const draft = M.State.replyDrafts[tid] || '';
      const thread = M.State.annotations.find((item) => item.threadId === tid);
      return {
        draft,
        threadType: thread && thread.threadType,
        noReview: !/@REVIEW\b/i.test(draft),
        noAi: !/@AI\b/i.test(draft),
        humanType: thread && (thread.threadType == null || thread.threadType === ''),
      };
    });
    if (!r.noReview || !r.noAi || !r.humanType) throw new Error(JSON.stringify(r));
  });

  await t('human comment does not force @AI', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('normal-comment-test.md', '# Title\n\nHello world normal comment.\n', null);
      const doc = M.State.editor.state.doc;
      let from = -1, to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text.includes('Hello world')) {
          from = pos;
          to = pos + Math.min(node.text.length, 5);
        }
      });
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection({ type: null });
      const tid = M.State.activeThreadId;
      const draft = M.State.replyDrafts[tid] || '';
      const thr = M.State.annotations.find((a) => a.threadId === tid);
      return {
        draft,
        noAi: !/@AI\b/i.test(draft),
        noReview: !/@REVIEW\b/i.test(draft),
        threadType: thr && thr.threadType,
      };
    });
    if (!r.noAi || !r.noReview || (r.threadType != null && r.threadType !== '')) {
      throw new Error('unexpected draft ' + JSON.stringify(r));
    }
  });

  await t('modes are marker-only: no in-card switch, no stored thread type', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('type-switch.md', '# T\n\nSwitch type unique anchor text.\nHuman-only phrase here.\n', null);
      // create human
      const doc = M.State.editor.state.doc;
      let from = -1, to = -1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text.includes('unique anchor')) {
          const i = node.text.indexOf('unique anchor');
          from = pos + i;
          to = from + 'unique anchor'.length;
        }
      });
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection({ type: null });
      const tidH = M.State.activeThreadId;
      const thrH = M.State.annotations.find((a) => a.threadId === tidH);
      M.renderCommentList();
      const cardH = document.querySelector(`[data-thread="${tidH}"]`);
      const humanBadge = !!cardH && !!cardH.querySelector('.comment-type-badge.is-human');
      const noHumanBadge = !humanBadge; // default human = no badge (AI/review only)
      const noSwitcherH = !cardH || !cardH.querySelector('.comment-type-switch, [data-act="set-type"]');

      // create AI on second phrase
      let from2 = -1, to2 = -1;
      M.State.editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text.includes('Human-only phrase')) {
          const i = node.text.indexOf('Human-only phrase');
          from2 = pos + i;
          to2 = from2 + 'Human-only phrase'.length;
        }
      });
      M.State.editor.commands.setTextSelection({ from: from2, to: to2 });
      M.createAnnotationFromSelection();
      const tidA = M.State.activeThreadId;
      const thrA = M.State.annotations.find((a) => a.threadId === tidA);
      M.renderCommentList();
      const cardA = document.querySelector(`[data-thread="${tidA}"]`);
      const aiBadge = !!cardA && !!cardA.querySelector('.comment-type-badge.is-ai');
      const noSwitcherA = !cardA || !cardA.querySelector('.comment-type-switch, [data-act="set-type"]');
      const authorBefore = thrH.authorColor;

      // Explicit marker submission promotes threadType to 'ai' and persists.
      M.addReply(tidH, '@AI fix the typo');
      const draftAi = M.State.replyDrafts[tidH] || '';
      const threadTypeAi = thrH.threadType ?? null;
      const stacked = /@REVIEW/i.test(draftAi) && /@AI/i.test(draftAi);
      const draftH = draftAi;
      const threadTypeH = threadTypeAi;
      const authorAfter = thrH.authorColor;

      return {
        aiCreateType: thrA.threadType,
        noHumanBadge,
        aiBadge,
        noSwitcherH,
        noSwitcherA,
        draftAi,
        draftH,
        threadTypeAi,
        threadTypeH,
        hasAi: /^@AI\b/i.test(draftAi),
                noAiOnModeSwitch: !/@AI\b/i.test(draftAi),
                noReviewAi: !/@REVIEW\b/i.test(draftAi),
                stacked,
                humanNoMarkers: !/@AI\b/i.test(draftH) && !/@REVIEW\b/i.test(draftH),
                authorStable: authorBefore === authorAfter,
                aiStillAi: thrA.threadType == null,
              };
            });
            if (!r.noHumanBadge || r.aiBadge || !r.noSwitcherH || !r.noSwitcherA || !r.noAiOnModeSwitch || !r.noReviewAi || r.stacked || r.threadTypeAi !== 'ai' || !r.authorStable) {
              throw new Error(JSON.stringify(r));
            }
          });


  await t('legacy @REVIEW body still loads as review display', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('legacy-review.md', '# L\n\nLegacy review target phrase here.\n', null);
      const ann = M.createTestAnnotation('Legacy review target phrase here.');
      if (!ann) return { err: 'no ann' };
      if (!Array.isArray(ann.comments) || !ann.comments.length) {
        ann.comments = [{
          id: 'legacy-c0',
          author: { id: 'u', name: 'U' },
          body: '@REVIEW please check tone',
          createdAt: new Date().toISOString(),
        }];
      } else {
        ann.comments[0] = { ...(ann.comments[0] || {}), body: '@REVIEW please check tone' };
      }
      ann.threadType = 'review';
      M.renderCommentList();
      const card = document.querySelector(`[data-thread="${ann.threadId}"]`);
      return {
        type: card && card.dataset.threadType,
        badge: !!card && !!card.querySelector('.comment-type-badge.is-review'),
        isReview: !!card && card.classList.contains('is-review'),
        hasAnyTypeSwitch: !!card && !!card.querySelector('.comment-type-switch, [data-act="set-type"]'),
        thrType: ann.threadType,
      };
    });
    if (r.err) throw new Error(r.err);
    if (r.type !== 'review' || !r.badge || !r.isReview || r.hasAnyTypeSwitch) {
      throw new Error(JSON.stringify(r));
    }
  });

  await t('AI author object counts as answered', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('ai-author-object.md', 'AI object anchor.', null);
      const ann = M.createTestAnnotation('AI object anchor.');
      ann.comments.push({
        id: 'ai-object-reply',
        author: { id: 'ai-reviewer', name: 'AI Reviewer' },
        body: '已处理。',
        createdAt: new Date().toISOString(),
      });
      M.renderCommentList();
      return { pending: M.ai.getPending().length, needsReply: M.ai.listThreads()[0]?.needsReply };
    });
    if (result.pending !== 0 || result.needsReply !== false) throw new Error(JSON.stringify(result));
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
