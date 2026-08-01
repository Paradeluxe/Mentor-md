/**
 * Node-side pure tests for modules/docx-export-comments.js.
 * Run: node tests/unit-docx-export-comments.spec.js
 *
 * Verifies:
 *  - escXml escapes & < > " correctly.
 *  - authorInitials returns up-to-two uppercase initials.
 *  - buildCommentsParts({ annotations }) returns:
 *      commentsXml / commentsExtendedXml / commentsIdsXml /
 *      commentsExtensibleXml / peopleXml + threadMap + commentEntries
 *  - Pending (empty comments) threads are skipped.
 *  - Resolved threads emit w15:done="1".
 *  - Replies emit a w:comment with w15:paraIdParent linking root paraId.
 *  - people.xml is currently always null (Word Desktop rejects our presenceInfo shape).
 *  - comment ids are 0-based, deterministic across threads.
 *  - commentEntries expose commentId, threadId, isRoot, parentCommentId.
 */
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const assert = require('assert');

(async () => {
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', 'modules', 'docx-export-comments.js')
  ).href;
  const mod = await import(modUrl);

  // ---- escXml ----
  assert.strictEqual(mod.escXml('plain'), 'plain', 'escXml passthrough');
  assert.strictEqual(mod.escXml('&'), '&amp;', 'escXml amp');
  assert.strictEqual(mod.escXml('<x>'), '&lt;x&gt;', 'escXml lt/gt');
  assert.strictEqual(mod.escXml('a"b'), 'a&quot;b', 'escXml quote');
  assert.strictEqual(mod.escXml(null), '', 'escXml null');
  assert.strictEqual(mod.escXml(undefined), '', 'escXml undefined');
  assert.strictEqual(mod.escXml(42), '42', 'escXml number coerces to string');
  console.log('PASS escXml');

  // ---- authorInitials ----
  assert.strictEqual(mod.authorInitials('Alice'), 'A', 'single name → A');
  assert.strictEqual(mod.authorInitials('alice'), 'A', 'lowercase → uppercase');
  assert.strictEqual(mod.authorInitials('Alice Wong'), 'AW', 'two words → AW');
  assert.strictEqual(mod.authorInitials('alice wong'), 'AW', 'two words lowercase');
  assert.strictEqual(mod.authorInitials('  Alice  '), 'A', 'trim whitespace');
  assert.strictEqual(mod.authorInitials('Mary-Jane'), 'M', 'hyphenated → first letter');
  assert.strictEqual(mod.authorInitials(''), '?', 'empty → ?');
  assert.strictEqual(mod.authorInitials(null), '?', 'null → ?');
  assert.strictEqual(mod.authorInitials(undefined), '?', 'undefined → ?');
  console.log('PASS authorInitials');

  // ---- buildCommentsParts: empty annotations ----
  const empty = mod.buildCommentsParts([]);
  assert.strictEqual(empty.commentsXml, '', 'empty → empty commentsXml');
  assert.strictEqual(empty.commentsExtendedXml, '', 'empty → empty commentsExtendedXml');
  assert.strictEqual(empty.commentsIdsXml, '', 'empty → empty commentsIdsXml');
  assert.strictEqual(empty.commentsExtensibleXml, '', 'empty → empty commentsExtensibleXml');
  assert.strictEqual(empty.peopleXml, null, 'empty → null peopleXml');
  assert.deepStrictEqual(empty.commentEntries, [], 'empty → no entries');
  console.log('PASS buildCommentsParts empty');

  // ---- buildCommentsParts: single thread, single comment ----
  const oneAnn = [{
    threadId: 't1',
    text: 'hello world',
    resolved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    comments: [{
      id: 'c0',
      author: { id: 'uid-a', name: 'Alice' },
      body: 'root note',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  }];
  const one = mod.buildCommentsParts(oneAnn);
  assert.ok(one.commentsXml.includes('w:comment '), 'comments.xml contains w:comment');
  assert.ok(one.commentsXml.includes('w:id="0"'), 'comments.xml id 0');
  assert.ok(one.commentsXml.includes('w:author="Alice"'), 'comments.xml author Alice');
  assert.ok(one.commentsXml.includes('w:initials="A"'), 'comments.xml initials A');
  assert.ok(one.commentsXml.includes('root note'), 'comments.xml body root note');
  assert.ok(one.commentsExtendedXml.includes('w15:commentEx'), 'commentsExtended has w15:commentEx');
  assert.ok(one.commentsExtendedXml.includes('w15:done="0"'), 'unresolved done=0');
  assert.ok(one.commentsIdsXml.includes('w16cid:commentId'), 'commentsIds has commentId');
  assert.ok(one.commentsExtensibleXml.includes('w16cex:commentExtensible'), 'commentsExtensible present');
  assert.strictEqual(one.peopleXml, null, 'people.xml omitted for Word compatibility');
  assert.ok(one.commentsXml.includes('w:annotationRef'), 'comment body has annotationRef');
  assert.ok(one.commentsExtensibleXml.includes('w16cex:durableId='), 'commentsExtensible uses durableId');
  assert.strictEqual(one.commentEntries.length, 1, 'one entry');
  assert.strictEqual(one.commentEntries[0].commentId, 0, 'entry commentId 0');
  assert.strictEqual(one.commentEntries[0].threadId, 't1', 'entry threadId t1');
  assert.strictEqual(one.commentEntries[0].isRoot, true, 'entry isRoot true');
  assert.strictEqual(one.commentEntries[0].parentCommentId, null, 'entry parentCommentId null');
  console.log('PASS single thread single comment');

  // ---- buildCommentsParts: resolved → done=1 ----
  const resolvedAnn = [{
    threadId: 'tR',
    text: 'some text',
    resolved: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    comments: [{
      id: 'cR',
      author: { id: 'uid-r', name: 'Bob' },
      body: 'closing note',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  }];
  const resolvedParts = mod.buildCommentsParts(resolvedAnn);
  assert.ok(resolvedParts.commentsExtendedXml.includes('w15:done="1"'), 'resolved done=1');
  console.log('PASS resolved done=1');

  // ---- buildCommentsParts: skip pending threads (no body) ----
  const pendingAnn = [{
    threadId: 'tP',
    text: 'pending quote',
    resolved: false,
    pending: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    comments: [{
      id: 'cP',
      author: { id: 'uid-p', name: 'Pat' },
      body: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  }];
  const pendingParts = mod.buildCommentsParts(pendingAnn);
  assert.strictEqual(pendingParts.commentsXml, '', 'pending thread produces empty commentsXml');
  assert.strictEqual(pendingParts.peopleXml, null, 'pending thread → null peopleXml');
  assert.strictEqual(pendingParts.commentEntries.length, 0, 'pending → no entries');
  console.log('PASS pending threads skipped');

  // ---- buildCommentsParts: thread with two comments (root + reply) ----
  const threadAnn = [{
    threadId: 'tT',
    text: 'quote text',
    resolved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    comments: [
      { id: 'c1', author: { id: 'uid-a', name: 'Alice' }, body: 'first', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c2', author: { id: 'uid-b', name: 'Bob' }, body: 'second', createdAt: '2026-01-02T00:00:00.000Z' },
    ],
  }];
  const threadParts = mod.buildCommentsParts(threadAnn);
  assert.ok(threadParts.commentsXml.includes('w:id="0"'), 'thread root id 0');
  assert.ok(threadParts.commentsXml.includes('w:id="1"'), 'thread reply id 1');
  assert.ok(threadParts.commentsXml.includes('w:author="Alice"'), 'thread contains Alice');
  assert.ok(threadParts.commentsXml.includes('w:author="Bob"'), 'thread contains Bob');
  // Threading: reply paraIdParent should reference root paraId.
  assert.ok(/w15:paraIdParent="[0-9A-F]{8}"/.test(threadParts.commentsExtendedXml),
    'reply has paraIdParent hex ref: ' + threadParts.commentsExtendedXml.slice(0, 400));
  // The root paraId must appear before the parent reference in the same XML.
  const ex = threadParts.commentsExtendedXml;
  const rootParaId = (ex.match(/<w15:commentEx[^>]*w15:paraId="([0-9A-F]{8})"/) || [])[1];
  assert.ok(rootParaId, 'root paraId parsed');
  assert.ok(new RegExp('w15:paraIdParent="' + rootParaId + '"').test(ex),
    'reply paraIdParent matches root paraId ' + rootParaId);
  // commentEntries shape
  assert.strictEqual(threadParts.commentEntries.length, 2, 'thread emits 2 entries');
  const rootEntry = threadParts.commentEntries.find((e) => e.isRoot);
  const replyEntry = threadParts.commentEntries.find((e) => !e.isRoot);
  assert.ok(rootEntry && replyEntry, 'has root and reply entries');
  assert.strictEqual(rootEntry.commentId, 0, 'root commentId 0');
  assert.strictEqual(replyEntry.commentId, 1, 'reply commentId 1');
  assert.strictEqual(replyEntry.parentCommentId, 0, 'reply parentCommentId 0');
  console.log('PASS thread with reply');

  // ---- buildCommentsParts: multiple threads → distinct comment ids, durableIds ----
  const multi = [
    {
      threadId: 'ta', text: 'quote-a', resolved: false, createdAt: '2026-01-01T00:00:00.000Z',
      comments: [
        { id: 'ca1', author: { id: 'uid-a', name: 'Alice' }, body: 'a-root', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'ca2', author: { id: 'uid-b', name: 'Bob' }, body: 'a-reply', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    },
    {
      threadId: 'tb', text: 'quote-b', resolved: false, createdAt: '2026-02-01T00:00:00.000Z',
      comments: [
        { id: 'cb1', author: { id: 'uid-c', name: 'Carol' }, body: 'b-root', createdAt: '2026-02-01T00:00:00.000Z' },
      ],
    },
  ];
  const multiParts = mod.buildCommentsParts(multi);
  // Distinct comment ids 0..3
  assert.ok(multiParts.commentsXml.includes('w:id="0"'), 'multi id 0');
  assert.ok(multiParts.commentsXml.includes('w:id="1"'), 'multi id 1');
  assert.ok(multiParts.commentsXml.includes('w:id="2"'), 'multi id 2');
  assert.ok(multiParts.commentsXml.includes('w:id="3"') === false, 'multi no id 3');
  // author names present
  for (const name of ['Alice', 'Bob', 'Carol']) {
    assert.ok(multiParts.commentsXml.includes('w:author="' + name + '"'),
      'multi author ' + name);
  }
  // people.xml intentionally omitted
  assert.strictEqual(multiParts.peopleXml, null, 'people.xml omitted');
  assert.strictEqual(multiParts.commentEntries.length, 3, 'multi 3 entries');
  console.log('PASS multiple threads');

  // ---- buildCommentsParts: paraId / durableId are 8-char uppercase hex ----
  const hex = /^[0-9A-F]{8}$/;
  const durable = /w16cid:durableId="([0-9A-F]{8})"/g;
  let m;
  const durables = [];
  while ((m = durable.exec(multiParts.commentsIdsXml)) !== null) durables.push(m[1]);
  assert.strictEqual(durables.length, 3, '3 durableIds for 3 comments');
  for (const d of durables) assert.ok(hex.test(d), 'durableId 8-char hex: ' + d);

  // ---- buildCommentsParts: threadId → commentId mapping helper ----
  assert.strictEqual(typeof multiParts.threadMap, 'object', 'threadMap is object');
  // threadMap keyed by threadId; root mapping should map threadId → { commentId: 0|1|2, ... }
  const rootMap = multiParts.threadMap.ta;
  assert.ok(rootMap && typeof rootMap.commentId === 'number', 'threadMap entry has numeric commentId');
  console.log('PASS multi-thread shape');

  // ---- buildCommentsParts: legacy shape — comments as legacy array of strings ----
  // Some old data has comments = [{body: 'x', author: 'Alice'}]
  const legacyAnn = [{
    threadId: 'tl', text: 'legacy quote', resolved: false,
    comments: [
      { author: 'Alice', body: 'legacy body' },
    ],
  }];
  const legacyParts = mod.buildCommentsParts(legacyAnn);
  assert.ok(legacyParts.commentsXml.includes('Alice'), 'legacy author string works');
  assert.ok(legacyParts.commentsXml.includes('legacy body'), 'legacy body works');
  console.log('PASS legacy author shape');

  // ---- buildCommentsParts: invalid entries (null/missing threadId) filtered ----
  const dirty = [
    null,
    { /* missing threadId */ },
    { threadId: 'tg', text: 'ok', resolved: false, comments: [{ author: { name: 'G' }, body: 'g-body' }] },
  ];
  const dirtyParts = mod.buildCommentsParts(dirty);
  assert.strictEqual(dirtyParts.commentEntries.length, 1, 'dirty filtered to 1');
  console.log('PASS invalid filtered');

  // ---- buildCommentsParts: missing thread.text → empty quoteText in entry ----
  const noText = [{
    threadId: 'tn', resolved: false,
    comments: [{ author: { name: 'N' }, body: 'n-body' }],
  }];
  const noTextParts = mod.buildCommentsParts(noText);
  assert.strictEqual(noTextParts.commentEntries[0].quoteText, '', 'missing text → empty quoteText');
  console.log('PASS missing quoteText');

  // ---- buildCommentsParts: whitespace body should still emit comment ----
  // (Skipped only when truly empty AND pending)
  const whitespaceAnn = [{
    threadId: 'tw', text: 'q', resolved: false, pending: true,
    comments: [{ author: { name: 'W' }, body: '   ' }],
  }];
  const wsParts = mod.buildCommentsParts(whitespaceAnn);
  // Pending with whitespace body is treated as pending → skipped.
  assert.strictEqual(wsParts.commentsXml, '', 'pending whitespace skipped');
  console.log('PASS pending whitespace skipped');

  console.log('\n=== unit-docx-export-comments ===');
  console.log('All tests passed.');
})().catch((err) => {
  console.error('FAIL', err.stack || err);
  process.exit(1);
});