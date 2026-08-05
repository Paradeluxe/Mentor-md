/**
 * File ops real-disk battery:
 * pending-open → edit → manual save → external rewrite → reload → resolve/open APIs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BASE = process.env.MENTOR_BASE || 'http://127.0.0.1:8787';

function assert(cond, msg, extra) {
  if (!cond) throw new Error(msg + (extra ? ' ' + JSON.stringify(extra) : ''));
}

function zipMd(filePath) {
  return execFileSync(
    'python',
    [
      '-c',
      'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read("content.md").decode("utf-8","replace"))',
      filePath,
    ],
    { encoding: 'utf-8' }
  );
}

function writeZipMd(filePath, mdText) {
  const pyPath = path.join(os.tmpdir(), 'mentor-write-zip-md.py');
  fs.writeFileSync(
    pyPath,
    [
      'import zipfile,sys,io',
      'src, md = sys.argv[1], sys.argv[2]',
      'buf=io.BytesIO()',
      "with zipfile.ZipFile(src,'r') as zin, zipfile.ZipFile(buf,'w') as zout:",
      '    for i in zin.infolist():',
      '        data = zin.read(i.filename)',
      "        if i.filename == 'content.md':",
      "            data = md.encode('utf-8')",
      '        zout.writestr(i, data)',
      "open(src,'wb').write(buf.getvalue())",
      '',
    ].join('\n'),
    'utf8'
  );
  execFileSync('python', [pyPath, filePath, mdText], { encoding: 'utf-8' });
}

(async () => {
  let pass = 0;
  let fail = 0;
  async function t(name, fn) {
    try {
      await fn();
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      fail++;
    }
  }

  console.log('=== e2e-file-ops-disk-real ===');
  const sess = await (await fetch(BASE + '/session')).json();
  assert(sess && sess.token, 'session', sess);
  const token = sess.token;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'file-ops-'));
  const demo = path.join(tmp, 'file-ops-real.mentor');
  fs.copyFileSync(path.resolve('examples/supervision-pet-demo.mentor'), demo);

  const po = await (
    await fetch(BASE + '/pending-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, path: demo }),
    })
  ).json();
  assert(po && po.ok, 'pending-open', po);

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/index.html?fo=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => !!window.__mdAnnotator?.State?.editor, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  let pathAbs = '';
  for (let i = 0; i < 50; i++) {
    pathAbs = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      try {
        return (M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath()) || M.State.externalWatchPath || '';
      } catch (_) {
        return '';
      }
    });
    if (/file-ops-real\.mentor$/i.test(pathAbs)) break;
    await page.waitForTimeout(200);
  }

  await t('pending-open binds path', async () => {
    assert(/file-ops-real\.mentor$/i.test(pathAbs), 'path', { pathAbs });
  });

  const mark = 'FILEOPSMARK' + Date.now();
  await t('manual writeCurrentToDisk writes content.md', async () => {
    const res = await page.evaluate(async (mark) => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(true, { silent: true });
      M.State.readOnlyMode = false;
      M.State.editor.commands.focus('end');
      M.State.editor.commands.insertContent('<p>' + mark + '</p>');
      M.State.currentFile.dirty = true;
      M.State.currentFile.dirtyGen = (M.State.currentFile.dirtyGen || 0) + 1;
      const wr = await M.writeCurrentToDisk({ reason: 'manual', showProgress: false });
      return {
        wr,
        dirty: !!M.State.currentFile.dirty,
        path: (M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath()) || '',
        hasTarget: M.hasDiskWriteTarget(),
      };
    }, mark);
    assert(res.hasTarget, 'target', res);
    assert(res.wr && res.wr.ok && res.wr.disk, 'write fail', res.wr);
    assert(res.dirty === false, 'dirty after save', res);
    await page.waitForTimeout(300);
    const md = zipMd(demo);
    assert(md.includes(mark), 'mark missing on disk', md.slice(-120));
  });

  await t('resolve-mentor-path by name hits same file', async () => {
    const r = await (
      await fetch(
        BASE +
          '/resolve-mentor-path?' +
          new URLSearchParams({ token, name: 'file-ops-real.mentor' }).toString()
      )
    ).json();
    assert(r && r.ok, 'resolve', r);
    assert(/file-ops-real\.mentor$/i.test(r.path || ''), 'path', r);
  });

  await t('/open with token returns zip bytes', async () => {
    const r = await fetch(
      BASE + '/open?' + new URLSearchParams({ token, path: demo }).toString()
    );
    assert(r.ok, 'open status ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    assert(buf[0] === 0x50 && buf[1] === 0x4b, 'not zip');
    assert(buf.length > 100, 'too small');
  });

  await t('external disk rewrite is visible after reload', async () => {
    const external = 'EXTERNALBODY' + Date.now();
    const mdNow = zipMd(demo);
    writeZipMd(demo, mdNow.trimEnd() + '\n\n' + external + '\n');
    const res = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const p =
        (M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath()) ||
        M.State.externalWatchPath ||
        '';
      if (typeof M.reloadCurrentFromDisk === 'function') {
        const r = await M.reloadCurrentFromDisk({ force: true });
        return { via: 'reloadCurrentFromDisk', r, path: p };
      }
      const token = M.State.externalWatchToken || (await M.ensureLocalSessionToken());
      const q = new URLSearchParams({ token, path: p });
      const resp = await fetch(location.origin + '/open?' + q.toString());
      if (!resp.ok) return { via: 'open-fetch', ok: false, status: resp.status, path: p };
      const blob = await resp.blob();
      const file = new File([blob], 'file-ops-real.mentor', { type: 'application/zip' });
      await M.openFromMentorFile(file, { quiet: true, pathHint: p });
      try {
        M.State.externalWatchPath = p;
        M.State.diskPathHint = p;
        if (M.State.currentFile) M.State.currentFile.path = p;
      } catch (_) {}
      return { via: 'open-fetch', ok: true, path: p };
    });
    await page.waitForTimeout(500);
    const bodyOk = await page.evaluate((m) => {
      const html = window.__mdAnnotator.State.editor.getHTML() || '';
      if (html.includes(m)) return true;
      try {
        const snap = window.__mdAnnotator.createSaveSnapshot({ skipHardAudit: true });
        return !!(snap && snap.mdText && snap.mdText.includes(m));
      } catch (_) {
        return false;
      }
    }, external);
    assert(bodyOk, 'external body not in editor', { res });
  });

  await t('save after external reload still works', async () => {
    const mark2 = 'AFTEREXT' + Date.now();
    const res = await page.evaluate(async (mark2) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.focus('end');
      M.State.editor.commands.insertContent('<p>' + mark2 + '</p>');
      M.State.currentFile.dirty = true;
      M.State.currentFile.dirtyGen = (M.State.currentFile.dirtyGen || 0) + 1;
      const wr = await M.writeCurrentToDisk({ reason: 'manual', showProgress: false });
      return { wr, dirty: !!M.State.currentFile.dirty };
    }, mark2);
    assert(res.wr && res.wr.ok && res.wr.disk, 'save2', res.wr);
    await page.waitForTimeout(300);
    const md = zipMd(demo);
    assert(md.includes(mark2), 'mark2 missing', md.slice(-160));
  });

  await t('write-mentor rejects unregistered path', async () => {
    const other = path.join(tmp, 'not-registered.mentor');
    fs.copyFileSync(demo, other);
    const raw = fs.readFileSync(other);
    const r = await fetch(
      BASE + '/write-mentor?' + new URLSearchParams({ token, path: other }).toString(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', 'X-Mentor-Token': token },
        body: raw,
      }
    );
    assert(r.status === 403, 'expected 403 got ' + r.status);
    const j = await r.json();
    assert(j.error === 'not-allowed', j);
  });

  await browser.close();
  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
