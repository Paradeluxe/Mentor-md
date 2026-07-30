// Regression matrix for annotation-anchor lifecycle failures.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  let pass = 0;
  let fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + name);
      pass++;
    } catch (error) {
      console.log('  ✗ ' + name + ': ' + (error && error.message ? error.message : error));
      fail++;
    }
  };

  await page.goto('http://127.0.0.1:8787/index.html?anchor-lifecycle=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));

  const setup = async (html) => page.evaluate((html) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    M.openNewTabBlank();
    M.State.annotations = [];
    M.State.activeThreadId = null;
    M.State._suspendAnnValidate = true;
    try {
      ed.commands.setContent(html, false);
    } finally {
      M.State._suspendAnnValidate = false;
    }
  }, html);

  const markRanges = async (threadId) => page.evaluate((threadId) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const out = [];
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const hit = node.marks.some((mark) => mark.type.name === 'annotation' && mark.attrs.threadId === threadId);
      if (hit) out.push({ from: pos, to: pos + node.nodeSize, text: node.text || '' });
    });
    return out;
  }, threadId);

  const createNth = async (needle, occurrence = 0) => page.evaluate(({ needle, occurrence }) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const hits = [];
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      let from = 0;
      while ((from = node.text.indexOf(needle, from)) !== -1) {
        hits.push({ from: pos + from, to: pos + from + needle.length });
        from += 1;
      }
    });
    const hit = hits[occurrence];
    if (!hit) return null;
    const thread = M._testCreateAnnotation(hit.from, hit.to, needle);
    if (!thread) return null;
    thread.pending = false;
    thread.comments = [{
      id: 'c-' + Math.random().toString(16).slice(2),
      author: { id: 'u', name: 'U' },
      body: 'anchor lifecycle',
      createdAt: new Date().toISOString(),
    }];
    return { threadId: thread.threadId, hit };
  }, { needle, occurrence });

  console.log('=== annotation-anchor-lifecycle ===');

  await t('source edit restores duplicate selected occurrence and annotation occurrence', async () => {
    await setup('<p>LEFT_A TOKEN RIGHT_A</p><p>LEFT_B TOKEN RIGHT_B</p>');
    const selectionBefore = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const hits = [];
      ed.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        let i = 0;
        while ((i = node.text.indexOf('TOKEN', i)) !== -1) {
          hits.push({ from: pos + i, to: pos + i + 5 });
          i += 1;
        }
      });
      ed.commands.setTextSelection(hits[1]);
      return hits[1];
    });
    const made = await createNth('TOKEN', 1);
    if (!made) throw new Error('thread not created');
    const state = await page.evaluate((threadId) => {
      const M = window.__mdAnnotator;
      M.setRenderMode('source');
      const source = document.querySelector('#source-view');
      source.textContent = 'INSERTED\n\n' + source.innerText;
      const markdown = M.flushSourceView();
      M.setRenderMode('rendered');
      const selection = { from: M.State.editor.state.selection.from, to: M.State.editor.state.selection.to };
      const thread = M.State.annotations.find((a) => a.threadId === threadId);
      const saved = M.serializeAnnotationThread(thread);
      return {
        markdown,
        range: thread.range,
        savedRange: saved.range,
        prefix: thread.prefix,
        savedPrefix: saved.prefix,
        anchorPosition: saved.anchor && saved.anchor.position,
        selection,
        invalid: !!thread.invalid,
      };
    }, made.threadId);
    const marks = await markRanges(made.threadId);
    if (marks.length !== 1 || marks[0].text !== 'TOKEN') throw new Error('mark not synchronously restored: ' + JSON.stringify(marks));
    if (marks[0].from !== state.range.from || marks[0].to !== state.range.to) throw new Error('thread range stale: ' + JSON.stringify({ marks, state }));
    if (state.savedRange.from !== marks[0].from || state.savedRange.to !== marks[0].to) throw new Error('saved range stale: ' + JSON.stringify(state));
    if (!state.anchorPosition || state.anchorPosition.from !== marks[0].from || state.anchorPosition.to !== marks[0].to) throw new Error('saved anchor.position stale: ' + JSON.stringify(state));
    if (state.selection.from !== marks[0].from || state.selection.to !== marks[0].to) throw new Error('source selection restored to wrong duplicate: ' + JSON.stringify({ selectionBefore, state, marks }));
    if (!state.prefix.includes('INSERTED')) throw new Error('context not refreshed: ' + JSON.stringify(state));
    if (state.invalid) throw new Error('thread invalid after exact reattach');
  });

  await t('cross-block mark validation preserves separators and multi-range metadata', async () => {
    await setup('<p>alpha first</p><p>beta second</p>');
    const state = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      let from = null;
      let to = null;
      const ranges = [];
      ed.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        if ((node.text || '').includes('alpha')) {
          from = pos;
          ranges.push({ from: pos, to: pos + node.nodeSize });
        }
        if ((node.text || '').includes('beta')) {
          to = pos + node.nodeSize;
          ranges.push({ from: pos, to: pos + node.nodeSize });
        }
      });
      const text = ed.state.doc.textBetween(from, to, ' ');
      const thread = M._testCreateAnnotation(from, to, text);
      thread.ranges = ranges;
      thread.pending = false;
      thread.comments = [];
      M._validateMarksAfterEdit(ed, { phase: 'full' });
      return {
        threadId: thread.threadId,
        text: thread.text,
        original: text,
        range: thread.range,
        ranges: thread.ranges,
        fuzzy: !!thread.fuzzy,
        invalid: !!thread.invalid,
        reason: thread.invalidReason || null,
      };
    });
    const marks = await markRanges(state.threadId);
    if (state.text !== state.original) throw new Error('separator lost: ' + JSON.stringify(state));
    if (state.fuzzy || state.invalid || state.reason) throw new Error('healthy cross-block thread was flagged: ' + JSON.stringify(state));
    const from = Math.min(...marks.map((m) => m.from));
    const to = Math.max(...marks.map((m) => m.to));
    if (state.range.from !== from || state.range.to !== to) throw new Error('aggregate range mismatch: ' + JSON.stringify({ state, marks }));
  });

  await t('multi-range table cells survive save and reload with both marks', async () => {
    await setup('<table><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table>');
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const cells = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.isText) cells.push({ text: node.text, from: pos, to: pos + node.nodeSize });
      });
      const wanted = [cells.find((x) => x.text === 'A1'), cells.find((x) => x.text === 'B2')];
      const threadId = 'multi-range-' + Date.now();
      const thread = {
        threadId,
        text: 'A1 B2',
        prefix: '',
        suffix: '',
        range: { from: wanted[0].from, to: wanted[1].to },
        ranges: wanted.map(({ from, to }) => ({ from, to })),
        resolved: false,
        createdAt: new Date().toISOString(),
        comments: [],
      };
      M.State.annotations = [thread];
      let tr = ed.state.tr;
      const mark = ed.schema.marks.annotation.create({ threadId });
      for (const range of thread.ranges) tr = tr.addMark(range.from, range.to, mark);
      tr.setMeta('__activeMarkSync', true);
      ed.view.dispatch(tr);
      M._validateMarksAfterEdit(ed, { phase: 'full' });
      const sidecar = M.buildAnnotationsSidecar();
      const markdown = M.htmlToMarkdown(ed.getHTML());
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('multi-range.mentor', markdown, { version: '1', annotations: sidecar });
      const loaded = M.State.annotations.find((a) => a.threadId === threadId);
      const marks = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((m) => m.type.name === 'annotation' && m.attrs.threadId === threadId)) {
          marks.push({ text: node.text, from: pos, to: pos + node.nodeSize });
        }
      });
      return { loaded, marks, audit: M.collectLiveAnnotationAudit() };
    });
    if (!result.loaded || result.loaded.invalid || result.loaded.deleted || result.loaded.fuzzy) throw new Error('multi-range invalid after load: ' + JSON.stringify(result));
    if (result.marks.length !== 2 || result.marks.map((m) => m.text).join(' ') !== 'A1 B2') throw new Error('multi-range marks not restored: ' + JSON.stringify(result));
    if (!Array.isArray(result.loaded.ranges) || result.loaded.ranges.length !== 2) throw new Error('multi-range metadata lost: ' + JSON.stringify(result));
    if (!result.audit.healthy) throw new Error('multi-range audit failed: ' + JSON.stringify(result.audit));
  });

  await t('duplicate image src uses alt/title/range evidence instead of first hit', async () => {
    await setup('<p><img src="media/x.png" alt="one"></p><p><img src="media/x.png" alt="two"></p>');
    const state = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const images = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') images.push({ pos, alt: node.attrs.alt, src: node.attrs.src });
      });
      const second = images[1];
      const thread = {
        threadId: 'img-second',
        text: 'two',
        range: { from: second.pos, to: second.pos + 1 },
        imageAnchors: [{ from: 999, to: 1000, src: second.src, alt: 'two', title: '' }],
        comments: [],
      };
      M.State.annotations = [thread];
      const sync = M.resyncImageAnchors(thread, ed.state.doc);
      return { images, sync, thread };
    });
    const second = state.images[1];
    const anchor = state.thread.imageAnchors[0];
    if (!anchor || anchor.from !== second.pos || anchor.alt !== 'two') throw new Error('image moved to wrong duplicate: ' + JSON.stringify(state));
  });

  await t('global load allocation rejects two threads claiming one unique occurrence', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const sidecar = {
        annotations: [
          { threadId: 'claim-a', text: 'UNIQUE', prefix: 'pre ', suffix: ' post', range: { from: 999, to: 1005 }, comments: [] },
          { threadId: 'claim-b', text: 'UNIQUE', prefix: 'pre ', suffix: ' post', range: { from: 999, to: 1005 }, comments: [] },
        ],
      };
      M.loadMarkdownIntoEditor('collision.md', 'pre UNIQUE post', sidecar, { alreadyPrepared: true });
      const marks = [];
      M.State.editor.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        for (const mark of node.marks) {
          if (mark.type.name === 'annotation') marks.push({ threadId: mark.attrs.threadId, from: pos, to: pos + node.nodeSize });
        }
      });
      return {
        threads: M.State.annotations.map((a) => ({ threadId: a.threadId, range: a.range, invalid: !!a.invalid, reason: a.invalidReason, status: a.anchor && a.anchor.status })),
        marks,
        audit: M.collectLiveAnnotationAudit(),
      };
    });
    if (result.marks.length !== 0) throw new Error('collision silently attached a mark: ' + JSON.stringify(result));
    if (result.threads.length !== 2 || result.threads.some((t) => !t.invalid || t.reason !== 'collision' || t.status !== 'collision' || t.range !== null)) {
      throw new Error('collision threads not preserved unresolved: ' + JSON.stringify(result));
    }
  });

  await t('duplicate image src decorates only the resolved image position', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const sidecar = {
        annotations: [{
          threadId: 'img-right',
          text: '[图片]',
          range: { from: 999, to: 1000 },
          imageAnchors: [{ from: 999, to: 1000, src: 'media/same.png', alt: 'right', title: '' }],
          comments: [],
        }],
      };
      M.loadMarkdownIntoEditor('images.md', '![left](media/same.png)\n\n![right](media/same.png)', sidecar, { alreadyPrepared: true });
      M.refreshAnnotationImageDecos();
      return {
        thread: M.State.annotations[0],
        images: Array.from(M.State.editor.view.dom.querySelectorAll('img')).map((img, index) => ({
          index,
          alt: img.alt,
          threadId: img.dataset.threadId || null,
          decorated: img.dataset.annotationImage || null,
        })),
      };
    });
    const hits = result.images.filter((img) => img.threadId === 'img-right' && img.decorated === '1');
    if (hits.length !== 1 || hits[0].alt !== 'right') throw new Error('duplicate src decorated wrong/all images: ' + JSON.stringify(result));
  });

  await t('overlapping annotation marks coexist and deletion preserves the survivor', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('overlap-live.md', 'alpha bravo charlie', { annotations: [] }, { alreadyPrepared: true });
      const outer = M._testCreateAnnotation(1, 20, 'alpha bravo charlie');
      const inner = M._testCreateAnnotation(7, 20, 'bravo charlie');
      const collect = () => {
        const byThread = {};
        M.State.editor.state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          for (const mark of node.marks) {
            if (mark.type.name !== 'annotation') continue;
            const tid = mark.attrs.threadId;
            if (!byThread[tid]) byThread[tid] = [];
            byThread[tid].push({ from: pos, to: pos + node.nodeSize, text: node.text });
          }
        });
        return byThread;
      };
      const before = collect();
      const beforeAudit = M.collectLiveAnnotationAudit();
      M._testDeleteThread(inner.threadId);
      const after = collect();
      const afterAudit = M.collectLiveAnnotationAudit();
      return { outerId: outer.threadId, innerId: inner.threadId, before, beforeAudit, after, afterAudit, threads: M.State.annotations.map((a) => a.threadId) };
    });
    if (!result.beforeAudit.healthy || !result.before[result.outerId] || !result.before[result.innerId]) {
      throw new Error('overlap marks did not coexist: ' + JSON.stringify(result));
    }
    const overlapPiece = result.before[result.outerId].some((r) => r.from <= 7 && r.to >= 20);
    if (!overlapPiece) throw new Error('outer mark missing inside overlap: ' + JSON.stringify(result));
    if (!result.afterAudit.healthy || !result.after[result.outerId] || result.after[result.innerId] || result.threads.includes(result.innerId)) {
      throw new Error('deleting inner damaged survivor: ' + JSON.stringify(result));
    }
  });

  await t('overlapping annotations survive serialized reload with both marks', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('overlap-reload.md', 'alpha bravo charlie', { annotations: [] }, { alreadyPrepared: true });
      const outer = M._testCreateAnnotation(1, 20, 'alpha bravo charlie');
      const inner = M._testCreateAnnotation(7, 20, 'bravo charlie');
      const sidecar = { version: '1', annotations: M.State.annotations.map((a) => M.serializeAnnotationThread(a)) };
      M.loadMarkdownIntoEditor('overlap-reload.md', 'alpha bravo charlie', sidecar, { alreadyPrepared: true, forceDisk: true });
      const ids = new Set();
      M.State.editor.state.doc.descendants((node) => {
        if (!node.isText) return;
        for (const mark of node.marks) if (mark.type.name === 'annotation') ids.add(mark.attrs.threadId);
      });
      return { ids: Array.from(ids), expected: [outer.threadId, inner.threadId], audit: M.collectLiveAnnotationAudit(), threads: M.State.annotations };
    });
    if (!result.audit.healthy || result.ids.length !== 2 || result.expected.some((id) => !result.ids.includes(id)) || result.threads.some((a) => a.invalid || a.deleted)) {
      throw new Error('overlap lost after reload: ' + JSON.stringify(result));
    }
  });

  await t('overlapping marks survive source and WYSIWYG roundtrip', async () => {
    const result = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('overlap-source.md', 'alpha bravo charlie', { annotations: [] }, { alreadyPrepared: true });
      const outer = M._testCreateAnnotation(1, 20, 'alpha bravo charlie');
      const inner = M._testCreateAnnotation(7, 20, 'bravo charlie');
      document.querySelector('#btn-toggle-render').click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      document.querySelector('#btn-toggle-render').click();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const ids = new Set();
      M.State.editor.state.doc.descendants((node) => {
        if (!node.isText) return;
        for (const mark of node.marks) if (mark.type.name === 'annotation') ids.add(mark.attrs.threadId);
      });
      return { ids: Array.from(ids), expected: [outer.threadId, inner.threadId], audit: M.collectLiveAnnotationAudit(), mode: M.State.renderMode };
    });
    if (result.mode !== 'rendered' || !result.audit.healthy || result.ids.length !== 2 || result.expected.some((id) => !result.ids.includes(id))) {
      throw new Error('overlap lost in source roundtrip: ' + JSON.stringify(result));
    }
  });

  await t('small-then-large contained middle stays healthy and savable', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('overlap-contain.md', 'alpha bravo charlie delta', { annotations: [] }, { alreadyPrepared: true, forceDisk: true });
      const ed = M.State.editor;
      const mk = (from, to, body) => {
        ed.commands.setTextSelection({ from, to });
        const t = M.createAnnotationFromSelection();
        if (!t) return null;
        M.addReply(t.threadId, body);
        return t;
      };
      const small = mk(7, 12, 'small');
      const large = mk(1, 20, 'large');
      const audit = M.collectLiveAnnotationAudit();
      let snapErr = null;
      let snap = null;
      try {
        snap = M.createSaveSnapshot();
      } catch (e) {
        snapErr = { message: e && e.message, code: e && e.code, audit: e && e.audit };
      }
      const marks = {};
      ed.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        for (const m of node.marks) {
          if (m.type.name !== 'annotation') continue;
          const tid = m.attrs.threadId;
          if (!marks[tid]) marks[tid] = [];
          marks[tid].push({ from: pos, to: pos + node.nodeSize, text: node.text });
        }
      });
      const bravoIds = new Set();
      ed.state.doc.nodesBetween(7, 12, (node) => {
        if (!node.isText) return;
        for (const m of node.marks) {
          if (m.type.name === 'annotation') bravoIds.add(m.attrs.threadId);
        }
      });
      return {
        smallId: small && small.threadId,
        largeId: large && large.threadId,
        threads: M.State.annotations.map((a) => ({
          id: a.threadId,
          text: a.text,
          range: a.range,
          invalid: !!a.invalid,
          status: a.anchor && a.anchor.status,
        })),
        marks,
        bravoIds: Array.from(bravoIds),
        audit,
        snapErr,
        snapOk: !!(snap && snap.sidecar),
        sidecar: snap && snap.sidecar && (snap.sidecar.annotations || snap.sidecar).map
          ? (Array.isArray(snap.sidecar) ? snap.sidecar : snap.sidecar.annotations || []).map((a) => ({
              id: a.threadId,
              text: a.text,
              range: a.range,
            }))
          : null,
      };
    });
    if (!result.smallId || !result.largeId) throw new Error('create failed: ' + JSON.stringify(result));
    if (!result.audit.healthy) throw new Error('audit unhealthy: ' + JSON.stringify(result.audit));
    if (result.snapErr) throw new Error('save blocked: ' + JSON.stringify(result.snapErr));
    if (!result.snapOk) throw new Error('snapshot missing: ' + JSON.stringify(result));
    if (!result.bravoIds.includes(result.smallId) || !result.bravoIds.includes(result.largeId)) {
      throw new Error('overlap node missing both marks: ' + JSON.stringify(result));
    }
    const largeT = result.threads.find((t) => t.id === result.largeId);
    if (!largeT || largeT.range.from !== 1 || largeT.range.to !== 20 || largeT.text !== 'alpha bravo charlie') {
      throw new Error('large range/text wrong: ' + JSON.stringify(result));
    }
    const smallT = result.threads.find((t) => t.id === result.smallId);
    if (!smallT || smallT.range.from !== 7 || smallT.range.to !== 12 || smallT.text !== 'bravo') {
      throw new Error('small range/text wrong: ' + JSON.stringify(result));
    }
  });

  await t('large-then-small and partial-overlap stay healthy and savable', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const run = (name, ops) => {
        M.openNewTabBlank();
        M.loadMarkdownIntoEditor(name + '.md', 'alpha bravo charlie delta', { annotations: [] }, { alreadyPrepared: true, forceDisk: true });
        const ed = M.State.editor;
        const ids = [];
        for (const [from, to, body] of ops) {
          ed.commands.setTextSelection({ from, to });
          const t = M.createAnnotationFromSelection();
          if (t) {
            M.addReply(t.threadId, body);
            ids.push(t.threadId);
          }
        }
        const audit = M.collectLiveAnnotationAudit();
        let snapErr = null;
        try {
          M.createSaveSnapshot();
        } catch (e) {
          snapErr = { message: e && e.message, code: e && e.code, audit: e && e.audit };
        }
        return {
          name,
          n: ids.length,
          healthy: !!(audit && audit.healthy),
          codes: (audit && audit.errors || []).map((e) => e.code),
          snapErr,
          threads: M.State.annotations.map((a) => ({ id: a.threadId, text: a.text, range: a.range })),
        };
      };
      return [
        run('big-then-small', [[1, 20, 'big'], [7, 12, 'small']]),
        run('partial-ab', [[1, 12, 'a'], [7, 16, 'b']]),
        run('partial-ba', [[7, 16, 'b'], [1, 12, 'a']]),
        run('same-from', [[1, 12, 'a'], [1, 20, 'b']]),
        run('same-to', [[7, 20, 'a'], [1, 20, 'b']]),
      ];
    });
    for (const row of result) {
      if (row.n !== 2 || !row.healthy || row.snapErr) {
        throw new Error('matrix row failed: ' + JSON.stringify(row));
      }
    }
  });

  await t('mentor handle open preserves references before citation anchor restore', async () => {
    const result = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const manifest = {
        version: 1,
        source: { name: 'refs.json', format: 'json' },
        entries: [{ key: 'alpha2020', type: 'article-journal', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2020]] }, title: 'Alpha paper' }],
      };
      const sidecar = { version: '1', annotations: [] };
      const blob = await M.buildMentorZipBlob('See [@alpha2020] now.', sidecar, {}, manifest);
      const file = new File([blob], 'citation-handle.mentor', { type: 'application/zip', lastModified: Date.now() });
      const handle = {
        name: file.name,
        async getFile() { return file; },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      await M.openFromMentorHandle(handle, { quiet: true, forceDisk: true });
      return {
        referenceKeys: (M.State.references.entries || []).map((e) => e.key),
        citations: Array.from(document.querySelectorAll('.mentor-citation')).map((el) => ({ key: el.dataset.key, text: el.textContent })),
      };
    });
    if (!result.referenceKeys.includes('alpha2020')) throw new Error('handle path dropped references: ' + JSON.stringify(result));
    if (result.citations.length !== 1 || result.citations[0].key !== 'alpha2020') throw new Error('citation node not reconciled with handle references: ' + JSON.stringify(result));
  });

  await t('mark recovery permits intentional partial overlap', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const ed = M.State.editor;
      M.State._suspendAnnValidate = true;
      try { ed.commands.setContent('<p>alpha bravo charlie</p>', false); }
      finally { M.State._suspendAnnValidate = false; }
      let start = null;
      ed.state.doc.descendants((node, pos) => { if (node.isText && start == null) start = pos; });
      const outerMark = ed.schema.marks.annotation.create({ threadId: 'outer', resolved: false, authorColor: 0 });
      ed.view.dispatch(ed.state.tr.addMark(start, start + 11, outerMark));
      M.State.annotations = [
        { threadId: 'outer', text: 'alpha bravo', prefix: '', suffix: ' charlie', range: { from: start, to: start + 11 }, comments: [] },
        { threadId: 'inner', text: 'bravo charlie', prefix: 'alpha ', suffix: '', range: { from: start + 6, to: start + 19 }, comments: [] },
      ];
      M._validateMarksAfterEdit(ed, { phase: 'full' });
      const marks = [];
      ed.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        for (const mark of node.marks) if (mark.type.name === 'annotation') marks.push({ threadId: mark.attrs.threadId, from: pos, to: pos + node.nodeSize, text: node.text });
      });
      return { threads: M.State.annotations, marks };
    });
    const inner = result.threads.find((t) => t.threadId === 'inner');
    if (!inner || inner.invalid || !result.marks.some((m) => m.threadId === 'inner')) throw new Error('partial overlap recovery blocked: ' + JSON.stringify(result));
  });

  await t('weak fuzzy context does not attach a duplicate to the wrong occurrence', async () => {
    const result = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State._suspendAnnValidate = true;
      try { M.State.editor.commands.setContent('<p>ABCDEFGH xxx tok q</p><p>ABCDEFGH yyy tok r</p><p>nothing here</p>', false); }
      finally { M.State._suspendAnnValidate = false; }
      const found = M.findAnnotationRange(M.State.editor.state.doc, {
        text: 'tok',
        prefix: 'ZZZZABCDEFGH',
        suffix: '',
        range: { from: 56, to: 59 },
      });
      return found;
    });
    if (!result || !result.ambiguous || typeof result.from === 'number') {
      throw new Error('weak 8-char context silently attached: ' + JSON.stringify(result));
    }
  });

  await t('live edits keep legacy range and anchor evidence synchronized', async () => {
    await setup('<p>AAA TOKEN ZZZ</p>');
    const made = await createNth('TOKEN', 0);
    if (!made) throw new Error('thread not created');
    const state = await page.evaluate((threadId) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      ed.commands.insertContentAt(1, 'PREFIX ');
      M._validateMarksAfterEdit(ed, { phase: 'full' });
      const thread = M.State.annotations.find((a) => a.threadId === threadId);
      const saved = M.serializeAnnotationThread(thread);
      return { thread, saved };
    }, made.threadId);
    const marks = await markRanges(made.threadId);
    if (marks.length !== 1) throw new Error('mark missing: ' + JSON.stringify(marks));
    const mark = marks[0];
    for (const source of [state.thread, state.saved]) {
      if (!source.anchor || !source.anchor.position) throw new Error('anchor position missing');
      if (source.range.from !== mark.from || source.range.to !== mark.to) throw new Error('range stale: ' + JSON.stringify(source));
      if (source.anchor.position.from !== mark.from || source.anchor.position.to !== mark.to) throw new Error('anchor position stale: ' + JSON.stringify(source));
      if (source.anchor.quote.prefix !== source.prefix || source.anchor.quote.suffix !== source.suffix) throw new Error('quote context stale: ' + JSON.stringify(source));
    }
  });

  console.log(`\nTOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
