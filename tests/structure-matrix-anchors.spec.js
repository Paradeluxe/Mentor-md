/**
 * Structure matrix: annotations across paragraphs, headings, lists, tables, code, CJK.
 * Headless Playwright against local Mentor :8787
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e.message || e)));

  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + name);
      pass++;
    } catch (e) {
      console.log('  ✗ ' + name + ': ' + e.message);
      fail++;
    }
  };

  await page.goto('http://127.0.0.1:8787/index.html?matrix=anchor&cb=' + Date.now(), {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
  });

  console.log('=== structure-matrix-anchors ===');

  const setup = async (html) => page.evaluate((html) => {
    const M = window.__mdAnnotator;
    M.openNewTabBlank();
    M.State.editor.commands.setContent(html);
    M.State.annotations = [];
    M.State.activeThreadId = null;
    return true;
  }, html);

  const annotate = async (needle, body = 'm') => page.evaluate(({ needle, body }) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    let hit = null;
    ed.state.doc.descendants((n, pos) => {
      if (hit || !n.isText || !n.text) return;
      const i = n.text.indexOf(needle);
      if (i >= 0) hit = { from: pos + i, to: pos + i + needle.length };
    });
    if (!hit) return null;
    ed.commands.setTextSelection(hit);
    const thr = M._testCreateAnnotation
      ? M._testCreateAnnotation(hit.from, hit.to, needle)
      : null;
    if (!thr) return null;
    thr.comments = thr.comments || [];
    thr.comments.push({
      id: 'm' + Math.random().toString(16).slice(2, 6),
      author: { id: 'u', name: 'U' },
      body,
      createdAt: new Date().toISOString(),
    });
    thr.pending = false;
    return thr.threadId;
  }, { needle, body });

  const roundtrip = async (name) => page.evaluate((name) => {
    const M = window.__mdAnnotator;
    const md = M.htmlToMarkdown(M.State.editor.getHTML());
    const anns = M.State.annotations.map((a) => ({
      threadId: a.threadId,
      text: a.text,
      prefix: a.prefix || '',
      suffix: a.suffix || '',
      resolved: false,
      createdAt: a.createdAt || new Date().toISOString(),
      comments: a.comments || [],
      anchor: a.anchor || null,
    }));
    M.openNewTabBlank();
    M.loadMarkdownIntoEditor(name, md, { version: '1', annotations: anns });
    return M.State.annotations.map((a) => ({
      tid: a.threadId,
      text: a.text,
      invalid: !!a.invalid,
      deleted: !!a.deleted,
      reason: a.invalidReason || null,
      hasRange: !!(a.range && typeof a.range.from === 'number'),
      status: a.anchor && a.anchor.status,
    }));
  }, name);

  await t('paragraph anchor survives roundtrip', async () => {
    await setup('<p>Intro paragraph with ALPHA-TOKEN here.</p><p>Other paragraph.</p>');
    const id = await annotate('ALPHA-TOKEN');
    if (!id) throw new Error('no id');
    const after = await roundtrip('p.mentor');
    const a = after.find((x) => x.tid === id);
    if (!a || !a.hasRange || a.invalid) throw new Error(JSON.stringify(after));
  });

  await t('heading anchor survives roundtrip', async () => {
    await setup('<h2>Heading with HEAD-TOKEN title</h2><p>Body text.</p>');
    const id = await annotate('HEAD-TOKEN');
    if (!id) throw new Error('no id');
    const after = await roundtrip('h.mentor');
    const a = after.find((x) => x.tid === id);
    if (!a || !a.hasRange || a.invalid) throw new Error(JSON.stringify(after));
  });

  await t('list item anchor survives roundtrip', async () => {
    await setup('<ul><li>First LIST-TOKEN item</li><li>Second item</li></ul>');
    const id = await annotate('LIST-TOKEN');
    if (!id) throw new Error('no id');
    const after = await roundtrip('li.mentor');
    const a = after.find((x) => x.tid === id);
    if (!a || !a.hasRange || a.invalid) throw new Error(JSON.stringify(after));
  });

  await t('table cell anchor survives roundtrip', async () => {
    await setup('<table><tbody><tr><td>Cell TABLE-TOKEN value</td><td>Other</td></tr></tbody></table>');
    const id = await annotate('TABLE-TOKEN');
    if (!id) throw new Error('no id');
    const after = await roundtrip('td.mentor');
    const a = after.find((x) => x.tid === id);
    if (!a || !a.hasRange || a.invalid) throw new Error(JSON.stringify(after));
  });

  await t('CJK anchor survives roundtrip', async () => {
    await setup('<p>这是一段中文锚点词测试内容。</p>');
    const id = await annotate('中文锚点词');
    if (!id) throw new Error('no id');
    const after = await roundtrip('cjk.mentor');
    const a = after.find((x) => x.tid === id);
    if (!a || !a.hasRange || a.invalid) throw new Error(JSON.stringify(after));
  });

  await t('identical duplicates stay ambiguous not first-hit', async () => {
    await setup('<p>same DUP-TOKEN one</p><p>same DUP-TOKEN two</p>');
    const ids = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const hits = [];
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        let i = 0;
        while ((i = n.text.indexOf('DUP-TOKEN', i)) !== -1) {
          hits.push({ from: pos + i, to: pos + i + 'DUP-TOKEN'.length });
          i += 1;
        }
      });
      const out = [];
      for (const hit of hits) {
        ed.commands.setTextSelection(hit);
        const thr = M._testCreateAnnotation(hit.from, hit.to, 'DUP-TOKEN');
        if (!thr) continue;
        thr.comments = [{ id: 'x', author: { id: 'u', name: 'U' }, body: 'c', createdAt: new Date().toISOString() }];
        thr.pending = false;
        out.push(thr.threadId);
      }
      return out;
    });
    if (ids.length < 2) throw new Error('need 2 anns ' + JSON.stringify(ids));
    const after = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      // Force identical non-disambiguating context for both
      const anns = M.State.annotations.map((a) => ({
        threadId: a.threadId,
        text: 'DUP-TOKEN',
        prefix: 'same ',
        suffix: ' ',
        resolved: false,
        createdAt: a.createdAt || new Date().toISOString(),
        comments: a.comments || [],
      }));
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('dup.mentor', md, { version: '1', annotations: anns });
      return M.State.annotations.map((a) => ({
        reason: a.invalidReason,
        invalid: !!a.invalid,
        hasRange: !!(a.range && typeof a.range.from === 'number'),
      }));
    });
    const amb = after.filter((x) => x.reason === 'ambiguous' || (x.invalid && !x.hasRange));
    if (amb.length < 2) throw new Error('expected both ambiguous ' + JSON.stringify(after));
  });

  await t('exportAnchorDiagnosis present and healthy shape', async () => {
    await setup('<p>Diag DIAG-TOKEN end</p>');
    await annotate('DIAG-TOKEN');
    const d = await page.evaluate(() => window.__mdAnnotator.exportAnchorDiagnosis());
    if (!d || !Array.isArray(d.threads) || typeof d.healthy !== 'boolean') {
      throw new Error(JSON.stringify(d));
    }
  });

  console.log(`\nTOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
  if (pageErrs.length) console.log('pageErrs', pageErrs.length, pageErrs.slice(0, 3));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
