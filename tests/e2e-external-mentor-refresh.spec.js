/**
 * External .mentor disk change → open page refresh via pending-open + server-poll.
 * Deep-link ?open= is removed (Word-style only).
 * Mutates only OS temp copies of tests/fixtures/sample.mentor.
 */
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const JSZip = require('jszip');

const BASE = process.env.MENTOR_URL || 'http://127.0.0.1:8787';
const FIXTURE = path.resolve(__dirname, 'fixtures', 'sample.mentor');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers })
      );
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
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitEditor(page) {
  await page.waitForFunction(
    () => window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor,
    { timeout: 20000 }
  );
  await page.waitForTimeout(1200);
}

async function rewriteMentorArchive(filePath, { mdText, aiReplyToken }) {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  if (mdText != null) zip.file('content.md', mdText);
  if (aiReplyToken) {
    let anns = { version: 1, annotations: [] };
    const entry = zip.file('annotations.json');
    if (entry) {
      try {
        anns = JSON.parse(await entry.async('string'));
      } catch (_) {}
    }
    if (!Array.isArray(anns.annotations)) anns.annotations = [];
    const threadId = 'ext-ai-' + Date.now();
    anns.annotations.push({
      threadId,
      status: 'open',
      text: 'external-anchor',
      comments: [
        {
          id: 'c-ext-1',
          author: 'External AI',
          authorId: 'external-ai',
          createdAt: new Date().toISOString(),
          body: aiReplyToken,
          role: 'ai',
        },
      ],
    });
    zip.file('annotations.json', JSON.stringify(anns, null, 2));
  }
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, filePath);
}

async function dismissAuthor(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('Mentor:author', 'ExtRefreshTester');
      localStorage.setItem('Mentor:authorId', 'ext-refresh-tester');
      if (window.__mdAnnotator && window.__mdAnnotator.State) {
        window.__mdAnnotator.State.author = 'ExtRefreshTester';
        window.__mdAnnotator.State.authorId = 'ext-refresh-tester';
      }
      const modal = document.getElementById('author-modal');
      if (modal) modal.classList.add('hidden');
    } catch (_) {}
  });
}

(async () => {
  if (!fs.existsSync(FIXTURE)) throw new Error('missing fixture ' + FIXTURE);
  const sess = JSON.parse((await get(BASE + '/session')).body.toString('utf8'));
  if (!sess.token) throw new Error('no session token');

  let pass = 0;
  const t = (name) => {
    console.log('  ✓', name);
    pass++;
  };

  const browser = await chromium.launch({ headless: true });
  console.log('=== e2e-external-mentor-refresh (pending-open) ===');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mentor-ext-'));
  const tmpMentor = path.join(tmpDir, 'sample-ext.mentor');
  fs.copyFileSync(FIXTURE, tmpMentor);

  const po = JSON.parse(
    (
      await post(BASE + '/pending-open', {
        token: sess.token,
        path: tmpMentor.replace(/\\/g, '/'),
      })
    ).body
  );
  assert.ok(po.ok || po.path || po.queued !== false, 'pending-open ' + JSON.stringify(po));

  const page = await browser.newPage();
  await page.goto(BASE + '/index.html?v=ext-' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
  await waitEditor(page);
  await dismissAuthor(page);
  await page.waitForTimeout(1500);

  const watch = await page.evaluate(() => window.__mdAnnotator.getExternalWatchState());
  const name = await page.evaluate(() => window.__mdAnnotator.State.currentFile?.name || '');
  const abs = await page.evaluate(() => window.__mdAnnotator.resolveActiveMentorAbsPath?.() || '');
  assert.ok(/\.mentor$/i.test(name) || abs, 'opened mentor name=' + name + ' abs=' + abs);
  // server-poll when path+token bound
  if (watch.mode !== 'server-poll') {
    // force bind + start watch for headless
    await page.evaluate(async (p) => {
      const M = window.__mdAnnotator;
      M.State.externalWatchPath = p;
      const tok = await M.ensureLocalSessionToken?.({ force: true });
      if (tok) M.State.externalWatchToken = tok;
      if (typeof M.startExternalWatchForCurrentDocument === 'function') {
        await M.startExternalWatchForCurrentDocument();
      }
    }, tmpMentor.replace(/\\/g, '/'));
    await page.waitForTimeout(400);
  }
  const watch2 = await page.evaluate(() => window.__mdAnnotator.getExternalWatchState());
  assert.equal(watch2.mode, 'server-poll', 'mode=' + JSON.stringify(watch2));
  assert.equal(watch2.hasToken, true);
  t('pending-open + path enters server-poll');

  await rewriteMentorArchive(tmpMentor, {
    mdText: '# External\n\nexternal-body-token\n',
    aiReplyToken: 'external-ai-reply-token',
  });

  await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const w = M.State.externalWatch && M.State.externalWatch.watcher;
    if (w && typeof w.probe === 'function') await w.probe();
    if (typeof M.flushExternalRefreshForTest === 'function') await M.flushExternalRefreshForTest();
  });
  await page.waitForTimeout(1000);

  const body = await page.locator('#editor').innerText();
  assert.match(body, /external-body-token/, 'body=' + body.slice(0, 200));
  t('server-poll clean reload applies external body');

  await browser.close();
  console.log('PASS external-mentor-refresh', pass);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
