// v1.43.52 multi-file open/save lifecycle
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

  console.log('=== v1.43.52 open/save lifecycle ===');
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('lifecycle APIs exported', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        act: typeof M.activateOpenedDocument,
        rem: typeof M.rememberOpenedFile,
        multi: typeof M.openMultipleHandles,
        prep: typeof M.prepareOpenDocument,
      };
    });
    if (r.act !== 'function' || r.rem !== 'function' || r.multi !== 'function' || r.prep !== 'function') {
      throw new Error(JSON.stringify(r));
    }
  });

  await t('handle is snapshotted before tab switch', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const fakeHandle = { name: 'a.mentor', __fake: true };
      M.loadMarkdownIntoEditor('a.mentor', '# A\n\nUNIQUE_A\n', null, {
        handle: fakeHandle,
        saveMode: 'mentor-handle',
      });
      const tabA = M.State.tabs.find((x) => x.name === 'a.mentor');
      M.loadMarkdownIntoEditor('b.mentor', '# B\n\nUNIQUE_B\n', null, {
        saveMode: 'mentor-download',
      });
      const a = M.State.tabs.find((x) => x.name === 'a.mentor');
      M.switchToTab(a.id);
      return {
        snapHandle: !!(tabA && tabA.handle && tabA.handle.__fake),
        afterHandle: !!(M.State.currentFile && M.State.currentFile.handle && M.State.currentFile.handle.__fake),
        mode: M.State.saveMode,
        body: M.State.editor.state.doc.textContent,
        tabCount: M.State.tabs.length,
      };
    });
    if (!r.snapHandle) throw new Error('handle missing on first snapshot');
    if (!r.afterHandle) throw new Error('handle lost after switch');
    if (r.mode !== 'mentor-handle') throw new Error('mode ' + r.mode);
    if (!r.body.includes('UNIQUE_A')) throw new Error('body ' + r.body);
    if (r.tabCount < 2) throw new Error('tabs ' + r.tabCount);
  });

  await t('reopen same name reuses one tab', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('a.mentor', '# A2\n\nUNIQUE_A2\n', null, {
        saveMode: 'mentor-download',
      });
      return {
        count: M.State.tabs.filter((x) => x.name === 'a.mentor').length,
        body: M.State.editor.state.doc.textContent,
        names: M.State.tabs.map((x) => x.name),
      };
    });
    if (r.count !== 1) throw new Error('duplicate tabs: ' + JSON.stringify(r));
    if (!r.body.includes('UNIQUE_A2')) throw new Error('not reloaded');
  });

  await t('prepareOpenDocument modes', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const same = M.prepareOpenDocument('a.mentor');
      M.openNewTabBlank();
      const blank = M.prepareOpenDocument('fresh-c.mentor');
      return { same: same.mode, blank: blank.mode };
    });
    if (r.same !== 'reload-same') throw new Error('expected reload-same got ' + r.same);
    // blank seed may be reuse-blank or new-tab depending on dirty/seed detection
    if (!['reuse-blank', 'new-tab', 'reuse-tab'].includes(r.blank)) {
      throw new Error('unexpected blank mode ' + r.blank);
    }
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  console.log('errs', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
