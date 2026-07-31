const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('Mentor:author', 'refs-ux'));
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8787/index.html?v=refux&cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    const M = window.__mdAnnotator;
    M.loadMarkdownIntoEditor('ux.md', 'See [@used2024] and again [@used2024].\n', null);
    M.addReferenceEntry({ key: 'used2024', type: 'article', authors: 'Used, C', title: 'Used title', year: '2024' });
    M.addReferenceEntry({ key: 'other2024', type: 'article', authors: 'Other, B', title: 'Other title', year: '2024' });
    M.reconcileCitationNodes?.();
  });
  await page.locator('#btn-refs').click();
  assert(await page.locator('#refs-pane').isVisible(), 'pane open');
  assert(await page.locator('#refs-primary-row').isVisible(), 'primary row');
  await page.locator('#refs-more-btn').click();
  assert(await page.locator('#refs-more-menu').isVisible(), 'more menu opens');
  assert.equal(await page.locator('#refs-more-btn').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert(await page.locator('#refs-more-menu').isHidden(), 'Escape closes menu');
  assert(await page.locator('#refs-more-btn').evaluate((el) => el === document.activeElement), 'focus returns');

  for (const selector of ['.rc-insert-btn', '.rc-edit-btn', '.rc-delete-btn']) {
    const button = page.locator(`.refs-card[data-key="used2024"] ${selector}`);
    assert(await button.getAttribute('aria-label'), `${selector} has aria-label`);
    assert(await button.getAttribute('title'), `${selector} has tooltip`);
  }

  await page.locator('#refs-more-btn').click();
  assert(await page.locator('#refs-more-menu').isVisible());
  await page.locator('#editor').click({ position: { x: 20, y: 20 } });
  assert(await page.locator('#refs-more-menu').isHidden(), 'outside click closes');

  console.log('PASS reference-pane-ux');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
