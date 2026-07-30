// Citation UI/static contract checks. Runs without mutating user documents.
const fs = require('fs');
const path = require('path');

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
  console.log(`✓ ${message}`);
}

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert(html.includes('id="refs-missing-summary"'), 'refs pane exposes missing-key status');
assert(!html.includes('pane-icon-refs">📚'), 'refs pane does not use emoji chrome');
assert(html.includes('点击正文引文') || html.includes('正文点击引文'), 'help documents body-to-library linkage');
assert(html.includes('反复点击文献卡片'), 'help documents sequential card-to-citation navigation');
assert(html.includes('Pandoc'), 'help documents Pandoc precision boundary');
assert(css.includes('.mentor-citation'), 'citation field visual style exists');
assert(css.includes('.mentor-citation.is-missing'), 'missing citation visual style exists');
assert(css.includes('.rc-usage'), 'reference usage badge style exists');
assert(css.includes('.refs-missing-summary'), 'missing-key summary style exists');
assert(css.includes('.refs-card:focus-visible'), 'reference card keyboard focus style exists');
assert(css.includes('.refs-card.is-active .rc-usage'), 'active citation ordinal style exists');

console.log('PASS citation UI contract');
