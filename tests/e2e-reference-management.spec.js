// tests/e2e-reference-management.spec.js
// Citation library CRUD: add/edit/delete, single-file import prefill, export, live APIs.
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}&cb=${Date.now()}`;
const TMP = path.join(os.tmpdir(), `mentor-ref-mgmt-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem('Mentor:author', 'ref-mgmt-test'));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => {
      document.querySelector('#author-modal')?.classList.add('hidden');
      window.__mdAnnotator.openNewTabBlank?.();
      window.__mdAnnotator.loadMarkdownIntoEditor(
        'ref-mgmt.md',
        'See [-@old2024, p. 3; @other2024] and [@used2024] again [@used2024].\n',
        null
      );
    });

    console.log('\n=== Controls + modal shell ===');
    await page.locator('#btn-refs').click();
    assert(await page.locator('#refs-pane').isVisible(), '引用栏打开');
    assert(await page.locator('#refs-add-btn').isVisible(), '添加入口可见');
    await page.locator('#refs-more-btn').click();
    assert(await page.locator('#refs-more-menu').isVisible(), '更多菜单打开');
    assert(await page.locator('#refs-import-btn').isVisible(), '导入入口可见');
    assert(await page.locator('#refs-export-btn').isVisible(), '导出入口可见');
    await page.keyboard.press('Escape');
    await page.locator('#refs-add-btn').click();
    assert(await page.locator('#reference-editor-modal').isVisible(), '新增表单打开');
    assert(await page.locator('#reference-key').getAttribute('aria-required') === 'true', 'citekey required');
    await page.keyboard.press('Escape');
    assert(await page.locator('#reference-editor-modal').isHidden(), 'Escape 关闭表单');

    console.log('\n=== Manual add ===');
    await page.locator('#refs-add-btn').click();
    await page.locator('#reference-key').fill('doe2026mentor');
    await page.locator('#reference-authors').fill('Doe, Jane');
    await page.locator('#reference-title').fill('Mentor citations');
    await page.locator('#reference-year').fill('2026');
    await page.locator('#reference-type').fill('article');
    await page.locator('#reference-save').click();
    await page.waitForSelector('.refs-card[data-key="doe2026mentor"]');
    assert(await page.locator('.refs-card[data-key="doe2026mentor"]').count() === 1, '添加后卡片存在');
    assert(await page.evaluate(() => !!(window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.dirty)), '添加后 dirty');
    assert(await page.evaluate(() => window.__mdAnnotator.references.entries.some(e => e.key === 'doe2026mentor')), 'live references getter');

    // invalid blank key
    await page.locator('#refs-add-btn').click();
    await page.locator('#reference-key').fill('');
    await page.locator('#reference-title').fill('x');
    await page.locator('#reference-save').click();
    assert(await page.locator('#reference-editor-modal').isVisible(), '空 citekey 不关表单');
    assert((await page.locator('#reference-form-error').innerText()).includes('citekey'), '显示 citekey 错误');
    await page.locator('#reference-cancel').click();

    // seed more entries via API for rename/delete cases
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.addReferenceEntry({ key: 'old2024', type: 'article', authors: 'Old, A', title: 'Old title', year: '2024' });
      M.addReferenceEntry({ key: 'other2024', type: 'article', authors: 'Other, B', title: 'Other title', year: '2024' });
      M.addReferenceEntry({ key: 'used2024', type: 'article', authors: 'Used, C', title: 'Used title', year: '2024' });
      M.reconcileCitationNodes();
    });

    console.log('\n=== Edit + citekey cascade ===');
    await page.locator('.refs-card[data-key="old2024"] [data-act="edit-reference"]').click();
    await page.locator('#reference-key').fill('new2024');
    await page.locator('#reference-title').fill('Updated title');
    await page.locator('#reference-save').click();
    await page.waitForSelector('.refs-card[data-key="new2024"]');
    const renameResult = await page.evaluate(() => ({
      keys: window.__mdAnnotator.State.references.entries.map(x => x.key).sort(),
      md: window.__mdAnnotator.htmlToMarkdownMedia(window.__mdAnnotator.State.editor.getHTML()),
    }));
    assert(renameResult.keys.includes('new2024') && !renameResult.keys.includes('old2024'), '库 key 已改名');
    assert(renameResult.md.includes('[-@new2024, p. 3; @other2024]'), '正文分组 citekey 同步改名');

    console.log('\n=== Delete used metadata keeps body missing ===');
    // first dialog may be confirm — already auto-accepted
    await page.locator('.refs-card[data-key="used2024"] [data-act="delete-reference"]').click();
    await page.waitForFunction(() => !document.querySelector('.refs-card[data-key="used2024"]'));
    const afterDel = await page.evaluate(() => {
      const missing = [...document.querySelectorAll('.mentor-citation.is-missing')].map(n => n.getAttribute('data-key'));
      const md = window.__mdAnnotator.htmlToMarkdownMedia(window.__mdAnnotator.State.editor.getHTML());
      return { missing, usedCount: (md.match(/@used2024/g) || []).length };
    });
    assert(afterDel.usedCount === 2, '删除元数据后正文仍保留 2 处 @used2024');
    assert(afterDel.missing.filter(k => k === 'used2024').length >= 1, '正文标缺失');

    console.log('\n=== Single-file Zotero-style import prefill (merge, not replace) ===');
    await page.locator('#refs-file-input').setInputFiles({
      name: 'zotero-single.bib',
      mimeType: 'application/x-bibtex',
      buffer: Buffer.from(`@article{smith2025one,
  author = {Smith, Ana},
  title = {One},
  journal = {J},
  year = {2025},
  doi = {10.9/one}
}
`, 'utf8'),
    });
    await page.waitForSelector('#reference-editor-modal:not(.hidden)');
    assert(await page.locator('#reference-key').inputValue() === 'smith2025one', '单条导入预填 citekey');
    await page.locator('#reference-save').click();
    await page.waitForSelector('.refs-card[data-key="smith2025one"]');
    assert(await page.locator('.refs-card[data-key="doe2026mentor"]').count() === 1, '旧条目保留');
    assert(await page.locator('.refs-card[data-key="smith2025one"]').count() === 1, '新条目加入');

    console.log('\n=== Export .bib ===');
    const bib = await page.evaluate(() => window.__mdAnnotator.exportReferencesBib({ download: false }));
    assert(/@article\{doe2026mentor,/.test(bib), 'export 含 doe2026mentor');
    assert(/@article\{smith2025one,/.test(bib), 'export 含 smith2025one');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.locator('#refs-more-btn').click();
        await page.locator('#refs-export-btn').click();
      })(),
    ]);
    const dlName = download.suggestedFilename();
    assert(/\.references\.bib$/i.test(dlName), `下载文件名 .references.bib (got ${dlName})`);
    const dlPath = path.join(TMP, dlName);
    await download.saveAs(dlPath);
    assert(fs.existsSync(dlPath) && fs.statSync(dlPath).size > 20, '下载文件非空');

    console.log('\n=== Zip persistence roundtrip ===');
    const zipCheck = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdownMedia(M.State.editor.getHTML());
      const blob = await M.buildMentorZipBlob(md, { annotations: [] }, {});
      const file = new File([blob], 'ref-mgmt.mentor', { type: 'application/zip' });
      const parsed = await M.readMentorZip(file);
      return {
        keys: (parsed.references.entries || []).map(e => e.key).sort(),
        hasBib: !!(parsed.referencesBib && parsed.referencesBib.includes('@article')),
      };
    });
    assert(zipCheck.keys.includes('smith2025one'), 'zip 保留 smith2025one');
    assert(zipCheck.keys.includes('doe2026mentor'), 'zip 保留 doe2026mentor');
    assert(zipCheck.hasBib, 'zip 含 references.bib 文本');

    assert(pageErrors.length === 0, `no page errors: ${pageErrors.join(' | ')}`);
    console.log('\nPASS e2e reference management');
  } finally {
    await ctx.close();
    await browser.close();
  }
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
