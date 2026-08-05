/**
 * Real-disk AutoSave: pending-open → edit → autosaveNow → file mtime/content.
 * Also checks server-path write and no-permission path.
 * Run: mentor-server on :8787, then node tests/e2e-autosave-disk-real.spec.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BASE = process.env.MENTOR_BASE || 'http://127.0.0.1:8787';

function zipHas(marker, filePath) {
  const py = `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
mark = sys.argv[2]
for n in z.namelist():
    if n.endswith('.md') or n in ('content.md', 'document.md', 'paper.md'):
        md = z.read(n).decode('utf-8', 'replace')
        print('file', n)
        print('HAS', mark in md)
        print('LEN', len(md))
        break
else:
    print('file NONE')
    print('HAS False')
`;
  const out = execFileSync('python', ['-c', py, filePath, marker], { encoding: 'utf-8' });
  return { out, ok: /HAS True/.test(out) };
}

function assert(cond, msg, extra) {
  if (!cond) {
    const e = new Error(msg + (extra ? ' ' + JSON.stringify(extra) : ''));
    throw e;
  }
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

  console.log('=== e2e-autosave-disk-real ===');
  const sess = await (await fetch(BASE + '/session')).json();
  assert(sess && sess.token, 'session token', sess);
  const token = sess.token;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-real-'));
  const demo = path.join(tmp, 'autosave-real.mentor');
  fs.copyFileSync(path.resolve('examples/supervision-pet-demo.mentor'), demo);
  const mtime0 = fs.statSync(demo).mtimeMs;
  const size0 = fs.statSync(demo).size;

  const po = await (
    await fetch(BASE + '/pending-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, path: demo }),
    })
  ).json();
  assert(po && po.ok, 'pending-open queue', po);

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/autosave|write-server|write-mentor|disk|no-disk/i.test(t)) logs.push(t.slice(0, 200));
  });
  await page.goto(BASE + '/index.html?as=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => !!window.__mdAnnotator?.State?.editor, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  // wait pending-open path
  let pathAbs = '';
  for (let i = 0; i < 50; i++) {
    pathAbs = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      try {
        if (M.resolveActiveMentorAbsPath) {
          const p = M.resolveActiveMentorAbsPath();
          if (p) return p;
        }
      } catch (_) {}
      return M.State.externalWatchPath || (M.State.currentFile && M.State.currentFile.path) || '';
    });
    if (pathAbs && /autosave-real\.mentor$/i.test(pathAbs)) break;
    await page.waitForTimeout(200);
  }

  await t('pending-open binds abs path', async () => {
    assert(!!pathAbs, 'path empty');
    assert(/autosave-real\.mentor$/i.test(pathAbs), 'wrong path', { pathAbs });
  });

  await t('AutoSave ON + dirty → real disk write + markClean', async () => {
    const marker = 'AUTOSAVEMARK' + Date.now();
    const res = await page.evaluate(async (marker) => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(true, { silent: true });
      try {
        M.State.readOnlyMode = false;
      } catch (_) {}
      M.State.editor.commands.focus('end');
      M.State.editor.commands.insertContent('<p>' + marker + '</p>');
      M.State.currentFile.dirty = true;
      M.State.currentFile.dirtyGen = (M.State.currentFile.dirtyGen || 0) + 1;
      const before = {
        dirty: !!M.State.currentFile.dirty,
        hasTarget: M.hasDiskWriteTarget(),
        diskActive: M.isAutoSaveDiskActive(),
        path: (M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath()) || M.State.externalWatchPath || '',
        auto: M.getAutoSaveEnabled(),
      };
      const wr = await M.autosaveNow();
      return {
        before,
        wr,
        dirtyAfter: !!M.State.currentFile.dirty,
        status: (document.querySelector('#status-text') && document.querySelector('#status-text').textContent) || '',
      };
    }, marker);

    assert(res.before.auto === true, 'auto off', res.before);
    assert(res.before.hasTarget === true, 'no target', res.before);
    assert(res.before.diskActive === true, 'disk inactive', res.before);
    assert(res.wr && res.wr.ok && res.wr.disk, 'autosaveNow not disk', res.wr);
    assert(res.dirtyAfter === false, 'still dirty', res);

    // allow FS settle
    await page.waitForTimeout(400);
    const st = fs.statSync(demo);
    assert(st.mtimeMs > mtime0, 'mtime not updated', { mtime0, mtime1: st.mtimeMs, size0, size1: st.size });
    const z = zipHas(marker, demo);
    assert(z.ok, 'marker missing in zip', { out: z.out, logs: logs.slice(-8) });
  });

  await t('AutoSave OFF → draft only, file not rewritten with new marker', async () => {
    const marker = 'AUTOSAVEOFF' + Date.now();
    const mBefore = fs.statSync(demo).mtimeMs;
    const res = await page.evaluate(async (marker) => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(false, { silent: true });
      M.State.editor.commands.insertContent('<p>' + marker + '</p>');
      M.State.currentFile.dirty = true;
      M.State.currentFile.dirtyGen = (M.State.currentFile.dirtyGen || 0) + 1;
      const wr = await M.autosaveNow();
      return { wr, dirty: !!M.State.currentFile.dirty, auto: M.getAutoSaveEnabled() };
    }, marker);
    assert(res.auto === false, 'auto still on');
    assert(res.dirty === true, 'should stay dirty when OFF');
    assert(!(res.wr && res.wr.disk), 'must not disk-write when OFF', res.wr);
    await page.waitForTimeout(300);
    const z = zipHas(marker, demo);
    assert(!z.ok, 'OFF must not put marker on disk', z.out);
    // mtime may equal; should not require growth
    void mBefore;
  });

  await t('AutoSave ON again flushes remaining dirty to disk', async () => {
    // turn ON while still dirty from previous test
    const mBefore = fs.statSync(demo).mtimeMs;
    const res = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // ensure dirty content exists
      const marker = 'AUTOSAVEFLUSH' + Date.now();
      M.State.editor.commands.insertContent('<p>' + marker + '</p>');
      M.State.currentFile.dirty = true;
      M.setAutoSaveEnabled(true, { silent: true });
      const wr = await M.autosaveNow();
      return { wr, dirty: !!M.State.currentFile.dirty, marker };
    });
    assert(res.wr && res.wr.ok && res.wr.disk, 'flush failed', res.wr);
    assert(res.dirty === false, 'dirty after flush');
    await page.waitForTimeout(400);
    assert(fs.statSync(demo).mtimeMs >= mBefore, 'mtime');
    const z = zipHas(res.marker, demo);
    assert(z.ok, 'flush marker missing', z.out);
  });

  await t('no disk target → draft only, no throw', async () => {
    const res = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(true, { silent: true });
      try {
        if (typeof M.clearExternalWatchSource === 'function') M.clearExternalWatchSource();
      } catch (_) {
        M.State.externalWatchPath = '';
        M.State.externalWatchToken = '';
      }
      const ghost = 'ghost-no-such-' + Date.now() + '.mentor';
      if (M.State.currentFile) {
        M.State.currentFile.path = '';
        M.State.currentFile.handle = null;
        M.State.currentFile.name = ghost;
      }
      M.State.diskPathHint = ghost;
      M.State.saveMode = 'mentor-download';
      // prevent basename resolve from previous real file
      try { M.State.externalWatchPath = ''; } catch (_) {}
      M.State.currentFile.dirty = true;
      M.State.currentFile.dirtyGen = (M.State.currentFile.dirtyGen || 0) + 1;
      const wr = await M.autosaveNow();
      return {
        wr,
        dirty: !!M.State.currentFile.dirty,
        hasTarget: M.hasDiskWriteTarget(),
        path: (M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath()) || M.State.externalWatchPath || '',
      };
    });
    assert(res.hasTarget === false, 'should have no target', res);
    assert(res.dirty === true, 'stay dirty without target');
    assert(!(res.wr && res.wr.disk), 'no disk without target', res.wr);
    assert(res.wr && (res.wr.ok === true || res.wr.skipped || res.wr.draft), 'should draft-ok', res.wr);
  });

  await browser.close();
  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  if (logs.length) {
    console.log('autosave logs:', logs.slice(-12));
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
