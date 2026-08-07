/**
 * unit: statusbar ephemeral setStatus + quiet meta
 * Run: node tests/unit-statusbar-ephemeral.spec.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(/function setStatus\(left, right\)/.test(src), 'setStatus exists');
assert(/#status-left/.test(src) && /#status-right/.test(src), 'slots kept');
assert(/STATUS_LEFT_TTL_MS|_statusLeftClearTimer/.test(src), 'ephemeral auto-clear for status-left');

const metaFn = src.match(/function _doUpdateDocMeta\([\s\S]*?\nfunction /);
assert(metaFn, 'meta fn');
assert(!/media=\$\{mediaUrlCount\}/.test(metaFn[0]), 'no default media= noise in status-right');
assert(!/DOM 无 img/.test(metaFn[0]), 'no DOM-missing-img debug line');

assert(html.includes('id="status-left-zone"'), 'left zone');
assert(html.includes('id="status-center-zone"'), 'center zone');
assert(html.includes('id="status-right-zone"'), 'right zone');
assert(html.includes('id="status-left"'), 'status-left kept');
assert(html.includes('id="ai-conn-status"'), 'ai chip kept');
assert(html.includes('id="supervision-signal"'), 'supervision lamp kept');

assert(!/#statusbar #status-left \{\s*\/\* Hidden[\s\S]*?display:\s*none !important/.test(css),
  'status-left must not be permanently hidden');
assert(!/#statusbar[\s\S]{0,400}#2563eb/.test(css), 'no cold-blue busy in nearby statusbar css');
assert(css.includes('status-zone-center'), 'zone css present');
assert(css.includes('statusbar responsive collapse'), 'responsive collapse present');

console.log('PASS unit-statusbar-ephemeral');
