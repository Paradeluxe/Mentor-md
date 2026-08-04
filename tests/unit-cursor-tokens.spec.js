/**
 * unit: Cursor cream design tokens (danger/success/elevated/tracking)
 * Run: node tests/unit-cursor-tokens.spec.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const rootMatch = css.match(/:root\s*\{[\s\S]*?\n\}/);
if (!rootMatch) throw new Error(':root block not found');
const root = rootMatch[0];

function assertIncludes(s, needle, msg) {
  if (!s.includes(needle)) throw new Error(msg || 'missing ' + needle);
}

// Cursor danger / success
assertIncludes(root, '#cf2d56', 'danger = Cursor warm crimson');
assertIncludes(root, '#1f8a65', 'success = Cursor warm teal');
// canvas + text
assertIncludes(root, '#f2f1ed', 'cream canvas');
assertIncludes(root, '#26251e', 'warm near-black');
// elevated blur scale (Cursor atmospheric)
assertIncludes(css, '28px 70px', 'elevated shadow blur');
// body positive tracking
assertIncludes(css, 'letter-spacing: 0.08px', 'body tracking');
// no cold blue primary in :root action
if (/--action-primary:\s*#2563eb/.test(root)) {
  throw new Error('cold blue accent forbidden');
}
console.log('PASS unit-cursor-tokens');
