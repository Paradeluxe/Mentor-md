// v1.44.6 update detection unit + UI
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8787/index.html';

function assert(c, m) { if (!c) throw new Error(m); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.goto(`${URL}?update-check=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });

    const local = await page.evaluate(() => window.__mdAnnotator.getLocalMentorVersion());
    assert(/^\d+\.\d+\.\d+$/.test(local), `bad local version: ${local}`);
    console.log('  ✓ local version', local);

    const cmp = await page.evaluate(() => {
      const C = window.__mdAnnotator.compareSemver;
      return {
        gt: C('1.44.6', '1.44.5'),
        eq: C('1.2.3', 'v1.2.3'),
        lt: C('1.0.0', '1.0.1'),
        bad: Number.isNaN(C('x', '1.0.0')),
      };
    });
    assert(cmp.gt > 0 && cmp.eq === 0 && cmp.lt < 0 && cmp.bad, `compare failed ${JSON.stringify(cmp)}`);
    console.log('  ✓ compareSemver');

    await page.route('https://api.github.com/repos/Paradeluxe/Mentor-md/releases/latest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tag_name: 'v9.9.9',
          html_url: 'https://github.com/Paradeluxe/Mentor-md/releases/tag/v9.9.9',
          name: 'v9.9.9',
        }),
      });
    });
    await page.evaluate(() => localStorage.removeItem('Mentor:updateCheck'));
    const newer = await page.evaluate(async () => {
      const r = await window.__mdAnnotator.checkForUpdate({ force: true, quiet: true, showBanner: true });
      const banner = document.querySelector('#update-banner');
      const st = document.querySelector('#settings-version-status');
      const link = document.querySelector('#settings-version-link');
      return {
        latest: r.latest,
        local: r.local,
        bannerHidden: banner?.classList.contains('hidden'),
        status: st?.textContent || '',
        linkHidden: link?.classList.contains('hidden'),
      };
    });
    assert(newer.latest === '9.9.9', `latest ${newer.latest}`);
    assert(newer.bannerHidden === false, `banner should show ${JSON.stringify(newer)}`);
    assert(newer.status.includes('9.9.9'), `status ${newer.status}`);
    assert(newer.linkHidden === false, 'download link should show');
    console.log('  ✓ newer release shows banner');

    await page.click('#update-banner-dismiss');
    const dismissed = await page.evaluate(() => {
      const banner = document.querySelector('#update-banner');
      const cache = JSON.parse(localStorage.getItem('Mentor:updateCheck') || '{}');
      return { hidden: banner.classList.contains('hidden'), dismissedLatest: cache.dismissedLatest };
    });
    assert(dismissed.hidden && dismissed.dismissedLatest === '9.9.9', JSON.stringify(dismissed));
    console.log('  ✓ dismiss banner');

    await page.unroute('https://api.github.com/repos/Paradeluxe/Mentor-md/releases/latest');
    const localVer = local;
    await page.route('https://api.github.com/repos/Paradeluxe/Mentor-md/releases/latest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tag_name: 'v' + localVer, html_url: 'https://github.com/Paradeluxe/Mentor-md/releases' }),
      });
    });
    await page.evaluate(() => localStorage.removeItem('Mentor:updateCheck'));
    const same = await page.evaluate(async () => {
      const r = await window.__mdAnnotator.checkForUpdate({ force: true, quiet: true, showBanner: true });
      const banner = document.querySelector('#update-banner');
      return {
        latest: r.latest,
        bannerHidden: banner?.classList.contains('hidden'),
        status: document.querySelector('#settings-version-status')?.textContent || '',
      };
    });
    assert(same.latest === localVer, `same latest ${same.latest}`);
    assert(same.bannerHidden === true, `banner should hide ${JSON.stringify(same)}`);
    assert(same.status.includes('最新'), `status ${same.status}`);
    console.log('  ✓ same version hides banner');

    const hasBtn = await page.evaluate(() => !!document.querySelector('#settings-check-update'));
    assert(hasBtn, 'missing check button');
    console.log('  ✓ settings check button');

    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    console.log('\n=== update-check: PASS ===');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
