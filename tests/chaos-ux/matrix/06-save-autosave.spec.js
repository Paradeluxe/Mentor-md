/**
 * Save / autosave behavioral matrix (S8) — extends unit tests with UI paths.
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('../harness');
const { DOCS } = require('../content-catalog');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/06-save-autosave ===');
  await boot(page);
  const { t, done } = createRunner(page, '06-save');

  await t('hasWriteHandle false in download mode', async () => {
    await loadDoc(page, 'save1.md', DOCS.simple);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        mode: M.State.saveMode,
        has: typeof M.hasWriteHandle === 'function' ? M.hasWriteHandle() : null,
      };
    });
    if (r.has === true) throw new Error('download should not write handle: ' + JSON.stringify(r));
  });

  await t('dirtyGen increments on markDirty', async () => {
    await loadDoc(page, 'save2.md', DOCS.simple);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const g0 = M.State.currentFile.dirtyGen || 0;
      // markDirty may not be exported — use editor insert
      if (typeof M.markDirty === 'function') {
        M.markDirty();
        M.markDirty();
      } else {
        M.State.editor.commands.insertContent('!');
        M.State.editor.commands.insertContent('!');
      }
      return { g0, g1: M.State.currentFile.dirtyGen, dirty: M.State.currentFile.dirty };
    });
    if (!r.dirty || r.g1 <= r.g0) throw new Error(JSON.stringify(r));
  });

  await t('writeCurrentToHandle mid-edit keeps dirty (dirtyGen)', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let resolveWrite;
      const gate = new Promise((res) => {
        resolveWrite = res;
      });
      M.State.saveMode = 'mentor-handle';
      M.State.diskPathHint = '';
      M.State.mediaFiles = {};
      M.State.currentFile = {
        name: 'race.mentor',
        dirty: true,
        dirtyGen: 10,
        handle: {
          queryPermission: async () => 'granted',
          createWritable: async () => ({
            write: async () => {
              await gate;
            },
            close: async () => {},
            abort: async () => {},
          }),
          getFile: async () => ({ lastModified: Date.now() }),
        },
      };
      M.State.editor.commands.setContent('<p>v1</p>', false);
      const p = M.writeCurrentToHandle({ reason: 'autosave' });
      M.State.currentFile.dirty = true;
      M.State.currentFile.dirtyGen = 11;
      resolveWrite();
      const res = await p;
      return { ok: res.ok, dirty: M.State.currentFile.dirty, gen: M.State.currentFile.dirtyGen };
    });
    if (!r.ok || !r.dirty || r.gen !== 11) throw new Error(JSON.stringify(r));
    coverage.hitContent('X4');
  });

  await t('autosave skips without granted permission', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let creates = 0;
      M.State.saveMode = 'mentor-handle';
      M.State.currentFile = {
        name: 'noperm.mentor',
        dirty: true,
        dirtyGen: 1,
        handle: {
          queryPermission: async () => 'prompt',
          requestPermission: async () => {
            throw new Error('should not request');
          },
          createWritable: async () => {
            creates++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      await M.autosaveNow();
      return { creates, dirty: M.State.currentFile.dirty };
    });
    if (r.creates !== 0 || !r.dirty) throw new Error(JSON.stringify(r));
  });

  await t('single-flight second write busy', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let resolveWrite;
      const gate = new Promise((res) => {
        resolveWrite = res;
      });
      let creates = 0;
      const handle = {
        queryPermission: async () => 'granted',
        createWritable: async () => {
          creates++;
          return {
            write: async () => {
              await gate;
            },
            close: async () => {},
            abort: async () => {},
          };
        },
      };
      const p1 = M.writeToHandle(handle, 'x');
      const p2 = M.writeToHandle(handle, 'y');
      const r2 = await p2;
      resolveWrite();
      const r1 = await p1;
      return { r1: r1.ok, r2skipped: !!r2.skipped, creates };
    });
    if (!r.r1 || !r.r2skipped || r.creates !== 1) throw new Error(JSON.stringify(r));
  });

  await t('annotate then Ctrl+S download mode no crash', async () => {
    await loadDoc(page, 'save3.md', DOCS.simple);
    await annotateText(page, 'UNIQUE_ALPHA', { body: 's' });
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(150);
    const pe = page._chaosPageErrors || [];
    if (pe.length) throw new Error(pe.join('; '));
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
