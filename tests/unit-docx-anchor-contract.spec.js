/**
 * unit: DOCX ↔ Mentor anchor contract (mdRange / quote / thread shape)
 * Run: node tests/unit-docx-anchor-contract.spec.js
 */
'use strict';

const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const {
  makeMinimalDocx,
  makeCommentDocxFixture,
} = require('./helpers/docx-fixture');
const {
  assertCommentsPart,
  assertCommentRange,
  assertThreading,
} = require('./helpers/docx-assert');

(async () => {
  const importUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'docx-import.js')).href;
  const exportUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'docx-export-comments.js')).href;
  const { parseDocxToMentor } = await import(importUrl);
  const { buildCommentsParts } = await import(exportUrl);

  let pass = 0;
  function ok(name) {
    pass += 1;
    console.log('PASS', name);
  }

  // --- DOCX → Mentor: mdRange + anchor.quote align with contentMd ---
  {
    const buf = await makeCommentDocxFixture();
    const res = await parseDocxToMentor(buf);
    assert.ok(res.annotations.length >= 1, 'has thread');
    const t = res.annotations[0];
    assert.ok(t.mdRange && typeof t.mdRange.from === 'number', 'mdRange');
    assert.ok(t.anchor && t.anchor.quote, 'anchor.quote');
    assert.strictEqual(t.anchor.quote.exact, t.text, 'quote.exact === text');
    if (t.text) {
      const slice = res.contentMd.slice(t.mdRange.from, t.mdRange.to);
      assert.strictEqual(slice, t.text, `md slice "${slice}" === text "${t.text}"`);
      assert.strictEqual(t.anchor.status, 'attached');
      assert.strictEqual(t.anchor.confidence, 1);
    }
    assert.ok(Array.isArray(t.comments) && t.comments.length >= 2, 'root+reply');
    ok('DOCX→Mentor mdRange/anchor contract');
  }

  // --- Mentor annotations → comments parts → re-import shape ---
  {
    const contentMd = 'Intro paragraph.\n\nHello world is here.\n\nOutro.\n';
    const quote = 'Hello world';
    const from = contentMd.indexOf(quote);
    const annotations = [
      {
        threadId: 't-contract-1',
        text: quote,
        prefix: contentMd.slice(Math.max(0, from - 8), from),
        suffix: contentMd.slice(from + quote.length, from + quote.length + 8),
        mdRange: { from, to: from + quote.length },
        range: { from, to: from + quote.length },
        resolved: false,
        pending: false,
        createdAt: '2026-03-01T12:00:00.000Z',
        comments: [
          {
            id: 'c1',
            author: { id: 'u1', name: 'Alice' },
            body: 'root note contract',
            createdAt: '2026-03-01T12:00:00.000Z',
          },
          {
            id: 'c2',
            author: { id: 'u2', name: 'Bob' },
            body: 'reply note contract',
            createdAt: '2026-03-01T12:05:00.000Z',
          },
        ],
        anchor: {
          version: '1',
          quote: {
            exact: quote,
            prefix: contentMd.slice(Math.max(0, from - 8), from),
            suffix: contentMd.slice(from + quote.length, from + quote.length + 8),
          },
          position: null,
          status: 'attached',
          confidence: 1,
          updatedAt: '2026-03-01T12:00:00.000Z',
        },
      },
    ];

    const parts = buildCommentsParts(annotations);
    assert.ok(parts && parts.commentsXml, 'export commentsXml');
    // Root id 0, reply id 1 (export assigns sequential ids)
    assertCommentsPart(parts.commentsXml, {
      id: '0',
      author: 'Alice',
      text: 'root note contract',
    });
    assertCommentsPart(parts.commentsXml, {
      id: '1',
      author: 'Bob',
      text: 'reply note contract',
    });
    const rootEntry = (parts.commentEntries || []).find((e) => e && e.isRoot);
    assert.ok(rootEntry && rootEntry.paraId, 'root paraId');
    const replyEntry = (parts.commentEntries || []).find((e) => e && !e.isRoot);
    assert.ok(replyEntry && replyEntry.paraId, 'reply paraId');
    assertThreading(parts.commentsExtendedXml, {
      paraId: replyEntry.paraId,
      parentParaId: rootEntry.paraId,
    });

    // Build a DOCX body with range markers around Hello world
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
      '<w:body>' +
      '<w:p><w:r><w:t>Intro paragraph.</w:t></w:r></w:p>' +
      '<w:p>' +
      '<w:commentRangeStart w:id="0"/>' +
      '<w:r><w:t xml:space="preserve">Hello world</w:t></w:r>' +
      '<w:commentRangeEnd w:id="0"/>' +
      '<w:r><w:commentReference w:id="0"/></w:r>' +
      '<w:r><w:t xml:space="preserve"> is here.</w:t></w:r>' +
      '</w:p>' +
      '<w:p><w:r><w:t>Outro.</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const buf = await makeMinimalDocx({
      documentXml,
      commentsXml: parts.commentsXml,
      commentsExtendedXml: parts.commentsExtendedXml,
      commentsIdsXml: parts.commentsIdsXml,
      commentsExtensibleXml: parts.commentsExtensibleXml,
      peopleXml: parts.peopleXml,
    });

    assertCommentRange(documentXml, '0', 'Hello world');

    const back = await parseDocxToMentor(buf);
    assert.ok(back.contentMd.includes('Hello world'), back.contentMd);
    assert.ok(back.annotations.length >= 1, 'reimport thread');
    const t = back.annotations[0];
    assert.strictEqual(t.text, 'Hello world');
    assert.ok(t.comments.some((c) => /root note contract/.test(c.body)));
    assert.ok(t.comments.some((c) => /reply note contract/.test(c.body)));
    assert.ok(t.comments.some((c) => c.author && c.author.name === 'Alice'));
    assert.ok(t.mdRange && back.contentMd.slice(t.mdRange.from, t.mdRange.to) === 'Hello world');
    // Fresh threadId on import (no stable cross-format id)
    assert.ok(t.threadId && t.threadId !== 't-contract-1');
    ok('Mentor→parts→DOCX→Mentor quote/thread contract');
  }

  // --- empty / orphan range: still produces thread with orphan status ---
  {
    const parts = buildCommentsParts([
      {
        threadId: 't-orphan',
        text: '',
        comments: [{ id: 'c', author: { name: 'X' }, body: 'no quote', createdAt: '2026-01-01T00:00:00Z' }],
      },
    ]);
    // document without range markers
    const documentXml =
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Only body</w:t></w:r></w:p></w:body></w:document>';
    const buf = await makeMinimalDocx({
      documentXml,
      commentsXml: parts.commentsXml,
      commentsExtendedXml: parts.commentsExtendedXml,
      commentsIdsXml: parts.commentsIdsXml,
      commentsExtensibleXml: parts.commentsExtensibleXml,
    });
    const res = await parseDocxToMentor(buf);
    assert.ok(res.annotations.length >= 1);
    // no range → orphan or empty text
    const t = res.annotations[0];
    assert.ok(t.comments.some((c) => /no quote/.test(c.body)));
    ok('comment without range still imports');
  }

  console.log('\n=== unit-docx-anchor-contract ===');
  console.log('All tests passed (' + pass + ')');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
