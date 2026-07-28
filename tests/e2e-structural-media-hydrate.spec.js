/**
 * Structural document.html must not keep dead blob: image srcs across open.
 * Save rewrites blob→media/*; load rewrites media/*→blob and recovers dead blobs via md order.
 * Run: node tests/e2e-structural-media-hydrate.spec.js
 */
'use strict';

const { chromium } = require('playwright');
const http = require('http');

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}/index.html?mediahydrate=${Date.now()}`;
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

async function waitEditor(page) {
  await page.waitForFunction(
    () => !!(window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor),
    null,
    { timeout: 30000 }
  );
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

    // pure helpers
    try {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const urls = {
          'media/a.png': 'blob:http://local/aaa',
          'media/b.png': 'blob:http://local/bbb',
        };
        const durable = M.htmlWithMediaPaths(
          '<p><img src="blob:http://local/aaa"><img src="blob:http://local/bbb"></p>',
          urls
        );
        const hydrated = M.htmlWithBlobUrls(
          '<p><img src="media/a.png"><img src="media/b.png"></p>',
          urls,
          ''
        );
        const recovered = M.htmlWithBlobUrls(
          '<p><img src="blob:http://dead/1"><img src="blob:http://dead/2"></p>',
          urls,
          '![x](media/a.png)\n![y](media/b.png)'
        );
        const stillDead = M.structuralHtmlHasUnresolvedBlobs(
          '<img src="blob:http://dead/zzz">',
          urls
        );
        return { durable, hydrated, recovered, stillDead };
      });
      if (!r.durable.includes('media/a.png') || r.durable.includes('blob:http://local/aaa')) {
        throw new Error('durable ' + r.durable);
      }
      if (!r.hydrated.includes('blob:http://local/aaa') || r.hydrated.includes('media/a.png')) {
        throw new Error('hydrated ' + r.hydrated);
      }
      if (!r.recovered.includes('blob:http://local/aaa') || r.recovered.includes('blob:http://dead/1')) {
        throw new Error('recovered ' + r.recovered);
      }
      if (!r.stillDead) throw new Error('stillDead false');
      ok('helpers-media-path-roundtrip');
    } catch (e) {
      bad('helpers-media-path-roundtrip', e);
    }

    // save snapshot stores media/* not blob
    try {
      const r = await page.evaluate(async (pngArr) => {
        const M = window.__mdAnnotator;
        M.openNewTabBlank();
        const png = new Uint8Array(pngArr);
        const blob = new Blob([png], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        M.State.mediaFiles = { 'media/keep.png': blob };
        M.State.mediaUrls = { 'media/keep.png': url };
        M.loadMarkdownIntoEditor(
          'hydrate.mentor',
          '# Hi\n\n![k](media/keep.png)\n',
          { version: '1', annotations: [] },
          { alreadyPrepared: true, saveMode: 'mentor-download' }
        );
        // force editor image src to blob (as live session does)
        const ed = M.State.editor;
        let from = null;
        ed.state.doc.descendants((node, pos) => {
          if (node.type && node.type.name === 'image' && from == null) from = pos;
        });
        if (from != null) {
          const tr = ed.state.tr.setNodeMarkup(from, undefined, {
            ...ed.state.doc.nodeAt(from).attrs,
            src: url,
          });
          ed.view.dispatch(tr);
        }
        const snap = M.createSaveSnapshot();
        const blobCount = (snap.documentHtml.match(/blob:/g) || []).length;
        const mediaCount = (snap.documentHtml.match(/media\/keep\.png/g) || []).length;
        const built = await M.buildMentorZipBlob(
          snap.mdText,
          snap.sidecar,
          snap.mediaFiles,
          snap.references,
          { documentHtml: snap.documentHtml }
        );
        const parsed = await M.readMentorZip(new File([built], 'round.mentor'));
        const packedHtml = parsed.archive && parsed.archive.documentHtml;
        const packedBlob = packedHtml ? (packedHtml.match(/blob:/g) || []).length : -1;
        const packedMedia = packedHtml ? (packedHtml.match(/media\/keep\.png/g) || []).length : -1;
        return {
          blobCount,
          mediaCount,
          packedBlob,
          packedMedia,
          usable: !!(parsed.archive && parsed.archive.verification && parsed.archive.verification.usable),
        };
      }, [...tinyPng()]);
      if (r.blobCount !== 0 || r.mediaCount < 1) throw new Error('snap ' + JSON.stringify(r));
      if (r.packedBlob !== 0 || r.packedMedia < 1 || !r.usable) throw new Error('pack ' + JSON.stringify(r));
      ok('save-snapshot-no-blob', JSON.stringify(r));
    } catch (e) {
      bad('save-snapshot-no-blob', e);
    }

    // open synthetic package with dead blobs + media files → live images
    try {
      const r = await page.evaluate(async (pngArr) => {
        const M = window.__mdAnnotator;
        const png = new Uint8Array(pngArr);
        const mediaBlob = new Blob([png], { type: 'image/png' });
        // Build a verified package first with media path, then hand-mutate html is hard in-page.
        // Instead: inject media, load structural html that contains dead blob, via loadMarkdownIntoEditor.
        M.openNewTabBlank();
        M.State.mediaFiles = { 'media/fig.png': mediaBlob };
        await M.injectMediaFiles({ 'media/fig.png': mediaBlob });
        const deadHtml = '<p>before</p><p><img src="blob:http://127.0.0.1:8787/dead-dead-dead"></p><p>after</p>';
        const md = '# T\n\n![f](media/fig.png)\n';
        // create verified-looking path: usable true
        M.loadMarkdownIntoEditor('dead.mentor', md, { version: '1', annotations: [] }, {
          alreadyPrepared: true,
          saveMode: 'mentor-download',
          structuralHtml: deadHtml,
          archiveVerification: { usable: true, reason: 'verified' },
        });
        const srcs = [];
        M.State.editor.state.doc.descendants((node) => {
          if (node.type && node.type.name === 'image') srcs.push(node.attrs.src || '');
        });
        const live = srcs.filter((s) => s.startsWith('blob:') && !s.includes('dead-dead'));
        const deadLeft = srcs.filter((s) => s.includes('dead-dead'));
        return {
          srcs,
          live: live.length,
          deadLeft: deadLeft.length,
          mode: M.State._archiveRestoreMode,
          mediaUrl: M.State.mediaUrls['media/fig.png'] || null,
        };
      }, [...tinyPng()]);
      if (r.live < 1 || r.deadLeft !== 0) throw new Error(JSON.stringify(r));
      ok('load-dead-blob-recovered', JSON.stringify(r));
    } catch (e) {
      bad('load-dead-blob-recovered', e);
    }

    // refs button
    // refs button not disabled without doc / while busy
    try {
      const r = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        // clear document
        try { M.openNewTabBlank(); } catch (_) {}
        M.State._toolbarBusy = true;
        M.syncToolbarActionState();
        const btn = document.querySelector('#btn-refs');
        const disabledBusy = !!btn.disabled;
        M.State._toolbarBusy = false;
        M.State.currentFile = null;
        M.syncToolbarActionState();
        const disabledNoDoc = !!btn.disabled;
        btn.click();
        const pane = document.querySelector('#refs-pane');
        const open = pane && !pane.classList.contains('hidden');
        return { disabledBusy, disabledNoDoc, open };
      });
      if (r.disabledBusy || r.disabledNoDoc || !r.open) throw new Error(JSON.stringify(r));
      ok('refs-button-always-clickable', JSON.stringify(r));
    } catch (e) {
      bad('refs-button-always-clickable', e);
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
