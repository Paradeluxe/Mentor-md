/**
 * unit: modules/docx-import.js
 * Run: node tests/unit-docx-import.spec.js
 */
'use strict';

const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const {
  makeMinimalDocx,
  makeCommentDocxFixture,
} = require('./helpers/docx-fixture');

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'docx-import.js')).href;
  const {
    parseDocxToMentor,
    parseDocumentXml,
    parseCommentsParts,
    assembleMentorAnnotations,
  } = await import(modUrl);

  let pass = 0;
  function ok(name) {
    pass += 1;
    console.log('PASS', name);
  }

  // --- Fixture B: no comments ---
  {
    const buf = await makeMinimalDocx({
      documentXml:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' +
        '<w:p><w:r><w:t>Alpha</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Beta line</w:t></w:r></w:p>' +
        '</w:body></w:document>',
    });
    const res = await parseDocxToMentor(buf);
    assert.ok(res.contentMd.includes('Alpha'), 'content has Alpha');
    assert.ok(res.contentMd.includes('Beta line'), 'content has Beta');
    assert.deepStrictEqual(res.annotations, []);
    ok('no comments → annotations []');
  }

  // --- Fixture A: threaded comment via makeCommentDocxFixture ---
  {
    const buf = await makeCommentDocxFixture();
    const res = await parseDocxToMentor(buf);
    assert.ok(res.contentMd.toLowerCase().includes('hello'), 'md has hello');
    assert.ok(res.annotations.length >= 1, 'at least one thread');
    const t = res.annotations[0];
    assert.ok(t.threadId, 'threadId');
    assert.ok(Array.isArray(t.comments) && t.comments.length >= 2, 'root+reply');
    assert.ok(
      t.comments.some((c) => /root note/i.test(c.body)),
      'root body',
    );
    assert.ok(
      t.comments.some((c) => /reply/i.test(c.body)),
      'reply body',
    );
    assert.ok(t.comments[0].author && t.comments[0].author.name, 'author name');
    // quote should be Hello (fixture range)
    assert.ok(
      /hello/i.test(t.text) || (t.anchor && /hello/i.test(t.anchor.quote.exact)),
      'quote text Hello, got ' + JSON.stringify(t.text),
    );
    ok('threaded comment fixture → Mentor thread');
  }

  // --- heading + bold ---
  {
    const docXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>plain </w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>' +
      '<w:r><w:t> end</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const { contentMd } = parseDocumentXml(docXml);
    assert.ok(contentMd.startsWith('# Title') || contentMd.includes('# Title'), contentMd);
    assert.ok(contentMd.includes('**bold**'), contentMd);
    ok('heading + bold markdown');
  }

  // --- parseCommentsParts resolved ---
  {
    const parts = parseCommentsParts({
      commentsXml:
        '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
        '<w:comment w:id="0" w:author="Alice" w:initials="A" w:date="2024-01-01T00:00:00Z">' +
        '<w:p w14:paraId="AAAAAAAA"><w:r><w:t>note</w:t></w:r></w:p></w:comment></w:comments>',
      commentsExtendedXml:
        '<?xml version="1.0"?><w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
        '<w15:commentEx w15:paraId="AAAAAAAA" w15:done="1"/>' +
        '</w15:commentsEx>',
    });
    assert.strictEqual(parts.comments.length, 1);
    assert.strictEqual(parts.extended[0].done, true);
    const assembled = assembleMentorAnnotations({
      comments: parts.comments,
      extended: parts.extended,
      people: [],
      rangesByCommentId: { '0': { start: 0, end: 5, quote: 'Hello' } },
      contentMd: 'Hello world\n',
    });
    assert.strictEqual(assembled.annotations[0].resolved, true);
    assert.strictEqual(assembled.annotations[0].text, 'Hello');
    assert.ok(assembled.annotations[0].mdRange);
    assert.strictEqual(assembled.annotations[0].mdRange.from, 0);
    ok('resolved + mdRange assembly');
  }

  // --- mid-paragraph range ---
  {
    const docXml =
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>' +
      '<w:r><w:t>AAA </w:t></w:r>' +
      '<w:commentRangeStart w:id="3"/>' +
      '<w:r><w:t>MID</w:t></w:r>' +
      '<w:commentRangeEnd w:id="3"/>' +
      '<w:r><w:commentReference w:id="3"/></w:r>' +
      '<w:r><w:t> ZZZ</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const { rangesByCommentId, plainText } = parseDocumentXml(docXml);
    assert.ok(plainText.includes('AAA'));
    assert.ok(rangesByCommentId['3']);
    assert.strictEqual(rangesByCommentId['3'].quote, 'MID');
    ok('mid-paragraph comment range');
  }

  console.log('\n=== unit-docx-import ===');
  console.log('All tests passed (' + pass + ')');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
