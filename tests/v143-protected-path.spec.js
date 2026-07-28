// v1.45.6: protected-path guard removed — research .mentor saves like any other file.
// Keep display downsample smoke from the old suite.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };
  await page.goto('http://127.0.0.1:8787/index.html?v=456&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => { const m = document.querySelector('#author-modal'); if (m) m.classList.add('hidden'); });

  await t('protect APIs removed', async () => {
    const r = await page.evaluate(() => ({
      isProt: typeof window.__mdAnnotator.isProtectedMentorTarget,
      confirm: typeof window.__mdAnnotator.confirmProtectedWrite,
      unlocked: window.__mdAnnotator.State.protectedWriteUnlocked,
      base: typeof window.__mdAnnotator.mentorBaseName,
    }));
    if (r.isProt !== 'undefined') throw new Error('isProtected still ' + r.isProt);
    if (r.confirm !== 'undefined') throw new Error('confirm still ' + r.confirm);
    if (r.unlocked !== undefined) throw new Error('unlocked still present');
    if (r.base !== 'function') throw new Error('mentorBaseName missing');
  });

  await t('autosave may write research-named mentor with granted handle', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let writes = 0;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>research draft body</p>');
      M.State.currentFile = {
        name: 'research-paper.mentor',
        dirty: true,
        dirtyGen: 1,
        handle: {
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          getFile: async () => ({ lastModified: Date.now() - 1000, name: 'research-paper.mentor' }),
          createWritable: async () => {
            writes++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      M.State.saveMode = 'mentor-handle';
      M.State.diskPathHint = 'E:/tmp/research/research-paper.mentor';
      M.State.fileMtime = Date.now() - 2000;
      M.State.mediaFiles = {};
      // Prefer full write path; if snapshot fails, still must not refuse as protected
      const res = await M.writeCurrentToHandle({ reason: 'autosave', showProgress: false });
      return {
        writes,
        res,
        err: res && res.error,
        conflict: res && res.conflict,
      };
    });
    if (r.conflict && r.conflict.kind === 'protected') throw new Error('still protected conflict');
    if (r.err === 'protected') throw new Error('still protected error');
    // write may fail for other reasons (snapshot); but must attempt or not skip-as-protected
    if (r.res && r.res.skipped && r.err === 'protected') throw new Error('skipped protected');
  });

  await t('createDisplayObjectURL still works', async () => {
    const ok = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1800; c.height = 900;
      c.getContext('2d').fillRect(0,0,1800,900);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const url = await window.__mdAnnotator.createDisplayObjectURL(blob, 'media/x.png');
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      URL.revokeObjectURL(url);
      return img.naturalWidth <= 1600;
    });
    if (!ok) throw new Error('downsample fail');
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
