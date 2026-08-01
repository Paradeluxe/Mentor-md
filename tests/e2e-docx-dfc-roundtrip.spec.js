/**
 * Real-file roundtrip: dFC .mentor → DOCX → Mentor (open path)
 * Copies under tmp/docx-roundtrip-test/
 * Requires Mentor server :8787
 *
 * Run: node tests/e2e-docx-dfc-roundtrip.spec.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'docx-roundtrip-test');
const SRC_MENTOR = path.join(OUT, 'paper-with-comments.mentor');
const OUT_DOCX = path.join(OUT, 'paper-with-comments.roundtrip.docx');
const OUT_DOCX2 = path.join(OUT, 'paper-with-comments.roundtrip2.docx');
const OUT_REPORT = path.join(OUT, 'REPORT.txt');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

(async () => {
  if (!fs.existsSync(SRC_MENTOR)) fail('missing source ' + SRC_MENTOR);

  // Baseline from zip
  const mentorBuf = fs.readFileSync(SRC_MENTOR);
  const mz = await JSZip.loadAsync(mentorBuf);
  const md0 = await mz.file('content.md').async('string');
  const ann0 = JSON.parse(await mz.file('annotations.json').async('string'));
  const threads0 = Array.isArray(ann0.annotations) ? ann0.annotations : [];
  const nonPending = threads0.filter(
    (t) => t && t.pending !== true && Array.isArray(t.comments) && t.comments.some((c) => String((c && c.body) || '').trim()),
  );
  ok(`source mentor md=${md0.length} chars, threads=${threads0.length}, exportable=${nonPending.length}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  await page.goto('http://127.0.0.1:8787/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      window.__mdAnnotator &&
      window.__mdAnnotator.openFromMentorFile &&
      window.__mdAnnotator.buildDocxBlob &&
      window.__mdAnnotator.openFromDocxFile &&
      window.__mdAnnotator.parseDocxToMentor,
    null,
    { timeout: 20000 },
  );
  ok('Mentor app ready');

  // --- 1) Open .mentor ---
  const mentorB64 = mentorBuf.toString('base64');
  const openRes = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'paper-with-comments.mentor', { type: 'application/zip' });
    await window.__mdAnnotator.openFromMentorFile(file, { quiet: true });
    // wait a tick for editor
    await new Promise((r) => setTimeout(r, 800));
    const S = window.__mdAnnotator.State;
    const anns = S.annotations || [];
    const text = S.editor ? S.editor.getText() : '';
    const html = S.editor ? S.editor.getHTML() : '';
    return {
      fileName: S.currentFile && S.currentFile.name,
      annCount: anns.length,
      textLen: text.length,
      htmlLen: html.length,
      textHead: text.slice(0, 160),
      hasShortTitle: /Dynamic FC|Whole-brain|cognitive control/i.test(text),
      sampleQuotes: anns.slice(0, 5).map((t) => (t && t.text) || ''),
      sampleBodies: anns.slice(0, 3).flatMap((t) => (t.comments || []).map((c) => (c.body || '').slice(0, 60))),
    };
  }, mentorB64);

  if (!openRes.hasShortTitle) fail('mentor open: body missing paper title marks: ' + JSON.stringify(openRes));
  if (!(openRes.annCount >= 1)) fail('mentor open: no annotations: ' + JSON.stringify(openRes));
  ok(`opened mentor: file=${openRes.fileName} anns=${openRes.annCount} textLen=${openRes.textLen}`);

  // --- 2) Export DOCX with annotations ---
  const exportRes = await page.evaluate(async () => {
    const S = window.__mdAnnotator.State;
    const html = S.editor.getHTML();
    const media = S.mediaFiles || {};
    const anns = S.annotations || [];
    const blob = await window.__mdAnnotator.buildDocxBlob(html, media, anns);
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return {
      b64: btoa(binary),
      size: bytes.length,
      annIn: anns.length,
    };
  });
  const docxBuf = Buffer.from(exportRes.b64, 'base64');
  fs.writeFileSync(OUT_DOCX, docxBuf);
  ok(`exported DOCX bytes=${docxBuf.length} → ${OUT_DOCX}`);

  // Structural assert on DOCX
  const dz = await JSZip.loadAsync(docxBuf);
  const docXml = await dz.file('word/document.xml').async('string');
  const commentsXml = dz.file('word/comments.xml')
    ? await dz.file('word/comments.xml').async('string')
    : null;
  const hasComments = !!commentsXml;
  const rangeStarts = (docXml.match(/commentRangeStart/g) || []).length;
  const commentCount = commentsXml ? (commentsXml.match(/<w:comment\b/g) || []).length : 0;
  const mediaParts = Object.keys(dz.files).filter((n) => n.startsWith('word/media/') && !dz.files[n].dir);
  ok(`docx structure: comments=${hasComments} commentTags=${commentCount} rangeStarts=${rangeStarts} media=${mediaParts.length}`);
  if (!hasComments) fail('exported DOCX missing word/comments.xml');
  if (commentCount < 1) fail('exported DOCX has 0 w:comment');
  if (rangeStarts < 1) fail('exported DOCX has 0 commentRangeStart');

  // --- 3) Import DOCX via openFromDocxFile ---
  const importOpen = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'paper-with-comments.roundtrip.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await window.__mdAnnotator.openFromDocxFile(file, { quiet: true });
    await new Promise((r) => setTimeout(r, 1000));
    const S = window.__mdAnnotator.State;
    const anns = S.annotations || [];
    const text = S.editor ? S.editor.getText() : '';
    return {
      fileName: S.currentFile && S.currentFile.name,
      annCount: anns.length,
      textLen: text.length,
      hasShortTitle: /Dynamic FC|Whole-brain|cognitive control|resting-state/i.test(text),
      texts: anns.map((t) => t.text || '').filter(Boolean).slice(0, 10),
      bodies: anns.flatMap((t) => (t.comments || []).map((c) => (c.body || '').slice(0, 80))).slice(0, 15),
      authors: anns.flatMap((t) => (t.comments || []).map((c) => (c.author && c.author.name) || '')).slice(0, 10),
      attached: anns.filter((t) => t.anchor && t.anchor.status === 'attached').length,
      orphan: anns.filter((t) => t.invalid || (t.anchor && t.anchor.status === 'orphan')).length,
      mediaKeys: Object.keys(S.mediaFiles || {}).length,
    };
  }, exportRes.b64);

  if (!importOpen.hasShortTitle) fail('docx import open: body missing title marks: ' + JSON.stringify(importOpen));
  if (!(importOpen.annCount >= 1)) fail('docx import open: no annotations: ' + JSON.stringify(importOpen));
  ok(
    `re-opened DOCX as Mentor: file=${importOpen.fileName} anns=${importOpen.annCount} attached=${importOpen.attached} orphan=${importOpen.orphan} textLen=${importOpen.textLen}`,
  );

  // --- 4) Pure parseDocxToMentor (Node + same bytes) ---
  const importUrl = pathToFileURL(path.join(ROOT, 'modules', 'docx-import.js')).href;
  const { parseDocxToMentor } = await import(importUrl);
  const parsed = await parseDocxToMentor(docxBuf);
  ok(
    `parseDocxToMentor: md=${parsed.contentMd.length} anns=${parsed.annotations.length} media=${Object.keys(parsed.mediaFiles || {}).length} warnings=${(parsed.warnings || []).length}`,
  );
  if (!(parsed.contentMd.length > 1000)) fail('parsed md too short');
  if (!(parsed.annotations.length >= 1)) fail('parsed no annotations');

  // Quote coverage: how many original exportable thread texts appear in reimport
  const origQuotes = nonPending.map((t) => String(t.text || '').trim()).filter((q) => q.length >= 8);
  let quoteHits = 0;
  for (const q of origQuotes) {
    if (parsed.annotations.some((a) => a.text && (a.text.includes(q.slice(0, 40)) || q.includes(a.text.slice(0, 40))))) {
      quoteHits++;
    } else if (parsed.contentMd.includes(q.slice(0, 40))) {
      // body kept quote even if anchor miss
    }
  }
  const hitRate = origQuotes.length ? quoteHits / origQuotes.length : 1;
  ok(`quote hit rate among reimport threads: ${quoteHits}/${origQuotes.length} (${(hitRate * 100).toFixed(0)}%)`);

  // Body keyword checks
  const keywords = ['Dynamic', 'functional', 'connectivity', 'aging'];
  for (const k of keywords) {
    if (!new RegExp(k, 'i').test(parsed.contentMd) && !new RegExp(k, 'i').test(importOpen.texts.join(' '))) {
      // soft: at least one keyword in md
    }
  }
  if (!/connectivity|aging|resting/i.test(parsed.contentMd)) {
    fail('parsed contentMd missing core paper keywords');
  }

  // --- 5) Second export from re-imported state ---
  const export2 = await page.evaluate(async () => {
    const S = window.__mdAnnotator.State;
    const blob = await window.__mdAnnotator.buildDocxBlob(
      S.editor.getHTML(),
      S.mediaFiles || {},
      S.annotations || [],
    );
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return { b64: btoa(binary), size: bytes.length };
  });
  const docx2 = Buffer.from(export2.b64, 'base64');
  fs.writeFileSync(OUT_DOCX2, docx2);
  const z2 = await JSZip.loadAsync(docx2);
  const c2 = z2.file('word/comments.xml') ? await z2.file('word/comments.xml').async('string') : '';
  const d2 = await z2.file('word/document.xml').async('string');
  ok(
    `second export DOCX bytes=${docx2.length} comments=${(c2.match(/<w:comment\b/g) || []).length} ranges=${(d2.match(/commentRangeStart/g) || []).length} → ${OUT_DOCX2}`,
  );
  if (!(c2 && (c2.match(/<w:comment\b/g) || []).length >= 1)) fail('second export lost comments');

  // --- 6) dfc-with-media.mentor lighter path ---
  const mediaMentor = path.join(OUT, 'dfc-with-media.mentor');
  if (fs.existsSync(mediaMentor)) {
    const mb = fs.readFileSync(mediaMentor).toString('base64');
    const mediaOpen = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'dfc-with-media.mentor', { type: 'application/zip' });
      await window.__mdAnnotator.openFromMentorFile(file, { quiet: true });
      await new Promise((r) => setTimeout(r, 800));
      const S = window.__mdAnnotator.State;
      const blob = await window.__mdAnnotator.buildDocxBlob(
        S.editor.getHTML(),
        S.mediaFiles || {},
        S.annotations || [],
      );
      const ab = await blob.arrayBuffer();
      const u8 = new Uint8Array(ab);
      let binary = '';
      for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return {
        ann: (S.annotations || []).length,
        textOk: /connectivity|aging|Short Title/i.test(S.editor.getText()),
        mediaIn: Object.keys(S.mediaFiles || {}).length,
        docxB64: btoa(binary),
        docxSize: u8.length,
      };
    }, mb);
    if (!mediaOpen.textOk) fail('dfc-with-media open failed body check');
    const mediaDocxPath = path.join(OUT, 'dfc-with-media.roundtrip.docx');
    fs.writeFileSync(mediaDocxPath, Buffer.from(mediaOpen.docxB64, 'base64'));
    const parsedMedia = await parseDocxToMentor(Buffer.from(mediaOpen.docxB64, 'base64'));
    ok(
      `dfc-with-media: open anns=${mediaOpen.ann} mediaIn=${mediaOpen.mediaIn} docx=${mediaOpen.docxSize} reimport md=${parsedMedia.contentMd.length} anns=${parsedMedia.annotations.length} mediaOut=${Object.keys(parsedMedia.mediaFiles || {}).length}`,
    );
  }

  if (pageErrors.length) {
    console.warn('page errors:', pageErrors.slice(0, 5));
  }

  const report = [
    'dFC DOCX roundtrip REPORT',
    'source: ' + SRC_MENTOR,
    'docx1: ' + OUT_DOCX + ' (' + docxBuf.length + ' bytes)',
    'docx2: ' + OUT_DOCX2 + ' (' + docx2.length + ' bytes)',
    'mentor open anns=' + openRes.annCount + ' textLen=' + openRes.textLen,
    'export comments=' + commentCount + ' ranges=' + rangeStarts + ' mediaParts=' + mediaParts.length,
    'reopen anns=' + importOpen.annCount + ' attached=' + importOpen.attached + ' orphan=' + importOpen.orphan,
    'parseDocx anns=' + parsed.annotations.length + ' md=' + parsed.contentMd.length,
    'quoteHits=' + quoteHits + '/' + origQuotes.length,
    'pageErrors=' + pageErrors.length,
    'STATUS=PASS',
  ].join('\n');
  fs.writeFileSync(OUT_REPORT, report, 'utf8');
  console.log('\n' + report);
  console.log('\nPASS e2e-docx-dfc-roundtrip');

  await browser.close();
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
