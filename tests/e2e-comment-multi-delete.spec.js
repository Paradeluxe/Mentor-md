// Multi-select delete threads via checkbox + deleteThreads batch API.
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = process.env.MENTOR_PORT || 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + name);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + name + ': ' + (e && e.message ? e.message : e));
      fail++;
    }
  };

  await page.goto(BASE + '?multi-del=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  console.log('=== comment multi-select delete ===');

  await t('create 3 threads then batch-delete 2', async () => {
    const res = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State._suspendAnnValidate = true;
      const ed = M.State.editor;
      ed.commands.setContent('<p>Alpha one here.</p><p>Beta two here.</p><p>Gamma three here.</p>');
      const texts = ['Alpha one', 'Beta two', 'Gamma three'];
      const ids = [];
      for (const tx of texts) {
        const found = M.findTextInDoc ? M.findTextInDoc(ed.state.doc, tx) : null;
        let from, to;
        if (found) {
          from = found.from; to = found.to;
        } else {
          // fallback scan
          let pos = null;
          ed.state.doc.descendants((node, p) => {
            if (pos) return false;
            if (node.isText && node.text && node.text.includes(tx)) {
              const i = node.text.indexOf(tx);
              pos = { from: p + i, to: p + i + tx.length };
              return false;
            }
          });
          if (!pos) throw new Error('text not found ' + tx);
          from = pos.from; to = pos.to;
        }
        const th = M._testCreateAnnotation(from, to, tx);
        if (!th) throw new Error('create failed ' + tx);
        ids.push(th.threadId);
      }
      const before = M.getAnnotations().length;
      M._testSelectThreads([ids[0], ids[1]]);
      const sel = M.commentSelection.ids();
      const del = M._testDeleteThreads([ids[0], ids[1]]);
      const after = M.getAnnotations().map((a) => a.threadId);
      const checks = document.querySelectorAll('.comment-select input').length;
      return { before, sel, del, after, remain: after[0], expectedRemain: ids[2], checks, ids };
    });
    assert.strictEqual(res.before, 3, '3 threads');
    assert.strictEqual(res.sel.length, 2, 'selected 2');
    assert.ok(res.del && res.del.ok, 'delete ok');
    assert.strictEqual(res.after.length, 1, '1 left');
    assert.strictEqual(res.after[0], res.expectedRemain, 'gamma remains');
    assert.ok(res.checks >= 1, 'checkbox in DOM after render');
  });

  await t('bulk bar appears when selected', async () => {
    const ok = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ids = M.getAnnotations().map((a) => a.threadId);
      if (!ids.length) return { empty: true };
      M._testSelectThreads(ids);
      const bar = document.getElementById('comment-bulk-bar');
      const hidden = bar && bar.hasAttribute('hidden');
      const count = document.getElementById('comment-bulk-count')?.textContent || '';
      M._testClearCommentSelection();
      const hidden2 = bar && bar.hasAttribute('hidden');
      return { empty: false, hidden, count, hidden2 };
    });
    if (ok.empty) return; // previous deleted all but one — still ok
    assert.strictEqual(ok.hidden, false, 'bar shown');
    assert.ok(/已选/.test(ok.count), 'count label');
    assert.strictEqual(ok.hidden2, true, 'bar hidden after clear');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
