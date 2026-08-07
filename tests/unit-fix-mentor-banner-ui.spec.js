/**
 * unit: fix-mentor job banner cream structure
 * Run: node tests/unit-fix-mentor-banner-ui.spec.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

assert(html.includes('id="fix-mentor-job-banner"'), 'banner id');
assert(html.includes('class="fm-prog-dot"'), 'pulse dot');
assert(html.includes('class="fm-prog-meta"'), 'meta group');
for (const id of ['fm-prog-title', 'fm-prog-elapsed', 'fm-prog-pct', 'fm-prog-fill', 'fm-prog-phase', 'fm-prog-log']) {
  assert(html.includes(`id="${id}"`), id);
}

// single definition of shell styles (no competing accent teal block)
const defs = (css.match(/\.fix-mentor-job-banner\s*\{/g) || []).length;
assert(defs === 1, 'exactly one .fix-mentor-job-banner shell, got ' + defs);
assert(!/#0d9488/.test(css.slice(css.indexOf('fix-mentor live progress'), css.indexOf('fix-mentor live progress') + 4000) || ''),
  'no raw teal accent hex in progress panel');
assert(css.includes('fm-prog-dot-pulse'), 'dot pulse keyframes');
assert(css.includes('var(--ai)'), 'uses --ai token');
assert(css.includes('.fm-prog-pct'), 'pct pill styles');

console.log('PASS unit-fix-mentor-banner-ui');
