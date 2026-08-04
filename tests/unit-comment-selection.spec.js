/**
 * unit: comment multi-select state
 * Run: node tests/unit-comment-selection.spec.js
 */
'use strict';
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

(async () => {
  const url = pathToFileURL(path.join(__dirname, '..', 'modules', 'comment-selection.js')).href;
  const { createCommentSelection } = await import(url);
  const s = createCommentSelection();
  assert.strictEqual(s.size(), 0);
  s.toggle('a');
  assert.strictEqual(s.has('a'), true);
  assert.deepStrictEqual(s.ids(), ['a']);
  s.toggle('b');
  assert.strictEqual(s.size(), 2);
  s.toggle('a');
  assert.strictEqual(s.has('a'), false);
  s.setAll(['x', 'y', 'z']);
  assert.strictEqual(s.size(), 3);
  s.pruneTo(['y', 'z', 'w']);
  assert.deepStrictEqual(s.ids().sort(), ['y', 'z']);
  s.clear();
  assert.strictEqual(s.size(), 0);
  console.log('PASS unit-comment-selection');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
