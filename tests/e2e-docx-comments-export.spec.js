// e2e: buildDocxBlob with annotations emits Word comment parts + range markers
// Run: server on :8787, then node tests/e2e-docx-comments-export.spec.js
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const JSZip = require('jszip');
const assert = require('assert');
const {
  loadDocxZip,
  readPart,
  assertCommentRange,
  assertCommentsPart,
  assertThreading,
} = require('./helpers/docx-assert');

const PORT = (() => {
  try {
    return require('fs').readFileSync(path.join(__dirname, '..', 'PORT'), 'utf8').trim() || '8787';
  } catch {
    return '8787';
  }
})();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor, { timeout: 15000 });

  await page.evaluate(() => {
    const M = window.__mdAnnotator;
    M.loadMarkdownIntoEditor('comments-export.md', '# Title\n\nHello world paragraph.\n\nSecond para stays clean.\n', null);
  });
  await page.waitForTimeout(200);

  // 1) empty annotations → no comments parts
  const emptyBuf = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const blob = await M.buildDocxBlob(M.State.editor.getHTML(), {}, []);
    const ab = await blob.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  });
  {
    const zip = await loadDocxZip(new Uint8Array(emptyBuf));
    assert.ok(!zip.files['word/comments.xml'], 'empty anns: no comments.xml');
    const docXml = readPart(zip, 'word/document.xml');
    assert.ok(docXml.includes('Hello world'), 'body text present');
    assert.ok(!docXml.includes('commentRangeStart'), 'no range markers without anns');
    console.log('ok empty annotations omit comment parts');
  }

  // 2) with thread + reply → full parts
  const withBuf = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    const annotations = [
      {
        threadId: 't-root-1',
        text: 'Hello world',
        resolved: false,
        pending: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        comments: [
          {
            id: 'c1',
            body: 'root note',
            createdAt: '2024-01-01T00:00:00.000Z',
            author: { id: 'u1', name: 'Alice' },
          },
          {
            id: 'c2',
            body: 'reply note',
            createdAt: '2024-01-02T00:00:00.000Z',
            author: { id: 'u2', name: 'Bob' },
          },
        ],
      },
      {
        threadId: 't-pending',
        text: 'ignored',
        pending: true,
        comments: [],
      },
    ];
    const blob = await M.buildDocxBlob(M.State.editor.getHTML(), {}, annotations);
    const ab = await blob.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  });

  {
    const zip = await loadDocxZip(new Uint8Array(withBuf));
    assert.ok(zip.files['word/comments.xml'], 'comments.xml present');
    assert.ok(zip.files['word/commentsExtended.xml'], 'commentsExtended present');
    assert.ok(zip.files['word/commentsIds.xml'], 'commentsIds present');
    assert.ok(zip.files['word/commentsExtensible.xml'], 'commentsExtensible present');
    // people.xml intentionally omitted (Word Desktop corruption); comments work without it
    assert.equal(!!zip.files['word/people.xml'], false, 'people.xml intentionally omitted');

    const ct = readPart(zip, '[Content_Types].xml');
    assert.ok(ct.includes('wordprocessingml.comments+xml'), 'CT comments');
    assert.ok(ct.includes('commentsExtended+xml'), 'CT commentsExtended');
    assert.ok(ct.includes('commentsIds+xml'), 'CT commentsIds');

    const rels = readPart(zip, 'word/_rels/document.xml.rels');
    assert.ok(rels.includes('relationships/comments"'), 'rels comments');
    assert.ok(rels.includes('commentsExtended'), 'rels commentsExtended');

    const docXml = readPart(zip, 'word/document.xml');
    assertCommentRange(docXml, 0, 'Hello world');

    const commentsXml = readPart(zip, 'word/comments.xml');
    assertCommentsPart(commentsXml, {
      id: 0,
      author: 'Alice',
      initials: 'A',
      text: 'root note',
    });
    assert.ok(commentsXml.includes('w:id="1"'), 'reply comment id=1');
    assert.ok(commentsXml.includes('reply note'), 'reply body');

    const extXml = readPart(zip, 'word/commentsExtended.xml');
    // reply should have parent link
    assert.ok(/paraIdParent=/.test(extXml) || /w15:paraIdParent=/.test(extXml), 'threading parent present');
    assert.ok(extXml.includes('w15:done="0"'), 'unresolved done=0');

    // resolved thread done=1
    const resolvedBuf = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const annotations = [
        {
          threadId: 't-res',
          text: 'Hello world',
          resolved: true,
          pending: false,
          comments: [
            {
              id: 'c1',
              body: 'done thread',
              createdAt: '2024-01-01T00:00:00.000Z',
              author: { name: 'Carol' },
            },
          ],
        },
      ];
      const blob = await M.buildDocxBlob(M.State.editor.getHTML(), {}, annotations);
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const zip2 = await loadDocxZip(new Uint8Array(resolvedBuf));
    const ext2 = readPart(zip2, 'word/commentsExtended.xml');
    assert.ok(ext2.includes('w15:done="1"'), 'resolved done=1');
    // no people when no author id
    assert.ok(!zip2.files['word/people.xml'], 'no people.xml without author ids');

    console.log('ok comments export with thread+reply+resolved');
  }

  await browser.close();
  console.log('\nPASS e2e-docx-comments-export');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
