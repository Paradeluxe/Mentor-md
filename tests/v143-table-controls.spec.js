// v1.43.23 table row/col controls
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };

  console.log('=== v1.43.23 table controls ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=138&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 10000 });

  await t('insertTable 3x3 + bar visible', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.setContent('<p>x</p>', false);
      ed.commands.setTextSelection(1);
      const ok = ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      M.updateTableControls();
      let rows = 0, cols = 0;
      ed.state.doc.descendants(n => {
        if (n.type.name === 'tableRow') rows++;
      });
      // first row cell count
      ed.state.doc.descendants(n => {
        if (n.type.name === 'table' && !cols) {
          const row = n.firstChild;
          cols = row ? row.childCount : 0;
        }
      });
      const bar = document.querySelector('#table-controls');
      return {
        ok,
        rows,
        cols,
        barVisible: bar && !bar.classList.contains('hidden'),
        inTable: M.isSelectionInTable(ed),
      };
    });
    if (!r.ok) throw new Error('insert failed');
    if (r.rows !== 3) throw new Error('rows ' + r.rows);
    if (r.cols !== 3) throw new Error('cols ' + r.cols);
    if (!r.inTable) throw new Error('not in table');
    if (!r.barVisible) throw new Error('bar hidden');
  });

  await t('addRowAfter increases rows', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const before = (() => { let n = 0; ed.state.doc.descendants(x => { if (x.type.name === 'tableRow') n++; }); return n; })();
      M.runTableCommand('row-after');
      const after = (() => { let n = 0; ed.state.doc.descendants(x => { if (x.type.name === 'tableRow') n++; }); return n; })();
      return { before, after };
    });
    if (r.after !== r.before + 1) throw new Error(JSON.stringify(r));
  });

  await t('addColumnAfter increases cols', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const colCount = () => {
        let c = 0;
        ed.state.doc.descendants(n => {
          if (n.type.name === 'table' && !c) c = n.firstChild.childCount;
        });
        return c;
      };
      const before = colCount();
      M.runTableCommand('col-after');
      return { before, after: colCount() };
    });
    if (r.after !== r.before + 1) throw new Error(JSON.stringify(r));
  });

  await t('toolbar table button exists', async () => {
    const n = await page.evaluate(() => !!document.querySelector('#format-toolbar [data-cmd="table"]'));
    if (!n) throw new Error('no toolbar table btn');
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
