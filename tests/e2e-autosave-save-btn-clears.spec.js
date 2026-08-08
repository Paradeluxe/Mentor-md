/**
 * Regression: AutoSave ON + open .mentor + edit must clear #btn-save dirty
 * after debounce — even if startAutosaveTimer restarts mid-debounce (open /
 * live-sync owner role). Manual Save must not be required.
 *
 * Run: mentor-server :8787, then
 *   node tests/e2e-autosave-save-btn-clears.spec.js
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
        print('HAS', mark in md)
        break
else:
    print('HAS False')
`;
  const out = execFileSync('python', ['-c', py, filePath, marker], { encoding: 'utf-8' });
  return /HAS True/.test(out);
}

function assert(cond, msg, extra) {
  if (!cond) throw new Error(msg + (extra ? ' ' + JSON.stringify(extra) : ''));
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

  console.log('=== e2e-autosave-save-btn-clears ===');
  const sess = await (await fetch(BASE + '/session')).json();
  assert(sess && sess.token, 'session', sess);
  const token = sess.token;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-btn-'));
  const demo = path.join(tmp, 'autosave-btn-clears.mentor');
  fs.copyFileSync(path.resolve('examples/supervision-pet-demo.mentor'), demo);
  const mtime0 = fs.statSync(demo).mtimeMs;

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
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/autosave|write-server|disk/i.test(t)) logs.push(t.slice(0, 200));
  });
  await page.goto(BASE + '/index.html?asbtn=' + Date.now(), {
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
        if (M.resolveActiveMentorAbsPath) {
          const p = M.resolveActiveMentorAbsPath();
          if (p) return p;
        }
      } catch (_) {}
      return M.State.externalWatchPath || (M.State.currentFile && M.State.currentFile.path) || '';
    });
    if (pathAbs && /autosave-btn-clears\.mentor$/i.test(pathAbs)) break;
    await page.waitForTimeout(200);
  }

  await t('pending-open binds path', async () => {
    assert(/autosave-btn-clears\.mentor$/i.test(pathAbs), 'path', { pathAbs });
  });

  await t('edit + timer restarts still clears dirty/save btn via debounce', async () => {
    const marker = 'BTNCLEAR' + Date.now();
    const setup = await page.evaluate((marker) => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(true, { silent: true });
      // Short debounce for the gate (allowed value).
      if (typeof M.setAutosaveDebounce === 'function') {
        // setAutosaveDebounce toasts; still OK in headless
        try { M.setAutosaveDebounce(1000); } catch (_) {}
      }
      try { M.State.readOnlyMode = false; } catch (_) {}
      M.State.editor.commands.focus('end');
      M.State.editor.commands.insertContent('<p>' + marker + '</p>');
      // Simulate open/live-sync re-arming the interval while debounce is pending.
      // Pre-fix: startAutosaveTimer() called stopAutosaveTimer() and wiped _t.
      try { M.startAutosaveTimer(); } catch (_) {}
      try { M.startAutosaveTimer(); } catch (_) {}
      return {
        dirty: !!M.State.currentFile.dirty,
        btnDirty: document.querySelector('#btn-save')?.dataset?.dirty,
        hasTarget: M.hasDiskWriteTarget(),
        auto: M.getAutoSaveEnabled(),
        diskActive: M.isAutoSaveDiskActive(),
        debounce: M.AUTOSAVE_DEBOUNCE,
      };
    }, marker);

    assert(setup.dirty === true, 'should be dirty after edit', setup);
    assert(setup.btnDirty === 'true', 'save btn lit after edit', setup);
    assert(setup.hasTarget === true, 'no disk target', setup);
    assert(setup.auto === true, 'auto off', setup);
    assert(setup.diskActive === true, 'disk inactive', setup);

    // Wait debounce (1s) + write budget
    let last = null;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(250);
      last = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        return {
          dirty: !!M.State.currentFile.dirty,
          btnDirty: document.querySelector('#btn-save')?.dataset?.dirty,
          indicator: document.querySelector('#dirty-indicator')?.classList.contains('is-dirty'),
          tabDirty: !!(M.State.tabs || []).find((t) => t && t.id === M.State.activeTabId)?.dirty,
          status: (document.querySelector('#status-text') && document.querySelector('#status-text').textContent) || '',
        };
      });
      if (!last.dirty && last.btnDirty === 'false' && !last.indicator && !last.tabDirty) break;
    }

    assert(last && last.dirty === false, 'still dirty after debounce', last);
    assert(last.btnDirty === 'false', 'save btn still lit', last);
    assert(last.indicator === false, 'dirty indicator still on', last);
    assert(last.tabDirty === false, 'tab still dirty', last);

    await page.waitForTimeout(400);
    const st = fs.statSync(demo);
    assert(st.mtimeMs > mtime0, 'mtime not updated', { mtime0, mtime1: st.mtimeMs });
    assert(zipHas(marker, demo), 'marker missing on disk', { marker, logs: logs.slice(-10) });
  });

  await t('second edit also clears without manual save', async () => {
    const marker = 'BTNCLEAR2' + Date.now();
    const mBefore = fs.statSync(demo).mtimeMs;
    await page.evaluate((marker) => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.focus('end');
      M.State.editor.commands.insertContent('<p>' + marker + '</p>');
      try { M.startAutosaveTimer(); } catch (_) {}
    }, marker);
    let last = null;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(250);
      last = await page.evaluate(() => ({
        dirty: !!window.__mdAnnotator.State.currentFile.dirty,
        btnDirty: document.querySelector('#btn-save')?.dataset?.dirty,
      }));
      if (!last.dirty && last.btnDirty === 'false') break;
    }
    assert(last && !last.dirty && last.btnDirty === 'false', 'second edit stuck dirty', last);
    await page.waitForTimeout(300);
    assert(zipHas(marker, demo), 'second marker missing', { marker });
    assert(fs.statSync(demo).mtimeMs >= mBefore, 'mtime2');
  });

  await browser.close();
  console.log(`\n=== RESULT: ${pass} pass / ${fail} fail ===`);
  console.log('autosave logs:', logs.slice(-12));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
