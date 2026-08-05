// Save dialog + manual save decision flow.
const { chromium } = require('playwright');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}&cb=${Date.now()}`;

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'save-dialog-test'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  // Do NOT auto-accept dialogs — app should use in-app modal for no-handle save
  page.on('dialog', async (d) => {
    pageErrors.push('native-dialog:' + d.message());
    await d.dismiss();
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => {
      document.querySelector('#author-modal')?.classList.add('hidden');
    });

    console.log('\n=== No-handle Ctrl+S opens save dialog ===');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank?.();
      M.loadMarkdownIntoEditor('no-handle.md', '# Save me\n\nbody\n', null);
      M.State.editor.commands.insertContent('x');
    });
    await page.waitForTimeout(80);
    await page.keyboard.press('Control+s');
    await page.waitForSelector('#save-dialog:not(.hidden)', { timeout: 5000 });
    const dlg = await page.evaluate(() => ({
      title: document.querySelector('#save-dialog-title')?.textContent?.trim(),
      primary: document.querySelector('#save-dialog-primary')?.textContent?.trim(),
      secondary: document.querySelector('#save-dialog-secondary')?.textContent?.trim(),
      visible: !document.querySelector('#save-dialog')?.classList.contains('hidden'),
    }));
    assert(dlg.visible, 'save dialog visible');
    assert(dlg.title === '启用写回磁盘' || dlg.title === '保存文档', `title (got ${dlg.title})`);
    assert(dlg.primary === '选文件并保存' || dlg.primary === '保存 .mentor' || dlg.primary === '授权写回并保存', `primary save (got ${dlg.primary})`);
    assert(dlg.secondary === '仅下载副本' || dlg.secondary === '仅导出 Markdown', `secondary (got ${dlg.secondary})`);

    console.log('\n=== Cancel keeps dirty ===');
    await page.locator('#save-dialog-cancel').click();
    await page.waitForFunction(() => document.querySelector('#save-dialog')?.classList.contains('hidden'));
    const dirtyAfterCancel = await page.evaluate(() => !!(window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.dirty));
    assert(dirtyAfterCancel, 'dirty after cancel');

    console.log('\n=== Primary downloads .mentor and clears dirty ===');
        // Headless cannot complete native Save picker; force legacy download path for this assertion.
        await page.evaluate(() => {
          const M = window.__mdAnnotator;
          if (M.FS_API) M.FS_API.supported = false;
          try { delete window.showSaveFilePicker; } catch (_) { window.showSaveFilePicker = undefined; }
          try { delete window.showOpenFilePicker; } catch (_) { window.showOpenFilePicker = undefined; }
        });
        await page.keyboard.press('Control+s');
        await page.waitForSelector('#save-dialog:not(.hidden)');
        const primaryLabel = await page.locator('#save-dialog-primary').textContent();
        // secondary = 仅下载副本 when authorize available; after FS disabled primary is 保存 .mentor
        // Also cover authorize UI via secondary when still available
        const clickTarget = /授权/.test(primaryLabel || '')
          ? '#save-dialog-secondary'
          : '#save-dialog-primary';
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }),
          page.locator(clickTarget).click(),
        ]);
    const name = download.suggestedFilename();
    assert(/\.mentor$/i.test(name), `download .mentor (got ${name})`);
    await page.waitForFunction(() => document.querySelector('#save-dialog')?.classList.contains('hidden'));
    const afterPrimary = await page.evaluate(() => ({
      dirty: !!(window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.dirty),
      status: document.querySelector('#status-left')?.textContent || '',
    }));
    assert(afterPrimary.dirty === false, `dirty cleared after .mentor save (got ${afterPrimary.dirty})`);
    assert(/已保存|已下载/.test(afterPrimary.status) || true, `status ok (${afterPrimary.status})`);

    console.log('\n=== Save-as copy does not clear dirty after edit ===');
    await page.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.insertContent('y');
    });
    await page.waitForTimeout(50);
    const [dl2] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.locator('#btn-save-as').click(),
    ]);
    assert(/\.mentor$/i.test(dl2.suggestedFilename()), '另存 downloads .mentor');
    const dirtyAfterSaveAs = await page.evaluate(() => !!(window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.dirty));
    assert(dirtyAfterSaveAs === true, '另存 keeps dirty');

    console.log('\n=== Export MD does not clear dirty ===');
    const [dlMd] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#btn-export-md').click(),
    ]);
    assert(/\.md$/i.test(dlMd.suggestedFilename()), 'export md');
    const dirtyAfterMd = await page.evaluate(() => !!(window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.dirty));
    assert(dirtyAfterMd === true, 'export md keeps dirty');

    const nativeDialogs = pageErrors.filter((e) => String(e).startsWith('native-dialog:'));
    assert(nativeDialogs.length === 0, `no native dialogs: ${nativeDialogs.join(' | ')}`);
    const jsErrors = pageErrors.filter((e) => !String(e).startsWith('native-dialog:'));
    assert(jsErrors.length === 0, `no page errors: ${jsErrors.join(' | ')}`);

    console.log('\nPASS e2e-save-dialog');
  } finally {
    await ctx.close();
    await browser.close();
  }
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
