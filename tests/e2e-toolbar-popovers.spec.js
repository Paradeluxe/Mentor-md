const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
  try {
    await page.goto('http://127.0.0.1:8787/?t=' + Date.now(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(
      () => window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor,
      { timeout: 20000 }
    );
    await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

    console.log('=== Help open state ===');
    await page.click('#help-btn');
    await page.waitForTimeout(60);
    assert.strictEqual(await page.getAttribute('#help-btn', 'aria-expanded'), 'true');
    assert.ok(await page.locator('#help-btn').evaluate((el) => el.classList.contains('is-active')));
    assert.strictEqual(await page.getAttribute('#help-popover', 'role'), 'dialog');
    assert.ok(!(await page.locator('#help-popover').evaluate((el) => el.classList.contains('hidden'))));

    console.log('=== Mutual exclusion help -> settings ===');
    await page.click('#settings-btn');
    await page.waitForTimeout(60);
    assert.strictEqual(await page.getAttribute('#help-btn', 'aria-expanded'), 'false');
    assert.ok(!(await page.locator('#help-btn').evaluate((el) => el.classList.contains('is-active'))));
    assert.strictEqual(await page.getAttribute('#settings-btn', 'aria-expanded'), 'true');
    assert.ok(await page.locator('#settings-btn').evaluate((el) => el.classList.contains('is-active')));
    assert.ok(await page.locator('#help-popover').evaluate((el) => el.classList.contains('hidden')));
    assert.ok(!(await page.locator('#settings-popover').evaluate((el) => el.classList.contains('hidden'))));

    console.log('=== Escape closes settings and restores focus ===');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
    assert.strictEqual(await page.getAttribute('#settings-btn', 'aria-expanded'), 'false');
    assert.ok(!(await page.locator('#settings-btn').evaluate((el) => el.classList.contains('is-active'))));
    assert.ok(await page.locator('#settings-popover').evaluate((el) => el.classList.contains('hidden')));
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'settings-btn');

    console.log('=== Settings then help mutual exclusion ===');
    await page.click('#settings-btn');
    await page.waitForTimeout(40);
    await page.click('#help-btn');
    await page.waitForTimeout(40);
    assert.strictEqual(await page.getAttribute('#settings-btn', 'aria-expanded'), 'false');
    assert.strictEqual(await page.getAttribute('#help-btn', 'aria-expanded'), 'true');

    assert.strictEqual(pageErrors.length, 0, pageErrors.join(' | '));
    console.log('PASS e2e-toolbar-popovers');
  } finally {
    await ctx.close();
    await browser.close();
  }
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
