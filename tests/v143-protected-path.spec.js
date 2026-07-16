// v1.43.38 protected path + image insert smoke
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name + ':', e.message); fail++; }
  };
  await page.goto('http://127.0.0.1:8787/index.html?v=38&cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => { const m = document.querySelector('#author-modal'); if (m) m.classList.add('hidden'); });

  await t('API exposed', async () => {
    const ok = await page.evaluate(() => typeof window.__mdAnnotator.isProtectedMentorTarget === 'function'
      && typeof window.__mdAnnotator.confirmProtectedWrite === 'function');
    if (!ok) throw new Error('missing API');
  });

  await t('protect by basename', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.isProtectedMentorTarget('DFC_Liu_Jul11_2026.mentor', ''));
    if (!r) throw new Error('should protect');
  });

  await t('protect by path hint', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.isProtectedMentorTarget('other.mentor', 'E:/x/dfc-paper/other.mentor'));
    if (!r) throw new Error('path should protect');
  });

  await t('normal file not protected', async () => {
    const r = await page.evaluate(() => window.__mdAnnotator.isProtectedMentorTarget('notes.mentor', 'C:/tmp/notes.mentor'));
    if (r) throw new Error('should not protect');
  });

  await t('autosave skips protected dirty handle mode', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.currentFile = {
        name: 'DFC_Liu_Jul11_2026.mentor',
        dirty: true,
        handle: { createWritable: async () => { throw new Error('should not write'); } },
      };
      M.State.saveMode = 'mentor-handle';
      M.State.diskPathHint = 'E:/hermes_playground/paper-writing/projects/dfc-paper/DFC_Liu_Jul11_2026.mentor';
      M.State.protectedWriteUnlocked = {};
      await M.autosaveNow();
      return { ok: true };
    });
    if (!r.ok) throw new Error('autosave threw');
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

  console.log('\\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
