/**
 * unit: no soft/compat anchor paths in product surfaces
 * Run: node tests/unit-anchor-no-compat.spec.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const mdRange = fs.readFileSync(path.join(root, 'modules', 'md-range.js'), 'utf8');
const bundlePath = path.join(root, 'app.bundle.js');

const banned = ['位置可能偏移', '锚点未就绪'];
for (const b of banned) {
  if (app.includes(b)) throw new Error('banned UI string in app.js: ' + b);
}
for (const ok of ['原文已被删除', '无法唯一确定', '批注锚点失效']) {
  if (!app.includes(ok)) throw new Error('missing hard banner in app.js: ' + ok);
}
if (fs.existsSync(bundlePath)) {
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  for (const b of banned) {
    if (bundle.includes(b)) throw new Error('banned UI string in bundle: ' + b);
  }
}
if (/scoreCandidate|buildCandidates/.test(mdRange)) {
  throw new Error('md-range must stay score-free');
}
console.log('PASS unit-anchor-no-compat');
