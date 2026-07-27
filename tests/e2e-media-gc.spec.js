/**
 * Media GC: unused media/* must not enter .mentor on save/build.
 * Run: node tests/e2e-media-gc.spec.js
 */
'use strict';

const { chromium } = require('playwright');
const http = require('http');
const path = require('path');

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html?mediagc=${Date.now()}`;

function tinyPng() {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
    144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 3, 0, 1, 0, 5,
    254, 210, 239, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
}

async function ensureServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/index.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

const results = [];
function ok(name, info) {
  results.push({ name, ok: true });
  console.log('PASS', name, info || '');
}
function bad(name, err) {
  results.push({ name, ok: false });
  console.error('FAIL', name, err && err.stack ? err.stack : err);
}

async function run() {
  if (!(await ensureServer())) {
    console.error('Mentor server not running on 8787');
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => !!(window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor),
      null,
      { timeout: 30000 },
    );

    // pure helpers
    try {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const refs = M.collectReferencedMediaPaths({
          mdText: '# t\n\n![a](media/keep.png)\n',
          html: '<p><img src="media/from-html.jpg"></p>',
          annotations: {
            annotations: [{ threadId: 't1', imageAnchors: [{ src: 'media/from-ann.webp', from: 1, to: 2 }] }],
          },
          mediaUrls: {},
          editor: null,
        });
        const arr = [...refs].sort();
        const pruned = M.pruneMediaFiles(
          {
            'media/keep.png': 1,
            'media/from-html.jpg': 2,
            'media/from-ann.webp': 3,
            'media/orphan.bin': 4,
            'media/../evil': 5,
          },
          refs,
        );
        return {
          arr,
          prunedKeys: Object.keys(pruned).sort(),
          normOk: M.normalizeMediaPath('media/a.png') === 'media/a.png',
          normBad: M.normalizeMediaPath('../x') === '' && M.normalizeMediaPath('media/../x') === '',
        };
      });
      const expect = ['media/from-ann.webp', 'media/from-html.jpg', 'media/keep.png'];
      if (JSON.stringify(r.arr) !== JSON.stringify(expect)) throw new Error('refs ' + JSON.stringify(r));
      if (JSON.stringify(r.prunedKeys) !== JSON.stringify(expect)) throw new Error('pruned ' + JSON.stringify(r));
      if (!r.normOk || !r.normBad) throw new Error('norm ' + JSON.stringify(r));
      ok('collect-and-prune-helpers', r.arr.join(','));
    } catch (e) {
      bad('collect-and-prune-helpers', e);
    }

    // snapshot + zip drops orphan
    try {
      const r = await page.evaluate(async (pngArr) => {
        const M = window.__mdAnnotator;
        M.openNewTabBlank();
        const png = new Uint8Array(pngArr);
        const keepBlob = new Blob([png], { type: 'image/png' });
        const orphanBlob = new Blob([png], { type: 'image/png' });
        const keepUrl = URL.createObjectURL(keepBlob);
        M.State.mediaFiles = {
          'media/keep.png': keepBlob,
          'media/orphan-old.png': orphanBlob,
        };
        M.State.mediaUrls = {
          'media/keep.png': keepUrl,
          'media/orphan-old.png': URL.createObjectURL(orphanBlob),
        };
        M.loadMarkdownIntoEditor(
          'gc.mentor',
          '# Hi\n\n![k](media/keep.png)\n',
          { version: '1', annotations: [] },
          { alreadyPrepared: true, saveMode: 'mentor-download' },
        );
        // re-inject after load (load may revoke)
        M.State.mediaFiles = {
          'media/keep.png': keepBlob,
          'media/orphan-old.png': orphanBlob,
        };
        M.State.mediaUrls = {
          'media/keep.png': keepUrl,
          'media/orphan-old.png': URL.createObjectURL(orphanBlob),
        };
        // ensure editor has the image node if md path rewritten
        const snap = M.createSaveSnapshot();
        const snapKeys = Object.keys(snap.mediaFiles || {}).sort();
        const blob = await M.buildMentorZipBlob(
          snap.mdText,
          snap.sidecar,
          {
            'media/keep.png': keepBlob,
            'media/orphan-old.png': orphanBlob,
            'media/never-referenced.png': orphanBlob,
          },
          snap.references,
          { documentHtml: snap.documentHtml },
        );
        const parsed = await M.readMentorZip(new File([blob], 'gc.mentor'));
        const zipKeys = Object.keys(parsed.mediaFiles || {}).sort();
        return {
          snapKeys,
          zipKeys,
          md: snap.mdText,
          stateStillHasOrphan: !!(M.State.mediaFiles && M.State.mediaFiles['media/orphan-old.png']),
        };
      }, Array.from(tinyPng()));
      if (!r.snapKeys.includes('media/keep.png') || r.snapKeys.includes('media/orphan-old.png')) {
        throw new Error('snap ' + JSON.stringify(r));
      }
      if (!r.zipKeys.includes('media/keep.png') || r.zipKeys.includes('media/orphan-old.png') || r.zipKeys.includes('media/never-referenced.png')) {
        throw new Error('zip ' + JSON.stringify(r));
      }
      ok('snapshot-and-zip-drop-orphan', JSON.stringify({ snapKeys: r.snapKeys, zipKeys: r.zipKeys }));
    } catch (e) {
      bad('snapshot-and-zip-drop-orphan', e);
    }

    // imageAnchors keep media even if not in md body
    try {
      const r = await page.evaluate(async (pngArr) => {
        const M = window.__mdAnnotator;
        M.openNewTabBlank();
        const png = new Uint8Array(pngArr);
        const blob = new Blob([png], { type: 'image/png' });
        const mediaFiles = {
          'media/fig-only.png': blob,
          'media/junk.png': blob,
        };
        const sidecar = {
          version: '1',
          annotations: [
            {
              threadId: 'img1',
              text: '[图片]',
              skipMark: true,
              imageAnchors: [{ src: 'media/fig-only.png', from: 0, to: 1, alt: '', title: '' }],
            },
          ],
        };
        const out = await M.buildMentorZipBlob('# only\n', sidecar, mediaFiles, { version: 1, entries: [] }, {});
        const parsed = await M.readMentorZip(new File([out], 'ia.mentor'));
        return Object.keys(parsed.mediaFiles || {}).sort();
      }, Array.from(tinyPng()));
      if (JSON.stringify(r) !== JSON.stringify(['media/fig-only.png'])) throw new Error(JSON.stringify(r));
      ok('imageAnchors-keep-referenced', r.join(','));
    } catch (e) {
      bad('imageAnchors-keep-referenced', e);
    }

    // p1 regression: referenced media still kept
    try {
      const r = await page.evaluate(async (pngArr) => {
        const M = window.__mdAnnotator;
        const png = new Uint8Array(pngArr);
        const mediaBlob = new Blob([png], { type: 'image/png' });
        M.openNewTabBlank();
        M.State.mediaFiles = { 'media/image1.png': mediaBlob };
        M.State.mediaUrls = { 'media/image1.png': URL.createObjectURL(mediaBlob) };
        M.loadMarkdownIntoEditor('media-p1.mentor', '# Hi\n\n![x](media/image1.png)\n', null, {
          alreadyPrepared: true,
          saveMode: 'mentor-download',
        });
        M.State.mediaFiles = { 'media/image1.png': mediaBlob };
        const snap = M.createSaveSnapshot();
        const zip = await M.buildMentorZipBlob(snap.mdText, snap.sidecar, snap.mediaFiles, snap.references, {
          documentHtml: snap.documentHtml,
        });
        const loaded = await M.readMentorZip(new File([zip], 'media-p1.mentor'));
        return {
          hasMedia: !!(loaded.mediaFiles && loaded.mediaFiles['media/image1.png']),
          mdHas: String(loaded.mdText || '').includes('media/image1.png'),
        };
      }, Array.from(tinyPng()));
      if (!r.hasMedia || !r.mdHas) throw new Error(JSON.stringify(r));
      ok('referenced-media-still-kept', JSON.stringify(r));
    } catch (e) {
      bad('referenced-media-still-kept', e);
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
