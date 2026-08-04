/**
 * Launch path: pending-open opens .mentor; ?open= deep-link is stripped and does not open.
 * Word-style only (mentor.cmd).
 */
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

function post(url, bodyObj) {
  const data = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const base = 'http://127.0.0.1:8787';
  const sess = JSON.parse((await get(base + '/session')).body);
  if (!sess.token) throw new Error('no session token');

  const mentorPath = path.resolve(__dirname, 'fixtures', 'sample.mentor');
  if (!fs.existsSync(mentorPath)) throw new Error('missing sample.mentor');

  const browser = await chromium.launch({ headless: true });
  const fails = [];

  // --- pending-open happy path ---
  {
    const po = JSON.parse(
      (
        await post(base + '/pending-open', {
          token: sess.token,
          path: mentorPath.replace(/\\/g, '/'),
        })
      ).body
    );
    if (!(po.ok || po.path || po.queued !== false)) fails.push('pending-open failed ' + JSON.stringify(po));

    const page = await browser.newPage();
    await page.goto(base + '/index.html?v=po-' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const name1 = await page.evaluate(() => window.__mdAnnotator?.State?.currentFile?.name || null);
    const abs1 = await page.evaluate(() => window.__mdAnnotator?.resolveActiveMentorAbsPath?.() || '');
    if (!name1 || !/\.mentor$/i.test(name1)) fails.push('pending-open did not open mentor, name=' + name1);
    // bind watch if needed
    await page.evaluate(async (p) => {
      const M = window.__mdAnnotator;
      if (!M) return;
      if (!M.State.externalWatchPath) M.State.externalWatchPath = p;
      const tok = await M.ensureLocalSessionToken?.({ force: true });
      if (tok) M.State.externalWatchToken = tok;
      await M.startExternalWatchForCurrentDocument?.();
    }, mentorPath.replace(/\\/g, '/'));
    await page.waitForTimeout(300);
    const watch1 = await page.evaluate(() => window.__mdAnnotator.getExternalWatchState());
    if (!watch1 || watch1.mode !== 'server-poll') {
      fails.push('expected server-poll after pending-open bind, got ' + JSON.stringify(watch1));
    }
    if (!watch1 || !watch1.hasToken) fails.push('expected token after bind, got ' + JSON.stringify(watch1));
    await page.close();
  }

  // --- ?open= deep-link must strip and NOT open via deep-link ---
  {
    const page = await browser.newPage();
    const openUrl =
      base +
      '/index.html?open=' +
      encodeURIComponent(mentorPath) +
      '&token=' +
      encodeURIComponent(sess.token) +
      '&v=dl-' +
      Date.now();
    await page.goto(openUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const url1 = page.url();
    const hasOpen1 = /[?&]open=/.test(url1);
    if (hasOpen1) fails.push('after deep-link URL still has open= : ' + url1);

    // bad path also strips
    const badUrl =
      base +
      '/index.html?open=' +
      encodeURIComponent('C:/no/such/file.mentor') +
      '&token=' +
      encodeURIComponent(sess.token);
    await page.goto(badUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const url3 = page.url();
    if (/[?&]open=/.test(url3)) fails.push('after bad open still open= : ' + url3);
    await page.close();
  }

  await browser.close();
  if (fails.length) {
    console.error('FAIL', fails);
    process.exit(1);
  }
  console.log('url-open / pending-open OK');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
