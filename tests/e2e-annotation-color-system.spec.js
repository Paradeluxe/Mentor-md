// Regression coverage for two-mode annotation colors (human | AI) + author layer + legacy review.
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8787/index.html';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contrast(rgbA, rgbB) {
  const parse = (rgb) => (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const luminance = (rgb) => {
    const channels = parse(rgb).map((value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const light = luminance(rgbA);
  const dark = luminance(rgbB);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${URL}?annotation-colors=${Date.now()}`);
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });

    const report = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const authorModal = document.querySelector('#author-modal');
      if (authorModal) authorModal.classList.add('hidden');
      M.setAuthor({ id: 'color-author', name: 'Color Author' });
      M.loadMarkdownIntoEditor(
        `annotation-colors-${Date.now()}.md`,
        '# Color system\n\nAI target text.\n\nHuman target text.\n',
        null
      );

      const selectText = (text) => {
        const editor = M.State.editor;
        let range = null;
        editor.state.doc.descendants((node, pos) => {
          if (!range && node.isText && node.text.includes(text)) {
            const offset = node.text.indexOf(text);
            range = { from: pos + offset, to: pos + offset + text.length };
          }
        });
        if (!range) throw new Error(`Missing text: ${text}`);
        editor.commands.setTextSelection(range);
      };
      const create = (text, marker = null) => {
        selectText(text);
        const thread = M.createAnnotationFromSelection();
        if (!thread) throw new Error(`Unable to create annotation for ${text}`);
        if (marker) {
          const target = M.State.annotations.find((item) => item.threadId === thread.threadId);
          target.comments.push({ id: `seed-${Date.now()}`, author: { id: 'u', name: 'tester' }, body: marker === 'ai' ? '@AI seed instruction' : '@REVIEW seed instruction', createdAt: new Date().toISOString() });
          M.syncAnnotationMarkModeAttrs?.(thread.threadId);
          M.renderCommentList();
        }
        return thread;
      };
      const enableSubmit = (threadId, value) => {
              // Prefer State draft then re-render so button is live-enabled (input-only can race DOM replace).
              M.State.replyDrafts[threadId] = value;
              M.State.expandedThreadIds[threadId] = true;
              M.renderCommentList();
              const input = document.querySelector(`[data-thread-input="${threadId}"]`);
              if (!input) throw new Error(`Missing input for ${threadId}`);
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              const btn = document.querySelector(`[data-act="submit-reply"][data-thread="${threadId}"]`);
              if (btn) btn.disabled = !String(value || '').trim();
            };
      const markColor = (threadId) => document.querySelector(`[data-thread-id="${threadId}"]`)?.getAttribute('data-author-color');
            const style = (selector, property) => {
              const element = document.querySelector(selector);
              return element ? window.getComputedStyle(element)[property] : null;
            };
            const card = (threadId) => document.querySelector(`[data-thread="${threadId}"]`);
            const solidOf = (threadId) => {
              const c = card(threadId);
              if (!c) return null;
              const d = document.createElement('span');
              d.style.background = 'var(--thread-solid)';
              d.style.position = 'absolute';
              d.style.width = '1px';
              d.style.height = '1px';
              c.appendChild(d);
              const bg = window.getComputedStyle(d).backgroundColor;
              d.remove();
              return bg;
            };

      const ai = create('AI target text', 'ai');
      const human = create('Human target text', null);
      try { M.syncAnnotationMarkModeAttrs && M.syncAnnotationMarkModeAttrs(); } catch (_) {}
      M.State.activeThreadId = ai.threadId;
      M.highlightActiveMark();
      M.renderCommentList();
      await wait(80);
      const aiMarkEl = document.querySelector(`.annotation-mark[data-thread-id="${ai.threadId}"]`);
      const humanMarkEl = document.querySelector(`.annotation-mark[data-thread-id="${human.threadId}"]`);
      if (!aiMarkEl || aiMarkEl.getAttribute('data-thread-type') !== 'ai') {
        throw new Error('AI body mark missing data-thread-type=ai: ' + (aiMarkEl && aiMarkEl.outerHTML));
      }
      if (humanMarkEl && humanMarkEl.getAttribute('data-thread-type')) {
        throw new Error('Human mark should not carry mode thread-type');
      }
      const aiMarkBg = window.getComputedStyle(aiMarkEl).backgroundColor;
      const aiCardRail = window.getComputedStyle(card(ai.threadId)).getPropertyValue('--thread-accent').trim();
      // store for later report
      window.__modeColorProbe = { aiMarkBg, aiCardRail, aiLine: aiMarkEl.style.getPropertyValue('--annotation-line') };
      enableSubmit(ai.threadId, '@AI make this clearer');
      enableSubmit(human.threadId, '人工改表述');

      const beforeColor = markColor(ai.threadId);
      const humanAuthorBefore = human.authorColor;
      const open = {
        aiCardType: card(ai.threadId)?.dataset.threadType,
        humanCardType: card(human.threadId)?.dataset.threadType || '',
        aiMarkType: document.querySelector(`.annotation-mark[data-thread-id="${ai.threadId}"]`)?.getAttribute('data-thread-type'),
        humanMarkType: document.querySelector(`.annotation-mark[data-thread-id="${human.threadId}"]`)?.getAttribute('data-thread-type') || '',
        aiIsActive: card(ai.threadId)?.classList.contains('is-active'),
        aiSubmit: solidOf(ai.threadId) || style(`[data-thread="${ai.threadId}"] button.primary`, 'backgroundColor'),
                humanSubmit: solidOf(human.threadId) || style(`[data-thread="${human.threadId}"] button.primary`, 'backgroundColor'),
        floatAi: style(`[data-thread="${ai.threadId}"] button.primary`, 'backgroundColor'),
                floatHuman: style('#float-comment-btn .float-comment-act', 'backgroundColor'),
        floatReviewMissing: !document.querySelector('#float-comment-btn .float-review-btn'),
        bubbleVisible: Array.from(document.querySelectorAll('.annotation-bubble')).some((bubble) => bubble.getBoundingClientRect().width > 0),
        bubbleColor: style(`[data-annotation-thread-id="${ai.threadId}"]`, 'backgroundColor'),
        avatarColor: style(`[data-thread="${ai.threadId}"] .comment-avatar`, 'backgroundColor'),
        avatarSlot: card(ai.threadId)?.querySelector('.comment-avatar')?.dataset.authorColor,
        actionText: style('#settings-btn', 'color'),
        panel: style('#comment-pane', 'backgroundColor'),
      };

      // Explicit marker conversion must not change author color or draft content.
      const authorBeforeSwitch = human.authorColor;
      M.addReply(human.threadId, '@AI after switch instruction');
      await wait(40);
      const afterToAi = {
        type: card(human.threadId)?.dataset.threadType,
        author: human.authorColor,
        submit: solidOf(human.threadId),
      };
      M.editComment(human.threadId, 0, 'back to human');
      await wait(40);
      const afterToHuman = {
        type: card(human.threadId)?.dataset.threadType || '',
        author: human.authorColor,
        submit: solidOf(human.threadId),
      };

            // legacy review display still paints review solid (no float)
            const legacy = M.createTestAnnotation('Human target text');
            legacy.comments[0].body = '@REVIEW legacy check';
            try { M.syncAnnotationMarkModeAttrs && M.syncAnnotationMarkModeAttrs(legacy.threadId); } catch (_) {}
            M.renderCommentList();
            await wait(40);
            enableSubmit(legacy.threadId, '@REVIEW legacy check');
            const legacyOpen = {
              type: card(legacy.threadId)?.dataset.threadType,
              isReview: card(legacy.threadId)?.classList.contains('is-review'),
              submit: solidOf(legacy.threadId),
            };

      const light = {
        theme: M.getTheme(),
        body: style('body', 'backgroundColor'),
        panel: style('#comment-pane', 'backgroundColor'),
        text: style('body', 'color'),
        action: getComputedStyle(document.documentElement).getPropertyValue('--action-primary').trim(),
      };
      M.setTheme('dark');
      await wait(50);
      const dark = {
        theme: M.getTheme(),
        body: style('body', 'backgroundColor'),
        panel: style('#comment-pane', 'backgroundColor'),
        text: style('body', 'color'),
        markVisible: style(`[data-thread-id="${ai.threadId}"]`, 'backgroundColor'),
      };
      M.setTheme('light');

      M._testToggleResolved(ai.threadId);
      M.State.expandedThreadIds[ai.threadId] = true;
      M.renderCommentList();
      await wait(50);
      enableSubmit(ai.threadId, '@AI make this clearer');
      const resolved = {
        markColor: markColor(ai.threadId),
        resolveColor: style(`[data-thread="${ai.threadId}"] .comment-resolve-btn`, 'color'),
        submitColor: style(`[data-thread="${ai.threadId}"] button.primary`, 'backgroundColor'),
        cardResolved: card(ai.threadId)?.classList.contains('is-resolved'),
      };

      M._testToggleResolved(ai.threadId);
      M.State.activeThreadId = ai.threadId;
      M.highlightActiveMark();
      M.renderCommentList();
      await wait(50);
      enableSubmit(ai.threadId, '@AI make this clearer');
      const reopened = {
        markColor: markColor(ai.threadId),
        submitColor: style(`[data-thread="${ai.threadId}"] button.primary`, 'backgroundColor'),
        cardResolved: card(ai.threadId)?.classList.contains('is-resolved'),
      };

      M.loadMarkdownIntoEditor(`annotation-image-${Date.now()}.md`, '# Image annotation\n', null);
      const editor = M.State.editor;
      editor.commands.setContent(
        '<p>Image annotation target.</p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">',
        false
      );
      let imagePosition = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') imagePosition = pos;
      });
      if (imagePosition < 0) throw new Error('Missing image node');
      editor.commands.setNodeSelection(imagePosition);
      const imageThread = M.createAnnotationFromSelection();
      M.applyThreadType(imageThread.threadId, 'ai');
      if (!imageThread) throw new Error('Unable to create image annotation');
      await wait(80);
      const image = document.querySelector('#editor img.annotation-image');
      const imageOpen = {
        active: !!image?.classList.contains('is-active'),
        type: image?.getAttribute('data-thread-type'),
        outline: image ? window.getComputedStyle(image).outlineStyle : null,
      };
      M._testToggleResolved(imageThread.threadId);
      await wait(220);
      const imageResolved = {
        active: !!image?.classList.contains('is-active'),
        resolved: !!image?.classList.contains('is-resolved'),
        borderColor: image ? window.getComputedStyle(image).borderBottomColor : null,
      };

      document.querySelector('[data-filter-tab="resolved"]')?.click();
      await wait(20);
      const filter = Array.from(document.querySelectorAll('.filter-tab')).map((tab) => ({
        type: tab.dataset.filterTab,
        selected: tab.getAttribute('aria-selected'),
      }));

      return {
        beforeColor,
        humanAuthorBefore,
        open,
        afterToAi,
        afterToHuman,
        authorBeforeSwitch,
        legacyOpen,
        light,
        dark,
        resolved,
        reopened,
        imageOpen,
        imageResolved,
        filter,
      };
    });

    assert(report.beforeColor !== null, `Missing author color: ${JSON.stringify(report)}`);
    assert(report.open.aiCardType === 'ai', `AI card type wrong: ${JSON.stringify(report.open)}`);

    assert(report.open.aiMarkType === 'ai', 'AI body mark carries data-thread-type=ai');
    assert(!report.open.humanMarkType, 'human body mark has no mode type');    assert(!report.open.humanCardType || report.open.humanCardType === '', `Human card type wrong: ${JSON.stringify(report.open)}`);
    assert(report.open.aiIsActive, `AI card should be active: ${JSON.stringify(report.open)}`);
    assert(report.open.floatReviewMissing, `float-review-btn still present: ${JSON.stringify(report.open)}`);
    assert(report.open.aiSubmit === report.open.floatAi, `AI button/card color diverged: ${JSON.stringify(report.open)}`);
        assert(report.open.humanSubmit === report.open.floatHuman, `Human button/card color diverged: ${JSON.stringify(report.open)}`);
        assert(report.open.humanSubmit !== report.open.aiSubmit, `Human and AI solids must differ: ${JSON.stringify(report.open)}`);
        assert(report.open.bubbleVisible, `Annotation bubble is not visible: ${JSON.stringify(report.open)}`);
        assert(report.open.avatarSlot === report.beforeColor, `Avatar and mark author slots diverged: ${JSON.stringify(report.open)}`);
        // AI: bubble follows mode (cyan); avatar stays author — must NOT force equality
        assert(report.open.bubbleColor === report.open.floatAi || report.open.bubbleColor === report.open.aiSubmit,
          `AI bubble should match mode solid, not author: ${JSON.stringify(report.open)}`);
        assert(report.open.avatarColor !== report.open.bubbleColor,
          `AI avatar (author) should differ from bubble (mode): ${JSON.stringify(report.open)}`);

    assert(report.afterToAi.type === 'ai', `Switch to AI failed: ${JSON.stringify(report.afterToAi)}`);
    assert(report.afterToAi.author === report.authorBeforeSwitch, `Type switch changed authorColor: ${JSON.stringify(report)}`);
    assert(report.afterToAi.submit === report.open.floatAi, `After AI switch submit not AI solid: ${JSON.stringify(report)}`);
    assert((!report.afterToHuman.type || report.afterToHuman.type === '') && report.afterToHuman.author === report.authorBeforeSwitch, `Switch back human failed: ${JSON.stringify(report.afterToHuman)}`);
    assert(report.afterToHuman.submit === report.open.floatHuman, `After human switch submit not human solid: ${JSON.stringify(report)}`);

    assert(report.legacyOpen.type === 'review' && report.legacyOpen.isReview, `Legacy review display broken: ${JSON.stringify(report.legacyOpen)}`);
    assert(report.legacyOpen.submit && report.legacyOpen.submit !== report.open.floatAi, `Legacy review should not use AI solid: ${JSON.stringify(report.legacyOpen)}`);

    assert(report.light.theme === 'light' && report.dark.theme === 'dark', `Theme preference did not switch: ${JSON.stringify({ light: report.light, dark: report.dark })}`);
    assert(report.light.body !== report.dark.body && report.light.panel !== report.dark.panel, `Theme surfaces did not switch: ${JSON.stringify({ light: report.light, dark: report.dark })}`);
    assert(contrast(report.light.text, report.light.body) >= 4.5, `Light text contrast is too low: ${JSON.stringify(report.light)}`);
    assert(contrast(report.dark.text, report.dark.body) >= 4.5, `Dark text contrast is too low: ${JSON.stringify(report.dark)}`);
    assert(report.dark.markVisible && report.dark.markVisible !== 'rgba(0, 0, 0, 0)', `Dark annotation mark is not visible: ${JSON.stringify(report.dark)}`);
    assert(report.resolved.cardResolved, `Resolved card missing state: ${JSON.stringify(report.resolved)}`);
    assert(report.resolved.markColor === report.beforeColor, `Resolve changed author color: ${JSON.stringify(report)}`);
    assert(report.resolved.resolveColor === 'rgb(24, 115, 87)', `Resolved control is not green: ${JSON.stringify(report.resolved)}`);
    assert(report.resolved.submitColor === 'rgb(24, 115, 87)', `Resolved submit is not green: ${JSON.stringify(report.resolved)}`);
    assert(!report.reopened.cardResolved, `Reopened card kept resolved state: ${JSON.stringify(report.reopened)}`);
    assert(report.reopened.markColor === report.beforeColor, `Reopen changed author color: ${JSON.stringify(report)}`);
    assert(report.reopened.submitColor === report.open.floatAi, `Reopen did not restore AI color: ${JSON.stringify(report)}`);
    assert(report.imageOpen.active && report.imageOpen.type === 'ai' && report.imageOpen.outline === 'solid', `Image active state missing: ${JSON.stringify(report.imageOpen)}`);
    assert(report.imageResolved.active && report.imageResolved.resolved && report.imageResolved.borderColor === 'rgb(24, 115, 87)', `Image resolved state wrong: ${JSON.stringify(report.imageResolved)}`);
    assert(report.filter.find((tab) => tab.type === 'resolved')?.selected === 'true', `Filter ARIA state wrong: ${JSON.stringify(report.filter)}`);
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
    console.log('Annotation color system passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
