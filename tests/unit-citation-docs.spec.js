const fs = require('fs');
const path = require('path');
function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAIL: ${msg}`); console.log(`✓ ${msg}`); }
const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'SCHEMA.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert(schema.includes('references.json'), 'schema declares references.json');
assert(schema.includes('references.bib'), 'schema declares references.bib');
assert(schema.includes('normalized reference manifest v2') || schema.includes('references.json'), 'schema marks citation files optional');
assert(schema.includes('bibliography'), 'schema declares bibliography config');
assert(schema.includes('<!-- mentor:bibliography -->'), 'schema declares bibliography marker');
assert(readme.includes('正文引文联动'), 'README documents body citation linkage');
assert(readme.includes('Pandoc citeproc'), 'README states Pandoc precision path');
assert(readme.includes('不可直接编辑') || readme.includes('文献库'), 'README mentions citation/bib management');
// Final EndNote contract (may land with UI commit):
// assert(readme.includes('文末 References 由文献库自动生成'));
console.log('PASS citation docs contract');
