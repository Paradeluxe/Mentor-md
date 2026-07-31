// Office-like AutoSave toolbar toggle: default ON, click flips preference + UI.
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = process.env.MENTOR_PORT || 8787;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/index.html?as=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { localStorage.removeItem('Mentor:autoSave'); } catch (_) {}
  });
  // re-sync after clearing key
  await page.evaluate(() => {
    window.__mdAnnotator.setAutoSaveEnabled(true, { silent: true });
    window.__mdAnnotator.syncAutosaveToggleUi();
  });

  const btn = page.locator('#btn-autosave');
  await btn.waitFor({ state: 'visible', timeout: 5000 });

  let st = await page.evaluate(() => {
    const el = document.querySelector('#btn-autosave');
    return {
      pressed: el?.getAttribute('aria-pressed'),
      label: el?.querySelector('.tb-label')?.textContent,
      enabled: window.__mdAnnotator.getAutoSaveEnabled(),
      inSaveGroup: !!el?.closest('[data-toolbar-group="save"]'),
    };
  });
  assert.strictEqual(st.label, '自动保存', 'label');
  assert.strictEqual(st.pressed, 'true', 'default pressed');
  assert.strictEqual(st.enabled, true, 'default enabled');
  assert.strictEqual(st.inSaveGroup, true, 'in save group');

  await btn.click();
  st = await page.evaluate(() => ({
    pressed: document.querySelector('#btn-autosave')?.getAttribute('aria-pressed'),
    enabled: window.__mdAnnotator.getAutoSaveEnabled(),
    ls: localStorage.getItem('Mentor:autoSave'),
  }));
  assert.strictEqual(st.pressed, 'false', 'off pressed');
  assert.strictEqual(st.enabled, false, 'off enabled');
  assert.strictEqual(st.ls, '0', 'ls off');

  await btn.click();
  st = await page.evaluate(() => ({
    pressed: document.querySelector('#btn-autosave')?.getAttribute('aria-pressed'),
    enabled: window.__mdAnnotator.getAutoSaveEnabled(),
    ls: localStorage.getItem('Mentor:autoSave'),
  }));
  assert.strictEqual(st.pressed, 'true', 'on pressed');
  assert.strictEqual(st.enabled, true, 'on enabled');
  assert.strictEqual(st.ls, '1', 'ls on');

  console.log('PASS e2e-autosave-toggle', st);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
