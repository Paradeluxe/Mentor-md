const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const VIEWPORTS = [
  { width: 1500, height: 900 },
  { width: 900, height: 800 },
  { width: 390, height: 844 }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(() => localStorage.setItem('Mentor:author', 'refs-layout'));
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8787/index.html?v=reflayout&cb=' + Date.now() + '&w=' + vp.width, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => {
      document.querySelector('#author-modal')?.classList.add('hidden');
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('layout.md', '# Layout\n\nBody\n', null);
      for (let i = 0; i < 12; i++) {
        M.addReferenceEntry({
          key: `longkey${i}2026`,
          type: 'article',
          authors: 'Verylongauthorname, Alpha Beta Gamma Delta',
          title: ('An Extremely Long Academic Title About Methodology Validity Reliability And Cross Cultural Semantics ').repeat(2).trim(),
          year: String(2015 + i)
        });
      }
    });
    await page.locator('#btn-refs').click();
    await page.waitForSelector('#refs-pane:not(.hidden)');
    const geometry = await page.evaluate(() => {
      const pane = document.querySelector('#refs-pane').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('#refs-pane #refs-primary-row button, #refs-pane .refs-card button, #refs-pane .refs-bibliography-controls button')]
        .filter((el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => el.getBoundingClientRect());
      const cards = [...document.querySelectorAll('.refs-card')]
        .map((el) => ({ box: el.getBoundingClientRect(), scrollWidth: el.scrollWidth }));
      return {
        pane: { left: pane.left, right: pane.right, width: pane.width },
        viewport: window.innerWidth,
        buttonTooSmall: buttons.some((box) => box.width > 0 && (box.width < 28 || box.height < 28)),
        cardOverflow: cards.some(({ box, scrollWidth }) => scrollWidth > box.width + 2),
        mainOverflow: (() => {
          const main = document.querySelector('#main');
          return main ? main.scrollWidth > main.clientWidth + 2 : false;
        })()
      };
    });
    const shot = path.join(os.tmpdir(), `mentor-reference-pane-${vp.width}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    if (geometry.pane.left < -1 || geometry.pane.right > geometry.viewport + 1) {
      throw new Error('pane out of viewport ' + JSON.stringify(geometry));
    }
    if (geometry.buttonTooSmall || geometry.cardOverflow || geometry.mainOverflow) {
      throw new Error('layout fail ' + JSON.stringify(geometry));
    }
    console.log('  ok viewport', vp.width, shot);
    await ctx.close();
  }
  console.log('PASS reference-pane-layout');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
