/**
 * enableWriteBackForCurrent + disk target after mocked Save picker.
 */
const { chromium } = require('playwright');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:8787/index.html?auth=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__mdAnnotator?.State?.editor, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  const r = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    // suppress background autosave races during setup
    M.setAutoSaveEnabled(false, { silent: true });
    if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
    M.loadMarkdownIntoEditor('auth-me.md', '# A\n\nbody\n', null);
    M.State.editor.commands.insertContent('x');

    let wrote = 0;
    let lastModified = 1_700_000_000_000;
    const fakeHandle = {
      name: 'auth-me.mentor',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => ({
        write: async () => { wrote++; lastModified += 1000; },
        close: async () => {},
        abort: async () => {},
      }),
      getFile: async () => ({ lastModified, name: 'auth-me.mentor' }),
    };
    window.showSaveFilePicker = async () => fakeHandle;
    window.showOpenFilePicker = async () => { throw new Error('should use save picker'); };

    const up = await M.enableWriteBackForCurrent({ thenSave: true, preferSavePicker: true });
    M.setAutoSaveEnabled(true, { silent: true });
    const disk = M.isAutoSaveDiskActive();
    const has = M.hasDiskWriteTarget();
    const dirty1 = !!M.State.currentFile.dirty;
    const wrote1 = wrote;

    // Force dirty + explicit autosave (editor update may not mark dirty in evaluate)
    M.State.currentFile.dirty = true;
    M.State.currentFile.dirtyGen = (M.State.currentFile.dirtyGen || 0) + 1;
    M.State.editor.commands.insertContent('y');
    const ar = await M.autosaveNow();
    return {
      upOk: !!(up && up.ok),
      saveOk: !!(up && up.saveResult && up.saveResult.ok),
      disk, has, dirty1, wrote1,
      arOk: !!(ar && ar.ok),
      arDisk: !!(ar && ar.disk),
      wrote2: wrote,
      name: M.State.currentFile.name,
      mode: M.State.saveMode,
      arErr: ar && (ar.error || ar.message) || null,
    };
  });

  assert(r.upOk, 'enableWriteBack ok ' + JSON.stringify(r));
  assert(r.saveOk, 'thenSave wrote');
  assert(r.has && r.disk, 'disk target active after authorize');
  assert(r.dirty1 === false, 'clean after authorize save');
  assert(r.wrote1 >= 1, 'first write happened');
  assert(r.arOk, 'autosave returned ok ' + JSON.stringify(r));
  assert(r.arDisk || r.wrote2 > r.wrote1, 'autosave hit disk ' + JSON.stringify(r));
  assert(/auth-me\.mentor$/i.test(r.name), 'renamed to .mentor');

  console.log('PASS e2e-authorize-writeback', r);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
