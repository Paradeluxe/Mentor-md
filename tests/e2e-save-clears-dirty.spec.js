/**
 * Save must clear dirty after successful .mentor download.
 * Regression: setEditable / live-sync onUpdate marked dirty mid-save → dirtyGen drift → markClean skipped
 * (toast「已保存」但脏点仍在，像保存失败).
 *
 * Run: node tests/e2e-save-clears-dirty.spec.js
 * Requires Mentor on http://127.0.0.1:8787/
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http');

const PORT = 8787;

function ensureServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/index.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('  ✓', msg);
}

(async () => {
  if (!(await ensureServer())) {
    console.error('Mentor not on 8787');
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'save-dirty-test'); } catch (_) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/index.html?savedirty=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => !!window.__mdAnnotator?.State?.editor, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  console.log('\n=== A synthetic no-handle save clears dirty ===');
  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
    M.loadMarkdownIntoEditor('save-dirty.md', '# Hello\n\nbody text for save dirty test\n', null);
    M.State.editor.commands.insertContent(' edit');
  });
  await page.waitForTimeout(80);
  {
    const before = await page.evaluate(() => ({
      dirty: !!window.__mdAnnotator.State.currentFile.dirty,
      gen: window.__mdAnnotator.State.currentFile.dirtyGen,
    }));
    assert(before.dirty === true, `dirty before save (gen=${before.gen})`);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      (async () => {
        await page.locator('#btn-save').click();
        await page.waitForSelector('#save-dialog:not(.hidden)', { timeout: 5000 });
        await page.locator('#save-dialog-primary').click();
      })(),
    ]);
    assert(/\.mentor$/i.test(download.suggestedFilename()), `download ${download.suggestedFilename()}`);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({
      dirty: !!window.__mdAnnotator.State.currentFile.dirty,
      gen: window.__mdAnnotator.State.currentFile.dirtyGen,
      indicator: document.querySelector('#dirty-indicator')?.classList.contains('is-dirty'),
      toast: document.querySelector('#toast')?.textContent || '',
      tabDirty: !!(window.__mdAnnotator.State.tabs.find((t) => t.id === window.__mdAnnotator.State.activeTabId)?.dirty),
    }));
    assert(after.dirty === false, `dirty cleared (got dirty=${after.dirty} gen=${after.gen} toast=${after.toast})`);
    assert(after.indicator === false, 'dirty indicator off');
    assert(after.tabDirty === false, 'tab dirty cleared');
  }

  console.log('\n=== B setEditable alone must not markDirty ===');
  {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // force clean snapshot
      M.State.currentFile.dirty = false;
      M.State.currentFile.dirtyGen = 10;
      document.querySelector('#dirty-indicator')?.classList.remove('is-dirty');
      const gen0 = M.State.currentFile.dirtyGen;
      M.State.editor.setEditable(true);
      M.State.editor.setEditable(false);
      M.State.editor.setEditable(true);
      return {
        gen0,
        gen1: M.State.currentFile.dirtyGen,
        dirty: M.State.currentFile.dirty,
      };
    });
    assert(r.gen1 === r.gen0, `setEditable no dirtyGen bump (${r.gen0}→${r.gen1})`);
    assert(r.dirty === false, 'setEditable no dirty flag');
  }

  console.log('\n=== C media-heavy synthetic package + live-sync settle + save clears dirty ===');
  {
    // Build a modest .mentor with one media entry via app APIs (no real paper paths).
    const built = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      const png1x1 = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ), (c) => c.charCodeAt(0));
      const mediaFiles = { 'media/fig.png': new Blob([png1x1], { type: 'image/png' }) };
      const md = '# Pack\n\n![fig](media/fig.png)\n\nbody line\n';
      const blob = await M.buildMentorZipBlob(md, { version: '1', annotations: [] }, mediaFiles);
      const buf = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    });
    await page.evaluate(async (arr) => {
      const M = window.__mdAnnotator;
      const u8 = new Uint8Array(arr);
      await M.openFromMentorFile(new File([u8], 'media-pack.mentor', { type: 'application/zip' }), { quiet: true });
      M.State.editor.commands.insertContent(' SAVE');
    }, built);
    // Allow live-sync elect / setLiveRole race window that previously dirtied mid-save
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => !!window.__mdAnnotator.State.currentFile.dirty);
    assert(before === true, 'dirty before media-pack save');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      (async () => {
        await page.locator('#btn-save').click();
        await page.waitForSelector('#save-dialog:not(.hidden)', { timeout: 5000 });
        await page.locator('#save-dialog-primary').click();
      })(),
    ]);
    assert(/media-pack\.mentor$/i.test(dl.suggestedFilename()), `name ${dl.suggestedFilename()}`);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      dirty: !!window.__mdAnnotator.State.currentFile.dirty,
      indicator: document.querySelector('#dirty-indicator')?.classList.contains('is-dirty'),
      toast: document.querySelector('#toast')?.textContent || '',
    }));
    assert(after.dirty === false, `media-pack dirty cleared (toast=${after.toast})`);
    assert(after.indicator === false, 'media-pack indicator off');
  }

  console.log('\n=== D anchor-audit dialog opens on no-handle ===');
  {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
      M.loadMarkdownIntoEditor('bad.md', '# T\n\nhello world\n', { version: '1', annotations: [] });
      M.State.annotations = [{
        threadId: 't-bad',
        text: 'NOT_THERE_XXXX',
        prefix: '',
        suffix: '',
        range: { from: 1, to: 4 },
        resolved: false,
        comments: [{ id: 'c1', author: 'a', body: 'x', createdAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      }];
      const p = M.runManualSave();
      await new Promise((r2) => setTimeout(r2, 300));
      const visible = !document.querySelector('#save-dialog')?.classList.contains('hidden');
      const title = document.querySelector('#save-dialog-title')?.textContent || '';
      if (visible) document.querySelector('#save-dialog-cancel')?.click();
      const result = await Promise.race([p, new Promise((r2) => setTimeout(() => r2({ timeout: true }), 3000))]);
      return { visible, title, result };
    });
    assert(r.visible === true, `audit dialog visible title=${r.title}`);
    assert(/批注/.test(r.title), `audit title ${r.title}`);
  }

  assert(pageErrors.length === 0, `no page errors ${pageErrors.join(' | ')}`);
  console.log('\nPASS e2e-save-clears-dirty');
  await browser.close();
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
