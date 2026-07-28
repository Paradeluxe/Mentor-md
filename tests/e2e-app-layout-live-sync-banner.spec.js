/**
 * Regression: live-sync banner must not steal #app's flex/grow row.
 * Old bug: #app had grid-template-rows: auto auto 1fr auto (4 tracks) but
 * toolbar + live-sync-banner + doc-tabs + main + statusbar = 5 children.
 * When the banner left display:none, 1fr landed on #doc-tabs → huge blank.
 *
 * Run: node tests/e2e-app-layout-live-sync-banner.spec.js
 */
const { chromium } = require("playwright");
const assert = require("assert");

const BASE = process.env.MENTOR_URL || "http://127.0.0.1:8787/index.html";

async function waitEditor(page) {
  await page.waitForFunction(
    () => window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor,
    { timeout: 15000 }
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + "?layout=" + Date.now());
  await waitEditor(page);

  // Force banner visible the same way live-sync does
  await page.evaluate(() => {
    const el = document.getElementById("live-sync-banner");
    const text = document.getElementById("live-sync-text");
    el.classList.remove("hidden");
    el.dataset.role = "owner";
    text.textContent = "此页面正在编辑；其他页面会实时更新";
    const btn = el.querySelector('[data-act="live-sync-takeover"]');
    if (btn) btn.hidden = true;
  });

  await page.waitForTimeout(80);

  const metrics = await page.evaluate(() => {
    const app = document.getElementById("app");
    const tabs = document.getElementById("doc-tabs");
    const main = document.getElementById("main");
    const banner = document.getElementById("live-sync-banner");
    const status = document.getElementById("statusbar");
    const appH = app.getBoundingClientRect().height;
    const tabsH = tabs.getBoundingClientRect().height;
    const mainH = main.getBoundingClientRect().height;
    const bannerH = banner.getBoundingClientRect().height;
    const statusH = status.getBoundingClientRect().height;
    const appStyle = getComputedStyle(app);
    return {
      appH,
      tabsH,
      mainH,
      bannerH,
      statusH,
      appDisplay: appStyle.display,
      appFlexDir: appStyle.flexDirection,
      mainFlex: getComputedStyle(main).flexGrow || getComputedStyle(main).flex,
      bannerHidden: banner.classList.contains("hidden"),
    };
  });

  console.log("metrics", metrics);

  assert.strictEqual(metrics.appDisplay, "flex", "app should be flex column");
  assert.strictEqual(metrics.appFlexDir, "column");
  assert.ok(metrics.bannerH > 10 && metrics.bannerH < 80, "banner compact, not 1fr");
  assert.ok(metrics.tabsH > 10 && metrics.tabsH < 48, "tabs stay ~28px, not 1fr blank");
  // Main must own most of the viewport when banner is open
  assert.ok(
    metrics.mainH > metrics.appH * 0.55,
    `main should own majority of app height (got main=${metrics.mainH} app=${metrics.appH})`
  );
  // Tabs must NOT be near full viewport (the old bug)
  assert.ok(
    metrics.tabsH < metrics.appH * 0.15,
    `tabs must not absorb 1fr blank (tabs=${metrics.tabsH} app=${metrics.appH})`
  );

  // Banner hidden again: main still fills
  await page.evaluate(() => {
    document.getElementById("live-sync-banner").classList.add("hidden");
  });
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => {
    const app = document.getElementById("app").getBoundingClientRect().height;
    const main = document.getElementById("main").getBoundingClientRect().height;
    const tabs = document.getElementById("doc-tabs").getBoundingClientRect().height;
    return { app, main, tabs };
  });
  assert.ok(after.main > after.app * 0.6, "main fills when banner hidden");
  assert.ok(after.tabs < 48, "tabs compact when banner hidden");

  console.log("OK e2e-app-layout-live-sync-banner");
  await browser.close();
  process.exit(0);
})().catch(async (err) => {
  console.error("FAIL", err);
  process.exit(1);
});
