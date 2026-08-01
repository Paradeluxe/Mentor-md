// e2e: openFromDocxFile imports Word comments into Mentor annotations
// Requires server on :8787
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const {
  makeCommentDocxFixture,
  makeMinimalDocx,
} = require('./helpers/docx-fixture');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:8787/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.openFromDocxFile, null, {
    timeout: 15000,
  });

  // Fixture with threaded comments
  const buf = await makeCommentDocxFixture();
  const b64 = Buffer.from(buf).toString('base64');

  const result = await page.evaluate(async (b64str) => {
    const bin = atob(b64str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'fixture-comments.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await window.__mdAnnotator.openFromDocxFile(file, { quiet: true });
    const anns = (window.__mdAnnotator.State && window.__mdAnnotator.State.annotations) || [];
    const body = window.__mdAnnotator.State.editor
      ? window.__mdAnnotator.State.editor.getText()
      : '';
    return {
      annCount: anns.length,
      bodies: anns.flatMap((t) => (t.comments || []).map((c) => c.body)),
      authors: anns.flatMap((t) => (t.comments || []).map((c) => (c.author && c.author.name) || '')),
      texts: anns.map((t) => t.text),
      bodyHasHello: /hello/i.test(body),
      fileName: window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.name,
    };
  }, b64);

  if (!(result.annCount >= 1)) throw new Error('expected annotations, got ' + JSON.stringify(result));
  if (!result.bodies.some((b) => /root note/i.test(b))) throw new Error('missing root note: ' + JSON.stringify(result));
  if (!result.bodies.some((b) => /reply/i.test(b))) throw new Error('missing reply: ' + JSON.stringify(result));
  if (!result.bodyHasHello) throw new Error('body missing Hello: ' + JSON.stringify(result));
  console.log('ok openFromDocxFile with comments', result);

  // Empty comments DOCX still opens body
  const emptyBuf = await makeMinimalDocx({
    documentXml:
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Solo body</w:t></w:r></w:p></w:body></w:document>',
  });
  const emptyB64 = Buffer.from(emptyBuf).toString('base64');
  const emptyRes = await page.evaluate(async (b64str) => {
    const bin = atob(b64str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'empty.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await window.__mdAnnotator.openFromDocxFile(file, { quiet: true });
    const anns = (window.__mdAnnotator.State && window.__mdAnnotator.State.annotations) || [];
    const body = window.__mdAnnotator.State.editor
      ? window.__mdAnnotator.State.editor.getText()
      : '';
    return { annCount: anns.length, body };
  }, emptyB64);
  if (emptyRes.annCount !== 0) throw new Error('expected 0 anns: ' + JSON.stringify(emptyRes));
  if (!/Solo body/i.test(emptyRes.body)) throw new Error('missing Solo body');
  console.log('ok openFromDocxFile body-only');

  await browser.close();
  console.log('\nPASS e2e-docx-import-open');
})().catch(async (err) => {
  console.error(err.stack || err);
  process.exit(1);
});
