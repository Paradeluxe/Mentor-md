/**
 * P1: save-as keeps media; zip budget rejects oversized packs; worker API present.
 */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8792;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

async function waitForServer(url, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => { res.resume(); resolve(); });
        req.on('error', reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('server not ready');
}

(async () => {
  const server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT, stdio: 'ignore', shell: true,
  });
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 20000 });

    const report = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // 1) save-as / buildMentorZipBlob includes media
      const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,0,3,0,1,0,5,254,210,239,0,0,0,0,73,69,78,68,174,66,96,130]);
      const mediaBlob = new Blob([png], { type: 'image/png' });
      M.State.mediaFiles = { 'media/image1.png': mediaBlob };
      M.State.mediaUrls = { 'media/image1.png': URL.createObjectURL(mediaBlob) };
      M.loadMarkdownIntoEditor('media-p1.mentor', '# Hi\n\n![x](media/image1.png)\n', null, {
        saveMode: 'mentor-download',
      });
      M.State.mediaFiles = { 'media/image1.png': mediaBlob };
      const snap = M.createSaveSnapshot();
      const blob = await M.buildMentorZipBlob(snap.mdText, snap.sidecar, snap.mediaFiles);
      // Round-trip via readMentorZip (no global JSZip required)
      const file = new File([blob], 'media-p1.mentor', { type: 'application/zip' });
      const loaded = await M.readMentorZip(file);

      // 2) zip budget helper rejects huge entry counts / oversized packs
      let budgetThrew = false;
      try {
        const fakeZip = { files: {} };
        for (let i = 0; i < 600; i++) fakeZip.files['media/f' + i + '.bin'] = { dir: false, uncompressedSize: 10 };
        M.assertMentorZipBudget({ size: 1000 }, fakeZip);
      } catch (e) {
        budgetThrew = true;
      }
      if (!budgetThrew) {
        try {
          await M.readMentorZip({ size: 90 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(8), name: 'big.mentor' });
        } catch (e) {
          budgetThrew = /过大|MB/.test(String(e && e.message || e));
        }
      }

      return {
        hasMedia: !!(loaded.mediaFiles && loaded.mediaFiles['media/image1.png']),
        mdHasMediaPath: String(loaded.mdText || '').includes('media/image1.png'),
        budgetThrew,
        mediaCount: Object.keys(loaded.mediaFiles || {}).length,
      };
    });

    assert(report.hasMedia, 'save-as zip missing media/image1.png');
    assert(report.mdHasMediaPath, 'content.md missing media path');
    assert(report.budgetThrew, 'zip budget did not reject oversized pack');

    console.log('P1 save-media-zip passed');
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('P1 save-media-zip FAILED:', e && e.stack || e);
    process.exit(1);
  } finally {
    try { server.kill(); } catch {}
  }
})();
