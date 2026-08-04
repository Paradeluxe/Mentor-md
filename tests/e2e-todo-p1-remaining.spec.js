/**
 * TODO residual: IDB atomic body+ann draft, serial write queue,
 * HandleStore UUID key, inverse-patch history, incremental validate,
 * DecorationSet active highlight, product surface.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8793;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

async function waitForServer(url, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('server not ready: ' + url);
}

(async () => {
  const server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: true,
  });
  let failed = 0;
  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, err) => {
    failed++;
    results.push({ name, ok: false, err: String(err && err.message || err) });
    console.error('FAIL', name, err);
  };

  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => console.warn('pageerror', e.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 25000 });

    // --- modules exported ---
    try {
      const mods = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        return {
          hasModules: !!(M.modules && M.modules.documentSession && M.modules.io && M.modules.annotations && M.modules.tabs),
          hasDraftStore: !!M.DraftStore,
          hasPutAtomic: typeof M.putAtomicDraftForCurrent === 'function',
          hasRestore: typeof M.restoreDraftIfAny === 'function',
          hasHandlePutById: typeof M.HandleStore.putFileById === 'function' || typeof M.HandleStore.putFile === 'function',
        };
      });
      assert(mods.hasModules, 'modules missing');
      assert(mods.hasDraftStore, 'DraftStore missing');
      assert(mods.hasPutAtomic, 'putAtomicDraftForCurrent missing');
      pass('modules-and-draft-api');
    } catch (e) {
      fail('modules-and-draft-api', e);
    }

    // --- IDB atomic body + ann restore (product path: activateOpenedDocument + reload) ---
    const crashDocId = 'test-draft-' + Date.now();
    const crashName = 'draft-crash.mentor';
    try {
      const idb = await page.evaluate(async ({ docId, name }) => {
        const M = window.__mdAnnotator;
        M.loadMarkdownIntoEditor(name, '# Hello\n\nBODY_ORIGINAL\n', null, {
          saveMode: 'download',
          documentId: docId,
        });
        M.State.currentFile.documentId = docId;
        M.State.editor.commands.setContent('<p>BODY_CRASH_RECOVERY_V2</p>', false);
        M.State.annotations = [
          {
            threadId: 't-draft-1',
            text: 'BODY_CRASH_RECOVERY_V2',
            prefix: '',
            suffix: '',
            resolved: false,
            createdAt: new Date().toISOString(),
            comments: [
              {
                id: 'c1',
                author: { id: 'a1', name: 'Tester' },
                body: 'note',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ];
        await M.putAtomicDraftForCurrent();
        const restored = await M.restoreDraftIfAny(docId, name);
        // serial queue: mutate between two enqueues; final must be note-2
        const p1 = M.putAtomicDraftForCurrent();
        M.State.annotations[0].comments[0].body = 'note-2';
        const p2 = M.putAtomicDraftForCurrent();
        await Promise.all([p1, p2]);
        const again = await M.DraftStore.getDraft(docId);
        // Product path: disk is stale, activateOpenedDocument must prefer draft into editor
        await M.activateOpenedDocument({
          name,
          content: '# Hello\n\nBODY_DISK_STALE\n',
          annotations: {
            version: '1',
            document: name,
            updatedAt: new Date().toISOString(),
            author: { id: 'a1', name: 'Tester' },
            annotations: [],
          },
          documentId: docId,
          saveMode: 'download',
          quiet: true,
          preferDraft: true,
        });
        const editorText = M.State.editor.state.doc.textContent || '';
        return {
          restoredBody: restored && restored.body,
          restoredAnn: restored && (restored.annotations || []).length,
          againAnnBody:
            again && again.annotations && again.annotations[0] && again.annotations[0].comments[0].body,
          documentId: restored && restored.documentId,
          editorText,
          editorAnnCount: (M.State.annotations || []).length,
          editorAnnBody:
            M.State.annotations[0] &&
            M.State.annotations[0].comments &&
            M.State.annotations[0].comments[0] &&
            M.State.annotations[0].comments[0].body,
        };
      }, { docId: crashDocId, name: crashName });
      assert(
        idb.restoredBody && /CRASH.?RECOVERY.?V2/i.test(String(idb.restoredBody).replace(/\\_/g, '_')),
        'body not restored: ' + JSON.stringify(idb.restoredBody)
      );
      assert(idb.restoredAnn === 1, 'ann count ' + idb.restoredAnn);
      assert(idb.documentId, 'documentId missing on draft');
      assert(idb.againAnnBody === 'note-2', 'serial write must end with note-2, got: ' + idb.againAnnBody);
      assert(
        /CRASH.?RECOVERY.?V2/i.test(String(idb.editorText).replace(/\\_/g, '_')),
        'editor body after activateOpenedDocument must use draft, got: ' + JSON.stringify(idb.editorText)
      );
      assert(!/BODY_DISK_STALE/.test(idb.editorText), 'stale disk body leaked into editor');
      assert(idb.editorAnnCount === 1, 'editor ann count after prefer-draft: ' + idb.editorAnnCount);
      assert(idb.editorAnnBody === 'note-2', 'editor ann body: ' + idb.editorAnnBody);
      pass('idb-atomic-body-ann');
    } catch (e) {
      fail('idb-atomic-body-ann', e);
    }

    // --- reload path: DraftStore preheat + activateOpenedDocument after page reload ---
    try {
      await page.evaluate(async ({ docId, name }) => {
        const M = window.__mdAnnotator;
        M.State.currentFile = M.State.currentFile || { name, documentId: docId, content: '', dirty: true };
        M.State.currentFile.documentId = docId;
        M.State.currentFile.name = name;
        M.State.editor.commands.setContent('<p>RELOAD_DRAFT_BODY_UNIQUE</p>', false);
        M.State.annotations = [
          {
            threadId: 't-reload-1',
            text: 'RELOAD_DRAFT_BODY_UNIQUE',
            prefix: '',
            suffix: '',
            resolved: false,
            createdAt: new Date().toISOString(),
            comments: [{ id: 'cr1', author: { id: 'a1', name: 'T' }, body: 'reload-note', createdAt: new Date().toISOString() }],
          },
        ];
        await M.putAtomicDraftForCurrent();
        sessionStorage.setItem('Mentor:testCrashDocId', docId);
        sessionStorage.setItem('Mentor:testCrashName', name);
      }, { docId: crashDocId + '-reload', name: 'reload-crash.mentor' });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 25000 });

      const afterReload = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        const docId = sessionStorage.getItem('Mentor:testCrashDocId');
        const name = sessionStorage.getItem('Mentor:testCrashName');
        // boot should preheat DraftStore into idbCache; also read DraftStore directly
        const draft = await M.restoreDraftIfAny(docId, name);
        await M.activateOpenedDocument({
          name,
          content: '# DISK_AFTER_RELOAD\n\nstale\n',
          annotations: {
            version: '1',
            document: name,
            updatedAt: new Date().toISOString(),
            author: { id: 'a1', name: 'T' },
            annotations: [],
          },
          documentId: docId,
          saveMode: 'download',
          quiet: true,
          preferDraft: true,
        });
        return {
          draftBody: draft && draft.body,
          draftAnn: draft && (draft.annotations || []).length,
          editorText: M.State.editor.state.doc.textContent || '',
          editorAnnCount: (M.State.annotations || []).length,
          annBody:
            M.State.annotations[0] &&
            M.State.annotations[0].comments &&
            M.State.annotations[0].comments[0] &&
            M.State.annotations[0].comments[0].body,
        };
      });
      assert(afterReload.draftBody && /RELOAD_DRAFT_BODY_UNIQUE/i.test(String(afterReload.draftBody).replace(/\\_/g, '_')),
        'draft missing after reload: ' + JSON.stringify(afterReload.draftBody));
      assert(/RELOAD_DRAFT_BODY_UNIQUE/i.test(String(afterReload.editorText).replace(/\\_/g, '_')),
        'editor after reload+open must restore draft body: ' + JSON.stringify(afterReload.editorText));
      assert(!/DISK_AFTER_RELOAD/.test(afterReload.editorText), 'disk content won after reload');
      assert(afterReload.editorAnnCount === 1, 'ann count after reload: ' + afterReload.editorAnnCount);
      assert(afterReload.annBody === 'reload-note', 'ann body after reload: ' + afterReload.annBody);
      pass('idb-draft-reload-open');
    } catch (e) {
      fail('idb-draft-reload-open', e);
    }

    // --- HandleStore UUID primary ---
    try {
      const hs = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        const docId = 'uuid-handle-' + Date.now();
        // Fake handle object (not a real FS handle) — store should still round-trip record
        const fake = { name: 'x.mentor', kind: 'file', _fake: true };
        await M.HandleStore.putFile('x.mentor', fake, docId);
        const byId = await M.HandleStore.getFile(docId);
        const byName = await M.HandleStore.getFile('x.mentor');
        const rec = await M.HandleStore.getFileRecord(docId);
        await M.HandleStore.deleteFile(docId);
        return {
          byIdFake: !!(byId && byId._fake),
          byNameFake: !!(byName && byName._fake),
          recId: rec && rec.documentId,
          recName: rec && rec.name,
        };
      });
      assert(hs.byIdFake, 'get by UUID failed');
      assert(hs.byNameFake, 'get by basename failed');
      assert(hs.recId && hs.recId.startsWith('uuid-handle-'), 'record documentId ' + hs.recId);
      pass('handlestore-uuid');
    } catch (e) {
      fail('handlestore-uuid', e);
    }

    // --- inverse patch history ---
    try {
      const hist = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        M.loadMarkdownIntoEditor('hist.md', 'hello world text here', null, { saveMode: 'download' });
        M.State.annotations = [];
        M.resetHistory ? M.resetHistory() : (M.State.history = { past: [], future: [], capacity: 100 });
        // ensure clean patch history
        M.State.history.past = [];
        M.State.history.future = [];
        M.State.history._checkpoint = null;
        M.State.history._prePush = null;
        M.pushHistory();
        M.State.annotations.push({
          threadId: 'h1',
          text: 'hello',
          prefix: '',
          suffix: '',
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [],
        });
        M.commitHistoryIfNeeded();
        const entry = M.State.history.past[M.State.history.past.length - 1];
        const isPatch = M.isPatchHistoryEntry(entry);
        const hasFullAnnArray = Array.isArray(entry && entry.annotations);
        const beforeUndo = M.State.annotations.length;
        M.undo2();
        const afterUndo = M.State.annotations.length;
        M.redo2();
        const afterRedo = M.State.annotations.length;
        return { isPatch, hasFullAnnArray, beforeUndo, afterUndo, afterRedo, entryKind: entry && entry.kind };
      });
      assert(hist.isPatch, 'entry not patch-shaped: ' + hist.entryKind);
      assert(!hist.hasFullAnnArray, 'entry still has full annotations array');
      assert(hist.beforeUndo === 1 && hist.afterUndo === 0 && hist.afterRedo === 1, JSON.stringify(hist));
      pass('inverse-patch-history');
    } catch (e) {
      fail('inverse-patch-history', e);
    }

    // --- incremental validate: far-apart marks — edit near A must not invalidate B ---
    try {
      const inc = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        // Two distant anchors: A near start, B near end
        const md =
          'ALPHA_MARK_HERE is at the start.\n\n' +
          'middle padding text that is long enough to separate ranges. '.repeat(8) +
          '\n\nOMEGA_MARK_HERE sits far away at the end.';
        M.loadMarkdownIntoEditor('val.md', md, null, { saveMode: 'download' });
        const ed = M.State.editor;
        const doc = ed.state.doc;
        const full = doc.textBetween(0, doc.content.size, '\n');
        const aIdx = full.indexOf('ALPHA_MARK_HERE');
        const bIdx = full.indexOf('OMEGA_MARK_HERE');
        // Map string index → PM pos (approx via textBetween search)
        function findRange(needle) {
          let found = null;
          doc.descendants((node, pos) => {
            if (found || !node.isText || !node.text) return;
            const i = node.text.indexOf(needle);
            if (i >= 0) found = { from: pos + i, to: pos + i + needle.length };
          });
          return found;
        }
        const rangeA = findRange('ALPHA_MARK_HERE');
        const rangeB = findRange('OMEGA_MARK_HERE');
        if (!rangeA || !rangeB) {
          return { error: 'ranges not found', aIdx, bIdx, fullLen: full.length };
        }
        M.State.annotations = [
          {
            threadId: 'mark-A',
            text: 'ALPHA_MARK_HERE',
            prefix: '',
            suffix: '',
            range: { from: rangeA.from, to: rangeA.to },
            resolved: false,
            invalid: false,
            fuzzy: false,
            createdAt: new Date().toISOString(),
            comments: [],
          },
          {
            threadId: 'mark-B',
            text: 'OMEGA_MARK_HERE',
            prefix: '',
            suffix: '',
            range: { from: rangeB.from, to: rangeB.to },
            resolved: false,
            invalid: false,
            fuzzy: false,
            createdAt: new Date().toISOString(),
            comments: [],
          },
        ];
        let tr = ed.state.tr;
        tr = tr.addMark(
          rangeA.from,
          rangeA.to,
          ed.schema.marks.annotation.create({ threadId: 'mark-A', resolved: false, authorColor: 0 })
        );
        tr = tr.addMark(
          rangeB.from,
          rangeB.to,
          ed.schema.marks.annotation.create({ threadId: 'mark-B', resolved: false, authorColor: 1 })
        );
        tr.setMeta('addToHistory', false);
        ed.view.dispatch(tr);

        // Light validate only around A (far from B)
        const changedNearA = [{ from: Math.max(0, rangeA.from - 2), to: rangeA.to + 2 }];
        M.State._lastChangedRanges = changedNearA;
        M._validateMarksAfterEdit(ed, { phase: 'light', changedRanges: changedNearA });
        const modeLight = M.State._validateScanMode;
        const annB = M.State.annotations.find((a) => a.threadId === 'mark-B');
        const annA = M.State.annotations.find((a) => a.threadId === 'mark-A');
        const bAfterLight = {
          invalid: !!(annB && annB.invalid),
          fuzzy: !!(annB && annB.fuzzy),
          deleted: !!(annB && annB.deleted),
          reason: annB && annB.invalidReason,
        };
        M._validateMarksAfterEdit(ed, { phase: 'full', changedRanges: null });
        const modeFull = M.State._validateScanMode;
        return {
          modeLight,
          modeFull,
          rangeA,
          rangeB,
          gap: rangeB.from - rangeA.to,
          bAfterLight,
          aInvalid: !!(annA && annA.invalid),
        };
      });
      assert(!inc.error, 'setup failed: ' + JSON.stringify(inc));
      assert(inc.modeLight === 'incremental', 'expected incremental light scan, got ' + inc.modeLight);
      assert(inc.modeFull === 'full', 'expected full scan, got ' + inc.modeFull);
      assert(inc.gap > 50, 'marks not far enough apart: gap=' + inc.gap);
      assert(inc.bAfterLight.invalid === false, 'B.invalid must stay false after light near A: ' + JSON.stringify(inc.bAfterLight));
      assert(inc.bAfterLight.fuzzy === false, 'B.fuzzy must stay false after light near A: ' + JSON.stringify(inc.bAfterLight));
      assert(inc.bAfterLight.deleted === false, 'B.deleted must stay false after light near A');
      assert(inc.bAfterLight.reason !== 'mark-missing', 'B must not get mark-missing from out-of-range scan');
      pass('incremental-validate');
    } catch (e) {
      fail('incremental-validate', e);
    }

    // --- DecorationSet active highlight ---
    try {
      const deco = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        M.State.activeThreadId = 'v1';
        M.highlightActiveMark();
        return {
          usedDeco: !!M.highlightActiveMark._usedDecorationSet,
          scanCount: M.highlightActiveMark._scanCount,
          hasPlugin: !!M.activeHighlightKey,
        };
      });
      assert(deco.usedDeco, 'DecorationSet path not used');
      assert(deco.scanCount === 1, 'expected single deco update path');
      assert(deco.hasPlugin, 'activeHighlightKey missing');
      pass('decorationset-active');
    } catch (e) {
      fail('decorationset-active', e);
    }

    // --- product: panes / ARIA / DOCX body-only ---
    try {
      const prod = await page.evaluate(() => {
        const outline = document.getElementById('file-pane');
        const comments = document.getElementById('comment-pane');
        const tabs = document.getElementById('doc-tabs');
        const dialog = document.getElementById('author-modal');
        const docx = document.getElementById('btn-export-docx');
        // toggle collapse
        document.body.classList.add('comment-pane-collapsed');
        document.body.classList.add('file-pane-collapsed');
        const collapsed =
          document.body.classList.contains('comment-pane-collapsed') &&
          document.body.classList.contains('file-pane-collapsed');
        document.body.classList.remove('comment-pane-collapsed');
        document.body.classList.remove('file-pane-collapsed');
        return {
          outlineRole: outline && outline.getAttribute('role'),
          outlineAria: outline && outline.getAttribute('aria-label'),
          commentRole: comments && comments.getAttribute('role'),
          tabsRole: tabs && tabs.getAttribute('role'),
          dialogRole: dialog && dialog.getAttribute('role'),
          docxMode: docx && docx.getAttribute('data-export-mode'),
          docxTitle: docx && docx.getAttribute('title'),
          collapsed,
          hasPointerResizer: !!document.querySelector('[data-pane-resize]'),
          hasToggleBar: !!(document.getElementById('pane-toggle-bar') || document.getElementById('btn-toggle-file-pane')),
        };
      });
      assert(prod.outlineRole === 'navigation' || prod.outlineRole === 'tabpanel', 'outline role');
      assert(prod.commentRole === 'complementary', 'comment role');
      assert(prod.tabsRole === 'tablist', 'tabs role');
      assert(prod.dialogRole === 'dialog', 'dialog role');
      assert(prod.docxMode === 'body-only' || prod.docxMode === 'comments-aware', 'docx body-only attr');
      assert(prod.docxTitle && /仅正文|body/i.test(prod.docxTitle), 'docx title label: ' + prod.docxTitle);
      assert(prod.collapsed, 'collapse classes');
      assert(prod.hasToggleBar, 'pane toggle bar');
      pass('p2-product-surface');
    } catch (e) {
      fail('p2-product-surface', e);
    }

    // --- pure module inverse patch unit via page ---
    try {
      const pure = await page.evaluate(() => {
        const { computeInverseAnnPatch, applyAnnPatch, isPatchHistoryEntry } = window.__mdAnnotator;
        const prev = [{ threadId: 'a', text: 'x', comments: [] }];
        const next = [
          { threadId: 'a', text: 'y', comments: [] },
          { threadId: 'b', text: 'z', comments: [] },
        ];
        const inv = computeInverseAnnPatch(prev, next);
        const back = applyAnnPatch(next, inv);
        return {
          ops: inv.ops.length,
          backLen: back.length,
          backText: back.find((t) => t.threadId === 'a')?.text,
          hasB: back.some((t) => t.threadId === 'b'),
          patchShape: isPatchHistoryEntry({ kind: 'inverse-patch', annPatch: inv }),
        };
      });
      assert(pure.ops >= 2, 'ops ' + pure.ops);
      assert(pure.backLen === 1 && pure.backText === 'x' && !pure.hasB, JSON.stringify(pure));
      assert(pure.patchShape, 'isPatchHistoryEntry');
      pass('pure-ann-patch');
    } catch (e) {
      fail('pure-ann-patch', e);
    }

    await browser.close();
  } finally {
    try {
      server.kill();
    } catch (_) {}
  }

  console.log('\n=== TODO residual results ===');
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.err ? ' — ' + r.err : ''));
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed) process.exit(1);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
