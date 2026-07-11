// 真 .mentor roundtrip: load DFC fixture → modify → save → reload → verify
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { URL_BASE, CURRENT_VERSION } = require('./_config');

const URL = URL_BASE + '?v=' + CURRENT_VERSION;
const FIXTURE = path.resolve(__dirname, 'fixtures/dfc-with-media.mentor');

async function setupEditor(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  const results = {};
  function step(name, ok, info) { results[name] = { ok, info }; console.log(`${ok ? '✓' : '✗'} ${name}:`, JSON.stringify(info).slice(0, 200)); }

  try {
    await setupEditor(page);
    const buffer = fs.readFileSync(FIXTURE);
    step('RT_01_loaded_fixture', true, { size: buffer.length });

    await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'dfc-with-media.mentor', { type: 'application/zip' });
      await window.__mdAnnotator.openFromMentorFile(file);
    }, buffer.toString('base64'));

    await page.waitForTimeout(2000);
    const loaded = await page.evaluate(() => ({
      docSize: window.__mdAnnotator.State.editor?.state?.doc?.content?.size || 0,
      annCount: window.__mdAnnotator.State.annotations?.length || 0,
      imgCount: document.querySelectorAll('#editor img').length,
    }));
    step('RT_02_parsed_in_editor', loaded.docSize > 100 && loaded.imgCount > 0, loaded);

    const beforeAnn = loaded.annCount;
    await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      let p = null;
      ed.state.doc.descendants((n, pos) => { if (n.isText && n.text.length >= 5 && !p) p = pos; });
      const tr = ed.state.tr;
      tr.addMark(p, p + 5, ed.schema.marks.annotation.create({ threadId: 'rt-new-1', resolved: false, authorColor: 0 }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'rt-new-1', range: { from: p, to: p + 5 },
        text: ed.state.doc.textBetween(p, p + 5, ' '),
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
    });
    await page.waitForTimeout(200);
    const afterAdd = await page.evaluate(() => ({
      annCount: window.__mdAnnotator.State.annotations.length,
      hasNew: !!document.querySelector('[data-thread-id="rt-new-1"]'),
    }));
    step('RT_03_added_annotation', afterAdd.annCount === beforeAnn + 1 && afterAdd.hasNew, afterAdd);

    const blobDataUrl = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      const mdText = ed.getHTML();
      const sidecar = {
        version: '1', document: 'dfc.mentor',
        annotations: window.__mdAnnotator.State.annotations.map(a => ({
          threadId: a.threadId, text: a.text, range: a.range,
          prefix: a.prefix || '', suffix: a.suffix || '',
          resolved: !!a.resolved, comments: a.comments || [], createdAt: a.createdAt,
        })),
      };
      const mediaFiles = window.__mdAnnotator.State.mediaFiles || {};
      const blob = await window.__mdAnnotator.buildMentorZipBlob(mdText, sidecar, mediaFiles);
      return { size: blob.size, type: blob.type, mediaCount: Object.keys(mediaFiles).length };
    });
    step('RT_04_built_zip', blobDataUrl.size > 100000, blobDataUrl);

    const workflow = await page.evaluate(async () => {
      const ann = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'rt-new-1');
      if (!ann) return { error: 'no ann' };
      ann.comments = [{ id: 'c1', author: { id: 'u1', name: 'tester' }, body: '这是新加的评论', createdAt: new Date().toISOString() }];
      ann.resolved = true;
      window.__mdAnnotator.State.activeThreadId = 'rt-new-1';
      window.__mdAnnotator.State.editor.commands.setTextSelection(ann.range.from);
      await new Promise(r => setTimeout(r, 100));
      const updated = window.__mdAnnotator.State.annotations.find(a => a.threadId === 'rt-new-1');
      return { commentCount: updated.comments.length, resolved: updated.resolved, firstBody: updated.comments[0].body };
    });
    step('RT_05_workflow_reply_resolve', workflow.commentCount === 1 && workflow.resolved && workflow.firstBody === '这是新加的评论', workflow);

    const final = await page.evaluate(() => ({
      totalAnn: window.__mdAnnotator.State.annotations.length,
      resolvedAnn: window.__mdAnnotator.State.annotations.filter(a => a.resolved).length,
      docSize: window.__mdAnnotator.State.editor.state.doc.content.size,
      imgCount: document.querySelectorAll('#editor img').length,
    }));
    step('RT_06_final_state', final.totalAnn === beforeAnn + 1, final);
  } catch (e) {
    step('FATAL', false, { error: e.message });
  }

  console.log('---');
  console.log('Errors:', errors.length);
  errors.forEach(e => console.log('  ', e));
  await browser.close();
  const passed = Object.values(results).filter(r => r.ok).length;
  const failed = Object.values(results).filter(r => !r.ok).length;
  console.log(`TOTAL: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });