const { chromium } = require('playwright');
const fs = require('fs');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}`;

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function importAndConfirm(page, file) {
  await page.locator('#refs-file-input').setInputFiles(file);
  // multi-entry: cards appear; single-entry: editor modal opens
  const modal = page.locator('#reference-editor-modal');
  try {
    await modal.waitFor({ state: 'visible', timeout: 1500 });
    await page.locator('#reference-save').click();
    await modal.waitFor({ state: 'hidden', timeout: 5000 });
  } catch (_) {
    // multi-entry path: no modal
  }
}

async function clearSearch(page) {
  await page.locator('#refs-search').fill('');
}

async function waitForKey(page, key) {
  await page.waitForFunction((k) => !!document.querySelector(`.refs-card[data-key="${k}"]`), key, { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('Mentor:author', 'refs-test'));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor('refs-test.md', '# References test\n\nCursor: ', null);
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    });

    console.log('\n=== BibTeX import ===');
    const bib = `@article{zeta2024last,
  author = {Zeta, Zoe},
  title = {Last title},
  journal = {Journal Z},
  year = {2024},
  doi = {10.1/zeta}
}

@article{alpha2020first,
  author = {Alpha, Ann and Beta, Bob},
  title = {{First} title},
  journal = {Journal A},
  year = {2020},
  doi = {10.1/alpha}
}`;
    await page.locator('#refs-file-input').setInputFiles({
      name: 'library.bib',
      mimeType: 'application/x-bibtex',
      buffer: Buffer.from(bib, 'utf8'),
    });
    await page.waitForFunction(() => document.querySelectorAll('.refs-card').length === 2);
    const bibState = await page.evaluate(() => ({
      keys: [...document.querySelectorAll('.refs-card .rc-key')].map(x => x.textContent),
      source: document.querySelector('#refs-source-name')?.textContent,
      paneVisible: !document.querySelector('#refs-pane')?.classList.contains('hidden'),
      editors: document.querySelectorAll('#refs-pane input:not([type="search"]), #refs-pane textarea, #refs-pane [contenteditable="true"]').length,
    }));
    assert(JSON.stringify(bibState.keys) === JSON.stringify(['@alpha2020first', '@zeta2024last']), 'BibTeX entries are sorted by citekey');
    assert(bibState.source.includes('library.bib') && bibState.source.includes('2 条'), 'source filename and count are shown');
    assert(bibState.paneVisible, 'reference pane opens after import');
    assert(bibState.editors === 0, 'reference text has no editable controls');

    console.log('\n=== Search + insert ===');
    await page.locator('#refs-search').fill('Alpha');
    assert(await page.locator('.refs-card').count() === 1, 'search filters cards');
    await page.locator('.refs-card .rc-insert-btn').click();
    const editorText = await page.locator('#editor').innerText();
    const editorMd = await page.evaluate(() => window.__mdAnnotator.htmlToMarkdownMedia(window.__mdAnnotator.State.editor.getHTML()));
    assert(editorMd.includes('[@alpha2020first]') && !editorText.includes('[@alpha2020first]'), 'insert button writes citekey source and renders author-year atom');

    console.log('\n=== Real PsyClaw refs.bib (merge, not replace) ===');
    await clearSearch(page);
    const psyPath = 'E:/hermes_playground/paper-writing/projects/psyclaw-paper/refs.bib';
    if (!fs.existsSync(psyPath)) {
      console.log('  ⊘ skip: PsyClaw refs.bib not found at', psyPath);
    } else {
      const beforeKeys = await page.evaluate(() => (window.__mdAnnotator.State.references.entries || []).map(e => e.key));
      await page.locator('#refs-file-input').setInputFiles(psyPath);
      await page.waitForFunction(() => document.querySelector('.refs-card[data-key="anwylirvine2020gorilla"]'), null, { timeout: 20000 });
      const realState = await page.evaluate(() => ({
        count: document.querySelectorAll('.refs-card').length,
        keys: [...document.querySelectorAll('.refs-card .rc-key')].map(x => x.textContent),
        entryCount: (window.__mdAnnotator.State.references.entries || []).length,
        contentEditables: document.querySelectorAll('#refs-pane [contenteditable="true"], #refs-pane textarea').length,
      }));
      assert(realState.entryCount >= 10, `merge keeps ≥10 entries (got ${realState.entryCount})`);
      assert(realState.keys.includes('@anwylirvine2020gorilla'), 'real library includes anwylirvine2020gorilla');
      assert(beforeKeys.every(k => realState.keys.includes('@' + k)), 'previous library keys survive merge');
      assert(realState.contentEditables === 0, 'real library remains non-contenteditable');
    }
    await page.locator('#refs-pane [data-act="toggle-refs-pane"]').click();
    assert(await page.locator('#refs-pane').isHidden(), 'reference pane can collapse');
    assert(await page.locator('#expand-refs-pane-btn').isVisible(), 'collapsed library exposes reopen control');
    await page.locator('#expand-refs-pane-btn').click();
    assert(await page.locator('#refs-pane').isVisible(), 'reopen control restores loaded library');

    console.log('\n=== RIS import (single → confirm form; merge) ===');
    await clearSearch(page);
    const ris = `TY  - JOUR\nAU  - Gamma, Grace\nAU  - Delta, Dan\nTI  - RIS title\nJO  - RIS Journal\nPY  - 2021\nDO  - 10.2/ris\nER  - \n`;
    await importAndConfirm(page, {
      name: 'library.ris',
      mimeType: 'application/x-research-info-systems',
      buffer: Buffer.from(ris, 'utf8'),
    });
    // RIS citekey is generated — find by title
    await page.waitForFunction(() => [...document.querySelectorAll('.refs-card')].some(c => c.textContent.includes('RIS title')));
    const risCard = await page.evaluate(() => [...document.querySelectorAll('.refs-card')].find(c => c.textContent.includes('RIS title'))?.innerText || '');
    assert(risCard.includes('Gamma, Grace') && risCard.includes('Delta, Dan'), 'RIS keeps multiple authors in one record');
    assert(risCard.includes('RIS title') && risCard.includes('2021'), 'RIS title and year are rendered');
    assert(await page.locator('.refs-card[data-key="alpha2020first"]').count() === 1, 'merge keeps earlier BibTeX entry');

    console.log('\n=== EndNote tagged import ===');
    await clearSearch(page);
    const enw = `%0 Journal Article\n%A Endnote, Erin\n%A Other, Owen\n%T Tagged title\n%J EndNote Journal\n%D 2023\n%R 10.4/endnote\n`;
    await importAndConfirm(page, {
      name: 'library.enw',
      mimeType: 'text/plain',
      buffer: Buffer.from(enw, 'utf8'),
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.refs-card')].some(c => c.textContent.includes('Tagged title')));
    const enwCard = await page.evaluate(() => [...document.querySelectorAll('.refs-card')].find(c => c.textContent.includes('Tagged title'))?.innerText || '');
    assert(enwCard.includes('Endnote, Erin') && enwCard.includes('Tagged title'), 'EndNote tagged record is rendered');

    console.log('\n=== EndNote XML import ===');
    await clearSearch(page);
    const xml = `<xml><records><record><rec-number>42</rec-number><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Xml, Xena</author></authors></contributors><titles><title>XML title</title><secondary-title>XML Journal</secondary-title></titles><dates><year>2024</year></dates><electronic-resource-num>10.5/xml</electronic-resource-num></record></records></xml>`;
    await importAndConfirm(page, {
      name: 'library.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(xml, 'utf8'),
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.refs-card')].some(c => c.textContent.includes('XML title')));
    const xmlCard = await page.evaluate(() => [...document.querySelectorAll('.refs-card')].find(c => c.textContent.includes('XML title'))?.innerText || '');
    assert(xmlCard.includes('Xml, Xena') && xmlCard.includes('XML title'), 'EndNote XML record is rendered');

    console.log('\n=== CSL-JSON import ===');
    await clearSearch(page);
    const csl = JSON.stringify([{
      id: 'omega2022json',
      type: 'article-journal',
      author: [{ given: 'Ola', family: 'Omega' }],
      issued: { 'date-parts': [[2022]] },
      title: 'JSON title',
      'container-title': 'JSON Journal',
      DOI: '10.3/json'
    }]);
    await importAndConfirm(page, {
      name: 'library.json',
      mimeType: 'application/json',
      buffer: Buffer.from(csl, 'utf8'),
    });
    await waitForKey(page, 'omega2022json');
    const jsonCard = await page.locator('.refs-card[data-key="omega2022json"]').innerText();
    assert(jsonCard.includes('@omega2022json') && jsonCard.includes('JSON title'), 'CSL-JSON record is rendered');

    assert(pageErrors.length === 0, `no page errors: ${pageErrors.join(' | ')}`);
    console.log('\nPASS e2e refs library');
  } finally {
    await ctx.close();
    await browser.close();
  }
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
