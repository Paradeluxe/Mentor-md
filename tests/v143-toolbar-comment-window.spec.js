// v143-toolbar-comment-window: v1.43.46
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + name);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + name + ': ' + e.message);
      fail++;
    }
  };

  const page = await (await browser.newContext({ viewport: { width: 900, height: 800 } })).newPage();
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now(), {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  console.log('=== v1.43.46 toolbar + comment window ===');

  await t('narrow: more btn visible; strike inside more menu', async () => {
    const r = await page.evaluate(() => {
      const btn = document.getElementById('btn-tb-more');
      const menu = document.getElementById('tb-more-menu');
      const strike = document.querySelector('#tb-more-menu [data-cmd="strike"]');
      const bold = document.querySelector('#format-toolbar > [data-cmd="bold"]');
      const cs = btn ? getComputedStyle(btn) : null;
      return {
        hasBtn: !!btn,
        hasMenu: !!menu,
        strikeInMore: !!strike,
        boldPrimary: !!bold,
        moreDisplay: cs && cs.display,
        w: window.innerWidth,
      };
    });
    if (!r.hasBtn || !r.hasMenu || !r.strikeInMore || !r.boldPrimary) throw new Error(JSON.stringify(r));
    if (r.w >= 1180) throw new Error('viewport not narrow ' + r.w);
    if (r.moreDisplay === 'none') throw new Error('more hidden on narrow ' + JSON.stringify(r));
  });

  await t('narrow: open more menu + strike toggles', async () => {
    await page.click('#btn-tb-more');
    const open = await page.evaluate(() => {
      const menu = document.getElementById('tb-more-menu');
      return menu && !menu.classList.contains('hidden');
    });
    if (!open) throw new Error('menu not open');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>hello world format</p>');
      M.State.editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    await page.click('#tb-more-menu [data-cmd="strike"]');
    const r = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      return { strike: ed.isActive('strike'), html: ed.getHTML() };
    });
    if (!r.strike && !/strike|s>|del>/i.test(r.html)) {
      // tip tap may use s tag
      if (!r.html.includes('<s>') && !r.html.includes('strike')) throw new Error(JSON.stringify(r));
    }
  });

  await t('wide: more btn hidden via CSS; strike still reachable', async () => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => {
      const btn = document.getElementById('btn-tb-more');
      const strike = document.querySelector('#format-toolbar [data-cmd="strike"]');
      return {
        moreDisplay: btn ? getComputedStyle(btn).display : null,
        strike: !!strike,
        w: window.innerWidth,
      };
    });
    if (r.moreDisplay !== 'none') throw new Error('more should hide wide ' + JSON.stringify(r));
    if (!r.strike) throw new Error('strike missing wide');
  });

  await t('comment window: 90 anns → first 60 + more footer', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.commentListShowAll = false;
      M.State.commentListLimit = 60;
      const parts = [];
      for (let i = 0; i < 90; i++) parts.push(`<p>row${i} cw-tok-${i} end</p>`);
      M.State.editor.commands.setContent(parts.join(''));
      M.State.annotations = [];
      for (let i = 0; i < 90; i++) {
        const needle = `cw-tok-${i}`;
        let from = -1, to = -1;
        M.State.editor.state.doc.descendants((n, pos) => {
          if (!n.isText || !n.text) return;
          const j = n.text.indexOf(needle);
          if (j >= 0 && from < 0) {
            from = pos + j;
            to = from + needle.length;
          }
        });
        M._testCreateAnnotation(from, to, needle);
      }
      M.renderCommentList();
      const cards = document.querySelectorAll('#comment-list .comment-thread').length;
      const more = document.querySelector('.comment-list-more-btn');
      const allBtn = [...document.querySelectorAll('.comment-list-more-btn')].map((b) => b.textContent);
      return { cards, hasMore: !!more, allBtn, ann: M.State.annotations.length };
    });
    if (r.ann !== 90) throw new Error('ann ' + r.ann);
    if (r.cards !== 60) throw new Error('cards ' + r.cards);
    if (!r.hasMore) throw new Error('no more btn ' + JSON.stringify(r));
  });

  await t('comment window: show all → 90 cards', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.commentListShowAll = true;
      M.renderCommentList();
      return {
        cards: document.querySelectorAll('#comment-list .comment-thread').length,
        showAll: M.State.commentListShowAll,
      };
    });
    if (r.cards !== 90) throw new Error(JSON.stringify(r));
  });

  await t('meta build mentions 1.43.46', async () => {
    const v = await page.evaluate(() => document.querySelector('meta[name="build"]')?.content || '');
    if (!/1\.43\.4[6-9]|1\.43\.[5-9]/.test(v)) throw new Error(v);
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
