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
assert(html.includes('id="refs-primary-row"'), 'refs pane has one primary command row');
assert(html.includes('id="refs-more-btn"'), 'refs pane exposes more menu trigger');
assert(html.includes('id="refs-more-menu"'), 'refs pane exposes low-frequency action menu');
assert(html.includes('aria-haspopup="menu"'), 'more trigger declares menu semantics');
assert(html.includes('class="refs-bibliography-options"'), 'bibliography settings are disclosed');
assert(!html.includes('class="refs-actions"'), 'legacy always-visible action strip removed');
assert(html.includes('尚无文献'), 'empty state is short');
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
assert(css.includes('.refs-primary-row'), 'primary row style exists');
assert(css.includes('.refs-more-menu'), 'more menu style exists');
assert(css.includes('.refs-bibliography-options'), 'bibliography options style exists');

console.log('PASS citation UI contract');
