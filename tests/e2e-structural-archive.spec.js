/**
 * Structural archive (document.html + manifest.json) e2e
 * Run: node tests/e2e-structural-archive.spec.js
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html?structural=${Date.now()}`;

const results = [];
function ok(name, info) {
  results.push({ name, ok: true });
  console.log('PASS', name, info || '');
}
function bad(name, err) {
  results.push({ name, ok: false });
  console.error('FAIL', name, err && err.stack ? err.stack : err);
}

async function waitEditor(page) {
  await page.waitForFunction(() => !!(window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor), null, { timeout: 30000 });
}

async function ensureServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/index.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function run() {
  if (!(await ensureServer())) {
    console.error('Mentor server not running on 8787');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[PAGEERR]', e.message));

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitEditor(page);

    // blank tab so we never touch user docs
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (typeof M.openNewTabBlank === 'function') M.openNewTabBlank();
    });
    await page.waitForTimeout(200);

    // --- build/read verified structural package ---
    try {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        const html = '<p><span data-thread-id="t1" class="annotation-mark" data-resolved="false">A</span></p>';
        const blob = await M.buildMentorZipBlob(
          '# A',
          { version: '1', annotations: [] },
          {},
          { version: 1, entries: [] },
          { documentHtml: html },
        );
        const file = new File([blob], 'structural.mentor', { type: 'application/zip' });
        const parsed = await M.readMentorZip(file);
        return {
          usable: !!(parsed.archive && parsed.archive.verification && parsed.archive.verification.usable),
          reason: parsed.archive && parsed.archive.verification && parsed.archive.verification.reason,
          html: parsed.archive && parsed.archive.documentHtml,
          md: parsed.mdText,
        };
      });
      if (!r.usable || r.reason !== 'verified' || r.html !== '<p><span data-thread-id="t1" class="annotation-mark" data-resolved="false">A</span></p>' || r.md !== '# A') {
        throw new Error(JSON.stringify(r));
      }
      ok('build-read-verified-structural', r.reason);
    } catch (e) {
      bad('build-read-verified-structural', e);
    }

    // --- mismatch / missing reasons ---
    try {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
        // Use in-page path: build good, then mutate via read of hand-built blobs using main APIs only.
        // Build with worker/main then re-pack with state media not needed — craft via build then File.
        async function pack(files) {
          // abuse build then we can't easily mutate; use Response/File from arrayBuffer via custom zip in browser
          const zip = new (window.JSZip || globalThis.JSZip)();
          // JSZip may be module-scoped; fall back to M path only.
          return null;
        }
        // Build verified then open path for missing: plain legacy without html
        const legacyBlob = await M.buildMentorZipBlob('# L', { version: '1', annotations: [] }, {}, { version: 1, entries: [] });
        const legacy = await M.readMentorZip(new File([legacyBlob], 'legacy.mentor'));
        // For mismatch, use modules helper if available
        const arch = M.modules.mentorArchive;
        const goodHtml = '<p>A</p>';
        const anns = '{"annotations":[]}';
        const goodMan = await arch.createArchiveManifest({ mdText: '# A', annotationsText: anns, documentHtml: goodHtml });
        const staleMd = await arch.verifyStructuralArchive({ mdText: '# changed', annotationsText: anns, documentHtml: goodHtml, manifest: goodMan });
        const missing = await arch.verifyStructuralArchive({ mdText: '# A', annotationsText: anns, documentHtml: goodHtml, manifest: null });
        return {
          legacyReason: legacy.archive && legacy.archive.verification && legacy.archive.verification.reason,
          legacyHtml: legacy.archive && legacy.archive.documentHtml,
          staleMd: staleMd.reason,
          missing: missing.reason,
        };
      });
      if (r.legacyReason !== 'manifest-missing' || r.legacyHtml !== null) throw new Error('legacy ' + JSON.stringify(r));
      if (r.staleMd !== 'content-md-mismatch') throw new Error('stale ' + JSON.stringify(r));
      if (r.missing !== 'manifest-missing') throw new Error('missing ' + JSON.stringify(r));
      ok('verification-reasons', JSON.stringify(r));
    } catch (e) {
      bad('verification-reasons', e);
    }

    // --- save snapshot includes documentHtml without spans in md ---
    try {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        M.openNewTabBlank();
        M.loadMarkdownIntoEditor('snap.mentor', 'hello world unique token here', { version: '1', annotations: [] }, { alreadyPrepared: true, saveMode: 'mentor-download' });
        // create annotation on unique token
        const ed = M.State.editor;
        const plain = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
        const idx = plain.indexOf('unique token');
        // map plain offset roughly via findAnnotationRange
        const pos = M.findAnnotationRange(ed.state.doc, { text: 'unique token', prefix: 'hello world ', suffix: ' here' });
        if (!pos || pos.from == null) return { err: 'no pos' };
        M._testCreateAnnotation ? M._testCreateAnnotation(pos.from, pos.to, 'unique token') : M.createAnnotationThread(pos.from, pos.to, 'unique token', { text: 'unique token' });
        // ensure mark exists
        const snap = M.createSaveSnapshot();
        const blob = await M.buildMentorZipBlob(snap.mdText, snap.sidecar, snap.mediaFiles, snap.references, { documentHtml: snap.documentHtml });
        const parsed = await M.readMentorZip(new File([blob], 'snap.mentor'));
        return {
          hasHtmlField: typeof snap.documentHtml === 'string',
          htmlHasThread: /data-thread-id=/.test(snap.documentHtml || ''),
          mdHasThread: /data-thread-id=/.test(snap.mdText || ''),
          verified: parsed.archive && parsed.archive.verification && parsed.archive.verification.reason,
          annCount: (snap.sidecar.annotations || []).length,
        };
      });
      if (r.err) throw new Error(r.err);
      if (!r.hasHtmlField || !r.htmlHasThread || r.mdHasThread || r.verified !== 'verified' || r.annCount < 1) {
        throw new Error(JSON.stringify(r));
      }
      ok('snapshot-documentHtml', JSON.stringify(r));
    } catch (e) {
      bad('snapshot-documentHtml', e);
    }

    // --- hard block on range mismatch ---
    try {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const anns = M.State.annotations || [];
        if (!anns.length) return { err: 'no ann' };
        const bak = anns[0].range ? { ...anns[0].range } : null;
        anns[0].range = { from: 1, to: 2 };
        let threw = false;
        let msg = '';
        try {
          M.createSaveSnapshot();
        } catch (e) {
          threw = true;
          msg = e && e.message || String(e);
        }
        if (bak) anns[0].range = bak;
        return { threw, msg };
      });
      if (r.err) throw new Error(r.err);
      if (!r.threw || !/不一致|停止保存|锚点/.test(r.msg)) throw new Error(JSON.stringify(r));
      ok('hard-block-range-mismatch', r.msg);
    } catch (e) {
      bad('hard-block-range-mismatch', e);
    }

    // --- open verified: restoreMode html, resolve count 0 ---
    try {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        M.openNewTabBlank();
        const md = 'ALPHA one\n\nBETA two\n\nGAMMA three\n\nDELTA four';
        M.loadMarkdownIntoEditor('dup.mentor', md, { version: '1', annotations: [] }, { alreadyPrepared: true, saveMode: 'mentor-download' });
        const ed = M.State.editor;
        const findWord = (w) => {
          let hit = null;
          ed.state.doc.descendants((node, pos) => {
            if (hit || !node.isText || !node.text) return;
            const j = node.text.indexOf(w);
            if (j >= 0) hit = { from: pos + j, to: pos + j + w.length, text: w };
          });
          return hit;
        };
        const p1 = findWord('BETA');
        const p2 = findWord('DELTA');
        if (!p1 || !p2) return { err: 'need BETA/DELTA', p1, p2 };
        const mk = (pp) => {
          if (M._testCreateAnnotation) return M._testCreateAnnotation(pp.from, pp.to, pp.text);
          return M.createAnnotationThread(pp.from, pp.to, pp.text, { text: pp.text });
        };
        mk(p1);
        mk(p2);
        const snap = M.createSaveSnapshot();
        const blob = await M.buildMentorZipBlob(snap.mdText, snap.sidecar, snap.mediaFiles, snap.references, { documentHtml: snap.documentHtml });
        M.__resetAnchorResolveCount();
        await M.openFromMentorFile(new File([blob], 'dup-round.mentor'), { quiet: true, forceDisk: true });
        const after = M.__anchorResolveCount();
        const diag = M.exportAnchorDiagnosis();
        const marks = [];
        const mt = M.State.editor.schema.marks.annotation;
        M.State.editor.state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          for (const m of node.marks || []) {
            if (m.type === mt) marks.push({ id: m.attrs.threadId, from: pos, to: pos + node.nodeSize, text: node.text });
          }
        });
        return {
          resolveCalls: after,
          restoreMode: diag.archive && diag.archive.restoreMode,
          reason: diag.archive && diag.archive.verification && diag.archive.verification.reason,
          markCount: marks.length,
          annCount: (M.State.annotations || []).length,
          texts: marks.map((m) => m.text),
          healthy: diag.healthy,
        };
      });
      if (r.err) throw new Error(JSON.stringify(r));
      if (r.resolveCalls !== 0 || r.restoreMode !== 'html' || r.reason !== 'verified' || r.markCount < 2 || r.annCount < 2) {
        throw new Error(JSON.stringify(r));
      }
      ok('open-html-no-resolve', JSON.stringify(r));
    } catch (e) {
      bad('open-html-no-resolve', e);
    }

    // --- stale content.md mismatch falls back ---
    try {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        // Take last good snap path: rebuild verified, then mutate zip using JSZip from window if present
        M.openNewTabBlank();
        M.loadMarkdownIntoEditor('stale.mentor', 'alpha UNIQUE beta', { version: '1', annotations: [] }, { alreadyPrepared: true });
        const ed = M.State.editor;
        const pos = M.findAnnotationRange(ed.state.doc, { text: 'UNIQUE', prefix: 'alpha ', suffix: ' beta' });
        if (M._testCreateAnnotation) M._testCreateAnnotation(pos.from, pos.to, 'UNIQUE');
        else M.createAnnotationThread(pos.from, pos.to, 'UNIQUE', { text: 'UNIQUE' });
        const snap = M.createSaveSnapshot();
        const blob = await M.buildMentorZipBlob(snap.mdText, snap.sidecar, snap.mediaFiles, snap.references, { documentHtml: snap.documentHtml });
        // mutate content.md via dynamic import of jszip from same origin worker copy is hard;
        // instead use modules verify + open with forced markdown path by stripping usable html through read of legacy.
        // Build a package with mismatched hashes by calling build then replacing via ArrayBuffer + JSZip from node is external.
        // In page: use FileReader path through M.modules only — craft zip with globalThis from worker boot not available.
        // Fallback test: open with structuralHtml null after read of intentionally broken archive using finish path.
        // Simulate by calling loadMarkdown with unusable verification.
        M.__resetAnchorResolveCount();
        M.loadMarkdownIntoEditor('stale2.mentor', 'alpha UNIQUE beta CHANGED', snap.sidecar, {
          alreadyPrepared: true,
          structuralHtml: snap.documentHtml,
          archiveVerification: { usable: false, reason: 'content-md-mismatch' },
        });
        const diag = M.exportAnchorDiagnosis();
        return {
          mode: M.State._archiveRestoreMode,
          reason: diag.archive && diag.archive.verification && diag.archive.verification.reason,
          resolveCalls: M.__anchorResolveCount(),
        };
      });
      if (r.mode !== 'markdown-fallback' || r.reason !== 'content-md-mismatch') throw new Error(JSON.stringify(r));
      ok('stale-html-fallback', JSON.stringify(r));
    } catch (e) {
      bad('stale-html-fallback', e);
    }

    // --- sanitizeStructuralHtml strips active content ---
    try {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const dirty = '<p onclick="alert(1)">x</p><script>evil()</script><p>ok</p>';
        const clean = M.sanitizeStructuralHtml(dirty);
        return {
          hasScript: /<script/i.test(clean),
          hasOnclick: /onclick/i.test(clean),
          hasOk: /ok/.test(clean),
        };
      });
      if (r.hasScript || r.hasOnclick || !r.hasOk) throw new Error(JSON.stringify(r));
      ok('sanitize-structural-html', JSON.stringify(r));
    } catch (e) {
      bad('sanitize-structural-html', e);
    }

    // --- legacy open + save upgrades to structural ---
    try {
      const r = await page.evaluate(async () => {
        const M = window.__mdAnnotator;
        M.openNewTabBlank();
        const legacyBlob = await M.buildMentorZipBlob(
          'legacy TOKEN body',
          { version: '1', annotations: [] },
          {},
          { version: 1, entries: [] }
        );
        await M.openFromMentorFile(new File([legacyBlob], 'legacy-up.mentor'), { quiet: true, forceDisk: true });
        const before = M.exportAnchorDiagnosis();
        const ed = M.State.editor;
        const pos = M.findAnnotationRange(ed.state.doc, { text: 'TOKEN', prefix: 'legacy ', suffix: ' body' });
        if (M._testCreateAnnotation) M._testCreateAnnotation(pos.from, pos.to, 'TOKEN');
        else M.createAnnotationThread(pos.from, pos.to, 'TOKEN', { text: 'TOKEN' });
        const snap = M.createSaveSnapshot();
        const upgraded = await M.buildMentorZipBlob(snap.mdText, snap.sidecar, snap.mediaFiles, snap.references, { documentHtml: snap.documentHtml });
        const parsed = await M.readMentorZip(new File([upgraded], 'legacy-up2.mentor'));
        return {
          beforeMode: before.archive && before.archive.restoreMode,
          beforeReason: before.archive && before.archive.verification && before.archive.verification.reason,
          hasHtml: typeof snap.documentHtml === 'string' && /data-thread-id=/.test(snap.documentHtml),
          afterReason: parsed.archive && parsed.archive.verification && parsed.archive.verification.reason,
          afterUsable: !!(parsed.archive && parsed.archive.verification && parsed.archive.verification.usable),
        };
      });
      if (r.beforeReason !== 'manifest-missing' || !r.hasHtml || r.afterReason !== 'verified' || !r.afterUsable) {
        throw new Error(JSON.stringify(r));
      }
      ok('legacy-upgrade-on-save', JSON.stringify(r));
    } catch (e) {
      bad('legacy-upgrade-on-save', e);
    }

// --- diagnosis fields ---
    try {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const d = M.exportAnchorDiagnosis();
        return !!(d.archive && typeof d.archive.restoreMode === 'string');
      });
      if (!r) throw new Error('no archive on diagnosis');
      ok('diagnosis-archive-fields');
    } catch (e) {
      bad('diagnosis-archive-fields', e);
    }

  } finally {
    await browser.close();
  }

  const pass = results.filter((x) => x.ok).length;
  const fail = results.length - pass;
  console.log(`TOTAL ${results.length} PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
