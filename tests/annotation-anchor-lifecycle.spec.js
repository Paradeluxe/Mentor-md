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
