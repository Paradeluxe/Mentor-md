/**
 * unit: character-level DOCX commentRange inject
 * Run: node tests/unit-docx-char-range-inject.spec.js
 */
'use strict';
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

(async () => {
  const url = pathToFileURL(path.join(__dirname, '..', 'modules', 'docx-export-range.js')).href;
  const { injectCommentRangeMarkers, wrapQuoteInParagraph } = await import(url);

  {
    const body = `<w:body><w:p><w:r><w:t>AAA Hello world BBB</w:t></w:r></w:p></w:body>`;
    const out = injectCommentRangeMarkers(body, {
      commentEntries: [{ isRoot: true, commentId: 0, quoteText: 'Hello world' }],
    });
    assert.ok(out.includes('commentRangeStart'), 'has start');
    assert.ok(out.includes('commentRangeEnd'), 'has end');
    const between = out.split(/<w:commentRangeStart[^/]*\/>/)[1].split(/<w:commentRangeEnd[^/]*\/>/)[0];
    const texts = [...between.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    assert.strictEqual(texts, 'Hello world', 'range plain must equal quote, got: ' + texts);
    assert.ok(/AAA[\s\S]*commentRangeStart/.test(out), 'AAA before start');
    assert.ok(/commentRangeEnd[\s\S]*BBB/.test(out), 'BBB after end');
    console.log('PASS inject single-run quote');
  }

  {
    const p = `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>pre </w:t></w:r><w:r><w:t>TARGET</w:t></w:r><w:r><w:t> post</w:t></w:r></w:p>`;
    const r = wrapQuoteInParagraph(p, 7, 'TARGET');
    assert.ok(r.ok, r.reason);
    const between = r.xml.split(/commentRangeStart[^/]*\/>/)[1].split(/commentRangeEnd[^/]*\/>/)[0];
    const texts = [...between.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    assert.strictEqual(texts, 'TARGET');
    assert.ok(r.xml.includes('commentReference'));
    console.log('PASS wrap multi-run');
  }

  {
    const body = `<w:body><w:p><w:r><w:t>nope</w:t></w:r></w:p></w:body>`;
    const out = injectCommentRangeMarkers(body, {
      commentEntries: [{ isRoot: true, commentId: 1, quoteText: 'missing' }],
    });
    assert.ok(!out.includes('commentRangeStart'), 'must not silent-attach');
    console.log('PASS missing quote no attach');
  }

  console.log('PASS unit-docx-char-range-inject');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
