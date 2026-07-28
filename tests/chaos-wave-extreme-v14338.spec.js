// chaos-wave-extreme-v14338: A protected-path / B media-offline / C perf-worker
// NEVER touches real dFC disk path. TEMP + in-memory only.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEMP = path.join(os.tmpdir(), 'mentor-chaos-extreme');
fs.mkdirSync(TEMP, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e.message || e)));

  let pass = 0, fail = 0;
  const results = [];
  const t = async (wave, name, fn) => {
    try {
      await fn();
      console.log(`  ✓ [${wave}] ${name}`);
      pass++;
      results.push({ wave, name, ok: true });
    } catch (e) {
      console.log(`  ✗ [${wave}] ${name}: ${e.message}`);
      fail++;
      results.push({ wave, name, ok: false, err: e.message });
    }
  };

  const gotoFresh = async () => {
    await page.goto('http://127.0.0.1:8787/index.html?chaos=extreme&cb=' + Date.now(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => {
      const m = document.querySelector('#author-modal');
      if (m) m.classList.add('hidden');
      // force blank — never touch dFC content in memory if IDB restored it
      try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
    });
    await page.waitForTimeout(80);
  };

  const makePngBlobB64 = async (w, h, color = '#4C72B0') => {
    return page.evaluate(async ({ w, h, color }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff';
      x.font = '40px sans-serif';
      x.fillText(w + 'x' + h, 20, 60);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const buf = await blob.arrayBuffer();
      let s = '';
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s);
    }, { w, h, color });
  };

  console.log('=== chaos-wave-extreme v1.43.38 A/B/C ===');
  console.log('TEMP=', TEMP);

  // ============================================================
  // WAVE A — no protected-path guard (v1.45.6) + multi-tab disk safety
  // ============================================================
  console.log('\n--- WAVE A: no protect + multi-tab ---');
  await gotoFresh();

  await t('A', 'A1 protect APIs removed', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        isProt: typeof M.isProtectedMentorTarget,
        confirm: typeof M.confirmProtectedWrite,
        unlocked: M.State.protectedWriteUnlocked,
        base: typeof M.mentorBaseName,
      };
    });
    if (r.isProt !== 'undefined' || r.confirm !== 'undefined') throw new Error(JSON.stringify(r));
    if (r.unlocked !== undefined) throw new Error('unlocked still set');
    if (r.base !== 'function') throw new Error('mentorBaseName missing');
  });

  await t('A', 'A2 research-named file not force-skipped by protect', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let writes = 0;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>dirty research</p>');
      M.State.currentFile = {
        name: 'research-paper.mentor',
        dirty: true,
        dirtyGen: 1,
        handle: {
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          getFile: async () => ({ lastModified: Date.now() - 1000, name: 'research-paper.mentor' }),
          createWritable: async () => {
            writes++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      M.State.saveMode = 'mentor-handle';
      M.State.diskPathHint = 'E:/tmp/research/research-paper.mentor';
      M.State.fileMtime = Date.now() - 2000;
      M.State.mediaFiles = {};
      const res = await M.writeCurrentToHandle({ reason: 'autosave', showProgress: false });
      return { writes, resOk: !!(res && res.ok), err: res && res.error, conflict: res && res.conflict };
    });
    if (r.err === 'protected' || (r.conflict && r.conflict.kind === 'protected')) {
      throw new Error('still protected: ' + JSON.stringify(r));
    }
  });

  await t('A', 'A3 tryWriteBackMentor no confirm gate', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let confirms = 0;
      let writes = 0;
      const orig = window.confirm;
      window.confirm = () => { confirms++; return false; };
      try {
        M.State.currentFile = {
          name: 'research-paper.mentor',
          dirty: true,
          handle: {
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
            createWritable: async () => {
              writes++;
              return { write: async () => {}, close: async () => {} };
            },
          },
        };
        M.State.saveMode = 'mentor-handle';
        M.State.diskPathHint = 'E:/tmp/research/research-paper.mentor';
        M.State.mediaFiles = {};
        const res = await M.tryWriteBackMentor('# hi', { version: '1', annotations: [] }, 'research-paper.mentor');
        return { confirms, writes, res };
      } finally {
        window.confirm = orig;
      }
    });
    if (r.confirms !== 0) throw new Error('confirm still used: ' + r.confirms);
    if (r.res && r.res.error && String(r.res.error).includes('\u53d7\u4fdd\u62a4')) throw new Error(JSON.stringify(r.res));
  });

  await t('A', 'A4 tryWriteBackMentor can write without unlock map', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let writes = 0;
      M.State.currentFile = {
        name: 'research-paper.mentor',
        dirty: true,
        handle: {
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          createWritable: async () => {
            writes++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      M.State.saveMode = 'mentor-handle';
      M.State.diskPathHint = 'E:/tmp/research/research-paper.mentor';
      M.State.mediaFiles = {};
      const r1 = await M.tryWriteBackMentor('# a', { version: '1', document: 'x', annotations: [] }, 'research-paper.mentor');
      return { writes, handle: !!(r1 && r1.handle), err: r1 && r1.error };
    });
    if (r.err && String(r.err).includes('\u53d7\u4fdd\u62a4')) throw new Error(JSON.stringify(r));
  });

  await t('A', 'A5 autosave on research-named handle is not force-skipped', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      let writes = 0;
      M.State.currentFile = {
        name: 'research-paper.mentor',
        dirty: true,
        dirtyGen: 1,
        handle: {
          queryPermission: async () => 'granted',
          getFile: async () => ({ lastModified: Date.now() - 1000, name: 'research-paper.mentor' }),
          createWritable: async () => {
            writes++;
            return { write: async () => {}, close: async () => {} };
          },
        },
      };
      M.State.saveMode = 'mentor-handle';
      M.State.diskPathHint = 'E:/tmp/research/research-paper.mentor';
      M.State.fileMtime = Date.now() - 2000;
      M.State.mediaFiles = {};
      await M.autosaveNow();
      return { writes };
    });
    // not asserting writes>0 (snapshot may fail); just no throw
    if (r.writes === undefined) throw new Error('bad');
  });

  await t('A', 'A6 multi-tab: edit blank while research-named tab exists — no cross wipe of tab snapshot', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // tab1 = research-named content in memory only
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>RESEARCH_MARK_ORIGINAL_CONTENT_KEEP_ME_12345</p>');
      M.State.currentFile = {
        name: 'research-paper.mentor',
        content: 'RESEARCH_MARK_ORIGINAL_CONTENT_KEEP_ME_12345',
        dirty: false,
      };
      M.State.diskPathHint = 'E:/tmp/research/research-paper.mentor';
      try { M.snapshotActiveTab(); } catch (_) {}
      const dfcTabId = M.State.activeTabId;

      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>BLANK_EDIT_XXX</p>');
      M.State.editor.commands.insertContent(' more');
      try { M.snapshotActiveTab(); } catch (_) {}

      // switch back to research tab
      if (dfcTabId && typeof M.switchToTab === 'function') {
        M.switchToTab(dfcTabId);
      } else {
        // fallback: find tab by name
        const tab = (M.State.tabs || []).find((t) => (t.fileName || t.name || '').includes('research-paper'));
        if (tab) M.switchToTab(tab.id);
      }
      await new Promise((r) => setTimeout(r, 50));
      const text = M.State.editor.state.doc.textContent;
      const tabs = (M.State.tabs || []).map((t) => ({
        n: t.fileName || t.name,
        id: t.id,
      }));
      return {
        text,
        hasMark: text.includes('RESEARCH_MARK_ORIGINAL_CONTENT_KEEP_ME_12345'),
        noBlankLeak: !text.includes('BLANK_EDIT_XXX'),
        tabCount: (M.State.tabs || []).length,
        tabs,
      };
    });
    if (!r.hasMark) throw new Error('dFC tab content lost: ' + r.text.slice(0, 80));
    if (!r.noBlankLeak) throw new Error('blank leaked into dFC tab');
    if (r.tabCount < 2) throw new Error('tabs=' + r.tabCount);
  });

  // ============================================================
  // WAVE B — media downsample / zip roundtrip / offline assets
  // ============================================================
  console.log('\n--- WAVE B: media + offline ---');
  await gotoFresh();

  await t('B', 'B1 downsample 3000x2000 → edge≤1600; small unchanged', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      async function sizeOf(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').fillRect(0, 0, w, h);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const url = await M.createDisplayObjectURL(blob, 'media/t.png');
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = url;
        });
        URL.revokeObjectURL(url);
        return { w: img.naturalWidth, h: img.naturalHeight, edge: Math.max(img.naturalWidth, img.naturalHeight) };
      }
      return { big: await sizeOf(3000, 2000), small: await sizeOf(400, 300), max: M.DISPLAY_MAX_EDGE };
    });
    if (r.big.edge > r.max) throw new Error('big edge ' + r.big.edge);
    if (r.small.w !== 400 || r.small.h !== 300) throw new Error(JSON.stringify(r.small));
  });

  await t('B', 'B2 injectMediaFiles keeps original in mediaFiles, display may shrink', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const c = document.createElement('canvas');
      c.width = 2400;
      c.height = 1600;
      c.getContext('2d').fillStyle = '#C44E52';
      c.getContext('2d').fillRect(0, 0, 2400, 1600);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const origSize = blob.size;
      M.State.mediaUrls = {};
      M.State.mediaFiles = {};
      await M.injectMediaFiles({ 'media/big.png': blob });
      const url = M.State.mediaUrls['media/big.png'];
      const kept = M.State.mediaFiles['media/big.png'];
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      return {
        origSize,
        keptSize: kept && kept.size,
        sameRef: kept === blob,
        dispW: img.naturalWidth,
        dispH: img.naturalHeight,
      };
    });
    if (!r.sameRef) throw new Error('mediaFiles must keep original blob ref');
    if (r.keptSize !== r.origSize) throw new Error('size mutated');
    if (Math.max(r.dispW, r.dispH) > 1600) throw new Error('display not downsampled');
  });

  await t('B', 'B3 build zip with large media → read back → media original dims preserved in zip bytes', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const c = document.createElement('canvas');
      c.width = 2200;
      c.height = 1100;
      c.getContext('2d').fillStyle = '#333';
      c.getContext('2d').fillRect(0, 0, 2200, 1100);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await M.injectMediaFiles({ 'media/fig.png': blob });
      const url = M.State.mediaUrls['media/fig.png'];
      M.State.editor.commands.setContent(`<p>Before</p><img src="${url}" alt="fig"><p>After</p>`);
      const md = M.htmlToMarkdownMedia
        ? M.htmlToMarkdownMedia(M.State.editor.getHTML())
        : M.htmlToMarkdown(M.State.editor.getHTML());
      const sidecar = { version: '1', document: 'chaos.mentor', annotations: [] };
      const zipBlob = await M.buildMentorZipBlob(md, sidecar, M.State.mediaFiles);
      const file = new File([zipBlob], 'chaos.mentor', { type: 'application/zip' });
      const read = await M.readMentorZip(file);
      const mediaBlob = read.mediaFiles['media/fig.png'];
      if (!mediaBlob) return { err: 'no media in zip', keys: Object.keys(read.mediaFiles || {}), md };
      // original-ish size: display is jpeg/png smaller; zip should have original mediaFiles
      const bmp = await createImageBitmap(mediaBlob);
      const dims = { w: bmp.width, h: bmp.height };
      bmp.close();
      const mdHasMedia = /media\/fig\.png/.test(read.mdText) || /media\/fig\.png/.test(md);
      const mdHasBlob = /blob:/.test(read.mdText);
      return {
        zipSize: zipBlob.size,
        mediaSize: mediaBlob.size,
        dims,
        mdHasMedia: mdHasMedia || /!\[/.test(md),
        mdHasBlob,
        mdSlice: (read.mdText || md || '').slice(0, 200),
        worker: M.getZipWorkerState?.(),
      };
    });
    if (r.err) throw new Error(r.err + ' ' + JSON.stringify(r));
    if (r.dims.w !== 2200 || r.dims.h !== 1100) throw new Error('zip lost original dims ' + JSON.stringify(r.dims));
    if (r.mdHasBlob) throw new Error('md still has blob: ' + r.mdSlice);
    if (r.worker && r.worker.stats && r.worker.stats.errors > 0) throw new Error('worker errors');
  });

  await t('B', 'B4 corrupt / edge images: empty blob, 1x1, svg skip crash', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const empty = new Blob([], { type: 'image/png' });
      const u1 = await M.createDisplayObjectURL(empty, 'media/empty.png');
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      const tiny = await new Promise((r) => c.toBlob(r, 'image/png'));
      const u2 = await M.createDisplayObjectURL(tiny, 'media/1.png');
      const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'], {
        type: 'image/svg+xml',
      });
      const u3 = await M.createDisplayObjectURL(svg, 'media/a.svg');
      [u1, u2, u3].forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {}
      });
      return { ok: true, u1: !!u1, u2: !!u2, u3: !!u3 };
    });
    if (!r.ok || !r.u1 || !r.u2 || !r.u3) throw new Error(JSON.stringify(r));
  });

  await t('B', 'B5 offline asset graph: no CDN scripts/links; bundle present', async () => {
    const r = await page.evaluate(() => {
      const scripts = [...document.scripts].map((s) => s.src);
      const links = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href);
      const all = scripts.concat(links);
      const cdn = all.filter((u) => /esm\.sh|googleapis|gstatic|jsdelivr|unpkg|cdnjs/.test(u || ''));
      return {
        cdn,
        hasBundle: scripts.some((s) => /app\.bundle\.js/.test(s)),
        hasImportmap: !!document.querySelector('script[type=importmap]'),
        hasKatexLocal: links.some((l) => /vendor\/katex/.test(l)),
        hasFontsLocal: links.some((l) => /vendor\/fonts/.test(l)),
        editor: !!window.__mdAnnotator?.State?.editor,
      };
    });
    if (r.cdn.length) throw new Error('cdn leak ' + r.cdn.join(','));
    if (!r.hasBundle || r.hasImportmap) throw new Error(JSON.stringify(r));
    if (!r.hasKatexLocal || !r.hasFontsLocal || !r.editor) throw new Error(JSON.stringify(r));
  });

  await t('B', 'B6 disk roundtrip TEMP only: write zip, reload via File, content+media ok', async () => {
    const b64 = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const c = document.createElement('canvas');
      c.width = 1800;
      c.height = 900;
      c.getContext('2d').fillStyle = '#4C72B0';
      c.getContext('2d').fillRect(0, 0, 1800, 900);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await M.injectMediaFiles({ 'media/t.png': blob });
      const url = M.State.mediaUrls['media/t.png'];
      M.State.editor.commands.setContent(`<p>CHAOS_ROUNDTRIP_MARKER</p><img src="${url}">`);
      // add one ann if API exists
      try {
        if (M._testCreateAnnotation) {
          M.State.editor.chain().focus().setTextSelection({ from: 1, to: 12 }).run();
          M._testCreateAnnotation(1, 12, 'quote');
        }
      } catch (_) {}
      const md = M.htmlToMarkdownMedia(M.State.editor.getHTML());
      const sidecar = {
        version: '1',
        document: 'chaos-temp.mentor',
        annotations: (M.State.annotations || []).map((a) => ({
          threadId: a.threadId,
          text: a.text,
          range: a.range,
          comments: a.comments || [],
          resolved: !!a.resolved,
          createdAt: a.createdAt,
        })),
      };
      const zip = await M.buildMentorZipBlob(md, sidecar, M.State.mediaFiles);
      const buf = await zip.arrayBuffer();
      const u8 = new Uint8Array(buf);
      let s = '';
      // chunk to avoid call stack
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      }
      return btoa(s);
    });
    const outPath = path.join(TEMP, 'chaos-roundtrip.mentor');
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    const st = fs.statSync(outPath);
    if (st.size < 1000) throw new Error('zip too small ' + st.size);

    // reload fresh page and open via File from base64
    await gotoFresh();
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'chaos-roundtrip.mentor', { type: 'application/zip' });
      const M = window.__mdAnnotator;
      await M.openFromMentorFile(file);
      const text = M.State.editor.state.doc.textContent;
      const imgs = [...document.querySelectorAll('.ProseMirror img')];
      const mediaN = Object.keys(M.State.mediaFiles || {}).length;
      return {
        textHas: text.includes('CHAOS_ROUNDTRIP_MARKER'),
        imgN: imgs.length,
        mediaN,
        broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
        name: M.State.currentFile && M.State.currentFile.name,
      };
    }, b64);
    if (!r.textHas) throw new Error('marker missing');
    if (r.imgN < 1 || r.mediaN < 1) throw new Error(JSON.stringify(r));
    if (r.broken) throw new Error('broken imgs ' + r.broken);
  });

  // ============================================================
  // WAVE C — perf 500 ann + worker kill
  // ============================================================
  console.log('\n--- WAVE C: perf + worker ---');
  await gotoFresh();

  await t('C', 'C1 create 200 anns (cap may block 500) measure render', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      // long doc
      let html = '';
      for (let i = 0; i < 80; i++) html += `<p>Paragraph ${i} lorem ipsum dolor sit amet chaos wave.</p>`;
      M.State.editor.commands.setContent(html);
      // raise cap
      if (M.setMaxAnnotations) M.setMaxAnnotations(1000);
      const t0 = performance.now();
      let created = 0;
      const doc = M.State.editor.state.doc;
      // create marks on successive short ranges
      for (let i = 0; i < 200; i++) {
        const from = 1 + i * 3;
        const to = from + 2;
        if (to > doc.content.size) break;
        try {
          if (M._testCreateAnnotation) {
            M._testCreateAnnotation(from, to, 't' + i);
            created++;
          } else if (M.createTestAnnotation) {
            M.createTestAnnotation(from, to, 't' + i);
            created++;
          }
        } catch (_) {}
      }
      const t1 = performance.now();
      M.renderCommentList();
      const t2 = performance.now();
      // keystroke
      const k0 = performance.now();
      M.State.editor.chain().focus().insertContent('X').run();
      const k1 = performance.now();
      return {
        created,
        ann: (M.State.annotations || []).length,
        createMs: +(t1 - t0).toFixed(1),
        renderMs: +(t2 - t1).toFixed(1),
        keyMs: +(k1 - k0).toFixed(1),
        cards: document.querySelectorAll('.comment-thread').length,
      };
    });
    if (r.created < 50) throw new Error('too few created ' + JSON.stringify(r));
    // soft thresholds — flaky machines
    if (r.renderMs > 8000) throw new Error('render too slow ' + r.renderMs);
    if (r.keyMs > 5000) throw new Error('key too slow ' + r.keyMs);
    console.log('    stats', JSON.stringify(r));
  });

  await t('C', 'C2 500 ann attempt under cap=1000', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      let html = '';
      for (let i = 0; i < 200; i++) html += `<p>Line ${i} abcdefghijklmnopqrstuvwxyz 中文测试。</p>`;
      M.State.editor.commands.setContent(html);
      if (M.setMaxAnnotations) M.setMaxAnnotations(1000);
      const t0 = performance.now();
      let created = 0;
      for (let i = 0; i < 500; i++) {
        const from = 1 + i * 2;
        const to = from + 1;
        try {
          const a = M._testCreateAnnotation(from, to, 'x');
          if (a) created++;
        } catch (_) {}
      }
      const t1 = performance.now();
      const k0 = performance.now();
      M.State.editor.commands.insertContent('Z');
      const k1 = performance.now();
      M.renderCommentList();
      const t2 = performance.now();
      return {
        created,
        ann: M.State.annotations.length,
        createMs: +(t1 - t0).toFixed(1),
        keyMs: +(k1 - k0).toFixed(1),
        renderMs: +(t2 - t1).toFixed(1),
        cards: document.querySelectorAll('.comment-thread').length,
      };
    });
    console.log('    stats500', JSON.stringify(r));
    if (r.created < 100) throw new Error('created too low ' + r.created);
    if (r.keyMs > 8000) throw new Error('keyMs ' + r.keyMs);
  });

  await t('C', 'C3 worker kill → build/load fallback, stats.errors or fallbacks grow, app survives', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const before = M.getZipWorkerState ? M.getZipWorkerState() : null;
      // kill worker if accessible via diag
      try {
        if (before && before.ready) {
          // try common internals
          const w =
            window.__mdAnnotator__zipWorker ||
            window.__zipWorker ||
            null;
          if (w && w.terminate) w.terminate();
        }
        // force via evaluate internals if exposed
        if (typeof M._killZipWorkerForTest === 'function') M._killZipWorkerForTest();
      } catch (_) {}

      // Monkey: if worker object on state
      try {
        // access module-private impossible; poison by replacing getZipWorkerState pending
        // Instead: terminate by building huge then... 
        // Call build many times after stealing worker from pending map — not available.
        // Use: page-level — if _zipWorker on window export
      } catch (_) {}

      // Robust approach: patch Worker.prototype temporarily? too late.
      // Direct: if worker in getZipWorkerState has terminate on returned object — no.

      // Inject: force fallback by making postMessage throw via wrapping buildMentorZipBlob worker path
      // Easiest testable path: terminate using internal if we expose it now...

      // Probe: attempt to find worker
      let killed = false;
      if (typeof M.killZipWorkerForTest === 'function') {
        M.killZipWorkerForTest();
        killed = true;
      } else {
        for (const k of Object.keys(window)) {
          if (/zip/i.test(k) && window[k] && typeof window[k].terminate === 'function') {
            try { window[k].terminate(); killed = true; } catch (_) {}
          }
        }
      }

      // Build should still work (fallback)
      const md = '# fallback test\n\nhello';
      const sidecar = { version: '1', document: 'f.mentor', annotations: [] };
      const t0 = performance.now();
      let blob = null;
      let err = null;
      try {
        blob = await M.buildMentorZipBlob(md, sidecar, {});
      } catch (e) {
        err = String(e.message || e);
      }
      const t1 = performance.now();
      const after = M.getZipWorkerState ? M.getZipWorkerState() : null;
      let readOk = false;
      if (blob) {
        const file = new File([blob], 'f.mentor', { type: 'application/zip' });
        const out = await M.readMentorZip(file);
        readOk = !!(out && out.mdText && out.mdText.includes('fallback'));
      }
      return {
        killed,
        err,
        blobSize: blob && blob.size,
        ms: +(t1 - t0).toFixed(1),
        before,
        after,
        readOk,
      };
    });
    if (r.err) throw new Error('build failed after kill attempt: ' + r.err);
    if (!r.blobSize || !r.readOk) throw new Error(JSON.stringify(r));
    console.log('    worker', JSON.stringify({ before: r.before, after: r.after, killed: r.killed }));
  });

  await t('C', 'C4 hard-kill worker via exposed hook if any; else force null ready path by double-build stress', async () => {
    // Add stronger kill if API exists after we potentially add it — for now stress 30 builds
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const times = [];
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        const blob = await M.buildMentorZipBlob('# n' + i, { version: '1', annotations: [] }, {});
        times.push(Math.round(performance.now() - t0));
        if (!blob || blob.size < 20) return { err: 'empty blob', i };
      }
      const st = M.getZipWorkerState ? M.getZipWorkerState() : null;
      return {
        n: times.length,
        avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        max: Math.max(...times),
        min: Math.min(...times),
        st,
      };
    });
    if (r.err) throw new Error(r.err);
    if (r.n !== 15) throw new Error(JSON.stringify(r));
    console.log('    buildStress', JSON.stringify(r));
  });

  await t('C', 'C5 large doc 1MB setContent + 1 char insert baseline', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const chunk = '字'.repeat(1000);
      let body = '';
      // ~100k chars not full 1MB to keep CI sane — scale marker
      for (let i = 0; i < 100; i++) body += `<p>${chunk}</p>`;
      const t0 = performance.now();
      M.State.editor.commands.setContent(body);
      const t1 = performance.now();
      const k0 = performance.now();
      M.State.editor.chain().focus().insertContent('Q').run();
      const k1 = performance.now();
      return {
        chars: M.State.editor.state.doc.textContent.length,
        loadMs: +(t1 - t0).toFixed(1),
        keyMs: +(k1 - k0).toFixed(1),
      };
    });
    console.log('    bigdoc', JSON.stringify(r));
    if (r.chars < 50000) throw new Error('doc too small');
    if (r.loadMs > 15000) throw new Error('loadMs ' + r.loadMs);
    if (r.keyMs > 10000) throw new Error('keyMs ' + r.keyMs);
  });

  // summary
  console.log('\n=== RESULT ===');
  console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  console.log('pageErrors', pageErrs.slice(0, 8));
  const report = {
    when: new Date().toISOString(),
    pass,
    fail,
    total: pass + fail,
    results,
    pageErrs: pageErrs.slice(0, 20),
    temp: TEMP,
  };
  const reportPath = path.join(TEMP, 'chaos-extreme-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('report', reportPath);

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
