// v1.43.54 unified autosave / save path
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      fail++;
    }
  };

  console.log('=== v1.43.54 autosave simple ===');
  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now());
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  await t('APIs exported', async () => {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        return {
          has: typeof M.hasWriteHandle,
          write: typeof M.writeCurrentToHandle,
          low: typeof M.writeToHandle,
          auto: typeof M.autosaveNow,
          getAuto: typeof M.getAutoSaveEnabled,
          setAuto: typeof M.setAutoSaveEnabled,
          disk: typeof M.isAutoSaveDiskActive,
        };
      });
      if (r.has !== 'function' || r.write !== 'function' || r.low !== 'function' || r.auto !== 'function') {
        throw new Error(JSON.stringify(r));
      }
      if (r.getAuto !== 'function' || r.setAuto !== 'function' || r.disk !== 'function') {
        throw new Error('autoSave APIs ' + JSON.stringify(r));
      }
    });

  await t('hasWriteHandle only for handle modes', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.currentFile = { name: 'a.mentor', dirty: true, handle: { name: 'a.mentor' } };
      M.State.saveMode = 'mentor-handle';
      const a = M.hasWriteHandle();
      M.State.saveMode = 'mentor-download';
      const b = M.hasWriteHandle();
      M.State.saveMode = 'handle';
      const c = M.hasWriteHandle();
      M.State.currentFile.handle = null;
      const d = M.hasWriteHandle();
      return { a, b, c, d };
    });
    if (!r.a || r.b || !r.c || r.d) throw new Error(JSON.stringify(r));
  });

  await t('AutoSave OFF + handle → draft only, stays dirty', async () => {
        const r = await page.evaluate(async () => {
          const M = window.__mdAnnotator;
          M.setAutoSaveEnabled(false, { silent: true });
          let writes = 0;
          M.State.saveMode = 'mentor-handle';
          M.State.diskPathHint = '';
          M.State.mediaFiles = {};
          M.State.currentFile = {
            name: 'notes.mentor',
            dirty: true,
            dirtyGen: 1,
            handle: {
              queryPermission: async () => 'granted',
              requestPermission: async () => 'granted',
              createWritable: async () => {
                writes++;
                return { write: async () => {}, close: async () => {}, abort: async () => {} };
              },
              getFile: async () => ({ lastModified: Date.now() }),
            },
          };
          M.State.editor.commands.setContent('<p>hello autosave</p>', false);
          await M.autosaveNow();
          return {
            writes,
            dirty: M.State.currentFile.dirty,
            shouldPrompt: typeof M.shouldPromptUnload === 'function' ? M.shouldPromptUnload() : null,
            enabled: M.getAutoSaveEnabled(),
          };
        });
        if (r.enabled !== false) throw new Error('pref should be off');
        if (r.writes !== 0) throw new Error('writes=' + r.writes + ' (OFF must not touch disk)');
        if (r.dirty !== true) throw new Error('dirty=' + r.dirty);
        if (r.shouldPrompt !== true) throw new Error('shouldPromptUnload=' + r.shouldPrompt);
      });

    await t('AutoSave ON + handle → disk write and markClean', async () => {
        const r = await page.evaluate(async () => {
          const M = window.__mdAnnotator;
          M.setAutoSaveEnabled(true, { silent: true });
          let writes = 0;
          M.State.saveMode = 'mentor-handle';
          M.State.diskPathHint = '';
          M.State.mediaFiles = {};
          M.State.fileMtime = null;
          M.State.readOnlyMode = false;
          M.State.currentFile = {
            name: 'notes-on.mentor',
            dirty: true,
            dirtyGen: 5,
            handle: {
              queryPermission: async () => 'granted',
              requestPermission: async () => 'granted',
              createWritable: async () => {
                writes++;
                return { write: async () => {}, close: async () => {}, abort: async () => {} };
              },
              getFile: async () => ({ lastModified: Date.now() }),
            },
          };
          M.State.editor.commands.setContent('<p>hello disk autosave</p>', false);
          // keep dirty after setContent if onUpdate cleaned unexpectedly
          M.State.currentFile.dirty = true;
          const res = await M.autosaveNow();
          return {
            writes,
            dirty: M.State.currentFile.dirty,
            shouldPrompt: typeof M.shouldPromptUnload === 'function' ? M.shouldPromptUnload() : null,
            res,
            diskActive: M.isAutoSaveDiskActive(),
          };
        });
        if (!r.diskActive) throw new Error('diskActive false ' + JSON.stringify(r));
        if (r.writes < 1) throw new Error('writes=' + r.writes + ' (ON should write disk)');
        if (r.dirty !== false) throw new Error('dirty=' + r.dirty + ' (ON should markClean)');
        if (r.shouldPrompt !== false) throw new Error('shouldPromptUnload=' + r.shouldPrompt);
        if (!r.res || !r.res.ok || !r.res.disk) throw new Error('res ' + JSON.stringify(r.res));
      });

  await t('download mode autosave does not write', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(true, { silent: true });
      let writes = 0;
      M.State.saveMode = 'mentor-download';
      M.State.currentFile = {
        name: 'x.mentor',
        dirty: true,
        dirtyGen: 2,
        handle: {
          queryPermission: async () => 'granted',
          createWritable: async () => {
            writes++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      await M.autosaveNow();
      return { writes, dirty: M.State.currentFile.dirty };
    });
    if (r.writes !== 0) throw new Error('wrote in download mode');
    if (!r.dirty) throw new Error('should stay dirty');
  });

  await t('dirty=false autosave does not write', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let writes = 0;
      M.State.saveMode = 'mentor-handle';
      M.State.currentFile = {
        name: 'clean.mentor',
        dirty: false,
        dirtyGen: 3,
        handle: {
          queryPermission: async () => 'granted',
          createWritable: async () => {
            writes++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      await M.autosaveNow();
      return { writes };
    });
    if (r.writes !== 0) throw new Error('wrote when clean');
  });

  await t('dirtyGen: edit during manual save keeps dirty', async () => {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        let resolveWrite;
        const gate = new Promise((res) => { resolveWrite = res; });
        M.State.saveMode = 'mentor-handle';
        M.State.diskPathHint = '';
        M.State.mediaFiles = {};
        M.State.fileMtime = null;
        M.State.readOnlyMode = false;
        M.State.currentFile = {
          name: 'race.mentor',
          dirty: true,
          dirtyGen: 10,
          handle: {
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
            createWritable: async () => ({
              write: async () => { await gate; },
              close: async () => {},
              abort: async () => {},
            }),
            getFile: async () => ({ lastModified: Date.now() }),
          },
        };
        M.State.editor.commands.setContent('<p>v1</p>', false);
        const p = M.writeCurrentToHandle({ reason: 'manual' });
        // Simulate edit mid-save
        M.State.currentFile.dirty = true;
        M.State.currentFile.dirtyGen = 11;
        resolveWrite();
        const res = await p;
        return { ok: res.ok, dirty: M.State.currentFile.dirty, gen: M.State.currentFile.dirtyGen };
      });
      if (!r.ok) throw new Error('write failed');
      if (!r.dirty) throw new Error('should remain dirty after mid-edit');
      if (r.gen !== 11) throw new Error('gen ' + r.gen);
    });

  await t('single-flight: second write returns busy', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let resolveWrite;
      const gate = new Promise((res) => { resolveWrite = res; });
      let creates = 0;
      M.State.saveMode = 'mentor-handle';
      M.State.mediaFiles = {};
      M.State.currentFile = {
        name: 'busy.mentor',
        dirty: true,
        dirtyGen: 1,
        handle: {
          queryPermission: async () => 'granted',
          createWritable: async () => {
            creates++;
            return {
              write: async () => { await gate; },
              close: async () => {},
              abort: async () => {},
            };
          },
          getFile: async () => ({ lastModified: Date.now() }),
        },
      };
      M.State.editor.commands.setContent('<p>busy</p>', false);
      const p1 = M.writeToHandle(M.State.currentFile.handle, 'x');
      const p2 = M.writeToHandle(M.State.currentFile.handle, 'y');
      const r2 = await p2;
      resolveWrite();
      const r1 = await p1;
      return { r1: r1.ok, r2skipped: !!r2.skipped, r2err: r2.error, creates };
    });
    if (!r.r1) throw new Error('first should ok');
    if (!r.r2skipped || r.r2err !== 'busy') throw new Error(JSON.stringify(r));
    if (r.creates !== 1) throw new Error('creates=' + r.creates);
  });

  await t('autosave without permission does not call createWritable', async () => {
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
              throw new Error('should not request from autosave');
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
      if (r.creates !== 0) throw new Error('createWritable called without grant');
      if (!r.dirty) throw new Error('should stay dirty');
    });

      await t('AutoSave ON + server path (no handle) → writeCurrentViaServer', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.setAutoSaveEnabled(true, { silent: true });
      let serverCalls = 0;
      const origFetch = window.fetch;
      window.fetch = async (url, opts) => {
        const u = String(url);
        if (u.includes('/write-mentor')) {
          serverCalls++;
          return new Response(JSON.stringify({ ok: true, mtimeNs: Date.now() * 1e6 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('/allow-open')) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('/session')) {
          return new Response(JSON.stringify({ ok: true, token: 'test-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return origFetch(url, opts);
      };
      try {
        M.State.saveMode = 'mentor-download';
        M.State.mediaFiles = {};
        M.State.externalWatchToken = 'test-token';
        M.State.externalWatchPath = 'E:\\tmp\\autosave-path.mentor';
        M.State.diskPathHint = 'E:\\tmp\\autosave-path.mentor';
        M.State.currentFile = {
          name: 'autosave-path.mentor',
          dirty: true,
          dirtyGen: 1,
          path: 'E:\\tmp\\autosave-path.mentor',
          handle: null,
        };
        M.State.editor.commands.setContent('<p>server path autosave</p>', false);
        const disk = M.isAutoSaveDiskActive();
        const hasTarget = M.hasDiskWriteTarget();
        const wr = await M.autosaveNow();
        return {
          disk,
          hasTarget,
          wrOk: !!(wr && wr.ok),
          wrDisk: !!(wr && wr.disk),
          serverCalls,
          dirty: M.State.currentFile.dirty,
        };
      } finally {
        window.fetch = origFetch;
      }
    });
    if (!r.hasTarget) throw new Error('hasDiskWriteTarget false ' + JSON.stringify(r));
    if (!r.disk) throw new Error('isAutoSaveDiskActive false ' + JSON.stringify(r));
    if (!r.wrOk || !r.wrDisk) throw new Error('autosave disk fail ' + JSON.stringify(r));
    if (r.serverCalls < 1) throw new Error('no server write ' + JSON.stringify(r));
    if (r.dirty !== false) throw new Error('should markClean ' + JSON.stringify(r));
  });

  await t('shouldPromptUnload true when dirty, false when clean', async () => {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        if (typeof M.shouldPromptUnload !== 'function') return { missing: true };
        M.State.tabs = [];
        M.State.currentFile = { name: 'a.mentor', dirty: true };
        const a = M.shouldPromptUnload();
        M.State.currentFile.dirty = false;
        const b = M.shouldPromptUnload();
        M.State.currentFile = null;
        M.State.tabs = [{ id: 't1', name: 'b.mentor', dirty: true }];
        const c = M.shouldPromptUnload();
        M.State.tabs = [{ id: 't1', name: 'b.mentor', dirty: false }];
        const d = M.shouldPromptUnload();
        return { a, b, c, d };
      });
      if (r.missing) throw new Error('shouldPromptUnload not exported');
      if (!r.a || r.b || !r.c || r.d) throw new Error(JSON.stringify(r));
    });

    console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
