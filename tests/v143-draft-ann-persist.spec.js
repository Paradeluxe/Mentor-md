// v1.43.25: draft annotation survives body edit + undo
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };

  console.log('=== v1.43.25 draft ann persist ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=140&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });

  async function createDraft() {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent('<p>hello world text</p><p>other line</p>', false);
      M.State.annotations = [];
      M.State.replyDrafts = {};
      M.State.history = { past: [], future: [], capacity: 100, lastOp: null };
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText && n.text.includes('world')) {
          const i = n.text.indexOf('world');
          from = pos + i; to = pos + i + 5;
        }
      });
      ed.commands.setTextSelection({ from, to });
      document.querySelector('#float-comment-btn button').click();
    });
    await page.waitForTimeout(100);
  }

  await t('create is pending, no history push', async () => {
    await createDraft();
    const r = await page.evaluate(() => {
      const a = window.__mdAnnotator.State.annotations[0];
      return {
        n: window.__mdAnnotator.State.annotations.length,
        pending: a?.pending,
        past: window.__mdAnnotator.State.history.past.length,
        cards: document.querySelectorAll('.comment-thread').length,
      };
    });
    if (r.n !== 1) throw new Error('ann ' + r.n);
    if (!r.pending) throw new Error('not pending');
    if (r.past !== 0) throw new Error('past should 0, got ' + r.past);
    if (r.cards !== 1) throw new Error('cards ' + r.cards);
  });

  await t('edit other body keeps draft', async () => {
    await page.evaluate(() => {
      const ta = document.querySelector('[data-thread-input]');
      if (ta) {
        ta.value = 'draft text';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const ed = window.__mdAnnotator.State.editor;
      // type in other paragraph
      let p = -1;
      ed.state.doc.descendants((n, pos) => {
        if (n.isText && n.text.includes('other')) p = pos;
      });
      ed.commands.setTextSelection(p + 1);
      ed.commands.insertContent('XXX');
    });
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => ({
      n: window.__mdAnnotator.State.annotations.length,
      pending: window.__mdAnnotator.State.annotations[0]?.pending,
      cards: document.querySelectorAll('.comment-thread').length,
      draft: Object.values(window.__mdAnnotator.State.replyDrafts)[0],
      marks: (() => {
        let c = 0;
        window.__mdAnnotator.State.editor.state.doc.descendants(n => {
          if (n.isText) n.marks.forEach(m => { if (m.type.name === 'annotation') c++; });
        });
        return c;
      })(),
    }));
    if (r.n !== 1 || r.cards !== 1 || r.marks < 1) throw new Error(JSON.stringify(r));
    if (r.draft !== 'draft text') throw new Error('draft lost ' + r.draft);
  });

  await t('Ctrl+Z after body edit does not wipe draft', async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(80);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => ({
      n: window.__mdAnnotator.State.annotations.length,
      cards: document.querySelectorAll('.comment-thread').length,
      pending: window.__mdAnnotator.State.annotations[0]?.pending,
    }));
    if (r.n !== 1 || r.cards !== 1) throw new Error(JSON.stringify(r));
    if (!r.pending) throw new Error('pending cleared');
  });

  await t('undo() API does not wipe pending', async () => {
    await createDraft();
    // inject toxic empty snapshot like old bug
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.history.past.push({ annotations: [], markSnapshot: [], ts: Date.now() });
      M.undo();
    });
    const r = await page.evaluate(() => ({
      n: window.__mdAnnotator.State.annotations.length,
      cards: document.querySelectorAll('.comment-thread').length,
    }));
    if (r.n !== 1 || r.cards !== 1) throw new Error(JSON.stringify(r));
  });

  await t('submit clears pending and pushHistory', async () => {
    await createDraft();
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const tid = M.State.annotations[0].threadId;
      // call addReply via UI submit
      const ta = document.querySelector('[data-thread-input]');
      ta.value = 'confirmed body';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-act="submit-reply"]').click();
    });
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const a = window.__mdAnnotator.State.annotations[0];
      return {
        pending: a?.pending,
        body: a?.comments?.[0]?.body,
        past: window.__mdAnnotator.State.history.past.length,
      };
    });
    if (r.pending) throw new Error('still pending');
    if (r.body !== 'confirmed body') throw new Error('body ' + r.body);
    if (r.past < 1) throw new Error('no history after submit');
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
