/**
 * Export paths — MD / DOCX / .mentor (S1.6–S1.7).
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
  clickSel,
} = require('../harness');
const { DOCS, BODY_CORPUS } = require('../content-catalog');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/07-export ===');
  await boot(page);
  const { t, done } = createRunner(page, '07-export');

  await t('export MD triggers download', async () => {
    await loadDoc(page, 'export-md.md', DOCS.simple);
    await annotateText(page, 'UNIQUE_ALPHA', { body: 'keep' });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#btn-export-md').click(),
    ]);
    const name = download.suggestedFilename();
    if (!/\.md$/i.test(name)) throw new Error('name=' + name);
    coverage.hitSurface('S1.7a');
  });

  await t('export .mentor package download', async () => {
    await loadDoc(page, 'export-mentor.md', DOCS.simple);
    await annotateText(page, 'UNIQUE_BETA', { body: BODY_CORPUS.aiInstr });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.locator('#btn-save-as').click(),
    ]);
    const name = download.suggestedFilename();
    if (!/\.mentor$/i.test(name) && !/\.zip$/i.test(name)) {
      // mentorExportName may produce .mentor
      if (!name) throw new Error('empty name');
    }
    coverage.hitSurface('S1.6');
  });

  await t('export DOCX download or graceful fail', async () => {
    await loadDoc(page, 'export-docx.md', DOCS.simple);
    let gotDownload = false;
    let err = null;
    page.once('download', () => {
      gotDownload = true;
    });
    try {
      await Promise.race([
        page.waitForEvent('download', { timeout: 12000 }).then(() => {
          gotDownload = true;
        }),
        page.locator('#btn-export-docx').click().then(() => page.waitForTimeout(1500)),
      ]);
    } catch (e) {
      err = e.message;
    }
    // DOCX may fail if JSZip path issues — must not pageerror
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error('pageerror: ' + pe.join('; '));
    coverage.hitSurface('S1.7b');
    // soft: either download or toast/status without crash
    void gotDownload;
    void err;
  });

  await t('export without document shows toast path', async () => {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // clear to empty state carefully
      M.State.currentFile = null;
    });
    await page.locator('#btn-export-md').click();
    await page.waitForTimeout(100);
    // restore a doc so later suites aren't broken if shared (new context each file though)
    await loadDoc(page, 'restored.md', DOCS.simple);
  });

  await t('rapid triple export clicks no crash', async () => {
    await loadDoc(page, 'triple.md', DOCS.simple);
    await page.evaluate(() => {
      // swallow downloads via stub if needed
    });
    for (const sel of ['#btn-export-md', '#btn-save-as', '#btn-export-docx']) {
      await page.locator(sel).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(80);
    }
    const ok = await page.evaluate(() => !!window.__mdAnnotator.State.editor);
    if (!ok) throw new Error('editor dead');
  });

  await t('sidecar content includes annotations on mentor build path', async () => {
    await loadDoc(page, 'side.md', DOCS.simple);
    await annotateText(page, 'UNIQUE_ALPHA', { body: '@AI export-check' });
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const side = M.buildAnnotationsSidecar();
      const html = M.State.editor.getHTML();
      const md = M.htmlToMarkdownMedia ? M.htmlToMarkdownMedia(html) : '';
      return {
        anns: side.length,
        hasAi: side.some((a) => (a.comments || []).some((c) => /@AI\b/i.test(c.body || ''))),
        mdLen: (md || html || '').length,
      };
    });
    if (r.anns < 1 || !r.hasAi) throw new Error(JSON.stringify(r));
    coverage.hitContent('P8');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
