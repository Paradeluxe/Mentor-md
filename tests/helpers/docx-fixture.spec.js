/**
 * Test runner for tests/helpers/docx-fixture.js + docx-assert.js
 * Run: node tests/helpers/docx-fixture.spec.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const fixture = require(path.join(ROOT, 'tests', 'helpers', 'docx-fixture.js'));
const assertions = require(path.join(ROOT, 'tests', 'helpers', 'docx-assert.js'));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ok  ' + name);
  } catch (err) {
    results.push({ name, ok: false });
    console.error('  FAIL ' + name + ' :: ' + (err && err.message ? err.message : err));
  }
}

(async () => {
  // ---- makeMinimalDocx returns Uint8Array with mandatory parts ----
  await test('makeMinimalDocx returns Uint8Array', async () => {
    const buf = await fixture.makeMinimalDocx({
      documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
    });
    assert.ok(buf instanceof Uint8Array, 'expected Uint8Array');
    assert.ok(buf.length > 0, 'expected non-empty buffer');
  });

  await test('makeMinimalDocx contains mandatory parts', async () => {
    const buf = await fixture.makeMinimalDocx({
      documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
    });
    const zip = await assertions.loadDocxZip(buf);
    assert.ok(zip.files['[Content_Types].xml'], 'missing [Content_Types].xml');
    assert.ok(zip.files['_rels/.rels'], 'missing _rels/.rels');
    assert.ok(zip.files['word/_rels/document.xml.rels'], 'missing word/_rels/document.xml.rels');
    assert.ok(zip.files['word/document.xml'], 'missing word/document.xml');
  });

  await test('loadDocxZip/readPart round-trip', async () => {
    const buf = await fixture.makeMinimalDocx({
      documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>'
    });
    const zip = await assertions.loadDocxZip(buf);
    const docXml = assertions.readPart(zip, 'word/document.xml');
    assert.ok(docXml && docXml.includes('<w:t>Hi</w:t>'), 'document.xml missing <w:t>Hi</w:t>');
    assert.strictEqual(assertions.readPart(zip, 'word/missing.xml'), null, 'expected null for missing part');
  });

  await test('omitted comment parts are absent from zip and content-types', async () => {
    const buf = await fixture.makeMinimalDocx({
      documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
    });
    const zip = await assertions.loadDocxZip(buf);
    assert.strictEqual(zip.files['word/comments.xml'], undefined, 'comments.xml should be absent when not provided');
    const ct = assertions.readPart(zip, '[Content_Types].xml');
    assert.ok(ct && !ct.includes('wordprocessingml.comments+xml'), 'should not declare comments content-type');
  });

  await test('provided comment parts appear with correct content-type overrides', async () => {
    const buf = await fixture.makeMinimalDocx({
      documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
      commentsXml: '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
      commentsExtendedXml: '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>',
      commentsIdsXml: '<w16cid:commentsIds xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"/>',
      commentsExtensibleXml: '<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"/>',
      peopleXml: '<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>'
    });
    const zip = await assertions.loadDocxZip(buf);
    assert.ok(zip.files['word/comments.xml'], 'comments.xml should be present');
    assert.ok(zip.files['word/commentsExtended.xml'], 'commentsExtended.xml should be present');
    assert.ok(zip.files['word/commentsIds.xml'], 'commentsIds.xml should be present');
    assert.ok(zip.files['word/commentsExtensible.xml'], 'commentsExtensible.xml should be present');
    assert.ok(zip.files['word/people.xml'], 'people.xml should be present');
    const ct = assertions.readPart(zip, '[Content_Types].xml');
    // comments uses the original wordprocessingml namespace prefix
    assert.ok(ct.includes('wordprocessingml.comments+xml'), 'should declare comments content-type');
    assert.ok(ct.includes('wordprocessingml.commentsExtended+xml'), 'should declare commentsExtended content-type');
    // commentsIds / commentsExtensible / people use the ms-word prefix (Microsoft convention)
    assert.ok(ct.includes('commentsIds+xml'), 'should declare commentsIds content-type');
    assert.ok(ct.includes('commentsExtensible+xml'), 'should declare commentsExtensible content-type');
    assert.ok(ct.includes('people+xml'), 'should declare people content-type');
    // PartName overrides should reference each part path
    assert.ok(ct.includes('PartName="/word/comments.xml"'), 'should have /word/comments.xml override');
    assert.ok(ct.includes('PartName="/word/commentsIds.xml"'), 'should have /word/commentsIds.xml override');
    assert.ok(ct.includes('PartName="/word/commentsExtended.xml"'), 'should have /word/commentsExtended.xml override');
    assert.ok(ct.includes('PartName="/word/commentsExtensible.xml"'), 'should have /word/commentsExtensible.xml override');
    assert.ok(ct.includes('PartName="/word/people.xml"'), 'should have /word/people.xml override');
  });

  // ---- makeCommentDocxFixture: realistic minimal docx with 2 comments ----
  await test('makeCommentDocxFixture produces valid fixture with threaded comment', async () => {
    const buf = await fixture.makeCommentDocxFixture();
    assert.ok(buf instanceof Uint8Array);
    const zip = await assertions.loadDocxZip(buf);
    const docXml = assertions.readPart(zip, 'word/document.xml');
    const commentsXml = assertions.readPart(zip, 'word/comments.xml');
    const extXml = assertions.readPart(zip, 'word/commentsExtended.xml');
    const idsXml = assertions.readPart(zip, 'word/commentsIds.xml');
    assert.ok(docXml && docXml.includes('Hello world'), 'document.xml missing "Hello world"');
    assert.ok(docXml && docXml.includes('Second para'), 'document.xml missing second paragraph');
    assert.ok(commentsXml && commentsXml.includes('Alice'), 'comments.xml missing author');
    assert.ok(commentsXml && commentsXml.includes('root note'), 'comments.xml missing body');
    assert.ok(commentsXml && commentsXml.includes('annotationRef'), 'comments.xml needs annotationRef');
    // Threading: reply (id=1) should reference root (id=0) via w15:paraIdParent
    assert.ok(extXml && extXml.includes('paraIdParent'), 'commentsExtended should reference paraIdParent for threading');
    assert.ok(extXml && /w15:paraIdParent="0A000001"/.test(extXml), 'reply parent should point to root paraId 0A000001');
    assert.ok(idsXml && idsXml.includes('commentsIds'), 'commentsIds.xml should be present');
    assert.ok(!zip.files['word/people.xml'], 'people.xml omitted for Word compatibility');
  });

  // ---- assertion helpers ----
  await test('assertCommentRange detects id and quoted text', async () => {
    const docXml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
      '<w:body>' +
      '<w:p w14:paraId="0AAA0001"><w:commentRangeStart w:id="0"/><w:r><w:t>Hello</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>' +
      '</w:body></w:document>';
    // happy path
    assert.doesNotThrow(() => assertions.assertCommentRange(docXml, 0, 'Hello'));
    // bad id should throw (rangeStart error)
    assert.throws(() => assertions.assertCommentRange(docXml, 1, 'Hello'), /commentRangeStart/);
    // doc with only rangeStart (no reference) should throw about missing commentReference
    const xmlMissingRef =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:commentRangeStart w:id="5"/><w:r><w:t>x</w:t></w:r><w:commentRangeEnd w:id="5"/></w:p></w:body></w:document>';
    assert.throws(() => assertions.assertCommentRange(xmlMissingRef, 5, 'x'), /commentReference/);
    // bad quoted text should throw
    assert.throws(() => assertions.assertCommentRange(docXml, 0, 'Goodbye'), /quoted text.*Goodbye/);
  });

  await test('assertCommentsPart checks id/author/initials/date/text', async () => {
    const commentsXml =
      '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:comment w:id="0" w:author="Alice" w:initials="A" w:date="2026-01-01T00:00:00Z">' +
      '<w:p><w:r><w:t>root note</w:t></w:r></w:p>' +
      '</w:comment></w:comments>';
    assert.doesNotThrow(() => assertions.assertCommentsPart(commentsXml, {
      id: 0, author: 'Alice', initials: 'A', date: '2026-01-01T00:00:00Z', text: 'root note'
    }));
    assert.throws(() => assertions.assertCommentsPart(commentsXml, { id: 1 }), /w:id="1"/);
    assert.throws(() => assertions.assertCommentsPart(commentsXml, { id: 0, author: 'Bob' }), /w:author/);
    assert.throws(() => assertions.assertCommentsPart(commentsXml, { id: 0, text: 'not it' }), /text/);
  });

  await test('assertThreading checks paraId/parentParaId/done', async () => {
    const extXml =
      '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
      '<w15:commentEx w15:paraId="0AAA0001" w15:done="0"/>' +
      '<w15:commentEx w15:paraId="0AAA0002" w15:paraIdParent="0AAA0001" w15:done="1"/>' +
      '</w15:commentsEx>';
    assert.doesNotThrow(() => assertions.assertThreading(extXml, { paraId: '0AAA0002', parentParaId: '0AAA0001', done: true }));
    // Missing paraId should throw with a message mentioning the missing paraId.
    assert.throws(() => assertions.assertThreading(extXml, { paraId: 'MISSING' }), /commentEx.*paraId="MISSING"/);
    // Wrong parent should throw mentioning wrong parent.
    assert.throws(() => assertions.assertThreading(extXml, { paraId: '0AAA0002', parentParaId: 'WRONG' }), /paraIdParent/);
    // Wrong done should throw mentioning done.
    assert.throws(() => assertions.assertThreading(extXml, { paraId: '0AAA0001', done: true }), /done/);
  });

  await test('assertPeople finds name', async () => {
    const peopleXml =
      '<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w15:person w:author="Alice"><w15:presenceInfo w15:providerId="None" w15:userId="Alice"/></w15:person>' +
      '</w15:people>';
    assert.doesNotThrow(() => assertions.assertPeople(peopleXml, 'Alice'));
    assert.throws(() => assertions.assertPeople(peopleXml, 'Bob'), /person with w:author="Bob"/);
  });

  // ---- parseXml smoke test (lightweight extraction) ----
  await test('parseXml extracts attributes and text without DOM', async () => {
    const xml = '<root attr1="v1" attr2="v2"><child>hello</child></root>';
    const parsed = assertions.parseXml(xml);
    assert.ok(parsed && typeof parsed === 'object', 'parseXml should return an object');
    assert.strictEqual(parsed.tag, 'root', 'root tag should be "root"');
    assert.strictEqual(parsed.attrs.attr1, 'v1', 'attr1 should be extracted');
    assert.strictEqual(parsed.attrs.attr2, 'v2', 'attr2 should be extracted');
    assert.ok(Array.isArray(parsed.children), 'children should be an array');
    assert.strictEqual(parsed.children.length, 1, 'should have one child element');
    const child = parsed.children[0];
    assert.strictEqual(child.tag, 'child', 'child tag should be "child"');
    assert.ok(child.text.includes('hello'), 'child text should include "hello": ' + JSON.stringify(child.text));
  });

  // ---- final summary ----
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length === 0 ? 'PASS' : 'FAIL') +
    '  ' + (results.length - failed.length) + '/' + results.length + ' tests passed');
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((err) => {
  console.error('runner crashed', err);
  process.exit(2);
});
