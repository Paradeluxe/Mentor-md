/**
 * P0 data integrity: source-mode save, annotation cap round-trip,
 * document identity separation, XSS rejection, save snapshot.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8791;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

async function waitForServer(url, ms = 15000) {
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
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 20000 });
    await page.evaluate(() => {
      localStorage.setItem('Mentor:author', 'P0 Tester');
      localStorage.setItem('Mentor:maxAnnotations', '50');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 20000 });

    // 1) Source mode save uses source text, not stale editor HTML
    const sourceSave = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('source-p0.mentor', '# Hello\n\nBODY_V1\n', null, {
        saveMode: 'mentor-download',
      });
      M.setRenderMode?.('source') || (function () {
        // fallback: toggle via UI state
        const btn = document.querySelector('#btn-toggle-render');
        if (btn && M.State.renderMode !== 'source') btn.click();
      })();
      await new Promise((r) => setTimeout(r, 50));
      const sourceEl = document.querySelector('#source-view');
      if (!sourceEl) return { error: 'no source-view' };
      sourceEl.innerText = '# Hello\n\nBODY_V2_SOURCE\n';
      M.State.currentFile.content = sourceEl.innerText;
      M.State.currentFile.dirty = true;
      const snap = M.createSaveSnapshot();
      return {
        mdText: snap.mdText,
        renderMode: M.State.renderMode,
      };
    });
    assert(!sourceSave.error, 'sourceSave error: ' + sourceSave.error);
    assert(String(sourceSave.mdText).includes('BODY_V2_SOURCE'), 'source snapshot missing V2: ' + sourceSave.mdText);

    // 2) Over-cap import preserves all annotations in save model
    const capRoundTrip = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const fakeAnns = [];
      let md = '';
      for (let i = 0; i < 150; i++) {
        const t = `[p0a${i}]`;
        md += t + ' ';
        fakeAnns.push({
          threadId: `p0a-${i}`,
          text: t,
          prefix: '',
          suffix: '',
          resolved: false,
          comments: [{ id: `c-${i}`, author: { id: 'u', name: 'U' }, body: 'x', createdAt: new Date().toISOString() }],
          createdAt: new Date().toISOString(),
        });
      }
      M.loadMarkdownIntoEditor('cap-p0.mentor', md, {
        version: '1',
        document: 'cap-p0.mentor',
        annotations: fakeAnns,
        updatedAt: new Date().toISOString(),
      });
      const loaded = M.State.annotations.length;
      const saved = M.buildAnnotationsSidecar().length;
      return { loaded, saved, cap: M.State.maxAnnotations };
    });
    assert(capRoundTrip.cap === 50, 'cap not 50');
    assert(capRoundTrip.loaded === 150, 'loaded ' + capRoundTrip.loaded);
    assert(capRoundTrip.saved === 150, 'saved ' + capRoundTrip.saved);

    // 3) Same basename + different content => different documentId / separate tabs
    const identity = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      await M.activateOpenedDocument({
        name: 'notes.mentor',
        content: '# A\n\nCONTENT_A_UNIQUE\n',
        saveMode: 'mentor-download',
        quiet: true,
      });
      const idA = M.State.currentFile.documentId;
      await M.activateOpenedDocument({
        name: 'notes.mentor',
        content: '# B\n\nCONTENT_B_UNIQUE\n',
        saveMode: 'mentor-download',
        quiet: true,
      });
      const idB = M.State.currentFile.documentId;
      const tabs = M.State.tabs.map((t) => ({
        name: t.name,
        documentId: t.currentFile?.documentId || t.id,
        body: (t.currentFile?.content || '').slice(0, 40),
      }));
      return { idA, idB, tabCount: M.State.tabs.length, tabs };
    });
    assert(identity.idA && identity.idB, 'missing documentIds');
    assert(identity.idA !== identity.idB, 'documentIds collided for different content: ' + JSON.stringify(identity));
    assert(identity.tabCount >= 2, 'expected separate tabs, got ' + identity.tabCount);

    // 4) Malicious createdAt / threadId rejected by sidecar validation
    const xss = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      try {
        M.loadMarkdownIntoEditor('xss.mentor', '# x\n\nsafe text\n', {
          version: '1',
          document: 'xss.mentor',
          annotations: [{
            threadId: '"><img src=x onerror=window.__xss=1>',
            text: 'safe text',
            comments: [{ id: 'c1', author: 'A', body: 'hi', createdAt: '<img src=x onerror=window.__xss=1>' }],
            createdAt: '<img src=x onerror=window.__xss=1>',
          }],
        });
        return { threw: false, xss: !!window.__xss };
      } catch (e) {
        return { threw: true, message: e.message, xss: !!window.__xss };
      }
    });
    assert(xss.threw === true, 'malicious sidecar should throw');
    assert(xss.xss !== true, 'XSS executed');

    // 5) Escaped render path for formatTime invalid dates (defense in depth)
    const escapeRender = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.annotations = [{
        threadId: 'safe-thread-1',
        text: 'hello',
        resolved: false,
        comments: [{
          id: 'c1',
          author: { id: 'a', name: 'A' },
          body: 'body',
          createdAt: '<img src=x onerror=window.__xss2=1>',
        }],
        createdAt: new Date().toISOString(),
      }];
      M.renderCommentList();
      const html = document.querySelector('#comment-list')?.innerHTML || '';
      return {
        hasRawTag: html.includes('<img src=x'),
        hasEscaped: html.includes('&lt;img') || html.includes('&#39;') || !html.includes('onerror='),
        xss: !!window.__xss2,
      };
    });
    assert(escapeRender.xss !== true, 'render XSS executed');
    assert(!escapeRender.hasRawTag, 'raw img tag in comment list');

    console.log('P0 data integrity passed');
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('P0 data integrity FAILED:', e && e.stack || e);
    process.exit(1);
  } finally {
    try { server.kill(); } catch {}
  }
})();
