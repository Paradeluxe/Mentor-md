/**
 * unit: DOCX edge cases
 * Run: node tests/unit-docx-edge-cases.spec.js
 */
'use strict';

const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const { makeMinimalDocx, makeCommentDocxFixture } = require('./helpers/docx-fixture');

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'docx-import.js')).href;
  const { parseDocxToMentor, DOCX_MAX_BYTES } = await import(modUrl);

  let pass = 0;
  function ok(name) {
    pass += 1;
    console.log('PASS', name);
  }

  // empty body
  {
    const buf = await makeMinimalDocx({
      documentXml:
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body><w:sectPr/></w:body></w:document>',
    });
    const res = await parseDocxToMentor(buf);
    assert.ok(typeof res.contentMd === 'string');
    assert.deepStrictEqual(res.annotations, []);
    ok('empty body');
  }

  // malformed non-zip
  {
    let threw = null;
    try {
      await parseDocxToMentor(new TextEncoder().encode('not-a-zip'));
    } catch (e) {
      threw = e;
    }
    assert.ok(threw, 'should throw');
    assert.ok(/无法读取 DOCX|ZIP|OOXML/i.test(threw.message), threw.message);
    assert.strictEqual(threw.code, 'DOCX_NOT_ZIP');
    ok('malformed zip');
  }

  // oversized
  {
    let threw = null;
    try {
      await parseDocxToMentor(new Uint8Array(100), { maxBytes: 10 });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw);
    assert.strictEqual(threw.code, 'DOCX_TOO_LARGE');
    ok('oversized guard');
  }

  // orphaned comments (comments.xml but no ranges)
  {
    const commentsXml =
      '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
      '<w:comment w:id="9" w:author="Z" w:date="2026-01-01T00:00:00Z">' +
      '<w:p w14:paraId="DEADBEEF"><w:r><w:t>orphan body</w:t></w:r></w:p></w:comment></w:comments>';
    const buf = await makeMinimalDocx({
      documentXml:
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body><w:p><w:r><w:t>No ranges here</w:t></w:r></w:p></w:body></w:document>',
      commentsXml,
    });
    const res = await parseDocxToMentor(buf);
    assert.ok(res.annotations.length >= 1);
    assert.strictEqual(res.annotations[0].invalid, true);
    assert.ok(/orphan/i.test(res.annotations[0].invalidReason || ''));
    assert.ok(res.annotations[0].comments.some((c) => /orphan body/.test(c.body)));
    ok('orphaned comment → invalid thread');
  }

  // w:del excluded, w:ins included
  {
    const docXml =
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p>' +
      '<w:del><w:r><w:delText>GONE</w:delText></w:r></w:del>' +
      '<w:ins><w:r><w:t>KEEP</w:t></w:r></w:ins>' +
      '</w:p></w:body></w:document>';
    const buf = await makeMinimalDocx({ documentXml: docXml });
    const res = await parseDocxToMentor(buf);
    assert.ok(res.contentMd.includes('KEEP'), res.contentMd);
    assert.ok(!res.contentMd.includes('GONE'), res.contentMd);
    ok('track changes del/ins');
  }

  // fixture still works
  {
    const buf = await makeCommentDocxFixture();
    const res = await parseDocxToMentor(buf);
    assert.ok(res.annotations.length >= 1);
    ok('comment fixture still ok');
  }

  assert.ok(DOCX_MAX_BYTES >= 25 * 1024 * 1024);
  console.log('\n=== unit-docx-edge-cases ===');
  console.log('All tests passed (' + pass + ')');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
