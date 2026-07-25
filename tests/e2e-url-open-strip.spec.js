// Regression: ?open= deep-link must strip after attempt so F5 does not loop "无法打开"
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

(async () => {
  const base = 'http://127.0.0.1:8787';
  const sess = JSON.parse((await get(base + '/session')).body);
  if (!sess.token) throw new Error('no session token');

  const mentorPath = path.resolve(__dirname, '..', 'example.mentor');
  if (!fs.existsSync(mentorPath)) throw new Error('missing example.mentor');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const toasts = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('?open') || t.includes('无法')) toasts.push(t);
  });

  const openUrl =
    base +
    '/index.html?open=' +
    encodeURIComponent(mentorPath) +
    '&token=' +
    encodeURIComponent(sess.token);

  await page.goto(openUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  const url1 = page.url();
  const hasOpen1 = url1.includes('open=');
  const name1 = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    return M && M.State && M.State.currentFile && M.State.currentFile.name;
  });

  // Reload same (already-stripped) URL — must not toast 无法打开 sticky
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const url2 = page.url();
  const hasOpen2 = url2.includes('open=');

  // Direct bad path once then strip
  const badUrl = base + '/index.html?open=' + encodeURIComponent('C:\\\\no\\\\such\\\\file.mentor') + '&token=' + encodeURIComponent(sess.token);
  await page.goto(badUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const url3 = page.url();
  const hasOpen3 = url3.includes('open=');

  await browser.close();

  const fails = [];
  if (hasOpen1) fails.push('after success URL still has open= : ' + url1);
  if (!name1 || !/\.mentor$/i.test(name1)) fails.push('did not open mentor, name=' + name1);
  if (hasOpen2) fails.push('after reload still open= : ' + url2);
  if (hasOpen3) fails.push('after bad open still open= : ' + url3);

  if (fails.length) {
    console.error('FAIL', fails);
    process.exit(1);
  }
  console.log('url-open strip OK', { name1, url1, url2, url3 });
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
